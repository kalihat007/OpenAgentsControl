/**
 * File operations engine for expert workflows.
 *
 * Provides guardrailed read, write, modify, diff, and batch operations
 * so experts can safely transform code files with previews, backups,
 * and rollback capabilities.
 */

import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  stat,
  unlink,
  rename,
  copyFile as fsCopyFile,
  mkdir,
  readdir,
  access,
} from 'node:fs/promises'
import { join, resolve, relative, dirname, extname, basename } from 'node:path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileOperation {
  type: 'read' | 'write' | 'modify' | 'create' | 'delete' | 'rename' | 'copy'
  path: string
  content?: string
  newPath?: string
}

export interface LineChange {
  lineNumber: number
  type: 'add' | 'remove' | 'modify'
  original?: string
  replacement?: string
}

export interface FileModification {
  path: string
  original: string
  modified: string
  diff: string
  lineChanges: LineChange[]
}

export interface BatchOperation {
  id: string
  operations: FileOperation[]
  dryRun: boolean
  preview: FileModification[]
  status: 'pending' | 'applied' | 'rolled_back'
}

export interface FileGuard {
  allowedPaths: string[]
  blockedPaths: string[]
  blockedPatterns: RegExp[]
  maxFileSize: number
  requireBackup: boolean
}

export interface OperationResult {
  success: boolean
  operation: FileOperation
  error?: string
  backup?: string
}

export interface SearchResult {
  file: string
  line: number
  column: number
  match: string
  context: { before: string[]; after: string[] }
}

// ── Language detection ────────────────────────────────────────────────────────

const EXTENSION_LANGUAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.xml': 'xml',
  '.vue': 'vue',
  '.svelte': 'svelte',
}

function detectLanguage(filePath: string): string {
  return EXTENSION_LANGUAGES[extname(filePath)] ?? 'unknown'
}

// ── Guards and safety ─────────────────────────────────────────────────────────

const DEFAULT_BLOCKED_PATHS = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  '.env.production',
  '.env.staging',
  'dist',
  'build',
  '.next',
  '.nuxt',
]

const DEFAULT_BLOCKED_PATTERNS = [
  /\.env(\.\w+)?$/,
  /secrets?\./i,
  /credentials?\./i,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa/,
  /id_ed25519/,
]

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export function createDefaultGuard(projectRoot: string): FileGuard {
  return {
    allowedPaths: [projectRoot],
    blockedPaths: DEFAULT_BLOCKED_PATHS.map(p => join(projectRoot, p)),
    blockedPatterns: [...DEFAULT_BLOCKED_PATTERNS],
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    requireBackup: true,
  }
}

export function validateOperation(
  op: FileOperation,
  guard: FileGuard,
): { allowed: boolean; reason?: string } {
  const targetPath = resolve(op.path)

  if (guard.allowedPaths.length > 0) {
    const isAllowed = guard.allowedPaths.some(
      allowed => targetPath.startsWith(resolve(allowed)),
    )
    if (!isAllowed) {
      return { allowed: false, reason: `Path '${op.path}' is outside allowed directories` }
    }
  }

  for (const blocked of guard.blockedPaths) {
    const resolvedBlocked = resolve(blocked)
    if (targetPath === resolvedBlocked || targetPath.startsWith(resolvedBlocked + '/')) {
      return { allowed: false, reason: `Path '${op.path}' is in blocked directory '${blocked}'` }
    }
  }

  for (const pattern of guard.blockedPatterns) {
    if (pattern.test(targetPath) || pattern.test(basename(targetPath))) {
      return { allowed: false, reason: `Path '${op.path}' matches blocked pattern ${pattern}` }
    }
  }

  if (op.newPath) {
    const newTargetPath = resolve(op.newPath)

    if (guard.allowedPaths.length > 0) {
      const isAllowed = guard.allowedPaths.some(
        allowed => newTargetPath.startsWith(resolve(allowed)),
      )
      if (!isAllowed) {
        return { allowed: false, reason: `Target path '${op.newPath}' is outside allowed directories` }
      }
    }

    for (const blocked of guard.blockedPaths) {
      const resolvedBlocked = resolve(blocked)
      if (newTargetPath === resolvedBlocked || newTargetPath.startsWith(resolvedBlocked + '/')) {
        return { allowed: false, reason: `Target path '${op.newPath}' is in blocked directory '${blocked}'` }
      }
    }
  }

  return { allowed: true }
}

const BACKUP_DIR = '.opencode/.backups'

export async function createBackup(path: string): Promise<string> {
  const resolvedPath = resolve(path)
  const projectRoot = findProjectRoot(resolvedPath)
  const backupDir = join(projectRoot, BACKUP_DIR)
  const timestamp = Date.now()
  const relativePath = relative(projectRoot, resolvedPath)
  const safeRelative = relativePath.replace(/[/\\]/g, '__')
  const backupPath = join(backupDir, `${safeRelative}.${timestamp}.bak`)

  await mkdir(backupDir, { recursive: true })
  await fsCopyFile(resolvedPath, backupPath)
  return backupPath
}

function findProjectRoot(filePath: string): string {
  return dirname(filePath)
}

// ── Safe read operations ──────────────────────────────────────────────────────

export async function readFile(path: string, guard?: FileGuard): Promise<string> {
  if (guard) {
    const check = validateOperation({ type: 'read', path }, guard)
    if (!check.allowed) throw new Error(check.reason)
  }

  const content = await fsReadFile(path, 'utf-8')

  if (guard && Buffer.byteLength(content, 'utf-8') > guard.maxFileSize) {
    throw new Error(`File '${path}' exceeds maximum size of ${guard.maxFileSize} bytes`)
  }

  return content
}

export async function readFileLines(
  path: string,
  startLine: number,
  endLine: number,
): Promise<string[]> {
  const content = await fsReadFile(path, 'utf-8')
  const lines = content.split('\n')
  const start = Math.max(0, startLine - 1)
  const end = Math.min(lines.length, endLine)
  return lines.slice(start, end)
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function getFileInfo(
  path: string,
): Promise<{ size: number; lines: number; language: string; lastModified: Date }> {
  const [stats, content] = await Promise.all([
    stat(path),
    fsReadFile(path, 'utf-8'),
  ])

  return {
    size: stats.size,
    lines: content.split('\n').length,
    language: detectLanguage(path),
    lastModified: stats.mtime,
  }
}

export async function searchInFile(
  path: string,
  pattern: string | RegExp,
  contextLines = 2,
): Promise<SearchResult[]> {
  const content = await fsReadFile(path, 'utf-8')
  const lines = content.split('\n')
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  const results: SearchResult[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    let match: RegExpExecArray | null
    regex.lastIndex = 0

    while ((match = regex.exec(line)) !== null) {
      const before = lines.slice(Math.max(0, i - contextLines), i)
      const after = lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines))

      results.push({
        file: path,
        line: i + 1,
        column: match.index + 1,
        match: match[0],
        context: { before, after },
      })

      if (!regex.global) break
    }
  }

  return results
}

export async function searchInDirectory(
  dir: string,
  pattern: string | RegExp,
  options?: { extensions?: string[]; ignore?: string[]; contextLines?: number },
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const extensions = options?.extensions
  const ignore = new Set(options?.ignore ?? ['node_modules', '.git', 'dist', 'build'])
  const contextLines = options?.contextLines ?? 2

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)

      if (ignore.has(entry.name)) continue

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        if (extensions && !extensions.some(ext => entry.name.endsWith(ext))) continue
        try {
          const fileResults = await searchInFile(fullPath, pattern, contextLines)
          results.push(...fileResults)
        } catch {
          // Skip files that can't be read (binary, permissions, etc.)
        }
      }
    }
  }

  await walk(dir)
  return results
}

// ── Safe write operations ─────────────────────────────────────────────────────

export async function writeFile(
  path: string,
  content: string,
  guard?: FileGuard,
): Promise<OperationResult> {
  const op: FileOperation = { type: 'write', path, content }

  if (guard) {
    const check = validateOperation(op, guard)
    if (!check.allowed) return { success: false, operation: op, error: check.reason }

    if (Buffer.byteLength(content, 'utf-8') > guard.maxFileSize) {
      return { success: false, operation: op, error: `Content exceeds maximum size of ${guard.maxFileSize} bytes` }
    }
  }

  try {
    let backupPath: string | undefined
    if (guard?.requireBackup && await fileExists(path)) {
      backupPath = await createBackup(path)
    }

    await mkdir(dirname(path), { recursive: true })
    await fsWriteFile(path, content, 'utf-8')
    return { success: true, operation: op, backup: backupPath }
  } catch (error) {
    return {
      success: false,
      operation: op,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function createFile(
  path: string,
  content: string,
  guard?: FileGuard,
): Promise<OperationResult> {
  const op: FileOperation = { type: 'create', path, content }

  if (guard) {
    const check = validateOperation(op, guard)
    if (!check.allowed) return { success: false, operation: op, error: check.reason }
  }

  if (await fileExists(path)) {
    return { success: false, operation: op, error: `File already exists: ${path}` }
  }

  try {
    await mkdir(dirname(path), { recursive: true })
    await fsWriteFile(path, content, 'utf-8')
    return { success: true, operation: op }
  } catch (error) {
    return {
      success: false,
      operation: op,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function deleteFile(
  path: string,
  guard?: FileGuard,
): Promise<OperationResult> {
  const op: FileOperation = { type: 'delete', path }

  if (guard) {
    const check = validateOperation(op, guard)
    if (!check.allowed) return { success: false, operation: op, error: check.reason }
  }

  if (!await fileExists(path)) {
    return { success: false, operation: op, error: `File not found: ${path}` }
  }

  try {
    const backupPath = await createBackup(path)
    await unlink(path)
    return { success: true, operation: op, backup: backupPath }
  } catch (error) {
    return {
      success: false,
      operation: op,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function renameFile(
  path: string,
  newPath: string,
  guard?: FileGuard,
): Promise<OperationResult> {
  const op: FileOperation = { type: 'rename', path, newPath }

  if (guard) {
    const check = validateOperation(op, guard)
    if (!check.allowed) return { success: false, operation: op, error: check.reason }
  }

  if (!await fileExists(path)) {
    return { success: false, operation: op, error: `File not found: ${path}` }
  }

  try {
    let backupPath: string | undefined
    if (guard?.requireBackup) {
      backupPath = await createBackup(path)
    }

    await mkdir(dirname(newPath), { recursive: true })
    await rename(path, newPath)
    return { success: true, operation: op, backup: backupPath }
  } catch (error) {
    return {
      success: false,
      operation: op,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function copyFile(
  path: string,
  dest: string,
): Promise<OperationResult> {
  const op: FileOperation = { type: 'copy', path, newPath: dest }

  if (!await fileExists(path)) {
    return { success: false, operation: op, error: `File not found: ${path}` }
  }

  try {
    await mkdir(dirname(dest), { recursive: true })
    await fsCopyFile(path, dest)
    return { success: true, operation: op }
  } catch (error) {
    return {
      success: false,
      operation: op,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ── Code modification ─────────────────────────────────────────────────────────

export async function modifyLines(
  path: string,
  changes: LineChange[],
): Promise<FileModification> {
  const original = await fsReadFile(path, 'utf-8')
  const lines = original.split('\n')

  const sorted = [...changes].sort((a, b) => b.lineNumber - a.lineNumber)

  for (const change of sorted) {
    const idx = change.lineNumber - 1

    switch (change.type) {
      case 'add':
        lines.splice(idx, 0, change.replacement ?? '')
        break
      case 'remove':
        if (idx >= 0 && idx < lines.length) {
          change.original = lines[idx]
          lines.splice(idx, 1)
        }
        break
      case 'modify':
        if (idx >= 0 && idx < lines.length) {
          change.original = lines[idx]
          lines[idx] = change.replacement ?? ''
        }
        break
    }
  }

  const modified = lines.join('\n')
  const diff = generateFileDiff(original, modified)

  return { path, original, modified, diff, lineChanges: changes }
}

export async function insertAtLine(
  path: string,
  line: number,
  content: string,
): Promise<FileModification> {
  return modifyLines(path, [{ lineNumber: line, type: 'add', replacement: content }])
}

export async function replaceLine(
  path: string,
  line: number,
  content: string,
): Promise<FileModification> {
  return modifyLines(path, [{ lineNumber: line, type: 'modify', replacement: content }])
}

export async function replaceRange(
  path: string,
  startLine: number,
  endLine: number,
  content: string,
): Promise<FileModification> {
  const original = await fsReadFile(path, 'utf-8')
  const lines = original.split('\n')
  const startIdx = startLine - 1
  const endIdx = endLine

  const removedLines = lines.slice(startIdx, endIdx)
  const contentLines = content.split('\n')
  const modified = [
    ...lines.slice(0, startIdx),
    ...contentLines,
    ...lines.slice(endIdx),
  ].join('\n')

  const lineChanges: LineChange[] = removedLines.map((orig, i) => ({
    lineNumber: startLine + i,
    type: 'remove' as const,
    original: orig,
  }))
  lineChanges.push({
    lineNumber: startLine,
    type: 'add',
    replacement: content,
  })

  const diff = generateFileDiff(original, modified)
  return { path, original, modified, diff, lineChanges }
}

export async function findAndReplace(
  path: string,
  search: string | RegExp,
  replacement: string,
): Promise<FileModification> {
  const original = await fsReadFile(path, 'utf-8')
  const regex = typeof search === 'string'
    ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    : new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g')

  const lines = original.split('\n')
  const lineChanges: LineChange[] = []

  const modifiedLines = lines.map((line, i) => {
    regex.lastIndex = 0
    if (regex.test(line)) {
      regex.lastIndex = 0
      const newLine = line.replace(regex, replacement)
      lineChanges.push({
        lineNumber: i + 1,
        type: 'modify',
        original: line,
        replacement: newLine,
      })
      return newLine
    }
    return line
  })

  const modified = modifiedLines.join('\n')
  const diff = generateFileDiff(original, modified)
  return { path, original, modified, diff, lineChanges }
}

export async function appendToFile(
  path: string,
  content: string,
): Promise<FileModification> {
  const original = await fsReadFile(path, 'utf-8')
  const modified = original + content
  const lineCount = original.split('\n').length
  const diff = generateFileDiff(original, modified)

  return {
    path,
    original,
    modified,
    diff,
    lineChanges: [{ lineNumber: lineCount + 1, type: 'add', replacement: content }],
  }
}

export async function prependToFile(
  path: string,
  content: string,
): Promise<FileModification> {
  const original = await fsReadFile(path, 'utf-8')
  const modified = content + original
  const diff = generateFileDiff(original, modified)

  return {
    path,
    original,
    modified,
    diff,
    lineChanges: [{ lineNumber: 1, type: 'add', replacement: content }],
  }
}

// ── Diff generation ───────────────────────────────────────────────────────────

export function generateFileDiff(original: string, modified: string): string {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')

  if (original === modified) return ''

  const hunks: string[] = []
  hunks.push('--- a/file')
  hunks.push('+++ b/file')

  const contextSize = 3
  let i = 0
  let j = 0

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      i++
      j++
      continue
    }

    const hunkStartOrig = Math.max(0, i - contextSize)
    const hunkStartMod = Math.max(0, j - contextSize)
    const hunkLines: string[] = []

    for (let c = hunkStartOrig; c < i; c++) {
      hunkLines.push(` ${origLines[c]}`)
    }

    while (i < origLines.length || j < modLines.length) {
      if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
        let matchCount = 0
        let ti = i
        let tj = j
        while (ti < origLines.length && tj < modLines.length && origLines[ti] === modLines[tj] && matchCount < contextSize * 2 + 1) {
          matchCount++
          ti++
          tj++
        }

        if (matchCount > contextSize * 2 && ti < origLines.length) {
          for (let c = 0; c < contextSize; c++) {
            hunkLines.push(` ${origLines[i + c]}`)
          }
          i += contextSize
          j += contextSize
          break
        }

        hunkLines.push(` ${origLines[i]}`)
        i++
        j++
        continue
      }

      if (i < origLines.length && (j >= modLines.length || !modLines.includes(origLines[i]!) || isLocalDeletion(origLines, modLines, i, j))) {
        hunkLines.push(`-${origLines[i]}`)
        i++
      } else if (j < modLines.length) {
        hunkLines.push(`+${modLines[j]}`)
        j++
      }
    }

    const endOrig = i
    const endMod = j
    const origCount = hunkLines.filter(l => l.startsWith(' ') || l.startsWith('-')).length
    const modCount = hunkLines.filter(l => l.startsWith(' ') || l.startsWith('+')).length

    hunks.push(`@@ -${hunkStartOrig + 1},${origCount} +${hunkStartMod + 1},${modCount} @@`)
    hunks.push(...hunkLines)
  }

  return hunks.join('\n')
}

function isLocalDeletion(origLines: string[], modLines: string[], origIdx: number, modIdx: number): boolean {
  const lookahead = 5
  for (let k = modIdx; k < Math.min(modLines.length, modIdx + lookahead); k++) {
    if (modLines[k] === origLines[origIdx]) return false
  }
  return true
}

export function previewModification(mod: FileModification): string {
  const lines: string[] = []
  lines.push(`File: ${mod.path}`)
  lines.push('─'.repeat(60))

  for (const change of mod.lineChanges) {
    switch (change.type) {
      case 'add':
        lines.push(`  L${change.lineNumber}  + ${change.replacement ?? ''}`)
        break
      case 'remove':
        lines.push(`  L${change.lineNumber}  - ${change.original ?? ''}`)
        break
      case 'modify':
        lines.push(`  L${change.lineNumber}  - ${change.original ?? ''}`)
        lines.push(`  L${change.lineNumber}  + ${change.replacement ?? ''}`)
        break
    }
  }

  lines.push('─'.repeat(60))
  return lines.join('\n')
}

export async function diffFiles(pathA: string, pathB: string): Promise<string> {
  const [contentA, contentB] = await Promise.all([
    fsReadFile(pathA, 'utf-8'),
    fsReadFile(pathB, 'utf-8'),
  ])
  return generateFileDiff(contentA, contentB)
}

// ── Batch operations ──────────────────────────────────────────────────────────

export function createBatch(
  operations: FileOperation[],
  guard?: FileGuard,
): BatchOperation {
  if (guard) {
    for (const op of operations) {
      const check = validateOperation(op, guard)
      if (!check.allowed) {
        throw new Error(`Batch validation failed for ${op.type} on '${op.path}': ${check.reason}`)
      }
    }
  }

  return {
    id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    operations,
    dryRun: false,
    preview: [],
    status: 'pending',
  }
}

export async function previewBatch(batch: BatchOperation): Promise<FileModification[]> {
  const previews: FileModification[] = []

  for (const op of batch.operations) {
    switch (op.type) {
      case 'write':
      case 'modify': {
        if (!op.content) break
        const exists = await fileExists(op.path)
        const original = exists ? await fsReadFile(op.path, 'utf-8') : ''
        const diff = generateFileDiff(original, op.content)
        previews.push({
          path: op.path,
          original,
          modified: op.content,
          diff,
          lineChanges: diffToLineChanges(original, op.content),
        })
        break
      }
      case 'create': {
        const diff = generateFileDiff('', op.content ?? '')
        previews.push({
          path: op.path,
          original: '',
          modified: op.content ?? '',
          diff,
          lineChanges: (op.content ?? '').split('\n').map((line, i) => ({
            lineNumber: i + 1,
            type: 'add' as const,
            replacement: line,
          })),
        })
        break
      }
      case 'delete': {
        const exists = await fileExists(op.path)
        if (exists) {
          const original = await fsReadFile(op.path, 'utf-8')
          const diff = generateFileDiff(original, '')
          previews.push({
            path: op.path,
            original,
            modified: '',
            diff,
            lineChanges: original.split('\n').map((line, i) => ({
              lineNumber: i + 1,
              type: 'remove' as const,
              original: line,
            })),
          })
        }
        break
      }
    }
  }

  batch.preview = previews
  batch.dryRun = true
  return previews
}

export async function applyBatch(batch: BatchOperation): Promise<OperationResult[]> {
  const results: OperationResult[] = []

  for (const op of batch.operations) {
    let result: OperationResult

    switch (op.type) {
      case 'read':
        try {
          await fsReadFile(op.path, 'utf-8')
          result = { success: true, operation: op }
        } catch (error) {
          result = { success: false, operation: op, error: error instanceof Error ? error.message : String(error) }
        }
        break
      case 'write':
      case 'modify':
        result = await writeFile(op.path, op.content ?? '')
        break
      case 'create':
        result = await createFile(op.path, op.content ?? '')
        break
      case 'delete':
        result = await deleteFile(op.path)
        break
      case 'rename':
        result = await renameFile(op.path, op.newPath ?? op.path)
        break
      case 'copy':
        result = await copyFile(op.path, op.newPath ?? op.path)
        break
      default:
        result = { success: false, operation: op, error: `Unknown operation type` }
    }

    if (!result.success) {
      // Rollback all previously successful operations
      const successResults = results.filter(r => r.success && r.backup)
      for (const prev of successResults.reverse()) {
        if (prev.backup) {
          try {
            await fsCopyFile(prev.backup, prev.operation.path)
          } catch {
            // Best-effort rollback
          }
        }
      }
      batch.status = 'rolled_back'
      results.push(result)
      return results
    }

    results.push(result)
  }

  batch.status = 'applied'
  return results
}

export async function rollbackBatch(batch: BatchOperation): Promise<OperationResult[]> {
  if (batch.status !== 'applied') {
    return [{
      success: false,
      operation: { type: 'read', path: '' },
      error: `Cannot rollback batch with status '${batch.status}' — only 'applied' batches can be rolled back`,
    }]
  }

  const results: OperationResult[] = []

  for (const preview of batch.preview.reverse()) {
    const op: FileOperation = { type: 'write', path: preview.path, content: preview.original }
    try {
      if (preview.original === '' && preview.modified !== '') {
        await unlink(preview.path)
      } else {
        await fsWriteFile(preview.path, preview.original, 'utf-8')
      }
      results.push({ success: true, operation: op })
    } catch (error) {
      results.push({
        success: false,
        operation: op,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  batch.status = 'rolled_back'
  return results
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffToLineChanges(original: string, modified: string): LineChange[] {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')
  const changes: LineChange[] = []
  const maxLen = Math.max(origLines.length, modLines.length)

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < origLines.length ? origLines[i] : undefined
    const modLine = i < modLines.length ? modLines[i] : undefined

    if (origLine === undefined && modLine !== undefined) {
      changes.push({ lineNumber: i + 1, type: 'add', replacement: modLine })
    } else if (origLine !== undefined && modLine === undefined) {
      changes.push({ lineNumber: i + 1, type: 'remove', original: origLine })
    } else if (origLine !== modLine) {
      changes.push({ lineNumber: i + 1, type: 'modify', original: origLine, replacement: modLine })
    }
  }

  return changes
}

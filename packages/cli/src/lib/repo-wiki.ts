/**
 * Repo Wiki — deterministic living project map for QuestMode.
 *
 * This is intentionally local and dependency-free. It gives OpenAgent a
 * constantly refreshed, inspectable repo map without turning every observation
 * into durable long-term memory.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const REPO_WIKI_DIR = '.oac/repo-wiki'
const FILES_JSON = 'files.json'
const GRAPH_JSON = 'graph.json'
const INDEX_MD = 'index.md'
const CHANGES_MD = 'changes.md'
const PACKAGES_MD = 'packages.md'

const DEFAULT_MAX_FILES = 2000
const MAX_HASH_BYTES = 1024 * 1024

const IGNORED_PREFIXES = [
  '.git/',
  '.oac/runs/',
  '.oac/repo-wiki/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.turbo/',
]

export type RepoWikiFileKind =
  | 'source'
  | 'test'
  | 'docs'
  | 'config'
  | 'script'
  | 'context'
  | 'agent'
  | 'plugin'
  | 'package'
  | 'asset'
  | 'other'

export interface RepoWikiFileEntry {
  path: string
  kind: RepoWikiFileKind
  extension: string
  sizeBytes: number
  mtimeMs: number
  lineCount?: number
  hash?: string
  tags: string[]
}

export interface RepoWikiPackageEntry {
  path: string
  name?: string
  private?: boolean
  main?: string
  type?: string
  workspaces?: string[]
  scripts: string[]
}

export interface RepoWikiChangeSet {
  added: string[]
  modified: string[]
  deleted: string[]
  gitStatus: string[]
  questChangedFiles: string[]
}

export interface RepoWikiSnapshot {
  version: '1'
  projectRoot: string
  currentWorkingDirectory: string
  generatedAt: string
  reason: string
  questId?: string
  summary: {
    files: number
    packages: number
    totalBytes: number
    byKind: Record<RepoWikiFileKind, number>
    topDirectories: Array<{ path: string; files: number }>
  }
  changes: RepoWikiChangeSet
  packages: RepoWikiPackageEntry[]
  files: RepoWikiFileEntry[]
}

export interface RepoWikiGraph {
  version: '1'
  generatedAt: string
  nodes: Array<{
    id: string
    kind: 'root' | 'directory' | 'file' | 'package'
    label: string
    metadata?: Record<string, unknown>
  }>
  edges: Array<{
    from: string
    to: string
    relation: 'contains' | 'declares' | 'belongs_to'
  }>
}

export interface RefreshRepoWikiOptions {
  reason?: string
  questId?: string
  changedFiles?: string[]
  maxFiles?: number
  cwd?: string
}

export interface RefreshRepoWikiResult {
  dir: string
  snapshot: RepoWikiSnapshot
  graph: RepoWikiGraph
  written: {
    index: string
    changes: string
    packages: string
    files: string
    graph: string
  }
}

export async function refreshRepoWiki(
  projectRoot: string,
  options: RefreshRepoWikiOptions = {},
): Promise<RefreshRepoWikiResult> {
  const dir = join(projectRoot, REPO_WIKI_DIR)
  await mkdir(dir, { recursive: true })

  const previous = await loadRepoWikiSnapshot(projectRoot)
  const filePaths = await listProjectFiles(projectRoot, options.maxFiles ?? DEFAULT_MAX_FILES)
  const files = await buildFileEntries(projectRoot, filePaths)
  const packages = await buildPackageEntries(projectRoot, files)
  const gitStatus = await currentGitStatus(projectRoot)
  const snapshot = buildSnapshot(projectRoot, files, packages, previous, gitStatus, options)
  const graph = buildRepoWikiGraph(snapshot)

  const paths = {
    index: join(dir, INDEX_MD),
    changes: join(dir, CHANGES_MD),
    packages: join(dir, PACKAGES_MD),
    files: join(dir, FILES_JSON),
    graph: join(dir, GRAPH_JSON),
  }

  await writeFile(paths.index, formatRepoWikiIndex(snapshot))
  await writeFile(paths.changes, formatRepoWikiChanges(snapshot))
  await writeFile(paths.packages, formatRepoWikiPackages(snapshot))
  await writeFile(paths.files, JSON.stringify(snapshot, null, 2) + '\n')
  await writeFile(paths.graph, JSON.stringify(graph, null, 2) + '\n')

  return { dir, snapshot, graph, written: paths }
}

export async function loadRepoWikiSnapshot(projectRoot: string): Promise<RepoWikiSnapshot | null> {
  try {
    const raw = await readFile(join(projectRoot, REPO_WIKI_DIR, FILES_JSON), 'utf-8')
    const parsed = JSON.parse(raw) as RepoWikiSnapshot
    return parsed.version === '1' ? parsed : null
  } catch {
    return null
  }
}

function buildSnapshot(
  projectRoot: string,
  files: RepoWikiFileEntry[],
  packages: RepoWikiPackageEntry[],
  previous: RepoWikiSnapshot | null,
  gitStatus: string[],
  options: RefreshRepoWikiOptions,
): RepoWikiSnapshot {
  const previousByPath = new Map((previous?.files ?? []).map((file) => [file.path, file]))
  const currentByPath = new Map(files.map((file) => [file.path, file]))
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const file of files) {
    const before = previousByPath.get(file.path)
    if (!before) {
      added.push(file.path)
      continue
    }
    if (before.hash !== file.hash || before.sizeBytes !== file.sizeBytes) {
      modified.push(file.path)
    }
  }

  for (const file of previousByPath.keys()) {
    if (!currentByPath.has(file)) deleted.push(file)
  }

  return {
    version: '1',
    projectRoot,
    currentWorkingDirectory: options.cwd ?? process.cwd(),
    generatedAt: new Date().toISOString(),
    reason: options.reason ?? 'manual',
    ...(options.questId && { questId: options.questId }),
    summary: {
      files: files.length,
      packages: packages.length,
      totalBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
      byKind: countByKind(files),
      topDirectories: topDirectories(files),
    },
    changes: {
      added,
      modified,
      deleted,
      gitStatus,
      questChangedFiles: unique((options.changedFiles ?? []).filter(Boolean)),
    },
    packages,
    files,
  }
}

async function listProjectFiles(projectRoot: string, maxFiles: number): Promise<string[]> {
  const gitFiles = await listGitFiles(projectRoot)
  const files = gitFiles.length > 0 ? gitFiles : await listFilesRecursively(projectRoot)
  return files
    .map(normalizePath)
    .filter((path) => path && !isIgnoredPath(path))
    .sort()
    .slice(0, maxFiles)
}

async function listGitFiles(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'ls-files', '--cached', '--others', '--exclude-standard'], {
      maxBuffer: 1024 * 1024 * 10,
    })
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

async function listFilesRecursively(projectRoot: string): Promise<string[]> {
  const files: string[] = []

  async function visit(absDir: string): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true })
    for (const entry of entries) {
      const absPath = join(absDir, entry.name)
      const relPath = normalizePath(relative(projectRoot, absPath))
      if (!relPath || isIgnoredPath(relPath)) continue
      if (entry.isDirectory()) {
        await visit(absPath)
      } else if (entry.isFile()) {
        files.push(relPath)
      }
    }
  }

  await visit(projectRoot)
  return files
}

async function buildFileEntries(projectRoot: string, paths: string[]): Promise<RepoWikiFileEntry[]> {
  const entries: RepoWikiFileEntry[] = []
  for (const path of paths) {
    const absPath = join(projectRoot, path)
    try {
      const fileStat = await stat(absPath)
      if (!fileStat.isFile()) continue
      const content = fileStat.size <= MAX_HASH_BYTES ? await readFile(absPath) : undefined
      const text = content && isProbablyText(content) ? content.toString('utf-8') : undefined
      entries.push({
        path,
        kind: classifyFile(path),
        extension: extname(path).replace(/^\./, ''),
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        ...(text !== undefined && { lineCount: countLines(text) }),
        hash: content ? createHash('sha256').update(content).digest('hex') : `size:${fileStat.size}:mtime:${Math.round(fileStat.mtimeMs)}`,
        tags: tagsForFile(path),
      })
    } catch {
      // File may have changed between listing and indexing.
    }
  }
  return entries
}

async function buildPackageEntries(projectRoot: string, files: RepoWikiFileEntry[]): Promise<RepoWikiPackageEntry[]> {
  const packageFiles = files.filter((file) => file.path === 'package.json' || file.path.endsWith('/package.json'))
  const packages: RepoWikiPackageEntry[] = []
  for (const file of packageFiles) {
    try {
      const raw = await readFile(join(projectRoot, file.path), 'utf-8')
      const pkg = JSON.parse(raw) as Record<string, unknown>
      packages.push({
        path: file.path,
        name: asString(pkg.name),
        private: typeof pkg.private === 'boolean' ? pkg.private : undefined,
        main: asString(pkg.main),
        type: asString(pkg.type),
        workspaces: Array.isArray(pkg.workspaces) ? pkg.workspaces.filter((value): value is string => typeof value === 'string') : undefined,
        scripts: Object.keys(asRecord(pkg.scripts) ?? {}).sort(),
      })
    } catch {
      packages.push({ path: file.path, scripts: [] })
    }
  }
  return packages.sort((a, b) => a.path.localeCompare(b.path))
}

async function currentGitStatus(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'status', '--short'], { maxBuffer: 1024 * 1024 })
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line && !line.includes(REPO_WIKI_DIR))
      .slice(0, 200)
  } catch {
    return []
  }
}

function buildRepoWikiGraph(snapshot: RepoWikiSnapshot): RepoWikiGraph {
  const nodes = new Map<string, RepoWikiGraph['nodes'][number]>()
  const edges = new Map<string, RepoWikiGraph['edges'][number]>()
  addNode(nodes, { id: 'root', kind: 'root', label: snapshot.projectRoot })

  for (const file of snapshot.files) {
    const parts = file.path.split('/')
    let parent = 'root'
    let current = ''
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part
      const dirId = `dir:${current}`
      addNode(nodes, { id: dirId, kind: 'directory', label: current })
      addEdge(edges, parent, dirId, 'contains')
      parent = dirId
    }

    const fileId = `file:${file.path}`
    addNode(nodes, {
      id: fileId,
      kind: 'file',
      label: file.path,
      metadata: { kind: file.kind, tags: file.tags, sizeBytes: file.sizeBytes },
    })
    addEdge(edges, parent, fileId, 'contains')
  }

  for (const pkg of snapshot.packages) {
    const packageId = `package:${pkg.name ?? pkg.path}`
    addNode(nodes, { id: packageId, kind: 'package', label: pkg.name ?? pkg.path, metadata: { path: pkg.path } })
    addEdge(edges, 'root', packageId, 'declares')
    addEdge(edges, `file:${pkg.path}`, packageId, 'belongs_to')
  }

  return {
    version: '1',
    generatedAt: snapshot.generatedAt,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  }
}

function formatRepoWikiIndex(snapshot: RepoWikiSnapshot): string {
  const lines = frontmatter(snapshot, 'repo-wiki-index')
  lines.push(
    '# Repo Wiki',
    '',
    '## Overview',
    '',
    `- Project root: \`${snapshot.projectRoot}\``,
    `- Current working directory: \`${snapshot.currentWorkingDirectory}\``,
    `- Files indexed: ${snapshot.summary.files}`,
    `- Packages detected: ${snapshot.summary.packages}`,
    `- Total indexed bytes: ${snapshot.summary.totalBytes}`,
    `- Refresh reason: \`${snapshot.reason}\``,
    ...(snapshot.questId ? [`- Quest: \`${snapshot.questId}\``] : []),
    '',
    '## File Kinds',
    '',
    '| Kind | Files |',
    '|------|-------|',
  )

  for (const kind of Object.keys(snapshot.summary.byKind).sort() as RepoWikiFileKind[]) {
    const count = snapshot.summary.byKind[kind]
    if (count > 0) lines.push(`| ${kind} | ${count} |`)
  }

  lines.push('', '## Top Directories', '', '| Directory | Files |', '|-----------|-------|')
  for (const dir of snapshot.summary.topDirectories) {
    lines.push(`| \`${dir.path}\` | ${dir.files} |`)
  }

  lines.push('', '## Current Changes', '')
  appendChangeList(lines, 'Added', snapshot.changes.added)
  appendChangeList(lines, 'Modified', snapshot.changes.modified)
  appendChangeList(lines, 'Deleted', snapshot.changes.deleted)
  appendChangeList(lines, 'Quest Changed Files', snapshot.changes.questChangedFiles)

  lines.push('', '## Git Status', '')
  if (snapshot.changes.gitStatus.length === 0) {
    lines.push('_No git status changes detected, or git is unavailable._')
  } else {
    for (const line of snapshot.changes.gitStatus.slice(0, 50)) {
      lines.push(`- \`${line}\``)
    }
  }

  lines.push(
    '',
    '## OpenAgent Usage',
    '',
    '- QuestMode refreshes this wiki after durable Quest creation and Quest file/context changes.',
    '- Use `oac repo-wiki` for an immediate refresh.',
    '- Use `oac repo-wiki --watch` for a continuous local refresh loop in the current project directory.',
    '- Use this wiki with `interaction-memory.json` and `memory-graph.json` before planning follow-up work.',
    '',
  )

  return lines.join('\n')
}

function formatRepoWikiChanges(snapshot: RepoWikiSnapshot): string {
  const lines = frontmatter(snapshot, 'repo-wiki-changes')
  lines.push('# Repo Wiki Changes', '')
  appendChangeList(lines, 'Added Since Last Refresh', snapshot.changes.added)
  appendChangeList(lines, 'Modified Since Last Refresh', snapshot.changes.modified)
  appendChangeList(lines, 'Deleted Since Last Refresh', snapshot.changes.deleted)
  appendChangeList(lines, 'Quest Changed Files', snapshot.changes.questChangedFiles)
  lines.push('', '## Git Status', '')
  if (snapshot.changes.gitStatus.length === 0) {
    lines.push('_No git status changes detected, or git is unavailable._')
  } else {
    for (const line of snapshot.changes.gitStatus) lines.push(`- \`${line}\``)
  }
  lines.push('')
  return lines.join('\n')
}

function formatRepoWikiPackages(snapshot: RepoWikiSnapshot): string {
  const lines = frontmatter(snapshot, 'repo-wiki-packages')
  lines.push('# Repo Wiki Packages', '')
  if (snapshot.packages.length === 0) {
    lines.push('_No package manifests detected._', '')
    return lines.join('\n')
  }

  for (const pkg of snapshot.packages) {
    lines.push(`## ${pkg.name ?? pkg.path}`, '')
    lines.push(`- Manifest: \`${pkg.path}\``)
    if (pkg.type) lines.push(`- Module type: \`${pkg.type}\``)
    if (pkg.main) lines.push(`- Main: \`${pkg.main}\``)
    if (pkg.workspaces && pkg.workspaces.length > 0) lines.push(`- Workspaces: ${pkg.workspaces.map((ws) => `\`${ws}\``).join(', ')}`)
    if (pkg.scripts.length > 0) lines.push(`- Scripts: ${pkg.scripts.map((script) => `\`${script}\``).join(', ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

function frontmatter(snapshot: RepoWikiSnapshot, generator: string): string[] {
  return [
    '---',
    `generatedAt: ${snapshot.generatedAt}`,
    `generator: ${generator}`,
    `projectRoot: ${JSON.stringify(snapshot.projectRoot)}`,
    `reason: ${snapshot.reason}`,
    ...(snapshot.questId ? [`questId: ${snapshot.questId}`] : []),
    '---',
    '',
  ]
}

function appendChangeList(lines: string[], title: string, values: string[]): void {
  lines.push(`### ${title}`, '')
  if (values.length === 0) {
    lines.push('_None._', '')
    return
  }
  for (const value of values.slice(0, 50)) {
    lines.push(`- \`${value}\``)
  }
  if (values.length > 50) lines.push(`- _...and ${values.length - 50} more._`)
  lines.push('')
}

function countByKind(files: RepoWikiFileEntry[]): Record<RepoWikiFileKind, number> {
  const kinds: RepoWikiFileKind[] = ['source', 'test', 'docs', 'config', 'script', 'context', 'agent', 'plugin', 'package', 'asset', 'other']
  const counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<RepoWikiFileKind, number>
  for (const file of files) counts[file.kind] += 1
  return counts
}

function topDirectories(files: RepoWikiFileEntry[]): Array<{ path: string; files: number }> {
  const counts = new Map<string, number>()
  for (const file of files) {
    const parts = file.path.split('/')
    const dir = parts.length > 1 ? parts[0] : '.'
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, files: count }))
    .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path))
    .slice(0, 12)
}

function classifyFile(path: string): RepoWikiFileKind {
  const normalized = normalizePath(path)
  const ext = extname(normalized).toLowerCase()
  const base = normalized.split('/').at(-1) ?? normalized

  if (base === 'package.json') return 'package'
  if (normalized.startsWith('.opencode/context/') || normalized.includes('/context/')) return 'context'
  if (normalized.startsWith('.opencode/agent/') || normalized.includes('/agent/')) return 'agent'
  if (normalized.startsWith('plugins/') || normalized.includes('/plugin')) return 'plugin'
  if (normalized.includes('.test.') || normalized.includes('.spec.') || normalized.includes('/test') || normalized.includes('/tests/')) return 'test'
  if (['.md', '.mdx', '.txt', '.adoc', '.rst'].includes(ext)) return 'docs'
  if (['.json', '.toml', '.yaml', '.yml', '.ini', '.env', '.config'].includes(ext) || base.startsWith('.')) return 'config'
  if (['.sh', '.bash', '.zsh'].includes(ext) || normalized.startsWith('scripts/')) return 'script'
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.rs', '.py', '.java', '.cs', '.cpp', '.c', '.h'].includes(ext)) return 'source'
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.pdf'].includes(ext)) return 'asset'
  return 'other'
}

function tagsForFile(path: string): string[] {
  const tags = new Set<string>()
  const normalized = normalizePath(path)
  const kind = classifyFile(normalized)
  tags.add(kind)
  if (normalized.includes('quest')) tags.add('quest')
  if (normalized.includes('memory')) tags.add('memory')
  if (normalized.includes('kimi')) tags.add('kimi')
  if (normalized.includes('codex')) tags.add('codex')
  if (normalized.includes('opencode')) tags.add('opencode')
  if (normalized.includes('install')) tags.add('install')
  if (normalized.includes('update')) tags.add('update')
  return [...tags].sort()
}

function isIgnoredPath(path: string): boolean {
  const normalized = normalizePath(path)
  if (!normalized || normalized === '.') return true
  return IGNORED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort()
}

function countLines(text: string): number {
  if (text.length === 0) return 0
  return text.split(/\r?\n/).length
}

function isProbablyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  return !sample.includes(0)
}

function addNode(nodes: Map<string, RepoWikiGraph['nodes'][number]>, node: RepoWikiGraph['nodes'][number]): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node)
}

function addEdge(
  edges: Map<string, RepoWikiGraph['edges'][number]>,
  from: string,
  to: string,
  relation: RepoWikiGraph['edges'][number]['relation'],
): void {
  const id = `${from}->${relation}->${to}`
  if (!edges.has(id)) edges.set(id, { from, to, relation })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

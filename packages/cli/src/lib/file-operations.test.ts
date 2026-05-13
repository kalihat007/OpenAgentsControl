import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile as fsWriteFile, mkdir, readFile as fsReadFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  readFile,
  readFileLines,
  fileExists,
  getFileInfo,
  searchInFile,
  searchInDirectory,
  writeFile,
  createFile,
  deleteFile,
  renameFile,
  copyFile,
  modifyLines,
  insertAtLine,
  replaceLine,
  replaceRange,
  findAndReplace,
  appendToFile,
  prependToFile,
  generateFileDiff,
  previewModification,
  diffFiles,
  createBatch,
  previewBatch,
  applyBatch,
  rollbackBatch,
  createDefaultGuard,
  validateOperation,
  createBackup,
  type FileGuard,
  type FileOperation,
  type LineChange,
  type FileModification,
  type BatchOperation,
  type OperationResult,
  type SearchResult,
} from './file-operations.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let tempDir: string

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'oac-fileops-'))
}

async function createTempFile(name: string, content: string): Promise<string> {
  const filePath = join(tempDir, name)
  await mkdir(join(tempDir, ...name.split('/').slice(0, -1)), { recursive: true })
  await fsWriteFile(filePath, content, 'utf-8')
  return filePath
}

beforeEach(async () => {
  tempDir = await makeTempDir()
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ── Read operations ───────────────────────────────────────────────────────────

describe('Read operations', () => {
  describe('readFile', () => {
    test('reads file content', async () => {
      const path = await createTempFile('hello.txt', 'Hello, world!')
      const content = await readFile(path)
      expect(content).toBe('Hello, world!')
    })

    test('throws on non-existent file', async () => {
      await expect(readFile(join(tempDir, 'nope.txt'))).rejects.toThrow()
    })

    test('respects guard allowed paths', async () => {
      const path = await createTempFile('guarded.txt', 'secret')
      const guard: FileGuard = {
        allowedPaths: ['/some/other/path'],
        blockedPaths: [],
        blockedPatterns: [],
        maxFileSize: 1024,
        requireBackup: false,
      }
      await expect(readFile(path, guard)).rejects.toThrow(/outside allowed/)
    })

    test('respects guard maxFileSize', async () => {
      const bigContent = 'x'.repeat(100)
      const path = await createTempFile('big.txt', bigContent)
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [],
        blockedPatterns: [],
        maxFileSize: 10,
        requireBackup: false,
      }
      await expect(readFile(path, guard)).rejects.toThrow(/exceeds maximum size/)
    })
  })

  describe('readFileLines', () => {
    test('reads a range of lines', async () => {
      const path = await createTempFile('lines.txt', 'line1\nline2\nline3\nline4\nline5')
      const lines = await readFileLines(path, 2, 4)
      expect(lines).toEqual(['line2', 'line3', 'line4'])
    })

    test('clamps to file boundaries', async () => {
      const path = await createTempFile('short.txt', 'a\nb')
      const lines = await readFileLines(path, 1, 100)
      expect(lines).toEqual(['a', 'b'])
    })
  })

  describe('fileExists', () => {
    test('returns true for existing files', async () => {
      const path = await createTempFile('exists.txt', '')
      expect(await fileExists(path)).toBe(true)
    })

    test('returns false for non-existent files', async () => {
      expect(await fileExists(join(tempDir, 'nope.txt'))).toBe(false)
    })
  })

  describe('getFileInfo', () => {
    test('returns size, lines, language, and lastModified', async () => {
      const content = 'const x = 1;\nconst y = 2;\n'
      const path = await createTempFile('info.ts', content)
      const info = await getFileInfo(path)

      expect(info.size).toBeGreaterThan(0)
      expect(info.lines).toBe(3) // trailing newline creates empty last line
      expect(info.language).toBe('typescript')
      expect(info.lastModified).toBeInstanceOf(Date)
    })

    test('detects language from extension', async () => {
      const pyPath = await createTempFile('script.py', 'print("hi")')
      const pyInfo = await getFileInfo(pyPath)
      expect(pyInfo.language).toBe('python')

      const goPath = await createTempFile('main.go', 'package main')
      const goInfo = await getFileInfo(goPath)
      expect(goInfo.language).toBe('go')
    })

    test('returns unknown for unrecognized extensions', async () => {
      const path = await createTempFile('data.xyz', 'stuff')
      const info = await getFileInfo(path)
      expect(info.language).toBe('unknown')
    })
  })

  describe('searchInFile', () => {
    test('finds matches with context', async () => {
      const path = await createTempFile('search.ts', 'line1\nline2\nfoo bar\nline4\nline5')
      const results = await searchInFile(path, 'foo')
      expect(results.length).toBe(1)
      expect(results[0]!.line).toBe(3)
      expect(results[0]!.column).toBe(1)
      expect(results[0]!.match).toBe('foo')
      expect(results[0]!.context.before).toEqual(['line1', 'line2'])
      expect(results[0]!.context.after).toEqual(['line4', 'line5'])
    })

    test('finds regex matches', async () => {
      const path = await createTempFile('regex.ts', 'apple\nbanana\navocado')
      const results = await searchInFile(path, /a\w+a/)
      expect(results.length).toBe(2) // banana, avocado
    })

    test('returns empty for no matches', async () => {
      const path = await createTempFile('empty-search.txt', 'hello world')
      const results = await searchInFile(path, 'notfound')
      expect(results).toEqual([])
    })
  })

  describe('searchInDirectory', () => {
    test('searches across multiple files', async () => {
      await createTempFile('a.ts', 'const x = TODO')
      await createTempFile('b.ts', 'nothing here')
      await createTempFile('sub/c.ts', 'another TODO item')

      const results = await searchInDirectory(tempDir, 'TODO')
      expect(results.length).toBe(2)
    })

    test('filters by extension', async () => {
      await createTempFile('code.ts', 'TODO fix')
      await createTempFile('readme.md', 'TODO doc')

      const results = await searchInDirectory(tempDir, 'TODO', { extensions: ['.ts'] })
      expect(results.length).toBe(1)
      expect(results[0]!.file).toContain('code.ts')
    })

    test('ignores specified directories', async () => {
      await createTempFile('src/ok.ts', 'TODO here')
      await createTempFile('node_modules/dep.ts', 'TODO hidden')

      const results = await searchInDirectory(tempDir, 'TODO')
      expect(results.length).toBe(1)
    })
  })
})

// ── Write operations ──────────────────────────────────────────────────────────

describe('Write operations', () => {
  describe('writeFile', () => {
    test('writes content to a new file', async () => {
      const path = join(tempDir, 'newfile.txt')
      const result = await writeFile(path, 'hello')
      expect(result.success).toBe(true)
      expect(await fsReadFile(path, 'utf-8')).toBe('hello')
    })

    test('overwrites existing file', async () => {
      const path = await createTempFile('overwrite.txt', 'old')
      const result = await writeFile(path, 'new')
      expect(result.success).toBe(true)
      expect(await fsReadFile(path, 'utf-8')).toBe('new')
    })

    test('creates backup when guard requires it', async () => {
      const path = await createTempFile('backup-me.txt', 'original')
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [],
        blockedPatterns: [],
        maxFileSize: 10 * 1024 * 1024,
        requireBackup: true,
      }
      const result = await writeFile(path, 'updated', guard)
      expect(result.success).toBe(true)
      expect(result.backup).toBeDefined()

      const backupContent = await fsReadFile(result.backup!, 'utf-8')
      expect(backupContent).toBe('original')
    })

    test('blocks writes to guarded paths', async () => {
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [join(tempDir, 'secret')],
        blockedPatterns: [],
        maxFileSize: 10 * 1024 * 1024,
        requireBackup: false,
      }
      const result = await writeFile(join(tempDir, 'secret', 'data.txt'), 'nope', guard)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/blocked/)
    })

    test('blocks writes exceeding max file size', async () => {
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [],
        blockedPatterns: [],
        maxFileSize: 10,
        requireBackup: false,
      }
      const result = await writeFile(join(tempDir, 'big.txt'), 'x'.repeat(100), guard)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/exceeds maximum size/)
    })

    test('blocks writes matching blocked patterns', async () => {
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [],
        blockedPatterns: [/\.env/],
        maxFileSize: 10 * 1024 * 1024,
        requireBackup: false,
      }
      const result = await writeFile(join(tempDir, '.env'), 'SECRET=abc', guard)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/blocked pattern/)
    })
  })

  describe('createFile', () => {
    test('creates a new file', async () => {
      const path = join(tempDir, 'brand-new.ts')
      const result = await createFile(path, 'export const x = 1')
      expect(result.success).toBe(true)
      expect(await fsReadFile(path, 'utf-8')).toBe('export const x = 1')
    })

    test('fails if file already exists', async () => {
      const path = await createTempFile('exists.ts', 'content')
      const result = await createFile(path, 'new content')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/already exists/)
    })

    test('creates intermediate directories', async () => {
      const path = join(tempDir, 'deep', 'nested', 'file.ts')
      const result = await createFile(path, 'nested')
      expect(result.success).toBe(true)
      expect(await fsReadFile(path, 'utf-8')).toBe('nested')
    })
  })

  describe('deleteFile', () => {
    test('deletes a file and creates backup', async () => {
      const path = await createTempFile('delete-me.txt', 'goodbye')
      const result = await deleteFile(path)
      expect(result.success).toBe(true)
      expect(result.backup).toBeDefined()
      expect(await fileExists(path)).toBe(false)

      const backupContent = await fsReadFile(result.backup!, 'utf-8')
      expect(backupContent).toBe('goodbye')
    })

    test('fails for non-existent file', async () => {
      const result = await deleteFile(join(tempDir, 'ghost.txt'))
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not found/)
    })
  })

  describe('renameFile', () => {
    test('renames a file', async () => {
      const path = await createTempFile('old-name.txt', 'content')
      const newPath = join(tempDir, 'new-name.txt')
      const result = await renameFile(path, newPath)
      expect(result.success).toBe(true)
      expect(await fileExists(path)).toBe(false)
      expect(await fileExists(newPath)).toBe(true)
      expect(await fsReadFile(newPath, 'utf-8')).toBe('content')
    })

    test('fails for non-existent source', async () => {
      const result = await renameFile(join(tempDir, 'nope.txt'), join(tempDir, 'also-nope.txt'))
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not found/)
    })
  })

  describe('copyFile', () => {
    test('copies a file', async () => {
      const path = await createTempFile('source.txt', 'data')
      const dest = join(tempDir, 'copy.txt')
      const result = await copyFile(path, dest)
      expect(result.success).toBe(true)
      expect(await fsReadFile(dest, 'utf-8')).toBe('data')
      expect(await fsReadFile(path, 'utf-8')).toBe('data') // original preserved
    })

    test('fails for non-existent source', async () => {
      const result = await copyFile(join(tempDir, 'nope.txt'), join(tempDir, 'dest.txt'))
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not found/)
    })
  })
})

// ── Modification operations ───────────────────────────────────────────────────

describe('Modification operations', () => {
  describe('modifyLines', () => {
    test('adds a line', async () => {
      const path = await createTempFile('mod.txt', 'line1\nline2\nline3')
      const mod = await modifyLines(path, [
        { lineNumber: 2, type: 'add', replacement: 'inserted' },
      ])
      expect(mod.modified).toBe('line1\ninserted\nline2\nline3')
    })

    test('removes a line', async () => {
      const path = await createTempFile('mod.txt', 'line1\nline2\nline3')
      const mod = await modifyLines(path, [
        { lineNumber: 2, type: 'remove' },
      ])
      expect(mod.modified).toBe('line1\nline3')
    })

    test('modifies a line', async () => {
      const path = await createTempFile('mod.txt', 'line1\nline2\nline3')
      const mod = await modifyLines(path, [
        { lineNumber: 2, type: 'modify', replacement: 'CHANGED' },
      ])
      expect(mod.modified).toBe('line1\nCHANGED\nline3')
    })

    test('applies multiple changes', async () => {
      const path = await createTempFile('multi.txt', 'a\nb\nc\nd')
      const mod = await modifyLines(path, [
        { lineNumber: 1, type: 'modify', replacement: 'A' },
        { lineNumber: 4, type: 'remove' },
      ])
      expect(mod.modified).toBe('A\nb\nc')
    })
  })

  describe('insertAtLine', () => {
    test('inserts content at specified line', async () => {
      const path = await createTempFile('insert.txt', 'first\nthird')
      const mod = await insertAtLine(path, 2, 'second')
      expect(mod.modified).toBe('first\nsecond\nthird')
    })
  })

  describe('replaceLine', () => {
    test('replaces a single line', async () => {
      const path = await createTempFile('replace.txt', 'old\nkeep')
      const mod = await replaceLine(path, 1, 'new')
      expect(mod.modified).toBe('new\nkeep')
    })
  })

  describe('replaceRange', () => {
    test('replaces a range of lines', async () => {
      const path = await createTempFile('range.txt', 'a\nb\nc\nd\ne')
      const mod = await replaceRange(path, 2, 4, 'X\nY')
      expect(mod.modified).toBe('a\nX\nY\ne')
    })
  })

  describe('findAndReplace', () => {
    test('replaces string matches', async () => {
      const path = await createTempFile('fnr.txt', 'hello world\nhello again')
      const mod = await findAndReplace(path, 'hello', 'goodbye')
      expect(mod.modified).toBe('goodbye world\ngoodbye again')
      expect(mod.lineChanges.length).toBe(2)
    })

    test('replaces regex matches', async () => {
      const path = await createTempFile('fnr-regex.txt', 'foo123 bar456')
      const mod = await findAndReplace(path, /\d+/g, 'NUM')
      expect(mod.modified).toBe('fooNUM barNUM')
    })

    test('handles no matches gracefully', async () => {
      const path = await createTempFile('no-match.txt', 'nothing to change')
      const mod = await findAndReplace(path, 'xyz', 'abc')
      expect(mod.modified).toBe('nothing to change')
      expect(mod.lineChanges.length).toBe(0)
    })
  })

  describe('appendToFile', () => {
    test('appends content', async () => {
      const path = await createTempFile('append.txt', 'start')
      const mod = await appendToFile(path, '\nend')
      expect(mod.modified).toBe('start\nend')
    })
  })

  describe('prependToFile', () => {
    test('prepends content', async () => {
      const path = await createTempFile('prepend.txt', 'end')
      const mod = await prependToFile(path, 'start\n')
      expect(mod.modified).toBe('start\nend')
    })
  })
})

// ── Diff generation ───────────────────────────────────────────────────────────

describe('Diff generation', () => {
  describe('generateFileDiff', () => {
    test('returns empty string for identical content', () => {
      expect(generateFileDiff('hello', 'hello')).toBe('')
    })

    test('generates unified diff format', () => {
      const diff = generateFileDiff('line1\nline2\nline3', 'line1\nmodified\nline3')
      expect(diff).toContain('---')
      expect(diff).toContain('+++')
      expect(diff).toContain('@@')
      expect(diff).toContain('-line2')
      expect(diff).toContain('+modified')
    })

    test('shows additions', () => {
      const diff = generateFileDiff('a\nb', 'a\nb\nc')
      expect(diff).toContain('+c')
    })

    test('shows deletions', () => {
      const diff = generateFileDiff('a\nb\nc', 'a\nc')
      expect(diff).toContain('-b')
    })
  })

  describe('previewModification', () => {
    test('generates human-readable preview', () => {
      const mod: FileModification = {
        path: 'test.ts',
        original: 'old',
        modified: 'new',
        diff: '',
        lineChanges: [
          { lineNumber: 1, type: 'modify', original: 'old', replacement: 'new' },
        ],
      }
      const preview = previewModification(mod)
      expect(preview).toContain('test.ts')
      expect(preview).toContain('- old')
      expect(preview).toContain('+ new')
    })

    test('shows additions', () => {
      const mod: FileModification = {
        path: 'test.ts',
        original: '',
        modified: 'added line',
        diff: '',
        lineChanges: [
          { lineNumber: 1, type: 'add', replacement: 'added line' },
        ],
      }
      const preview = previewModification(mod)
      expect(preview).toContain('+ added line')
    })

    test('shows removals', () => {
      const mod: FileModification = {
        path: 'test.ts',
        original: 'removed line',
        modified: '',
        diff: '',
        lineChanges: [
          { lineNumber: 1, type: 'remove', original: 'removed line' },
        ],
      }
      const preview = previewModification(mod)
      expect(preview).toContain('- removed line')
    })
  })

  describe('diffFiles', () => {
    test('diffs two files', async () => {
      const pathA = await createTempFile('a.txt', 'hello\nworld')
      const pathB = await createTempFile('b.txt', 'hello\nearth')
      const diff = await diffFiles(pathA, pathB)
      expect(diff).toContain('-world')
      expect(diff).toContain('+earth')
    })

    test('returns empty for identical files', async () => {
      const pathA = await createTempFile('same1.txt', 'identical')
      const pathB = await createTempFile('same2.txt', 'identical')
      const diff = await diffFiles(pathA, pathB)
      expect(diff).toBe('')
    })
  })
})

// ── Batch operations ──────────────────────────────────────────────────────────

describe('Batch operations', () => {
  describe('createBatch', () => {
    test('creates a pending batch', () => {
      const ops: FileOperation[] = [
        { type: 'write', path: '/tmp/test.txt', content: 'hello' },
      ]
      const batch = createBatch(ops)
      expect(batch.id).toMatch(/^batch-/)
      expect(batch.status).toBe('pending')
      expect(batch.operations).toEqual(ops)
    })

    test('throws when guard blocks an operation', () => {
      const guard: FileGuard = {
        allowedPaths: ['/allowed'],
        blockedPaths: [],
        blockedPatterns: [],
        maxFileSize: 1024,
        requireBackup: false,
      }
      expect(() => createBatch(
        [{ type: 'write', path: '/forbidden/file.txt', content: 'x' }],
        guard,
      )).toThrow(/Batch validation failed/)
    })
  })

  describe('previewBatch', () => {
    test('previews write operations', async () => {
      const path = await createTempFile('batch-preview.txt', 'original')
      const batch = createBatch([
        { type: 'write', path, content: 'updated' },
      ])
      const previews = await previewBatch(batch)
      expect(previews.length).toBe(1)
      expect(previews[0]!.original).toBe('original')
      expect(previews[0]!.modified).toBe('updated')
      expect(previews[0]!.diff).toContain('-original')
      expect(previews[0]!.diff).toContain('+updated')
    })

    test('previews create operations', async () => {
      const batch = createBatch([
        { type: 'create', path: join(tempDir, 'new.txt'), content: 'fresh' },
      ])
      const previews = await previewBatch(batch)
      expect(previews.length).toBe(1)
      expect(previews[0]!.original).toBe('')
      expect(previews[0]!.modified).toBe('fresh')
    })

    test('previews delete operations', async () => {
      const path = await createTempFile('batch-delete.txt', 'doomed')
      const batch = createBatch([{ type: 'delete', path }])
      const previews = await previewBatch(batch)
      expect(previews.length).toBe(1)
      expect(previews[0]!.original).toBe('doomed')
      expect(previews[0]!.modified).toBe('')
    })
  })

  describe('applyBatch', () => {
    test('applies all operations', async () => {
      const path1 = join(tempDir, 'batch-a.txt')
      const path2 = join(tempDir, 'batch-b.txt')

      const batch = createBatch([
        { type: 'create', path: path1, content: 'file a' },
        { type: 'create', path: path2, content: 'file b' },
      ])
      const results = await applyBatch(batch)
      expect(results.every(r => r.success)).toBe(true)
      expect(batch.status).toBe('applied')
      expect(await fsReadFile(path1, 'utf-8')).toBe('file a')
      expect(await fsReadFile(path2, 'utf-8')).toBe('file b')
    })

    test('rolls back on failure', async () => {
      const existingPath = await createTempFile('pre-existing.txt', 'keep this')

      const batch = createBatch([
        { type: 'write', path: existingPath, content: 'overwritten' },
        { type: 'create', path: existingPath, content: 'conflict' }, // will fail, already exists now
      ])
      const results = await applyBatch(batch)
      expect(batch.status).toBe('rolled_back')
      expect(results.some(r => !r.success)).toBe(true)
    })
  })

  describe('rollbackBatch', () => {
    test('rolls back applied changes', async () => {
      const path = await createTempFile('rollback.txt', 'original')
      const batch = createBatch([
        { type: 'write', path, content: 'changed' },
      ])
      await previewBatch(batch)
      await applyBatch(batch)
      expect(await fsReadFile(path, 'utf-8')).toBe('changed')

      const results = await rollbackBatch(batch)
      expect(results.every(r => r.success)).toBe(true)
      expect(batch.status).toBe('rolled_back')
      expect(await fsReadFile(path, 'utf-8')).toBe('original')
    })

    test('fails for non-applied batches', async () => {
      const batch = createBatch([{ type: 'read', path: '/tmp/x' }])
      const results = await rollbackBatch(batch)
      expect(results[0]!.success).toBe(false)
      expect(results[0]!.error).toMatch(/Cannot rollback/)
    })
  })
})

// ── Guard validation ──────────────────────────────────────────────────────────

describe('Guard validation', () => {
  describe('createDefaultGuard', () => {
    test('blocks node_modules', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/node_modules/pkg/index.js', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
      expect(check.reason).toMatch(/blocked/)
    })

    test('blocks .git directory', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/.git/config', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })

    test('blocks .env files', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/.env', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })

    test('blocks .env.local files', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/.env.local', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })

    test('blocks secret files via pattern', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/secrets.json', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })

    test('blocks private key files via pattern', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/server.key', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })

    test('allows normal source files', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/project/src/index.ts', content: '' },
        guard,
      )
      expect(check.allowed).toBe(true)
    })

    test('blocks paths outside project root', () => {
      const guard = createDefaultGuard('/project')
      const check = validateOperation(
        { type: 'write', path: '/etc/passwd', content: '' },
        guard,
      )
      expect(check.allowed).toBe(false)
    })
  })

  describe('validateOperation', () => {
    test('validates rename target path', () => {
      const guard: FileGuard = {
        allowedPaths: [tempDir],
        blockedPaths: [join(tempDir, 'blocked')],
        blockedPatterns: [],
        maxFileSize: 1024,
        requireBackup: false,
      }
      const check = validateOperation(
        { type: 'rename', path: join(tempDir, 'a.txt'), newPath: join(tempDir, 'blocked', 'b.txt') },
        guard,
      )
      expect(check.allowed).toBe(false)
      expect(check.reason).toMatch(/Target path/)
    })
  })
})

// ── Backup ────────────────────────────────────────────────────────────────────

describe('Backup', () => {
  test('creates backup in .opencode/.backups/', async () => {
    const path = await createTempFile('backup-test.txt', 'important data')
    const backupPath = await createBackup(path)

    expect(backupPath).toContain('.opencode')
    expect(backupPath).toContain('.backups')
    expect(backupPath).toContain('.bak')
    expect(await fsReadFile(backupPath, 'utf-8')).toBe('important data')
  })

  test('preserves original file', async () => {
    const path = await createTempFile('preserve.txt', 'keep me')
    await createBackup(path)
    expect(await fsReadFile(path, 'utf-8')).toBe('keep me')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('handles empty files', async () => {
    const path = await createTempFile('empty.txt', '')
    const content = await readFile(path)
    expect(content).toBe('')

    const info = await getFileInfo(path)
    expect(info.lines).toBe(1) // single empty line
    expect(info.size).toBe(0)
  })

  test('handles files with only newlines', async () => {
    const path = await createTempFile('newlines.txt', '\n\n\n')
    const lines = await readFileLines(path, 1, 10)
    expect(lines.length).toBe(4) // 3 newlines = 4 empty strings
  })

  test('handles unicode content', async () => {
    const content = '日本語テスト\n🎉 emoji line\nCafé résumé'
    const path = await createTempFile('unicode.txt', content)
    const read = await readFile(path)
    expect(read).toBe(content)
  })

  test('readFileLines with 0 startLine clamps to first line', async () => {
    const path = await createTempFile('clamp.txt', 'first\nsecond')
    const lines = await readFileLines(path, 0, 1)
    expect(lines).toEqual(['first'])
  })

  test('searchInFile finds multiple matches on one line', async () => {
    const path = await createTempFile('multi-match.txt', 'aaa bbb aaa')
    const results = await searchInFile(path, /aaa/g)
    expect(results.length).toBe(2)
    expect(results[0]!.column).toBe(1)
    expect(results[1]!.column).toBe(9)
  })

  test('writeFile creates parent directories', async () => {
    const path = join(tempDir, 'deep', 'nested', 'dir', 'file.txt')
    const result = await writeFile(path, 'deep content')
    expect(result.success).toBe(true)
    expect(await fsReadFile(path, 'utf-8')).toBe('deep content')
  })

  test('findAndReplace with special regex characters in string search', async () => {
    const path = await createTempFile('special.txt', 'price is $100.00')
    const mod = await findAndReplace(path, '$100.00', '€200.00')
    expect(mod.modified).toBe('price is €200.00')
  })

  test('modifyLines handles out-of-range line numbers gracefully', async () => {
    const path = await createTempFile('short.txt', 'only one line')
    const mod = await modifyLines(path, [
      { lineNumber: 999, type: 'modify', replacement: 'nowhere' },
    ])
    expect(mod.modified).toBe('only one line')
  })
})

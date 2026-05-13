import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { indexCommand } from './index-cmd.js'
import {
  indexCodebase,
  saveIndex,
  type CodebaseIndex,
} from '../lib/codebase-indexer.js'

// ── Capture console output ────────────────────────────────────────────────────

let captured: string[]
const origLog = console.log
const origError = console.error

function startCapture() {
  captured = []
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
}

function stopCapture(): string[] {
  console.log = origLog
  console.error = origError
  return captured
}

// ── Temp project helper ───────────────────────────────────────────────────────

let tmpDir: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'oac-index-cmd-test-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function createTempProject(name: string, files: Record<string, string>): Promise<string> {
  const root = join(tmpDir, name)
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath)
    await mkdir(join(absPath, '..'), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
  }
  return root
}

// ── indexCommand tests ────────────────────────────────────────────────────────

describe('indexCommand', () => {
  test('runs full index and prints summary', async () => {
    const root = await createTempProject('idx-summary', {
      'package.json': JSON.stringify({
        dependencies: { express: '^4.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'tsconfig.json': '{}',
      'src/index.ts': 'export const main = () => {}',
      'src/utils.ts': 'export function help() { return 42 }',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: false, showStack: false, showTree: false, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Codebase Index Summary')
      expect(joined).toContain('Modules')
      expect(joined).toContain('Languages')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--show-stack displays tech stack', async () => {
    const root = await createTempProject('idx-stack', {
      'package.json': JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
      }),
      'tsconfig.json': '{}',
      'src/App.tsx': 'export default function App() { return <div/> }',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: true, showStack: true, showTree: false, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Detected Tech Stack')
      expect(joined).toContain('Languages')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--show-tree displays file tree', async () => {
    const root = await createTempProject('idx-tree', {
      'package.json': '{}',
      'src/index.ts': 'export {}',
      'src/lib/utils.ts': 'export {}',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: true, showStack: false, showTree: true, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('File Tree')
      expect(joined).toContain('src')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--show-conventions displays conventions', async () => {
    const root = await createTempProject('idx-conventions', {
      'package.json': JSON.stringify({ dependencies: { zustand: '^4.0.0' } }),
      'src/user-service.ts': `import { create } from 'zustand'\nexport const useStore = create(() => ({}))`,
      'src/auth-handler.ts': `export function handle() { try { return 1 } catch(e) { throw e } }`,
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: true, showStack: false, showTree: false, showConventions: true })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Detected Project Conventions')
      expect(joined).toContain('File naming')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--show-deps shows dependency graph for a file', async () => {
    const root = await createTempProject('idx-deps', {
      'package.json': '{}',
      'src/index.ts': `import { helper } from './utils.js'\nconsole.log(helper())`,
      'src/utils.ts': 'export function helper() { return 42 }',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: true, showStack: false, showDeps: 'src/index.ts', showTree: false, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Dependencies for')
      expect(joined).toContain('src/index.ts')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--show-deps throws for missing file', async () => {
    const root = await createTempProject('idx-deps-missing', {
      'package.json': '{}',
      'src/index.ts': 'export {}',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await expect(
        indexCommand({ refresh: true, showStack: false, showDeps: 'nonexistent.ts', showTree: false, showConventions: false })
      ).rejects.toThrow('not found')
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })

  test('--refresh forces re-index even with cached data', async () => {
    const root = await createTempProject('idx-refresh', {
      'package.json': '{}',
      'src/app.ts': 'export const x = 1',
    })

    const index = await indexCodebase(root)
    await saveIndex(root, index)

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: true, showStack: false, showTree: false, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Codebase Index Summary')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('uses cached index when available and fresh', async () => {
    const root = await createTempProject('idx-cached', {
      'package.json': '{}',
      'src/app.ts': 'export const x = 1',
    })

    const index = await indexCodebase(root)
    await saveIndex(root, index)

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await indexCommand({ refresh: false, showStack: false, showTree: false, showConventions: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('cached')
    } finally {
      process.chdir(origCwd)
    }
  })
})

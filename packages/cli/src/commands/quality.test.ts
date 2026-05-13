import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { qualityCommand } from './quality.js'

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

// ── Git-initialized temp project helper ───────────────────────────────────────

let tmpDir: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'oac-quality-cmd-test-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function createGitProject(name: string, files: Record<string, string>): Promise<string> {
  const root = join(tmpDir, name)
  await mkdir(root, { recursive: true })

  execSync('git init', { cwd: root, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: root, stdio: 'pipe' })

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath)
    await mkdir(join(absPath, '..'), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
  }

  execSync('git add -A', { cwd: root, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: root, stdio: 'pipe' })

  return root
}

// ── qualityCommand tests ──────────────────────────────────────────────────────

describe('qualityCommand', () => {
  test('reports no changes when nothing is modified', async () => {
    const root = await createGitProject('quality-clean', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('No changed files')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('analyzes uncommitted changes', async () => {
    const root = await createGitProject('quality-changes', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\nexport const y = 3\n', 'utf-8')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Quality Analysis')
      expect(joined).toContain('Score')
      expect(joined).toContain('Grade')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--report generates detailed report', async () => {
    const root = await createGitProject('quality-report', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\nexport function foo() { return "bar" }\n', 'utf-8')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: true, review: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Detailed Quality Report')
      expect(joined).toContain('Change Statistics')
      expect(joined).toContain('Signal Breakdown')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--review runs automated code review', async () => {
    const root = await createGitProject('quality-review', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(
      join(root, 'src/app.ts'),
      `// TODO: fix this\nexport const x = 2\nconsole.log('debug')\n`,
      'utf-8',
    )

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: true })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Automated Code Review')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--threshold passes when score meets minimum', async () => {
    const root = await createGitProject('quality-pass', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\n', 'utf-8')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: false, threshold: 10 })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('meets threshold')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--threshold fails when score is below minimum', async () => {
    const root = await createGitProject('quality-fail', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\n', 'utf-8')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      const promise = qualityCommand({ report: false, review: false, threshold: 999 })
      await expect(promise).rejects.toThrow()
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })

  test('--review detects debug statements', async () => {
    const root = await createGitProject('quality-debug', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(
      join(root, 'src/app.ts'),
      `export const x = 2\nconsole.log('debug info')\nconsole.debug('more debug')\n`,
      'utf-8',
    )

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: true })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Debug statement')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('displays color-coded grade', async () => {
    const root = await createGitProject('quality-grade', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\n', 'utf-8')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toMatch(/Grade:.*[ABCDF]/)
    } finally {
      process.chdir(origCwd)
    }
  })

  test('handles staged changes', async () => {
    const root = await createGitProject('quality-staged', {
      'src/app.ts': 'export const x = 1',
      'package.json': '{}',
    })

    await writeFile(join(root, 'src/app.ts'), 'export const x = 2\nexport const y = 3\n', 'utf-8')
    execSync('git add src/app.ts', { cwd: root, stdio: 'pipe' })

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await qualityCommand({ report: false, review: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Quality Analysis')
    } finally {
      process.chdir(origCwd)
    }
  })
})

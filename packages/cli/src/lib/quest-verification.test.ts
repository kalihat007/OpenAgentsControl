import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectChecks, resolveNodeScriptRunner } from './quest-verification.js'

const tempDirs: string[] = []

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = join(tmpdir(), `oac-quest-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(dir, { recursive: true })
  tempDirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content)
  }
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('resolveNodeScriptRunner', () => {
  it('prefers bun when bun.lock is present', async () => {
    const projectRoot = await makeProject({
      'bun.lock': '',
      'package.json': JSON.stringify({ scripts: { test: 'true' } }),
    })
    const runner = await resolveNodeScriptRunner(projectRoot)
    expect(runner).toBe('bun')
  })

  it('returns npm or bun for package.json projects', async () => {
    const projectRoot = await makeProject({
      'package.json': JSON.stringify({ scripts: { test: 'true' } }),
    })
    const runner = await resolveNodeScriptRunner(projectRoot)
    expect(runner === 'npm' || runner === 'bun').toBe(true)
  })
})

describe('detectChecks', () => {
  it('uses the resolved runner for package.json scripts', async () => {
    const projectRoot = await makeProject({
      'package.json': JSON.stringify({
        scripts: {
          test: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
          lint: 'node -e "process.exit(0)"',
        },
      }),
    })
    const runner = await resolveNodeScriptRunner(projectRoot)
    expect(runner).not.toBeNull()
    const checks = await detectChecks(projectRoot)
    expect(checks.map((check) => check.command)).toEqual([
      `${runner} run test`,
      `${runner} run build`,
      `${runner} run lint`,
    ])
  })
})

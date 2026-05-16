import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { swarmStatusCommand } from './swarm-status.js'

describe('swarmStatusCommand', () => {
  let tmpRoot: string
  let prevCwd: string

  beforeEach(async () => {
    prevCwd = process.cwd()
    tmpRoot = await mkdtemp(join(tmpdir(), 'oac-swarm-status-'))
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await mkdir(runsDir, { recursive: true })
    await writeFile(
      join(runsDir, 'summary.json'),
      JSON.stringify({
        runId: 'swarm-test123',
        objective: 'test objective',
        createdAt: '2026-01-01T00:00:00.000Z',
        executionMode: 'simulate',
        acceptance: { passed: 0, failed: 0, unverified: 5 },
      }),
    )
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify({ type: 'task.started', message: 'Agent started' }) + '\n',
    )
    process.chdir(tmpRoot)
  })

  afterEach(async () => {
    process.chdir(prevCwd)
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('lists runs when no session id given', async () => {
    await expect(swarmStatusCommand()).resolves.toBeUndefined()
  })

  it('shows session details for a valid id', async () => {
    await expect(swarmStatusCommand('swarm-test123')).resolves.toBeUndefined()
  })
})

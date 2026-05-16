import { describe, it, expect } from 'bun:test'
import { EventEmitter } from 'node:events'
import {
  isOpencodeAvailable,
  opencodeUnavailableMessage,
  runOpencodeTask,
  type SpawnDeps,
} from './opencode-spawn.js'

function mockSpawnSuccess(stdout = '{"ok":true}\n') {
  return () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: (signal?: string) => void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(stdout))
      child.emit('close', 0, null)
    })
    return child as ReturnType<NonNullable<SpawnDeps['spawn']>>
  }
}

function mockSpawnFailure(code = 1, stderr = 'agent not found') {
  return () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: (signal?: string) => void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(() => {
      child.stderr.emit('data', Buffer.from(stderr))
      child.emit('close', code, null)
    })
    return child as ReturnType<NonNullable<SpawnDeps['spawn']>>
  }
}

describe('opencode-spawn', () => {
  it('isOpencodeAvailable returns true when opencode --version succeeds', () => {
    const deps: SpawnDeps = {
      spawnSync: () =>
        ({
          status: 0,
          stdout: '1.0.0',
          stderr: '',
        }) as ReturnType<SpawnDeps['spawnSync']>,
    }
    expect(isOpencodeAvailable(deps)).toBe(true)
  })

  it('isOpencodeAvailable returns false when binary is missing', () => {
    const deps: SpawnDeps = {
      spawnSync: () => {
        throw new Error('ENOENT')
      },
    }
    expect(isOpencodeAvailable(deps)).toBe(false)
  })

  it('opencodeUnavailableMessage mentions install hint', () => {
    expect(opencodeUnavailableMessage()).toContain('opencode')
    expect(opencodeUnavailableMessage()).toContain('opencode-ai')
  })

  it('runOpencodeTask resolves ok on exit code 0', async () => {
    const result = await runOpencodeTask(
      { agent: 'CoderAgent', objective: 'fix typo', cwd: '/tmp/project' },
      { spawn: mockSpawnSuccess() },
    )
    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('runOpencodeTask resolves not ok on non-zero exit', async () => {
    const result = await runOpencodeTask(
      { agent: 'CoderAgent', objective: 'fail', cwd: '/tmp/project' },
      { spawn: mockSpawnFailure(2, 'unknown agent') },
    )
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(2)
    expect(result.errorMessage).toContain('unknown agent')
  })

  it('runOpencodeTask passes agent and objective to opencode run', async () => {
    let capturedArgs: string[] = []
    const deps: SpawnDeps = {
      spawn: (_cmd, args) => {
        capturedArgs = [...args]
        return mockSpawnSuccess()()
      },
    }
    await runOpencodeTask(
      { agent: 'TestEngineer', objective: 'add unit tests', cwd: '/proj' },
      deps,
    )
    expect(capturedArgs).toContain('run')
    expect(capturedArgs).toContain('--agent')
    expect(capturedArgs).toContain('TestEngineer')
    expect(capturedArgs).toContain('--dir')
    expect(capturedArgs).toContain('/proj')
    expect(capturedArgs).toContain('add unit tests')
  })
})

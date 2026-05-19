import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { questStatusCommand } from './quest-status.js'
import { CLAUDE_BRIDGE_COMMAND } from '../lib/run-handoff.js'

describe('questStatusCommand', () => {
  let tmpRoot: string
  let prevCwd: string

  beforeEach(async () => {
    prevCwd = process.cwd()
    tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-status-'))
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await mkdir(runsDir, { recursive: true })
    await writeFile(
      join(runsDir, 'quest.json'),
      JSON.stringify({
        version: '4',
        questId: 'swarm-test123',
        runId: 'swarm-test123',
        objective: 'test objective',
        scenario: 'code_with_spec',
        state: 'WAITING',
        intensity: 'standard',
        trustLabel: 'planned_only',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        experts: [],
        tasks: [],
        acceptanceCriteria: [],
        artifacts: { runDir: '.oac/runs/swarm-test123', quest: 'quest.json', spec: 'spec.json' },
        nextSuggestedAction: 'resume',
        runtimes: {
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
          kimi: { command: 'kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml', resumePrompt: 'resume' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume' },
        },
      }),
    )
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify({ type: 'handoff.ready', message: 'Handoff ready' }) + '\n',
    )
    process.chdir(tmpRoot)
  })

  afterEach(async () => {
    process.chdir(prevCwd)
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('lists Quest runs when no id is given', async () => {
    await expect(questStatusCommand()).resolves.toBeUndefined()
  })

  it('lists reconciled Quest state from events', async () => {
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'validation',
        data: {
          result: {
            timestamp: new Date().toISOString(),
            checks: [{ name: 'test', command: 'npm test', passed: true }],
            overallPassed: true,
            summary: '1/1 checks passed',
          },
        },
      }) + '\n',
    )

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questStatusCommand()
    } finally {
      console.log = originalLog
    }

    expect(output.join('\n')).toContain('tested')
  })

  it('shows Quest details for a valid id', async () => {
    await expect(questStatusCommand('swarm-test123')).resolves.toBeUndefined()
  })

  it('prints machine-readable reconciled JSON for a quest', async () => {
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await writeFile(
      join(runsDir, 'events.ndjson'),
      [
        JSON.stringify({
          timestamp: '2026-05-17T00:00:00.000Z',
          type: 'runtime.assigned',
          data: { runtime: 'kimi', taskIds: ['task-1'] },
        }),
        JSON.stringify({
          timestamp: '2026-05-17T00:00:01.000Z',
          type: 'handoff.outgoing',
          data: { fromRuntime: 'kimi', toRuntime: 'opencode', taskIds: ['task-1'] },
        }),
      ].join('\n') + '\n',
    )

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questStatusCommand('swarm-test123', { json: true })
    } finally {
      console.log = originalLog
    }

    const parsed = JSON.parse(output.join('\n'))
    expect(parsed.questId).toBe('swarm-test123')
    expect(parsed.runtimes.kimi.assigned).toBe(1)
    expect(parsed.handoffs).toHaveLength(1)
    expect(parsed.recentEvents).toHaveLength(2)
  })

  it('displays per-task progress percentage for in-progress tasks', async () => {
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await writeFile(
      join(runsDir, 'quest.json'),
      JSON.stringify({
        version: '8',
        questId: 'swarm-test123',
        runId: 'swarm-test123',
        objective: 'test objective',
        scenario: 'code_with_spec',
        state: 'EXECUTE',
        intensity: 'standard',
        trustLabel: 'changed',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        experts: [],
        tasks: [
          { id: 'task-1', title: 'First', status: 'completed', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
          { id: 'task-2', title: 'Second', status: 'in_progress', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
          { id: 'task-3', title: 'Third', status: 'pending', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
        ],
        acceptanceCriteria: [],
        artifacts: { runDir: '.oac/runs/swarm-test123', quest: 'quest.json', spec: 'spec.json' },
        nextSuggestedAction: 'resume',
        runtimes: {
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
          kimi: { command: 'kimi', resumePrompt: 'resume' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume' },
        },
      }),
    )
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify({
        timestamp: '2026-05-17T00:00:00.000Z',
        type: 'task.progress',
        data: { taskId: 'task-2', percent: 42, checkpoint: 'lib/auth.ts', message: 'Verifying token' },
      }) + '\n',
    )

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questStatusCommand('swarm-test123')
    } finally {
      console.log = originalLog
    }

    const text = output.join('\n')
    expect(text).toContain('42%')
    expect(text).toContain('Second')
  })

  it('watch mode renders initial quest state and reacts to events.ndjson changes', async () => {
    const runsDir = join(tmpRoot, '.oac', 'runs', 'swarm-test123')
    await writeFile(
      join(runsDir, 'quest.json'),
      JSON.stringify({
        version: '8',
        questId: 'swarm-test123',
        runId: 'swarm-test123',
        objective: 'watch test',
        scenario: 'code_with_spec',
        state: 'EXECUTE',
        intensity: 'standard',
        trustLabel: 'changed',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        experts: [],
        tasks: [
          { id: 'task-1', title: 'First', status: 'in_progress', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
        ],
        acceptanceCriteria: [],
        artifacts: { runDir: '.oac/runs/swarm-test123', quest: 'quest.json', spec: 'spec.json' },
        nextSuggestedAction: 'resume',
        runtimes: {
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
          kimi: { command: 'kimi', resumePrompt: 'resume' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume' },
        },
      }),
    )
    await writeFile(join(runsDir, 'events.ndjson'), '')

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    const originalOn = process.on
    const originalExit = process.exit
    let sigintHandler: (() => void) | undefined
    process.on = ((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler
      return process
    }) as typeof process.on
    process.exit = (() => {}) as typeof process.exit

    const watchPromise = questStatusCommand('swarm-test123', { watch: true })

    // Wait for initial render
    await new Promise((r) => setTimeout(r, 150))

    // Append an event to trigger the file watcher
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify({
        timestamp: '2026-05-17T00:00:00.000Z',
        type: 'task_update',
        data: { taskId: 'task-1', status: 'completed' },
      }) + '\n',
    )

    // Wait for debounce + render
    await new Promise((r) => setTimeout(r, 400))

    // Stop watch
    sigintHandler?.()
    await watchPromise

    console.log = originalLog
    process.on = originalOn
    process.exit = originalExit

    const text = output.join('\n')
    expect(text).toContain('swarm-test123')
    expect(text).toContain('EXECUTE')
    expect(text).toContain('task-1')
    // The watcher should have re-rendered after the file change, showing completed state
    expect(text).toContain('✓ task-1')
  })
})

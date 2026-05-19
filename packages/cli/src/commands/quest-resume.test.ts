import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { questResumeCommand } from './quest-resume.js'
import { CommandUsageError } from '../lib/errors.js'
import { CLAUDE_BRIDGE_COMMAND, CODEX_COMMAND } from '../lib/run-handoff.js'
import { buildTaskProgressEvent } from '../lib/quest-reconciler.js'

describe('questResumeCommand', () => {
  let tmpRoot: string
  let prevCwd: string

  beforeEach(async () => {
    prevCwd = process.cwd()
    tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-resume-'))
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
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume prompt' },
          kimi: { command: 'kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml', resumePrompt: 'resume prompt' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume prompt' },
        },
      }),
    )
    process.chdir(tmpRoot)
  })

  afterEach(async () => {
    process.chdir(prevCwd)
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('prints resume commands for a valid Quest', async () => {
    await expect(questResumeCommand('swarm-test123')).resolves.toBeUndefined()
  })

  it('requires a Quest id', async () => {
    await expect(questResumeCommand(undefined)).rejects.toBeInstanceOf(CommandUsageError)
  })

  it('supports --runtime codex handoff for legacy quests without codex field', async () => {
    await questResumeCommand('swarm-test123', { runtime: 'codex' })
  })

  it('backfills codex runtime when loading quest.json', async () => {
    const { loadQuestRun } = await import('../lib/quest-run.js')
    const quest = await loadQuestRun(process.cwd(), 'swarm-test123')
    expect(quest?.runtimes.codex.command).toBe(CODEX_COMMAND)
  })

  it('--from-checkpoint shows checkpoint in resume prompt when task.progress exists', async () => {
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
        ],
        acceptanceCriteria: [],
        artifacts: { runDir: '.oac/runs/swarm-test123', quest: 'quest.json', spec: 'spec.json' },
        nextSuggestedAction: 'resume',
        runtimes: {
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume prompt' },
          kimi: { command: 'kimi', resumePrompt: 'resume prompt' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume prompt' },
          codex: { command: CODEX_COMMAND, resumePrompt: 'resume prompt' },
        },
      }),
    )
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify(buildTaskProgressEvent('task-2', 42, 'lib/auth.ts:verifyToken()', 'Implementing JWT verification')) + '\n',
    )

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questResumeCommand('swarm-test123', { fromCheckpoint: true })
    } finally {
      console.log = originalLog
    }

    const text = output.join('\n')
    expect(text).toContain('Checkpoint: lib/auth.ts:verifyToken()')
    expect(text).toContain('Progress: 42%')
    expect(text).toContain('Last status: Implementing JWT verification')
    expect(text).toContain('task-2')
  })

  it('--from-checkpoint falls back to normal prompt when no checkpoint data', async () => {
    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questResumeCommand('swarm-test123', { fromCheckpoint: true })
    } finally {
      console.log = originalLog
    }

    const text = output.join('\n')
    expect(text).toContain('resume prompt')
    expect(text).not.toContain('Checkpoint:')
  })

  it('--from-checkpoint with --runtime shows checkpoint block', async () => {
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
          { id: 'task-2', title: 'Second', status: 'in_progress', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
        ],
        acceptanceCriteria: [],
        artifacts: { runDir: '.oac/runs/swarm-test123', quest: 'quest.json', spec: 'spec.json' },
        nextSuggestedAction: 'resume',
        runtimes: {
          opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume prompt' },
          kimi: { command: 'kimi', resumePrompt: 'resume prompt' },
          claude: { command: CLAUDE_BRIDGE_COMMAND, resumePrompt: 'resume prompt' },
          codex: { command: CODEX_COMMAND, resumePrompt: 'resume prompt' },
        },
      }),
    )
    await writeFile(
      join(runsDir, 'events.ndjson'),
      JSON.stringify(buildTaskProgressEvent('task-2', 67, 'src/index.ts', 'Refactoring entry point')) + '\n',
    )

    const originalLog = console.log
    const output: string[] = []
    console.log = (message?: unknown) => {
      output.push(String(message ?? ''))
    }

    try {
      await questResumeCommand('swarm-test123', { runtime: 'kimi', fromCheckpoint: true })
    } finally {
      console.log = originalLog
    }

    const text = output.join('\n')
    expect(text).toContain('Checkpoint:')
    expect(text).toContain('task-2')
    expect(text).toContain('src/index.ts')
    expect(text).toContain('67%')
    expect(text).toContain('Refactoring entry point')
  })
})

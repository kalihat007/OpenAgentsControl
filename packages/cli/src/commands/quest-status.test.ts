import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { questStatusCommand } from './quest-status.js'

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
          claude: { command: 'claude --plugin-dir ~/.claude/plugins/openagents-control-bridge', resumePrompt: 'resume' },
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
})

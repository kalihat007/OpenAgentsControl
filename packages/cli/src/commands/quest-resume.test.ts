import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { questResumeCommand } from './quest-resume.js'
import { CommandUsageError } from '../lib/errors.js'
import { CLAUDE_BRIDGE_COMMAND } from '../lib/run-handoff.js'

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
})

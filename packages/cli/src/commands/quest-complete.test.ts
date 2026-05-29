import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { questCompleteCommand } from './quest-complete.js'
import { loadEvents, loadReconciledQuest } from '../lib/quest-reconciler.js'
import { persistQuestRun, type QuestRun } from '../lib/quest-run.js'

describe('quest-complete command', () => {
  let projectRoot: string
  let previousCwd: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-quest-complete-'))
    process.chdir(projectRoot)
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('reflects standard v8 quests before marking them complete', async () => {
    const quest = makeQuest('quest-complete-reflect')
    await persistQuestRun(projectRoot, quest)

    await questCompleteCommand(quest.questId, { extractMemory: false })

    const completed = await loadReconciledQuest(projectRoot, quest.questId)
    expect(completed?.state).toBe('COMPLETE')

    const events = await loadEvents(projectRoot, quest.questId)
    expect(events.some((event) => event.type === 'state_change' && event.data.to === 'REFLECT')).toBe(true)
    expect(events.some((event) => event.type === 'state_change' && event.data.to === 'COMPLETE')).toBe(true)
    expect(events.some((event) => event.type === 'next_steps.suggested')).toBe(true)
    expect(completed?.nextStepSuggestions.length).toBeGreaterThan(0)

    const reflection = JSON.parse(
      await readFile(join(projectRoot, '.oac', 'runs', quest.questId, 'reflection.json'), 'utf8'),
    ) as { questId: string }
    expect(reflection.questId).toBe(quest.questId)

    const summary = JSON.parse(
      await readFile(join(projectRoot, '.oac', 'runs', quest.questId, 'summary.json'), 'utf8'),
    ) as { nextStepSuggestions: Array<{ title: string }> }
    expect(summary.nextStepSuggestions.length).toBeGreaterThan(0)
    expect(summary.nextStepSuggestions.some((suggestion) => suggestion.title.includes('verified surfaces'))).toBe(true)
  })
})

function makeQuest(questId: string): QuestRun {
  const now = new Date().toISOString()
  return {
    version: '8',
    questId,
    runId: questId,
    objective: 'Complete command test',
    scenario: 'code_with_spec',
    state: 'VERIFY',
    intensity: 'standard',
    trustLabel: 'tested',
    createdAt: now,
    updatedAt: now,
    experts: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Task one',
        status: 'completed',
        expert: 'coder',
        dependsOn: [],
        acceptanceCriteria: ['task completed'],
      },
    ],
    acceptanceCriteria: ['completion can reflect'],
    artifacts: {
      runDir: `.oac/runs/${questId}`,
      quest: 'quest.json',
      spec: 'spec.json',
      reflection: 'reflection.json',
    },
    nextSuggestedAction: 'complete',
    runtimes: {
      opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
      kimi: { command: 'kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml', resumePrompt: 'resume' },
      claude: { command: 'claude', resumePrompt: 'resume' },
      codex: { command: 'codex', resumePrompt: 'resume' },
    },
    changedFiles: ['src/example.ts'],
    verification: {
      timestamp: now,
      checks: [
        {
          name: 'test',
          command: 'bun test',
          passed: true,
        },
      ],
      overallPassed: true,
      summary: 'test passed',
    },
  }
}

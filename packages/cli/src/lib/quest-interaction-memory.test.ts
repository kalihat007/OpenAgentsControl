import { describe, expect, it } from 'bun:test'
import { buildQuestInteractionMemory } from './quest-interaction-memory.js'
import type { QuestRun } from './quest-run.js'
import type { ReconcilerEvent } from './quest-reconciler.js'

describe('quest-interaction-memory', () => {
  it('builds request, action, file, context, cwd, and knowledge memory from Quest events', () => {
    const quest = makeQuest()
    const events: ReconcilerEvent[] = [
      {
        timestamp: '2026-05-27T00:00:01.000Z',
        type: 'request.received',
        data: { text: 'Continue the memory work', runtime: 'kimi', cwd: '/repo' },
      },
      {
        timestamp: '2026-05-27T00:00:02.000Z',
        type: 'cwd.observed',
        data: { cwd: '/repo/packages/cli', runtime: 'kimi', taskId: 'task-1' },
      },
      {
        timestamp: '2026-05-27T00:00:03.000Z',
        type: 'context.loaded',
        data: { contextPath: '.opencode/context/core/quest-mode.md', taskId: 'task-1' },
      },
      {
        timestamp: '2026-05-27T00:00:04.000Z',
        type: 'action.summary',
        data: {
          summary: 'Added interaction memory artifact',
          taskId: 'task-1',
          runtime: 'kimi',
          changedFiles: ['packages/cli/src/lib/quest-interaction-memory.ts'],
          contextFiles: ['.opencode/context/core/quest-mode.md'],
          cwd: '/repo/packages/cli',
        },
      },
      {
        timestamp: '2026-05-27T00:00:05.000Z',
        type: 'knowledge.captured',
        data: { kind: 'decision', summary: 'Use derived JSON memory instead of mutable quest.json', taskId: 'task-1' },
      },
    ]

    const memory = buildQuestInteractionMemory(quest, events, '/repo')

    expect(memory.summary.requests).toBe(2)
    expect(memory.summary.actions).toBe(5)
    expect(memory.summary.fileChanges).toBe(1)
    expect(memory.summary.contexts).toBe(1)
    expect(memory.summary.knowledgeItems).toBe(4)
    expect(memory.workingContext.currentWorkDir).toBe('/repo/packages/cli')
    expect(memory.requests[0]?.source).toBe('initial')
    expect(memory.requests[1]?.source).toBe('request.received')
    expect(memory.fileChanges[0]?.path).toBe('packages/cli/src/lib/quest-interaction-memory.ts')
    expect(memory.knowledge.some((entry) => entry.kind === 'decision')).toBe(true)
  })
})

function makeQuest(): QuestRun {
  const now = '2026-05-27T00:00:00.000Z'
  return {
    version: '8',
    questId: 'quest-interaction-1',
    runId: 'quest-interaction-1',
    objective: 'Build self memory',
    scenario: 'code_with_spec',
    state: 'EXECUTE',
    intensity: 'standard',
    trustLabel: 'changed',
    createdAt: now,
    updatedAt: now,
    experts: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Implement interaction memory',
        status: 'in_progress',
        expert: 'CoderAgent',
        dependsOn: [],
        acceptanceCriteria: [],
      },
    ],
    acceptanceCriteria: ['interaction memory exists'],
    artifacts: {
      runDir: '.oac/runs/quest-interaction-1',
      quest: 'quest.json',
      spec: 'spec.json',
      interactionMemory: 'interaction-memory.json',
    },
    nextSuggestedAction: 'continue',
    runtimes: {
      opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
      kimi: { command: 'kimi', resumePrompt: 'resume' },
      claude: { command: 'claude', resumePrompt: 'resume' },
      codex: { command: 'codex', resumePrompt: 'resume' },
    },
  }
}

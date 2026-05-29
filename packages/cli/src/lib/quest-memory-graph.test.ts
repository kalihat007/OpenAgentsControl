import { describe, expect, it } from 'bun:test'
import { buildQuestMemoryGraph } from './quest-memory-graph.js'
import type { QuestRun } from './quest-run.js'
import type { ReconcilerEvent } from './quest-reconciler.js'

describe('quest-memory-graph', () => {
  it('builds request, action, file, context, runtime, and validation nodes from Quest events', () => {
    const quest = makeQuest()
    const events: ReconcilerEvent[] = [
      {
        timestamp: '2026-05-27T00:00:00.000Z',
        type: 'context.loaded',
        data: { contextPath: '.opencode/context/core/quest-mode.md', taskId: 'task-1' },
      },
      {
        timestamp: '2026-05-27T00:00:01.000Z',
        type: 'file_change',
        data: { added: 'src/auth.ts', removed: 'src/old-auth.ts', taskId: 'task-1' },
      },
      {
        timestamp: '2026-05-27T00:00:02.000Z',
        type: 'runtime.spawned',
        data: { runtime: 'kimi', taskIds: ['task-1'] },
      },
      {
        timestamp: '2026-05-27T00:00:03.000Z',
        type: 'validation',
        data: {
          result: {
            timestamp: '2026-05-27T00:00:03.000Z',
            checks: [{ name: 'test', command: 'bun test', passed: true }],
            overallPassed: true,
            summary: '1/1 checks passed',
          },
        },
      },
    ]

    const graph = buildQuestMemoryGraph(quest, events)

    expect(graph.summary.requests).toBe(1)
    expect(graph.summary.tasks).toBe(1)
    expect(graph.summary.actions).toBe(4)
    expect(graph.summary.files).toBe(2)
    expect(graph.summary.contexts).toBe(1)
    expect(graph.summary.runtimes).toBe(1)
    expect(graph.nodes.some((node) => node.id === 'context:.opencode/context/core/quest-mode.md')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'file:src/auth.ts')).toBe(true)
    expect(graph.edges.some((edge) => edge.to === 'file:src/auth.ts' && edge.relation === 'adds')).toBe(true)
    expect(graph.edges.some((edge) => edge.to === 'file:src/old-auth.ts' && edge.relation === 'removes')).toBe(true)
    expect(graph.edges.some((edge) => edge.relation === 'loads_context')).toBe(true)
  })
})

function makeQuest(): QuestRun {
  const now = '2026-05-27T00:00:00.000Z'
  return {
    version: '8',
    questId: 'quest-memory-1',
    runId: 'quest-memory-1',
    objective: 'Build background memory',
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
        title: 'Implement memory graph',
        status: 'in_progress',
        expert: 'CoderAgent',
        dependsOn: [],
        acceptanceCriteria: [],
      },
    ],
    acceptanceCriteria: ['memory graph exists'],
    artifacts: {
      runDir: '.oac/runs/quest-memory-1',
      quest: 'quest.json',
      spec: 'spec.json',
      memoryGraph: 'memory-graph.json',
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

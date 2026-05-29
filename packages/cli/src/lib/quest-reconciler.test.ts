import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  reconcileQuestRun,
  loadReconciledQuest,
  loadEvents,
  buildTaskUpdateEvent,
  buildStateChangeEvent,
  buildFileChangeEvent,
  buildValidationEvent,
  buildAmendmentEvent,
  buildReviewStartedEvent,
  buildReviewApprovedEvent,
  buildReviewRejectedEvent,
  buildTaskInjectedEvent,
  buildPriorityChangedEvent,
  buildTaskProgressEvent,
  buildContextLoadedEvent,
  buildContextChangedEvent,
  buildRequestReceivedEvent,
  buildActionSummaryEvent,
  buildCwdObservedEvent,
  buildKnowledgeCapturedEvent,
  buildResearchAssessedEvent,
  buildResearchPerformedEvent,
  buildNextStepsSuggestedEvent,
} from './quest-reconciler.js'
import { persistQuestRun, type QuestRun } from './quest-run.js'

function makeBaseQuest(): QuestRun {
  const now = new Date().toISOString()
  return {
    version: '6',
    questId: 'test-q-001',
    runId: 'test-q-001',
    objective: 'Test quest',
    scenario: 'code_with_spec',
    state: 'EXECUTE',
    intensity: 'standard',
    trustLabel: 'changed',
    createdAt: now,
    updatedAt: '2024-01-01T00:00:00.000Z',
    experts: [],
    tasks: [
      { id: '1', title: 'First', status: 'pending', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
      { id: '2', title: 'Second', status: 'in_progress', expert: 'coder', dependsOn: [], acceptanceCriteria: [] },
    ],
    acceptanceCriteria: ['All tests pass'],
    artifacts: { runDir: '.oac/runs/test-q-001', quest: 'quest.json', spec: 'spec.json' },
    nextSuggestedAction: 'Start first task',
    runtimes: {
      opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'Resume' },
      kimi: { command: 'kimi', resumePrompt: 'Resume' },
      claude: { command: 'claude', resumePrompt: 'Resume' },
      codex: { command: 'codex', resumePrompt: 'Resume' },
    },
  }
}

describe('quest-reconciler', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-reconciler-test-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  // ── Pure reconciliation ─────────────────────────────────────────────────────

  it('reconcileQuestRun applies task_update events', () => {
    const base = makeBaseQuest()
    const events = [
      buildTaskUpdateEvent('1', 'in_progress'),
      buildTaskUpdateEvent('1', 'completed'),
      buildTaskUpdateEvent('2', 'failed'),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.tasks[0].status).toBe('completed')
    expect(live.tasks[1].status).toBe('failed')
    expect(live.updatedAt).not.toBe(base.updatedAt)
  })

  it('reconcileQuestRun accepts runtime task_id write-back events', () => {
    const base = makeBaseQuest()
    const events = [
      {
        timestamp: new Date().toISOString(),
        type: 'task_update' as const,
        data: { task_id: '1', status: 'completed', expert: 'TechLeadAgent' },
      },
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.tasks[0].status).toBe('completed')
    expect(live.tasks[0].expert).toBe('TechLeadAgent')
  })

  it('reconcileQuestRun creates missing tasks from task_update', () => {
    const base = makeBaseQuest()
    const events = [buildTaskUpdateEvent('3', 'pending', { title: 'New task', expert: 'reviewer' })]

    const live = reconcileQuestRun(base, events)
    expect(live.tasks).toHaveLength(3)
    expect(live.tasks[2].title).toBe('New task')
    expect(live.tasks[2].status).toBe('pending')
  })

  it('reconcileQuestRun applies state_change events', () => {
    const base = makeBaseQuest()
    const events = [buildStateChangeEvent('EXECUTE', 'VERIFY')]

    const live = reconcileQuestRun(base, events)
    expect(live.state).toBe('VERIFY')
  })

  it('reconcileQuestRun accepts REVIEW as a v8 state_change target', () => {
    const base = makeBaseQuest()
    base.version = '8'
    const events = [buildStateChangeEvent('EXECUTE', 'REVIEW')]

    const live = reconcileQuestRun(base, events)
    expect(live.state).toBe('REVIEW')
  })

  it('reconcileQuestRun accepts REFLECT as a v8 state_change target', () => {
    const base = makeBaseQuest()
    base.version = '8'
    const events = [buildStateChangeEvent('VERIFY', 'REFLECT')]

    const live = reconcileQuestRun(base, events)
    expect(live.state).toBe('REFLECT')
  })

  it('reconcileQuestRun ignores invalid state changes', () => {
    const base = makeBaseQuest()
    const events = [{ timestamp: 'now', type: 'state_change' as const, data: { to: 'INVALID' } }]

    const live = reconcileQuestRun(base, events)
    expect(live.state).toBe('EXECUTE')
  })

  it('reconcileQuestRun accumulates file_change events', () => {
    const base = makeBaseQuest()
    const events = [
      buildFileChangeEvent('src/index.ts'),
      buildFileChangeEvent('src/lib.ts'),
      buildFileChangeEvent('src/index.ts'), // duplicate — should not double-add
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.changedFiles).toEqual(['src/index.ts', 'src/lib.ts'])
  })

  it('reconcileQuestRun removes files on file_change with removed', () => {
    const base = makeBaseQuest()
    const events = [
      buildFileChangeEvent('src/index.ts'),
      buildFileChangeEvent('src/lib.ts'),
      buildFileChangeEvent(undefined, 'src/index.ts'),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.changedFiles).toEqual(['src/lib.ts'])
  })

  it('reconcileQuestRun derives a background memory graph from action, file, and context events', () => {
    const base = makeBaseQuest()
    base.version = '8'
    const events = [
      buildContextLoadedEvent('.opencode/context/core/quest-mode.md', { taskId: '1' }),
      buildFileChangeEvent('src/index.ts'),
      buildContextChangedEvent('.opencode/context/core/quest-mode.md', { taskId: '1' }),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.memoryGraph.summary.actions).toBe(3)
    expect(live.memoryGraph.summary.files).toBe(1)
    expect(live.memoryGraph.summary.contexts).toBe(1)
    expect(live.memoryGraph.nodes.some((node) => node.id === 'context:.opencode/context/core/quest-mode.md')).toBe(true)
  })

  it('reconcileQuestRun derives interaction memory from requests, cwd, actions, and knowledge', () => {
    const base = makeBaseQuest()
    base.version = '8'
    const events = [
      buildRequestReceivedEvent('Continue with memory', { runtime: 'kimi', cwd: '/repo' }),
      buildCwdObservedEvent('/repo/packages/cli', { runtime: 'kimi', taskId: '1' }),
      buildActionSummaryEvent('Updated memory files', {
        taskId: '1',
        runtime: 'kimi',
        cwd: '/repo/packages/cli',
        changedFiles: ['packages/cli/src/lib/quest-interaction-memory.ts'],
      }),
      buildKnowledgeCapturedEvent('decision', 'Use append-only events as source of truth', { taskId: '1' }),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.interactionMemory.summary.requests).toBe(2)
    expect(live.interactionMemory.summary.actions).toBe(4)
    expect(live.interactionMemory.summary.fileChanges).toBe(1)
    expect(live.interactionMemory.workingContext.currentWorkDir).toBe('/repo/packages/cli')
    expect(live.interactionMemory.knowledge.some((entry) => entry.kind === 'decision')).toBe(true)
  })

  it('reconcileQuestRun records pre-execution research decisions in memory artifacts', () => {
    const base = makeBaseQuest()
    base.version = '8'
    const events = [
      buildContextLoadedEvent('.opencode/context/core/quest-mode.md', {
        taskId: '1',
        reason: 'Pre-execution discovery gate',
      }),
      buildResearchAssessedEvent(false, 'Local Quest context and repo files are sufficient; no current web facts needed.', {
        taskId: '1',
        runtime: 'kimi',
        cwd: '/repo',
        files: ['packages/cli/src/lib/runtime-bridge.ts'],
        contexts: ['.opencode/context/core/quest-mode.md'],
      }),
      buildResearchPerformedEvent('Checked current API docs for a provider-specific integration detail.', {
        taskId: '1',
        runtime: 'kimi',
        queries: ['provider cli latest flags'],
        sources: ['https://example.com/docs'],
      }),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.memoryGraph.summary.actions).toBe(3)
    expect(live.memoryGraph.nodes.some((node) => node.id === 'file:packages/cli/src/lib/runtime-bridge.ts')).toBe(true)
    expect(live.interactionMemory.summary.actions).toBe(3)
    expect(live.interactionMemory.knowledge.some((entry) => entry.kind === 'research_assessment')).toBe(true)
    expect(live.interactionMemory.knowledge.some((entry) => entry.kind === 'research_performed')).toBe(true)
  })

  it('reconcileQuestRun records suggested next steps without executing them', () => {
    const base = makeBaseQuest()
    base.version = '8'
    base.state = 'COMPLETE'
    const events = [
      buildNextStepsSuggestedEvent([
        {
          id: 'review-summary',
          kind: 'review',
          title: 'Review the completion summary',
          reason: 'Confirm evidence before starting another Quest.',
          command: 'oac quest-status test-q-001',
        },
      ]),
    ]

    const live = reconcileQuestRun(base, events)
    expect(live.nextStepSuggestions).toHaveLength(1)
    expect(live.nextStepSuggestions[0]?.kind).toBe('review')
    expect(live.nextSuggestedAction).toContain('choose one')
  })

  it('reconcileQuestRun applies validation events and updates trust label', () => {
    const base = makeBaseQuest()
    const result = {
      timestamp: new Date().toISOString(),
      checks: [{ name: 'test', command: 'npm test', passed: true }],
      overallPassed: true,
      summary: '1/1 passed',
    }
    const events = [buildValidationEvent(result)]

    const live = reconcileQuestRun(base, events)
    expect(live.trustLabel).toBe('tested')
    expect(live.verification?.overallPassed).toBe(true)
  })

  it('reconcileQuestRun marks trust failed on failed validation', () => {
    const base = makeBaseQuest()
    const result = {
      timestamp: new Date().toISOString(),
      checks: [{ name: 'test', command: 'npm test', passed: false }],
      overallPassed: false,
      summary: '0/1 passed',
    }
    const events = [buildValidationEvent(result)]

    const live = reconcileQuestRun(base, events)
    expect(live.trustLabel).toBe('failed')
  })

  it('reconcileQuestRun recovers trust after a later passing validation', () => {
    const base = makeBaseQuest()
    const failed = {
      timestamp: new Date().toISOString(),
      checks: [{ name: 'test', command: 'npm test', passed: false }],
      overallPassed: false,
      summary: '0/1 passed',
    }
    const passed = {
      timestamp: new Date().toISOString(),
      checks: [{ name: 'test', command: 'npm test', passed: true }],
      overallPassed: true,
      summary: '1/1 passed',
    }

    const live = reconcileQuestRun(base, [buildValidationEvent(failed), buildValidationEvent(passed)])
    expect(live.trustLabel).toBe('tested')
    expect(live.verification?.summary).toBe('1/1 passed')
  })

  it('reconcileQuestRun treats forced no-check validation as inspected only', () => {
    const base = makeBaseQuest()
    base.trustLabel = 'planned_only'
    const result = {
      timestamp: new Date().toISOString(),
      checks: [],
      overallPassed: false,
      summary: '0 checks detected; forced verification recorded',
      forced: true,
      noChecks: true,
    }

    const live = reconcileQuestRun(base, [buildValidationEvent(result)])
    expect(live.trustLabel).toBe('inspected_only')
    expect(live.verification?.forced).toBe(true)
  })

  it('reconcileQuestRun applies amendment events', () => {
    const base = makeBaseQuest()
    const events = [buildAmendmentEvent('Updated objective', 'Add auth')]

    const live = reconcileQuestRun(base, events)
    expect(live.objective).toBe('Updated objective')
    expect(live.amendments).toHaveLength(1)
  })

  it('reconcileQuestRun creates new tasks from amendment text', () => {
    const base = makeBaseQuest()
    const events = [buildAmendmentEvent('Updated objective', 'Add OAuth integration')]

    const live = reconcileQuestRun(base, events)
    expect(live.tasks.length).toBeGreaterThan(2)
    const amendedTask = live.tasks.find((t) => t.title.startsWith('Amended:'))
    expect(amendedTask).toBeDefined()
    expect(amendedTask?.status).toBe('pending')
    expect(amendedTask?.dependsOn).toContain('2') // depends on in_progress task
    expect(live.objective).toBe('Updated objective')
  })

  it('reconcileQuestRun blocks amendment tasks that create cycles', () => {
    const base = makeBaseQuest()
    base.tasks[0].dependsOn = ['2']
    base.tasks[1].dependsOn = ['1']
    const events = [buildAmendmentEvent('Updated objective', 'Add OAuth integration')]

    const live = reconcileQuestRun(base, events)
    const amendedTask = live.tasks.find((t) => t.title.startsWith('Amended:'))
    expect(amendedTask?.status).toBe('blocked')
    expect(live.trustLabel).toBe('blocked')
  })

  it('reconcileQuestRun applies error events and marks tasks failed', () => {
    const base = makeBaseQuest()
    const events = [{ timestamp: 'now', type: 'error' as const, data: { taskId: '2', critical: false } }]

    const live = reconcileQuestRun(base, events)
    expect(live.tasks[1].status).toBe('failed')
  })

  it('reconcileQuestRun marks trust failed on critical error', () => {
    const base = makeBaseQuest()
    const events = [{ timestamp: 'now', type: 'error' as const, data: { critical: true } }]

    const live = reconcileQuestRun(base, events)
    expect(live.trustLabel).toBe('failed')
  })

  it('reconcileQuestRun notes do not mutate state', () => {
    const base = makeBaseQuest()
    const events = [{ timestamp: 'now', type: 'note' as const, data: { message: 'Hello' } }]

    const live = reconcileQuestRun(base, events)
    expect(live.state).toBe(base.state)
    expect(live.tasks).toHaveLength(base.tasks.length)
  })

  it('reconcileQuestRun tracks v6 runtime progress events', () => {
    const base = makeBaseQuest()
    const events = [
      {
        timestamp: '2026-05-17T00:00:00.000Z',
        type: 'runtime.assigned' as const,
        data: { runtime: 'kimi', taskIds: ['1', '2'] },
      },
      {
        timestamp: '2026-05-17T00:00:01.000Z',
        type: 'runtime.spawned' as const,
        data: { runtime: 'kimi', pid: 1234 },
      },
      {
        timestamp: '2026-05-17T00:00:02.000Z',
        type: 'runtime.completed' as const,
        data: { runtime: 'kimi', ok: true },
      },
    ]

    const live = reconcileQuestRun(base, events)

    expect(live.runtimeProgress.kimi?.assigned).toBe(2)
    expect(live.runtimeProgress.kimi?.completed).toBe(1)
    expect(live.runtimeProgress.kimi?.pid).toBe(1234)
    expect(live.runtimeProgress.kimi?.alive).toBe(false)
    expect((live.tasks[0] as unknown as { runtime?: string }).runtime).toBe('kimi')
  })

  it('reconcileQuestRun records outgoing and accepted handoffs', () => {
    const base = makeBaseQuest()
    const events = [
      {
        timestamp: '2026-05-17T00:00:00.000Z',
        type: 'handoff.outgoing' as const,
        data: {
          fromRuntime: 'kimi',
          toRuntime: 'opencode',
          taskIds: ['1'],
          changedFiles: ['packages/cli/src/lib/team-memory.ts'],
          nextAction: 'continue status work',
          risks: ['verify JSON output'],
        },
      },
      {
        timestamp: '2026-05-17T00:00:01.000Z',
        type: 'handoff.incoming' as const,
        data: {
          fromRuntime: 'kimi',
          toRuntime: 'opencode',
          acceptedTaskIds: ['1'],
        },
      },
    ]

    const live = reconcileQuestRun(base, events)

    expect(live.handoffs).toHaveLength(1)
    expect(live.handoffs[0]?.accepted).toBe(true)
    expect(live.handoffs[0]?.acceptedTaskIds).toEqual(['1'])
  })

  it('reconcileQuestRun records and resolves incidents', () => {
    const base = makeBaseQuest()
    const events = [
      {
        timestamp: '2026-05-17T00:00:00.000Z',
        type: 'incident.created' as const,
        data: {
          incidentId: 'inc-1',
          taskId: '2',
          severity: 'critical',
          summary: 'Runtime failed before write-back',
        },
      },
      {
        timestamp: '2026-05-17T00:00:01.000Z',
        type: 'incident.resolved' as const,
        data: {
          incidentId: 'inc-1',
          resolution: 'Retried with corrected command',
        },
      },
    ]

    const live = reconcileQuestRun(base, events)

    expect(live.tasks[1].status).toBe('failed')
    expect(live.trustLabel).toBe('failed')
    expect(live.incidents[0]?.status).toBe('resolved')
    expect(live.incidents[0]?.resolution).toBe('Retried with corrected command')
  })

  // ── Disk integration ────────────────────────────────────────────────────────

  it('loadReconciledQuest reads base + events from disk', async () => {
    await mkdir(join(projectRoot, '.oac', 'runs', 'q1'), { recursive: true })
    const base = makeBaseQuest()
    base.questId = 'q1'
    base.runId = 'q1'
    base.artifacts.runDir = '.oac/runs/q1'
    await persistQuestRun(projectRoot, base)

    const events = [
      buildTaskUpdateEvent('1', 'completed'),
      buildFileChangeEvent('src/index.ts'),
    ]
    const eventsPath = join(projectRoot, '.oac', 'runs', 'q1', 'events.ndjson')
    for (const ev of events) {
      await writeFile(eventsPath, JSON.stringify(ev) + '\n', { flag: 'a' })
    }

    const live = await loadReconciledQuest(projectRoot, 'q1')
    expect(live).not.toBeNull()
    expect(live!.tasks[0].status).toBe('completed')
    expect(live!.changedFiles).toContain('src/index.ts')
  })

  it('loadReconciledQuest returns null for missing quest', async () => {
    const live = await loadReconciledQuest(projectRoot, 'nonexistent')
    expect(live).toBeNull()
  })

  it('loadEvents returns empty array when no events file', async () => {
    const events = await loadEvents(projectRoot, 'nonexistent')
    expect(events).toEqual([])
  })

  it('loadEvents keeps valid events when one line is malformed', async () => {
    await mkdir(join(projectRoot, '.oac', 'runs', 'q-malformed'), { recursive: true })
    const eventsPath = join(projectRoot, '.oac', 'runs', 'q-malformed', 'events.ndjson')
    const valid = buildTaskUpdateEvent('1', 'completed')
    await writeFile(eventsPath, `${JSON.stringify(valid)}\nnot-json\n`)

    const events = await loadEvents(projectRoot, 'q-malformed')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('task_update')
  })

  // ── v8 Event Types ──────────────────────────────────────────────────────────

  it('review.started transitions state to REVIEW', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [buildReviewStartedEvent()])
    expect(live.state).toBe('REVIEW')
  })

  it('review.approved transitions REVIEW → VERIFY', () => {
    const base = makeBaseQuest()
    base.state = 'REVIEW'
    const live = reconcileQuestRun(base, [buildReviewApprovedEvent()])
    expect(live.state).toBe('VERIFY')
  })

  it('review.rejected transitions REVIEW → EXECUTE and resets failed tasks', () => {
    const base = makeBaseQuest()
    base.state = 'REVIEW'
    base.tasks[0].status = 'failed'
    const live = reconcileQuestRun(base, [buildReviewRejectedEvent()])
    expect(live.state).toBe('EXECUTE')
    expect(live.tasks[0].status).toBe('pending')
  })

  it('task.injected adds a new task to the quest', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      buildTaskInjectedEvent('new-1', 'Injected task', { expert: 'tester', priority: 2 }),
    ])
    expect(live.tasks).toHaveLength(3)
    const injected = live.tasks.find((t) => t.id === 'new-1')
    expect(injected).not.toBeUndefined()
    expect(injected!.title).toBe('Injected task')
    expect(injected!.priority).toBe(2)
  })

  it('task.injected accepts real runtime snake_case and nested task payloads', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      {
        timestamp: new Date().toISOString(),
        type: 'task.injected',
        data: {
          task: {
            task_id: 'new-runtime-1',
            title: 'Runtime injected task',
            status: 'completed',
            agent: 'KimiAdaptiveExpert',
            depends_on: ['1'],
            acceptance_criteria: ['Runtime shape reconciles'],
            priority: '1',
          },
        },
      },
    ])

    const injected = live.tasks.find((t) => t.id === 'new-runtime-1')
    expect(injected).not.toBeUndefined()
    expect(injected!.status).toBe('completed')
    expect(injected!.expert).toBe('KimiAdaptiveExpert')
    expect(injected!.dependsOn).toEqual(['1'])
    expect(injected!.acceptanceCriteria).toEqual(['Runtime shape reconciles'])
    expect(injected!.priority).toBe(1)
  })

  it('task.injected detects cycles and blocks the task', () => {
    const base = makeBaseQuest()
    base.tasks[0].dependsOn = ['2']
    base.tasks[1].dependsOn = ['1']
    const live = reconcileQuestRun(base, [
      buildTaskInjectedEvent('new-1', 'Cyclic task', { dependsOn: ['1'] }),
    ])
    const injected = live.tasks.find((t) => t.id === 'new-1')
    expect(injected!.status).toBe('blocked')
    expect(live.trustLabel).toBe('blocked')
  })

  it('priority.changed updates task priority', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [buildPriorityChangedEvent('1', 1)])
    expect(live.tasks[0].priority).toBe(1)
  })

  it('priority.changed accepts snake_case ids and numeric string priorities', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      {
        timestamp: new Date().toISOString(),
        type: 'priority.changed',
        data: { task_id: '1', new_priority: '1' },
      },
    ])
    expect(live.tasks[0].priority).toBe(1)
  })

  it('task.progress records percent, checkpoint, and lastMessage', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      buildTaskProgressEvent('2', 42, 'auth-service.ts:verifyToken()', 'Implementing JWT verification'),
    ])
    expect(live.taskProgress).toBeDefined()
    expect(live.taskProgress!['2']!.percent).toBe(42)
    expect(live.taskProgress!['2']!.checkpoint).toBe('auth-service.ts:verifyToken()')
    expect(live.taskProgress!['2']!.lastMessage).toBe('Implementing JWT verification')
    expect(live.taskProgress!['2']!.updatedAt).toBeDefined()
  })

  it('task.progress clamps percent to [0, 100]', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      buildTaskProgressEvent('1', -10),
      buildTaskProgressEvent('2', 150),
    ])
    expect(live.taskProgress!['1']!.percent).toBe(0)
    expect(live.taskProgress!['2']!.percent).toBe(100)
  })

  it('task.progress ignores events without taskId or percent', () => {
    const base = makeBaseQuest()
    const live = reconcileQuestRun(base, [
      {
        timestamp: new Date().toISOString(),
        type: 'task.progress',
        data: { task_id: '1' },
      } as unknown as Parameters<typeof reconcileQuestRun>[1][number],
    ])
    expect(Object.keys(live.taskProgress || {})).toHaveLength(0)
  })
})

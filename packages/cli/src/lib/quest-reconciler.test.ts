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
} from './quest-reconciler.js'
import { persistQuestRun, type QuestRun } from './quest-run.js'

function makeBaseQuest(): QuestRun {
  const now = new Date().toISOString()
  return {
    version: '4',
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
})

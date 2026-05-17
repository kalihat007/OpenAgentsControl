import { describe, it, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildQuestRun,
  persistQuestRun,
  generateQuestId,
  questExists,
  appendQuestEvent,
  writeTaskGraph,
  formatRuntimeHandoff,
  formatQuestSummary,
  formatAcceptanceReport,
} from './quest-run.js'
import { planExecution } from './swarm-executor.js'
import type { RouterResult } from './task-router.js'

function routerResult(objective: string): RouterResult {
  return {
    objective,
    scenario: 'code_with_spec',
    primaryExperts: [
      {
        id: 'coder',
        name: 'CoderAgent',
        description: 'writes code',
        category: 'development',
        keywords: ['code'],
        filePatterns: ['*.ts'],
        score: 10,
      },
    ],
    secondaryExperts: [],
    reasoning: [],
    estimatedChunks: 2,
    confidence: {
      score: 1,
      isLowConfidence: false,
      isAmbiguous: false,
      ambiguousExperts: [],
    },
    clarification: {
      needed: false,
      questions: [],
    },
  }
}

describe('quest-run', () => {
  it('builds a v5 Quest sidecar from a plan', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    expect(quest.version).toBe('5')
    expect(quest.questId).toBe(plan.session.id)
    expect(quest.state).toBe('SPEC')
    expect(quest.tasks.length).toBeGreaterThan(0)
    expect(quest.runtimes.kimi.command).toContain('kimi --work-dir .')
  })

  it('persists quest.json under .oac/runs/{id}', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-run-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      const questPath = await persistQuestRun(tmpRoot, quest)
      const raw = await readFile(questPath, 'utf-8')
      expect(JSON.parse(raw).questId).toBe(plan.session.id)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('generateQuestId creates sequential IDs for the same day', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-id-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs'), { recursive: true })

      // Create directories to reserve IDs
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-001'))
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-002'))

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const id1 = await generateQuestId(tmpRoot)
      expect(id1).toBe(`quest-${today}-001`)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('questExists returns true for persisted quests and false otherwise', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-exists-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      expect(await questExists(tmpRoot, quest.questId)).toBe(false)
      await persistQuestRun(tmpRoot, quest)
      expect(await questExists(tmpRoot, quest.questId)).toBe(true)
      expect(await questExists(tmpRoot, 'nonexistent')).toBe(false)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('appendQuestEvent appends to events.ndjson', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-events-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      await appendQuestEvent(tmpRoot, quest.questId, {
        timestamp: new Date().toISOString(),
        type: 'task_update',
        data: { taskId: '1', to: 'completed' },
      })

      const eventsPath = join(tmpRoot, '.oac', 'runs', quest.questId, 'events.ndjson')
      const raw = await readFile(eventsPath, 'utf-8')
      const lines = raw.trim().split('\n')
      expect(lines.length).toBe(1)
      const event = JSON.parse(lines[0] as string)
      expect(event.type).toBe('task_update')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('writeTaskGraph writes task-graph.json', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-graph-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs', 'q1'), { recursive: true })
      await writeTaskGraph(tmpRoot, 'q1', [
        { id: '1', title: 'A', status: 'completed' },
        { id: '2', title: 'B', status: 'pending' },
      ])
      const raw = await readFile(join(tmpRoot, '.oac', 'runs', 'q1', 'task-graph.json'), 'utf-8')
      const graph = JSON.parse(raw)
      expect(graph.tasks).toHaveLength(2)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('formatRuntimeHandoff includes runtime command and resume prompt', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const text = formatRuntimeHandoff(quest, 'kimi')
    expect(text).toContain(quest.questId)
    expect(text).toContain('kimi --work-dir')
    expect(text).toContain('Resume prompt:')
  })

  it('formatQuestSummary produces markdown', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatQuestSummary(quest)
    expect(md).toContain('# Quest Summary')
    expect(md).toContain(quest.objective)
    expect(md).toContain('## Next Action')
  })

  it('formatAcceptanceReport includes risks for failed tasks', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatAcceptanceReport(quest)
    expect(md).toContain('# Acceptance Report')
    expect(md).toContain('## Remaining Risks')
  })
})

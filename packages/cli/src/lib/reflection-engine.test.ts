import { describe, it, expect } from 'bun:test'
import { analyzeQuestForReflection, saveReflection, loadReflection } from './reflection-engine.js'
import type { ReconciledQuestRun } from './quest-reconciler.js'
import type { AgentMemoryBundle } from './agent-memory.js'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeQuest(overrides: Partial<ReconciledQuestRun> = {}): ReconciledQuestRun {
  return {
    id: 'test-quest-1',
    objective: 'test objective',
    state: 'COMPLETE',
    scenario: 'code_with_spec',
    intensity: 'standard',
    trustLabel: 'tested',
    tasks: [],
    changedFiles: [],
    amendments: [],
    handoffs: [],
    runtimeProgress: {},
    taskProgress: {},
    incidents: [],
    events: [],
    ...overrides,
  } as ReconciledQuestRun
}

describe('analyzeQuestForReflection', () => {
  it('returns clean execution insight for no incidents and 100% pass rate', () => {
    const quest = makeQuest({
      events: [
        { timestamp: '2026-01-01T00:00:00Z', type: 'validation', data: { passed: true, checks: [{ name: 'build', passed: true }] } },
      ],
    })
    const result = analyzeQuestForReflection(quest)
    expect(result.questId).toBe('test-quest-1')
    expect(result.learnings.length).toBeGreaterThanOrEqual(1)
    expect(result.learnings.some((l) => l.category === 'success_reinforcement')).toBe(true)
    expect(result.metrics.find((m) => m.name === 'validation_pass_rate')?.value).toBe(1)
  })

  it('detects redundant file reads before writes', () => {
    const quest = makeQuest({
      events: [
        { timestamp: '2026-01-01T00:00:00Z', type: 'file_change', data: { type: 'read', path: 'src/a.ts' } },
        { timestamp: '2026-01-01T00:00:01Z', type: 'file_change', data: { type: 'read', path: 'src/b.ts' } },
        { timestamp: '2026-01-01T00:00:02Z', type: 'file_change', data: { type: 'read', path: 'src/c.ts' } },
        { timestamp: '2026-01-01T00:00:03Z', type: 'file_change', data: { type: 'read', path: 'src/d.ts' } },
        { timestamp: '2026-01-01T00:00:04Z', type: 'file_change', data: { type: 'write', path: 'src/a.ts' } },
        { timestamp: '2026-01-01T00:00:05Z', type: 'file_change', data: { type: 'write', path: 'src/b.ts' } },
        { timestamp: '2026-01-01T00:00:06Z', type: 'file_change', data: { type: 'write', path: 'src/c.ts' } },
        { timestamp: '2026-01-01T00:00:07Z', type: 'file_change', data: { type: 'write', path: 'src/d.ts' } },
      ],
    })
    const result = analyzeQuestForReflection(quest)
    expect(result.learnings.some((l) => l.category === 'redundant_step')).toBe(true)
    expect(result.patternSuggestions.some((s) => s.includes('Batch file reads'))).toBe(true)
  })

  it('detects incidents as pattern mismatch', () => {
    const quest = makeQuest({
      events: [
        { timestamp: '2026-01-01T00:00:00Z', type: 'incident.created', data: { category: 'test-failure', message: 'Test timeout' } },
        { timestamp: '2026-01-01T00:00:01Z', type: 'incident.created', data: { category: 'test-failure', message: 'Assertion failed' } },
      ],
    })
    const result = analyzeQuestForReflection(quest)
    expect(result.learnings.some((l) => l.category === 'pattern_mismatch')).toBe(true)
    expect(result.metrics.find((m) => m.name === 'incidents')?.value).toBe(2)
  })

  it('detects validation failures as context gap', () => {
    const quest = makeQuest({
      events: [
        { timestamp: '2026-01-01T00:00:00Z', type: 'validation', data: { passed: false, checks: [{ name: 'lint', passed: false }, { name: 'build', passed: true }] } },
      ],
    })
    const result = analyzeQuestForReflection(quest)
    expect(result.learnings.some((l) => l.category === 'context_gap')).toBe(true)
  })

  it('includes agent memory unresolved blockers', () => {
    const agentMemory: AgentMemoryBundle = {
      questId: 'test-quest-1',
      version: '1',
      agents: {
        CoderAgent: {
          agentId: 'CoderAgent',
          taskIds: ['t1'],
          notes: [],
          decisions: [],
          blockers: [
            { timestamp: '2026-01-01T00:00:00Z', description: 'Missing dependency', resolved: false, taskId: 't1' },
          ],
          discoveries: [],
          filesTouched: [],
          conventionsLearned: [],
        },
      },
      lastUpdated: '2026-01-01T00:00:00Z',
    }
    const quest = makeQuest()
    const result = analyzeQuestForReflection(quest, agentMemory)
    expect(result.learnings.some((l) => l.description.includes('CoderAgent'))).toBe(true)
  })
})

describe('saveReflection / loadReflection', () => {
  const testDir = join(tmpdir(), 'oac-reflection-test-' + Date.now())

  it('round-trips reflection to disk', async () => {
    await mkdir(join(testDir, '.oac', 'runs', 'q1'), { recursive: true })
    const reflection = analyzeQuestForReflection(makeQuest({ id: 'q1' }))
    const path = await saveReflection(testDir, 'q1', reflection)
    expect(path).toContain('reflection.json')

    const loaded = await loadReflection(testDir, 'q1')
    expect(loaded).not.toBeNull()
    expect(loaded!.questId).toBe('q1')
    expect(loaded!.learnings.length).toBe(reflection.learnings.length)
  })

  it('returns null for missing reflection', async () => {
    const loaded = await loadReflection(testDir, 'nonexistent')
    expect(loaded).toBeNull()
  })
})

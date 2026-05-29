import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  approveMemoryPromotion,
  refreshMemoryPromotionStore,
  rejectMemoryPromotion,
} from './quest-memory-promotion.js'
import { loadTeamMemory } from './team-memory.js'
import type { QuestInteractionMemory } from './quest-interaction-memory.js'

describe('quest-memory-promotion', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-memory-promotion-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('creates pending promotion candidates only for repeated learnings', async () => {
    await writeInteractionMemory('quest-a', [
      knowledge('decision', 'Use append-only Quest events as the source of truth for durable run state.', '2026-05-20T00:00:00.000Z'),
      knowledge('decision', 'Singleton learning should stay out of long-term memory.', '2026-05-20T00:01:00.000Z'),
    ])
    await writeInteractionMemory('quest-b', [
      knowledge('decision', 'Use append-only Quest events as the source of truth for durable run state.', '2026-05-21T00:00:00.000Z'),
    ])

    const store = await refreshMemoryPromotionStore(projectRoot, {
      now: new Date('2026-05-22T00:00:00.000Z'),
    })

    expect(store.candidates).toHaveLength(1)
    expect(store.candidates[0]?.status).toBe('pending')
    expect(store.candidates[0]?.occurrenceCount).toBe(2)
    expect(store.candidates[0]?.confidence).toBeGreaterThanOrEqual(0.65)
    expect(store.candidates[0]?.summary).toContain('append-only Quest events')
  })

  it('requires user approval before writing promoted knowledge to team memory', async () => {
    await writeInteractionMemory('quest-a', [
      knowledge('workflow', 'Run live Kimi Quest validation after touching Kimi adapter prompts.', '2026-05-20T00:00:00.000Z'),
    ])
    await writeInteractionMemory('quest-b', [
      knowledge('workflow', 'Run live Kimi Quest validation after touching Kimi adapter prompts.', '2026-05-21T00:00:00.000Z'),
    ])

    const store = await refreshMemoryPromotionStore(projectRoot, {
      now: new Date('2026-05-22T00:00:00.000Z'),
    })
    const candidate = store.candidates[0]!
    let teamMemory = await loadTeamMemory(projectRoot)
    expect(teamMemory.lessons).toHaveLength(0)

    const approved = await approveMemoryPromotion(projectRoot, candidate.id, { approvedBy: 'test-user' })
    expect(approved.status).toBe('approved')

    teamMemory = await loadTeamMemory(projectRoot)
    expect(teamMemory.lessons).toHaveLength(1)
    expect(teamMemory.lessons[0]?.category).toBe('workflow')
    expect(teamMemory.lessons[0]?.lesson).toContain('live Kimi Quest validation')
    expect(teamMemory.lessons[0]?.context?.candidateId).toBe(candidate.id)
  })

  it('preserves rejected candidate status across rescans', async () => {
    await writeInteractionMemory('quest-a', [
      knowledge('risk', 'Do not treat every Quest event as durable repo knowledge.', '2026-05-20T00:00:00.000Z'),
    ])
    await writeInteractionMemory('quest-b', [
      knowledge('risk', 'Do not treat every Quest event as durable repo knowledge.', '2026-05-21T00:00:00.000Z'),
    ])

    const store = await refreshMemoryPromotionStore(projectRoot, {
      now: new Date('2026-05-22T00:00:00.000Z'),
    })
    await rejectMemoryPromotion(projectRoot, store.candidates[0]!.id, 'Too broad')

    const refreshed = await refreshMemoryPromotionStore(projectRoot, {
      now: new Date('2026-05-23T00:00:00.000Z'),
    })
    expect(refreshed.candidates[0]?.status).toBe('rejected')
    expect(refreshed.candidates[0]?.rejectionReason).toBe('Too broad')
  })

  async function writeInteractionMemory(questId: string, knowledgeEntries: QuestInteractionMemory['knowledge']): Promise<void> {
    const runDir = join(projectRoot, '.oac', 'runs', questId)
    await mkdir(runDir, { recursive: true })
    const memory: QuestInteractionMemory = {
      version: '1',
      questId,
      objective: `Quest ${questId}`,
      generatedAt: '2026-05-22T00:00:00.000Z',
      projectRoot,
      runDir: `.oac/runs/${questId}`,
      workingContext: {
        projectRoot,
        runDir: `.oac/runs/${questId}`,
        cwdHistory: [],
      },
      requests: [],
      actions: [],
      fileChanges: [],
      contextChanges: [],
      knowledge: knowledgeEntries,
      summary: {
        requests: 0,
        actions: 0,
        fileChanges: 0,
        contexts: 0,
        knowledgeItems: knowledgeEntries.length,
        cwdCount: 0,
      },
    }
    await writeFile(join(runDir, 'interaction-memory.json'), JSON.stringify(memory, null, 2) + '\n')
  }

  function knowledge(kind: string, summary: string, timestamp: string): QuestInteractionMemory['knowledge'][number] {
    return {
      kind,
      summary,
      timestamp,
      taskIds: ['task-001'],
      files: ['packages/cli/src/lib/quest-memory-promotion.ts'],
      contexts: ['.opencode/context/core/quest-mode.md'],
      runtime: 'kimi',
    }
  }
})

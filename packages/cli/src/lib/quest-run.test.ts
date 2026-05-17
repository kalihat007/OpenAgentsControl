import { describe, it, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildQuestRun, persistQuestRun } from './quest-run.js'
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
  it('builds a v3 Quest sidecar from a plan', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    expect(quest.version).toBe('3')
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
})

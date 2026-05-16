/**
 * Run spec — single source of truth for a swarm/experts session.
 */

import type { QuestScenario, RouterResult } from './task-router.js'
import type { ExecutionPlan } from './swarm-executor.js'

export const RUN_SPEC_VERSION = '1' as const

export interface RunSpecRequirements {
  /** Placeholder for future structured requirements extraction. */
  summary: string
  acceptanceCriteria: string[]
}

export interface RunSpecExpert {
  id: string
  name: string
  category: string
  role: 'primary' | 'secondary'
  score: number
}

export interface RunSpec {
  version: typeof RUN_SPEC_VERSION
  runId: string
  objective: string
  scenario: QuestScenario
  createdAt: string
  experts: RunSpecExpert[]
  requirements: RunSpecRequirements
}

export function buildRunSpec(
  routerResult: RouterResult,
  plan: ExecutionPlan,
): RunSpec {
  const experts: RunSpecExpert[] = [
    ...routerResult.primaryExperts.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      role: 'primary' as const,
      score: e.score,
    })),
    ...routerResult.secondaryExperts.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      role: 'secondary' as const,
      score: e.score,
    })),
  ]

  return {
    version: RUN_SPEC_VERSION,
    runId: plan.session.id,
    objective: routerResult.objective,
    scenario: routerResult.scenario,
    createdAt: plan.createdAt,
    experts,
    requirements: {
      summary: routerResult.objective,
      acceptanceCriteria: plan.acceptanceCriteria,
    },
  }
}

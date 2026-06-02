/**
 * Quest v15 pre-planning requirement compiler.
 *
 * This runs before swarm tasks are created, so it only depends on the routed
 * objective and router clarification signals. Richer repo-backed requirement
 * context is added later by the Intelligent Coding Team OS sidecars.
 */

import { createHash } from 'node:crypto'
import type { QuestScenario, RouterResult } from './task-router.js'

export const QUEST_PREPLANNING_REQUIREMENT_COMPILER_VERSION = '15' as const

export type PrePlanningRequirementReadiness = 'ready' | 'needs-clarification'

export interface QuestPrePlanningRequirement {
  id: string
  statement: string
  type: 'functional' | 'validation' | 'constraint'
  source: 'objective' | 'router' | 'inferred'
  confidence: number
}

export interface QuestPrePlanningAssumption {
  id: string
  statement: string
  status: 'assumed' | 'confirmed' | 'rejected'
  reason: string
}

export interface QuestPrePlanningRequirementCompiler {
  version: typeof QUEST_PREPLANNING_REQUIREMENT_COMPILER_VERSION
  readiness: PrePlanningRequirementReadiness
  confidence: number
  objective: string
  scenario: QuestScenario
  requirements: QuestPrePlanningRequirement[]
  nonGoals: string[]
  acceptanceCriteria: string[]
  clarifyingQuestions: string[]
  assumptions: QuestPrePlanningAssumption[]
  planningNotes: string[]
}

export function compilePrePlanningRequirements(
  routerResult: RouterResult,
): QuestPrePlanningRequirementCompiler {
  const objective = normalizeObjective(routerResult.objective)
  const clarifyingQuestions = unique([
    ...routerResult.clarification.questions,
    ...inferClarifyingQuestions(objective),
  ]).slice(0, 5)
  const readiness: PrePlanningRequirementReadiness =
    routerResult.clarification.needed || clarifyingQuestions.length > 0
      ? 'needs-clarification'
      : 'ready'
  const confidence = clamp(
    routerResult.confidence.score
      - (readiness === 'needs-clarification' ? 0.18 : 0)
      - (routerResult.confidence.isAmbiguous ? 0.12 : 0),
  )
  const requirements = buildRequirements(routerResult, objective, confidence)
  const nonGoals = buildNonGoals(objective)
  const acceptanceCriteria = buildAcceptanceCriteria(
    objective,
    readiness,
    routerResult.scenario,
    nonGoals,
  )
  const assumptions = clarifyingQuestions.map((question) => ({
    id: stableId(`assumption:${question}`),
    statement: `Proceed with the safest narrow interpretation unless the user answers: ${question}`,
    status: 'assumed' as const,
    reason: 'Pre-planning compiler captured an unresolved clarification before task creation.',
  }))

  return {
    version: QUEST_PREPLANNING_REQUIREMENT_COMPILER_VERSION,
    readiness,
    confidence,
    objective,
    scenario: routerResult.scenario,
    requirements,
    nonGoals,
    acceptanceCriteria,
    clarifyingQuestions,
    assumptions,
    planningNotes: buildPlanningNotes(readiness, routerResult.scenario, clarifyingQuestions),
  }
}

function buildRequirements(
  routerResult: RouterResult,
  objective: string,
  confidence: number,
): QuestPrePlanningRequirement[] {
  return [
    {
      id: stableId(`objective:${objective}`),
      statement: objective,
      type: 'functional',
      source: 'objective',
      confidence,
    },
    {
      id: stableId(`scenario:${routerResult.scenario}`),
      statement: `Plan and execute using the ${routerResult.scenario} Quest scenario.`,
      type: 'constraint',
      source: 'router',
      confidence: 0.82,
    },
    {
      id: 'req-validate-before-complete',
      statement: 'Record validation evidence before the Quest is marked COMPLETE.',
      type: 'validation',
      source: 'inferred',
      confidence: 0.9,
    },
    {
      id: 'req-suggest-next-steps',
      statement: 'Suggest practical next steps after completion and wait for the user to choose.',
      type: 'constraint',
      source: 'inferred',
      confidence: 0.88,
    },
  ]
}

function buildAcceptanceCriteria(
  objective: string,
  readiness: PrePlanningRequirementReadiness,
  scenario: QuestScenario,
  nonGoals: string[],
): string[] {
  return unique([
    `Pre-planning requirement readiness is ${readiness}`,
    readiness === 'needs-clarification'
      ? 'Open clarifying questions are answered, explicitly assumed, or carried as blockers before broad edits'
      : 'No blocking requirement clarification remains before execution',
    `Requested outcome is satisfied or explicitly blocked: ${objective}`,
    `Quest scenario ${scenario} is reflected in task ownership and validation`,
    'Required local files and context are inspected before edits',
    'Validation evidence is recorded before COMPLETE',
    'Review signals, non-goals, and constraints are acknowledged before COMPLETE',
    'Next steps are suggested after completion and the agent waits for the user',
    ...nonGoals.map((nonGoal) => `Non-goal preserved: ${nonGoal}`),
  ]).slice(0, 12)
}

function buildNonGoals(objective: string): string[] {
  const lower = objective.toLowerCase()
  const nonGoals = [
    'Do not change unrelated files or generated artifacts unless required for validation.',
    'Do not silently promote short-term events into durable memory or skills.',
  ]
  if (!lower.includes('deploy')) nonGoals.push('Do not deploy or perform production actions.')
  if (!lower.includes('secret') && !lower.includes('credential')) {
    nonGoals.push('Do not introduce secrets or credentials.')
  }
  return nonGoals
}

function inferClarifyingQuestions(objective: string): string[] {
  const lower = objective.toLowerCase()
  const vague =
    /\b(do it|fix everything|needful|make better|implement all|everything|all of it)\b/.test(lower)
  if (!vague) return []
  return [
    'Which exact behavior, files, or runtime should change first?',
    'Which validation must pass before this Quest can be called complete?',
  ]
}

function buildPlanningNotes(
  readiness: PrePlanningRequirementReadiness,
  scenario: QuestScenario,
  clarifyingQuestions: string[],
): string[] {
  return unique([
    `Requirement compiler ran before task planning with scenario ${scenario}.`,
    readiness === 'needs-clarification'
      ? 'Proceed narrowly and keep assumptions visible until the user confirms them.'
      : 'Requirements are ready for task planning.',
    ...(clarifyingQuestions.length > 0
      ? [`Open questions captured: ${clarifyingQuestions.length}`]
      : []),
  ])
}

function normalizeObjective(objective: string): string {
  const trimmed = objective.trim()
  return trimmed.length > 0 ? trimmed : 'Current Quest objective'
}

function stableId(input: string): string {
  return `preq-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

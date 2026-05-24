/**
 * Reflection Engine — meta-cognitive loop for OpenAgent Quest v8.
 *
 * After VERIFY, before COMPLETE, analyses the quest trace to extract
 * learnings, missed shortcuts, redundant steps, and suggested pattern
 * improvements. Outputs `reflection.json` and promotes insights into
 * team memory.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createLogger } from './logger.js'
import type { ReconciledQuestRun, ReconcilerEvent } from './quest-reconciler.js'
import type { AgentMemoryBundle } from './agent-memory.js'

const log = createLogger('reflection-engine')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReflectionLearning {
  category: 'shortcut_missed' | 'redundant_step' | 'pattern_mismatch' | 'context_gap' | 'success_reinforcement'
  description: string
  evidence: string[]
  confidence: number
  suggestedAction?: string
}

export interface ReflectionMetric {
  name: string
  value: number
  unit: string
  benchmark?: number
}

export interface ReflectionResult {
  questId: string
  timestamp: string
  overallInsight: string
  learnings: ReflectionLearning[]
  metrics: ReflectionMetric[]
  patternSuggestions: string[]
  promotedToTeamMemory: boolean
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

export function analyzeQuestForReflection(
  quest: ReconciledQuestRun,
  agentMemory?: AgentMemoryBundle,
): ReflectionResult {
  const learnings: ReflectionLearning[] = []
  const metrics: ReflectionMetric[] = []
  const patternSuggestions: string[] = []

  // Metric: tool-call efficiency
  const toolCalls = quest.events.filter((e) =>
    ['file_change', 'validation', 'error'].includes(e.type),
  ).length
  metrics.push({ name: 'tool_calls', value: toolCalls, unit: 'count' })

  // Metric: incident rate
  const incidents = quest.events.filter((e) => e.type === 'incident.created').length
  metrics.push({ name: 'incidents', value: incidents, unit: 'count' })

  // Metric: verification pass rate
  const validations = quest.events.filter((e) => e.type === 'validation')
  const passedValidations = validations.filter(
    (e) => (e.data as Record<string, unknown>).passed === true,
  ).length
  const passRate = validations.length > 0 ? passedValidations / validations.length : 1
  metrics.push({ name: 'validation_pass_rate', value: passRate, unit: 'ratio', benchmark: 1 })

  // Learning: repeated file reads before writes (redundant step)
  const fileReads = new Set<string>()
  const fileWrites = new Set<string>()
  for (const event of quest.events) {
    if (event.type === 'file_change') {
      const data = event.data as Record<string, unknown>
      const path = String(data.path ?? data.filePath ?? '')
      const changeType = String(data.type ?? 'write')
      if (changeType === 'read' && path) fileReads.add(path)
      if ((changeType === 'write' || changeType === 'update') && path) fileWrites.add(path)
    }
  }
  const readsBeforeWrites = [...fileWrites].filter((p) => fileReads.has(p))
  if (readsBeforeWrites.length > 3) {
    learnings.push({
      category: 'redundant_step',
      description: `Read ${readsBeforeWrites.length} files before writing them. Consider batching reads with a single context load.`,
      evidence: readsBeforeWrites.slice(0, 5),
      confidence: 0.75,
      suggestedAction: 'Use Grep/Glob to identify target files, then read them in a single batch.',
    })
  }

  // Learning: incidents indicate pattern mismatch
  if (incidents > 0) {
    const incidentEvents = quest.events.filter((e) => e.type === 'incident.created')
    const categories = new Set(incidentEvents.map((e) => String((e.data as Record<string, unknown>).category ?? 'unknown')))
    learnings.push({
      category: 'pattern_mismatch',
      description: `${incidents} incident(s) occurred across categories: ${[...categories].join(', ')}.`,
      evidence: incidentEvents.map((e) => String((e.data as Record<string, unknown>).message ?? '')),
      confidence: 0.85,
      suggestedAction: 'Add pre-flight checks for these failure categories before the next similar quest.',
    })
  }

  // Learning: validation failures indicate context gap
  if (passedValidations < validations.length) {
    const failedChecks = validations
      .flatMap((e) => {
        const data = e.data as Record<string, unknown>
        const checks = Array.isArray(data.checks) ? data.checks : []
        return checks.filter((c: Record<string, unknown>) => c.passed === false)
      })
      .map((c: Record<string, unknown>) => String(c.name ?? 'unnamed'))
    learnings.push({
      category: 'context_gap',
      description: `${validations.length - passedValidations} validation check(s) failed.`,
      evidence: failedChecks,
      confidence: 0.8,
      suggestedAction: 'Include these checks in the acceptance criteria of the next similar quest.',
    })
  }

  // Learning: success reinforcement when everything passed
  if (incidents === 0 && passRate === 1 && toolCalls <= 10) {
    learnings.push({
      category: 'success_reinforcement',
      description: 'Clean execution with minimal tool calls and no incidents. This approach is a keeper.',
      evidence: [`tool_calls: ${toolCalls}`, `incidents: ${incidents}`],
      confidence: 0.9,
    })
  }

  // Agent memory: blockers that were resolved
  if (agentMemory) {
    for (const [agentId, memory] of Object.entries(agentMemory.agents)) {
      const unresolvedBlockers = memory.blockers.filter((b) => !b.resolved)
      if (unresolvedBlockers.length > 0) {
        learnings.push({
          category: 'context_gap',
          description: `${agentId} had ${unresolvedBlockers.length} unresolved blocker(s).`,
          evidence: unresolvedBlockers.map((b) => b.description),
          confidence: 0.7,
        })
      }
    }
  }

  // Pattern suggestions
  if (readsBeforeWrites.length > 3) {
    patternSuggestions.push('Batch file reads before writes to reduce redundant I/O.')
  }
  if (incidents > 0) {
    patternSuggestions.push('Add a pre-execution risk scan for incident-prone task types.')
  }
  if (validations.length === 0) {
    patternSuggestions.push('This quest had no validation gates. Consider adding at least one acceptance check.')
  }

  const overallInsight = buildOverallInsight(quest, learnings, metrics)

  return {
    questId: quest.id,
    timestamp: new Date().toISOString(),
    overallInsight,
    learnings,
    metrics,
    patternSuggestions,
    promotedToTeamMemory: false,
  }
}

function buildOverallInsight(
  quest: ReconciledQuestRun,
  learnings: ReflectionLearning[],
  metrics: ReflectionMetric[],
): string {
  const incidentMetric = metrics.find((m) => m.name === 'incidents')
  const passRateMetric = metrics.find((m) => m.name === 'validation_pass_rate')

  if (incidentMetric && incidentMetric.value === 0 && passRateMetric && passRateMetric.value === 1) {
    return `Quest ${quest.id} completed cleanly. ${learnings.length} learnings extracted for pattern reinforcement.`
  }
  if (incidentMetric && incidentMetric.value > 0) {
    return `Quest ${quest.id} completed with ${incidentMetric.value} incident(s). ${learnings.length} learnings identify root causes and prevention strategies.`
  }
  if (passRateMetric && passRateMetric.value < 1) {
    return `Quest ${quest.id} had validation gaps. ${learnings.length} learnings suggest acceptance-criteria improvements.`
  }
  return `Quest ${quest.id} reflected. ${learnings.length} learnings captured for future quests.`
}

// ── Persistence ─────────────────────────────────────────────────────────────────

export async function saveReflection(
  projectRoot: string,
  questId: string,
  reflection: ReflectionResult,
): Promise<string> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  const path = join(runDir, 'reflection.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(reflection, null, 2))
  log.debug('Reflection saved', { questId, learnings: reflection.learnings.length })
  return path
}

export async function loadReflection(
  projectRoot: string,
  questId: string,
): Promise<ReflectionResult | null> {
  const path = join(projectRoot, '.oac', 'runs', questId, 'reflection.json')
  try {
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as ReflectionResult
  } catch {
    return null
  }
}

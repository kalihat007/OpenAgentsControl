/**
 * Expert Memory & Learning System — makes experts smarter over time.
 *
 * Tracks decisions, routing accuracy, user preferences, and project
 * conventions so the system continuously improves its expert selection
 * and understands the user's project better with each interaction.
 *
 * Data is persisted to `.opencode/.expert-memory.json` as pretty-printed JSON.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLogger } from './logger.js'
import type { ProjectConventions } from './codebase-indexer.js'

const log = createLogger('expert-memory')

const MEMORY_PATH = '.opencode/.expert-memory.json'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Decision {
  id: string
  timestamp: string
  expertId: string
  objective: string
  approach: string
  outcome: 'success' | 'failure' | 'partial'
  context: Record<string, unknown>
  learnings: string[]
}

export interface RoutingRecord {
  timestamp: string
  objective: string
  routedTo: string
  confidence: number
  userOverride?: string
  wasCorrect?: boolean
}

export interface UserPreferences {
  preferredExperts: Record<string, number>
  disabledExperts: string[]
  confidenceThreshold: number
  autoApprove: boolean
  customKeywords: Record<string, string[]>
}

export interface ConventionOverride {
  pattern: string
  convention: string
  source: 'detected' | 'user' | 'learned'
  confidence: number
}

export interface ExpertMemory {
  projectRoot: string
  decisions: Decision[]
  routingHistory: RoutingRecord[]
  userPreferences: UserPreferences
  projectConventions: ConventionOverride[]
  lastUpdated: string
}

export interface Adjustment {
  expertId: string
  currentWeight: number
  suggestedWeight: number
  reason: string
}

// ── Memory persistence ────────────────────────────────────────────────────────

export function initializeMemory(projectRoot: string): ExpertMemory {
  return {
    projectRoot,
    decisions: [],
    routingHistory: [],
    userPreferences: {
      preferredExperts: {},
      disabledExperts: [],
      confidenceThreshold: 0.4,
      autoApprove: false,
      customKeywords: {},
    },
    projectConventions: [],
    lastUpdated: new Date().toISOString(),
  }
}

export async function loadMemory(projectRoot: string): Promise<ExpertMemory> {
  const memoryPath = join(projectRoot, MEMORY_PATH)
  try {
    const raw = await readFile(memoryPath, 'utf-8')
    const parsed = JSON.parse(raw) as ExpertMemory
    log.debug('Memory loaded', { decisions: parsed.decisions.length, routingRecords: parsed.routingHistory.length })
    return parsed
  } catch (err) {
    if (err instanceof SyntaxError) {
      log.warn('Corrupt memory file — reinitializing', { path: memoryPath })
    } else {
      log.debug('No existing memory file — initializing fresh', { path: memoryPath })
    }
    return initializeMemory(projectRoot)
  }
}

export async function saveMemory(memory: ExpertMemory): Promise<void> {
  const memoryPath = join(memory.projectRoot, MEMORY_PATH)
  await mkdir(dirname(memoryPath), { recursive: true })

  const updated: ExpertMemory = {
    ...memory,
    lastUpdated: new Date().toISOString(),
  }

  await writeFile(memoryPath, JSON.stringify(updated, null, 2), 'utf-8')
  log.debug('Memory saved', { path: memoryPath })
}

// ── Decision logging ──────────────────────────────────────────────────────────

export function recordDecision(
  memory: ExpertMemory,
  decision: Omit<Decision, 'id' | 'timestamp'>,
): ExpertMemory {
  const newDecision: Decision = {
    ...decision,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  }

  return {
    ...memory,
    decisions: [...memory.decisions, newDecision],
  }
}

export function getDecisionsByExpert(memory: ExpertMemory, expertId: string): Decision[] {
  return memory.decisions.filter((d) => d.expertId === expertId)
}

export function getDecisionsByOutcome(
  memory: ExpertMemory,
  outcome: Decision['outcome'],
): Decision[] {
  return memory.decisions.filter((d) => d.outcome === outcome)
}

export function getRecentDecisions(memory: ExpertMemory, limit: number): Decision[] {
  const indexed = memory.decisions.map((d, i) => ({ d, i }))
  indexed.sort((a, b) => {
    const timeDiff = new Date(b.d.timestamp).getTime() - new Date(a.d.timestamp).getTime()
    return timeDiff !== 0 ? timeDiff : b.i - a.i
  })
  return indexed.slice(0, limit).map(({ d }) => d)
}

// ── Routing learning ──────────────────────────────────────────────────────────

export function recordRouting(
  memory: ExpertMemory,
  record: Omit<RoutingRecord, 'timestamp'>,
): ExpertMemory {
  const newRecord: RoutingRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  }

  return {
    ...memory,
    routingHistory: [...memory.routingHistory, newRecord],
  }
}

export function recordUserOverride(
  memory: ExpertMemory,
  objective: string,
  overriddenTo: string,
): ExpertMemory {
  const history = memory.routingHistory.slice()

  // Find the most recent routing record matching this objective and mark it
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].objective === objective) {
      history[i] = {
        ...history[i],
        userOverride: overriddenTo,
        wasCorrect: false,
      }
      break
    }
  }

  // Boost the expert the user chose
  const preferredExperts = { ...memory.userPreferences.preferredExperts }
  preferredExperts[overriddenTo] = (preferredExperts[overriddenTo] ?? 0) + 1

  return {
    ...memory,
    routingHistory: history,
    userPreferences: {
      ...memory.userPreferences,
      preferredExperts,
    },
  }
}

export function getRoutingAccuracy(
  memory: ExpertMemory,
  expertId?: string,
): { total: number; correct: number; accuracy: number } {
  const records = expertId
    ? memory.routingHistory.filter((r) => r.routedTo === expertId)
    : memory.routingHistory

  const evaluated = records.filter((r) => r.wasCorrect !== undefined)
  const correct = evaluated.filter((r) => r.wasCorrect === true).length
  const total = evaluated.length

  return {
    total,
    correct,
    accuracy: total === 0 ? 1 : correct / total,
  }
}

export function getLearnedWeights(memory: ExpertMemory): Record<string, number> {
  const weights: Record<string, number> = {}
  const expertStats = new Map<string, { correct: number; total: number; overriddenAway: number }>()

  for (const record of memory.routingHistory) {
    const stats = expertStats.get(record.routedTo) ?? { correct: 0, total: 0, overriddenAway: 0 }
    stats.total++
    if (record.wasCorrect === true) stats.correct++
    if (record.userOverride && record.userOverride !== record.routedTo) stats.overriddenAway++
    expertStats.set(record.routedTo, stats)
  }

  for (const [expertId, stats] of expertStats) {
    const baseWeight = 1.0
    const accuracyBonus = stats.total > 0 ? (stats.correct / stats.total) * 0.5 : 0
    const overridePenalty = stats.total > 0 ? (stats.overriddenAway / stats.total) * 0.3 : 0
    const prefBoost = (memory.userPreferences.preferredExperts[expertId] ?? 0) * 0.1

    weights[expertId] = Math.max(0.1, baseWeight + accuracyBonus - overridePenalty + prefBoost)
  }

  // Include experts that are only in preferences (never routed to)
  for (const [expertId, boost] of Object.entries(memory.userPreferences.preferredExperts)) {
    if (!(expertId in weights)) {
      weights[expertId] = 1.0 + boost * 0.1
    }
  }

  return weights
}

export function suggestRoutingAdjustments(memory: ExpertMemory): Adjustment[] {
  const adjustments: Adjustment[] = []
  const weights = getLearnedWeights(memory)

  // Check for frequently-overridden experts first (more specific signal)
  const overrideStats = new Map<string, number>()
  for (const record of memory.routingHistory) {
    if (record.userOverride && record.userOverride !== record.routedTo) {
      overrideStats.set(record.routedTo, (overrideStats.get(record.routedTo) ?? 0) + 1)
    }
  }

  for (const [expertId, overrideCount] of overrideStats) {
    if (overrideCount >= 5) {
      adjustments.push({
        expertId,
        currentWeight: weights[expertId] ?? 1.0,
        suggestedWeight: 0.3,
        reason: `Overridden ${overrideCount} times — consider reducing weight significantly`,
      })
    }
  }

  // Then check accuracy-based adjustments for experts not already flagged
  for (const [expertId, weight] of Object.entries(weights)) {
    if (adjustments.some((a) => a.expertId === expertId)) continue

    const { total, correct, accuracy } = getRoutingAccuracy(memory, expertId)

    if (total < 3) continue

    if (accuracy < 0.5) {
      adjustments.push({
        expertId,
        currentWeight: weight,
        suggestedWeight: Math.max(0.1, weight * 0.7),
        reason: `Low accuracy (${Math.round(accuracy * 100)}%) over ${total} routings — reduce weight`,
      })
    } else if (accuracy > 0.8 && correct >= 5) {
      adjustments.push({
        expertId,
        currentWeight: weight,
        suggestedWeight: Math.min(2.0, weight * 1.2),
        reason: `High accuracy (${Math.round(accuracy * 100)}%) over ${total} routings — increase weight`,
      })
    }
  }

  return adjustments
}

// ── User preferences ──────────────────────────────────────────────────────────

export function updatePreference<K extends keyof UserPreferences>(
  memory: ExpertMemory,
  key: K,
  value: UserPreferences[K],
): ExpertMemory {
  return {
    ...memory,
    userPreferences: {
      ...memory.userPreferences,
      [key]: value,
    },
  }
}

export function boostExpert(
  memory: ExpertMemory,
  expertId: string,
  amount: number,
): ExpertMemory {
  const preferredExperts = { ...memory.userPreferences.preferredExperts }
  preferredExperts[expertId] = (preferredExperts[expertId] ?? 0) + amount

  return {
    ...memory,
    userPreferences: {
      ...memory.userPreferences,
      preferredExperts,
    },
  }
}

export function disableExpert(memory: ExpertMemory, expertId: string): ExpertMemory {
  const disabledExperts = memory.userPreferences.disabledExperts.includes(expertId)
    ? memory.userPreferences.disabledExperts
    : [...memory.userPreferences.disabledExperts, expertId]

  return {
    ...memory,
    userPreferences: {
      ...memory.userPreferences,
      disabledExperts,
    },
  }
}

export function addCustomKeywords(
  memory: ExpertMemory,
  expertId: string,
  keywords: string[],
): ExpertMemory {
  const customKeywords = { ...memory.userPreferences.customKeywords }
  const existing = customKeywords[expertId] ?? []
  const merged = [...new Set([...existing, ...keywords])]
  customKeywords[expertId] = merged

  return {
    ...memory,
    userPreferences: {
      ...memory.userPreferences,
      customKeywords,
    },
  }
}

// ── Convention learning ───────────────────────────────────────────────────────

export function learnConvention(
  memory: ExpertMemory,
  pattern: string,
  convention: string,
  source: ConventionOverride['source'],
): ExpertMemory {
  const conventions = memory.projectConventions.slice()

  const existingIdx = conventions.findIndex((c) => c.pattern === pattern)
  const newOverride: ConventionOverride = {
    pattern,
    convention,
    source,
    confidence: source === 'user' ? 1.0 : source === 'learned' ? 0.7 : 0.5,
  }

  if (existingIdx >= 0) {
    const existing = conventions[existingIdx]
    // User-specified conventions always win; otherwise take higher confidence
    if (source === 'user' || newOverride.confidence >= existing.confidence) {
      conventions[existingIdx] = newOverride
    }
  } else {
    conventions.push(newOverride)
  }

  return {
    ...memory,
    projectConventions: conventions,
  }
}

export function getConventions(
  memory: ExpertMemory,
  pattern?: string,
): ConventionOverride[] {
  if (!pattern) return memory.projectConventions

  return memory.projectConventions.filter((c) => c.pattern === pattern)
}

export function mergeWithDetected(
  memory: ExpertMemory,
  detected: ProjectConventions,
): ProjectConventions {
  const merged = { ...detected }

  for (const override of memory.projectConventions) {
    const key = override.pattern as keyof ProjectConventions
    if (key in merged) {
      // Only override if the learned/user convention has decent confidence
      if (override.confidence >= 0.5) {
        ;(merged as Record<string, string>)[key] = override.convention
      }
    }
  }

  return merged
}

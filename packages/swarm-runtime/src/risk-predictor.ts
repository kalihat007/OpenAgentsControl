/**
 * Risk Predictor — predictive failure detection for OpenAgent swarm tasks.
 *
 * Combines codebase dependency graph awareness, team memory recurring-failure
 * patterns, and quest-pattern history to score the likelihood of failure
 * before a batch executes.
 */

import type { SwarmTask } from "./types.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical"

/** Minimal interface for dependency graph data passed from the CLI. */
export interface RiskPredictorCodebaseModule {
  path: string
  imports: string[]
  exports: string[]
  complexity: "low" | "medium" | "high"
}

export interface RiskPredictorCodebaseIndex {
  modules: RiskPredictorCodebaseModule[]
  dependencies: Record<string, { imports: string[]; importedBy: string[] }>
  conventions: {
    importStyle?: string
    fileNaming?: string
  }
}

/** Minimal interface for team memory data passed from the CLI. */
export interface RiskPredictorRecurringFailure {
  pattern: string
  failureSummary: string
  occurrenceCount: number
  resolved: boolean
}

export interface RiskPredictorTeamMemory {
  recurringFailures: RiskPredictorRecurringFailure[]
}

/** Minimal interface for quest pattern data passed from the CLI. */
export interface RiskPredictorQuestPattern {
  objectiveKeywords: string[]
  outcome: "success" | "failed" | "blocked"
}

export interface TaskRiskScore {
  taskId: string
  score: number // 0–10
  level: RiskLevel
  factors: RiskFactor[]
}

export interface RiskFactor {
  category: "dependency" | "history" | "complexity" | "conflict" | "convention"
  description: string
  weight: number
}

export interface BatchRiskReport {
  batchId: string
  taskRisks: TaskRiskScore[]
  overallScore: number
  overallLevel: RiskLevel
  topFactors: RiskFactor[]
  recommendations: string[]
}

// ── Scoring Constants ─────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS: Record<RiskLevel, number> = {
  low: 3,
  medium: 5,
  high: 7,
  critical: 9,
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= LEVEL_THRESHOLDS.critical) return "critical"
  if (score >= LEVEL_THRESHOLDS.high) return "high"
  if (score >= LEVEL_THRESHOLDS.medium) return "medium"
  return "low"
}

// ── Dependency Risk ───────────────────────────────────────────────────────────

function analyzeDependencyRisk(
  task: SwarmTask,
  codebase: RiskPredictorCodebaseIndex | null,
): RiskFactor[] {
  const factors: RiskFactor[] = []
  if (!codebase) return factors

  const affected = [...(task.reads ?? []), ...(task.writes ?? [])]
  const moduleRisks: number[] = []

  for (const filePath of affected) {
    const moduleInfo = codebase.modules.find((m) => filePath.includes(m.path))
    if (!moduleInfo) continue

    // High fan-out = high blast radius
    const depCount = moduleInfo.imports.length + moduleInfo.exports.length
    if (depCount > 5) {
      moduleRisks.push(depCount / 10)
      factors.push({
        category: "dependency",
        description: `${filePath} has ${depCount} import/export relationships`,
        weight: Math.min(depCount / 10, 1),
      })
    }

    // Check for circular or deep transitive deps
    const transitive = codebase.dependencies[filePath]
    if (transitive?.importedBy && transitive.importedBy.length > 3) {
      moduleRisks.push(transitive.importedBy.length / 5)
      factors.push({
        category: "dependency",
        description: `${filePath} is imported by ${transitive.importedBy.length} other files`,
        weight: Math.min(transitive.importedBy.length / 5, 1),
      })
    }
  }

  return factors
}

// ── Historical Risk ───────────────────────────────────────────────────────────

function analyzeHistoricalRisk(
  task: SwarmTask,
  teamMemory: RiskPredictorTeamMemory | null,
  patterns: RiskPredictorQuestPattern[],
): RiskFactor[] {
  const factors: RiskFactor[] = []
  if (!teamMemory && patterns.length === 0) return factors

  const taskKeywords = extractTaskKeywords(task)

  // Match against recurring failures
  if (teamMemory) {
    for (const failure of teamMemory.recurringFailures) {
      if (failure.resolved) continue
      const failureKeywords = tokenize(`${failure.pattern} ${failure.failureSummary}`)
      const overlap = keywordOverlap(taskKeywords, failureKeywords)
      if (overlap > 0.15) {
        factors.push({
          category: "history",
          description: `Unresolved recurring failure "${failure.pattern}" (${failure.occurrenceCount}x) matches this task`,
          weight: Math.min(failure.occurrenceCount / 5, 1) * overlap,
        })
      }
    }
  }

  // Match against past quest patterns
  const relevantPatterns = patterns.filter((p) => {
    const overlap = keywordOverlap(taskKeywords, p.objectiveKeywords)
    return overlap > 0.2
  })

  const failurePatterns = relevantPatterns.filter((p) => p.outcome === "failed")
  if (failurePatterns.length > 0) {
    const failRate = failurePatterns.length / relevantPatterns.length
    factors.push({
      category: "history",
      description: `${Math.round(failRate * 100)}% of similar past quests failed (${failurePatterns.length}/${relevantPatterns.length})`,
      weight: failRate,
    })
  }

  return factors
}

// ── Complexity Risk ───────────────────────────────────────────────────────────

function analyzeComplexityRisk(
  task: SwarmTask,
  codebase: RiskPredictorCodebaseIndex | null,
): RiskFactor[] {
  const factors: RiskFactor[] = []
  const affected = [...(task.reads ?? []), ...(task.writes ?? [])]

  // Many affected files = coordination risk (does not need codebase)
  if (affected.length > 5) {
    factors.push({
      category: "complexity",
      description: `Task touches ${affected.length} files — coordination risk`,
      weight: Math.min(affected.length / 10, 1),
    })
  }

  if (!codebase) return factors

  let highComplexityCount = 0
  for (const filePath of affected) {
    const moduleInfo = codebase.modules.find((m) => filePath.includes(m.path))
    if (moduleInfo?.complexity === "high") {
      highComplexityCount++
    }
  }

  if (highComplexityCount > 0) {
    factors.push({
      category: "complexity",
      description: `${highComplexityCount} affected file(s) marked high complexity`,
      weight: Math.min(highComplexityCount / 2, 1),
    })
  }

  return factors
}

// ── Conflict Risk ─────────────────────────────────────────────────────────────

function analyzeConflictRisk(
  task: SwarmTask,
  concurrentTasks: SwarmTask[],
): RiskFactor[] {
  const factors: RiskFactor[] = []
  const affected = new Set([...(task.reads ?? []), ...(task.writes ?? [])])

  for (const other of concurrentTasks) {
    if (other.id === task.id) continue
    const otherAffected = new Set([...(other.reads ?? []), ...(other.writes ?? [])])
    const overlap = [...affected].filter((f) => otherAffected.has(f))
    if (overlap.length > 0) {
      factors.push({
        category: "conflict",
        description: `File overlap with concurrent task ${other.id}: ${overlap.join(", ")}`,
        weight: Math.min(overlap.length / 3, 1),
      })
    }
  }

  return factors
}

// ── Convention Risk ───────────────────────────────────────────────────────────

function analyzeConventionRisk(
  task: SwarmTask,
  codebase: RiskPredictorCodebaseIndex | null,
): RiskFactor[] {
  const factors: RiskFactor[] = []
  if (!codebase) return factors

  // If task title mentions patterns that conflict with detected conventions
  const objective = task.title.toLowerCase()
  const conventions = codebase.conventions

  if (conventions.importStyle && objective.includes("import")) {
    // Low risk factor — just informational
    factors.push({
      category: "convention",
      description: `Task involves imports; project convention is "${conventions.importStyle}"`,
      weight: 0.2,
    })
  }

  if (conventions.fileNaming && objective.includes("rename")) {
    factors.push({
      category: "convention",
      description: `Task involves renaming; project convention is "${conventions.fileNaming}"`,
      weight: 0.2,
    })
  }

  return factors
}

// ── Batch Scoring ─────────────────────────────────────────────────────────────

export function predictBatchRisk(
  tasks: SwarmTask[],
  options: {
    codebase?: RiskPredictorCodebaseIndex | null
    teamMemory?: RiskPredictorTeamMemory | null
    patterns?: RiskPredictorQuestPattern[]
  } = {},
): BatchRiskReport {
  const { codebase = null, teamMemory = null, patterns = [] } = options

  const taskRisks: TaskRiskScore[] = []
  const allFactors: RiskFactor[] = []

  for (const task of tasks) {
    const factors = [
      ...analyzeDependencyRisk(task, codebase),
      ...analyzeHistoricalRisk(task, teamMemory, patterns),
      ...analyzeComplexityRisk(task, codebase),
      ...analyzeConflictRisk(task, tasks),
      ...analyzeConventionRisk(task, codebase),
    ]

    // Compute weighted score: sum of (weight * 2.5) per factor, capped at 10
    const rawScore = factors.reduce((sum, f) => sum + f.weight * 2.5, 0)
    const score = Math.min(Math.round(rawScore * 10) / 10, 10)

    taskRisks.push({
      taskId: task.id,
      score,
      level: scoreToLevel(score),
      factors,
    })

    allFactors.push(...factors)
  }

  // Overall batch score = max task score + 0.5 per conflict factor
  const maxTaskScore = Math.max(...taskRisks.map((t) => t.score), 0)
  const conflictCount = allFactors.filter((f) => f.category === "conflict").length
  const overallScore = Math.min(maxTaskScore + conflictCount * 0.5, 10)
  const overallLevel = scoreToLevel(overallScore)

  // Top factors by weight
  const topFactors = allFactors
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)

  // Recommendations
  const recommendations: string[] = []
  if (overallLevel === "critical" || overallLevel === "high") {
    recommendations.push("Force REVIEW gate before EXECUTE")
  }
  if (conflictCount > 0) {
    recommendations.push("Split overlapping tasks into separate batches or serialize them")
  }
  if (allFactors.some((f) => f.category === "history")) {
    recommendations.push("Review recurring failure patterns before executing")
  }
  if (allFactors.some((f) => f.category === "complexity" && f.weight > 0.5)) {
    recommendations.push("Break high-complexity task into smaller subtasks")
  }
  if (recommendations.length === 0) {
    recommendations.push("Risk profile is clean — proceed with normal swarm execution")
  }

  return {
    batchId: `batch-${Date.now()}`,
    taskRisks,
    overallScore,
    overallLevel,
    topFactors,
    recommendations,
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\-/]+/)
    .filter((w) => w.length > 2)
    .slice(0, 30)
}

function extractTaskKeywords(task: SwarmTask): string[] {
  const text = `${task.title} ${task.agent} ${[...(task.reads ?? []), ...(task.writes ?? [])].join(" ")}`
  return [...new Set(tokenize(text))]
}

function keywordOverlap(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

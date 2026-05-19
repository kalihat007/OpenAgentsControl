/**
 * Expert Pipeline — unified orchestration that ties every module together.
 *
 * Runs the full agentic coding pipeline:
 *   1. Codebase indexing (contextual awareness)
 *   2. Custom expert + memory loading
 *   3. Multi-intent task decomposition
 *   4. Expert routing with memory-adjusted scoring
 *   5. Interactive session + approval gates
 *   6. Swarm execution (PEV loop)
 *   7. Quality verification
 *   8. Memory update with outcomes
 *
 * Usage:
 *   const result = await runExpertPipeline("build a JWT login API", cwd)
 */

import { createLogger } from './logger.js'
import { routeTask, type RouterResult, type ExpertProfile } from './task-router.js'
import {
  planExecution,
  executeSwarm,
  loadSessionBudgetLimits,
  mergeQualityGateChecks,
  type ExecutionMode,
  type ExecutionPlan,
  type ExecutionResult,
  type AcceptanceCheck,
} from './swarm-executor.js'
import type { RuntimeType } from './runtime-bridge.js'
import { runSwarmQualityGate } from './swarm-quality-gate.js'
import {
  indexCodebase,
  loadIndex,
  saveIndex,
  isIndexStale,
  type CodebaseIndex,
} from './codebase-indexer.js'
import {
  decomposeTask,
  shouldDecompose,
  type DecomposedTask,
  type SubTask,
} from './task-decomposer.js'
import {
  loadMemory,
  saveMemory,
  recordRouting,
  recordDecision,
  getLearnedWeights,
  type ExpertMemory,
} from './expert-memory.js'
import {
  loadBuiltInExperts,
  loadCustomExperts,
  type ExpertDefinition,
} from './expert-definitions.js'
import { DEFAULT_MAX_PARALLEL_AGENTS } from './config.js'
import {
  createInteractiveSession,
  reachGate,
  approveGate,
  emitProgress,
  type InteractiveMode,
  type InteractiveSession,
} from './interactive-mode.js'

const log = createLogger('expert-pipeline')

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | 'indexing'
  | 'decomposition'
  | 'routing'
  | 'planning'
  | 'approval'
  | 'execution'
  | 'verification'
  | 'quality'
  | 'memory_update'
  | 'complete'

export interface PipelineConfig {
  mode: InteractiveMode
  useIndex: boolean
  useMemory: boolean
  useDecomposition: boolean
  qualityChecks: boolean
  dryRun: boolean
  verbose: boolean
  maxConcurrency: number
  /** simulate (default), handoff, runtime, or distributed — runtime modes spawn real execution */
  executionMode: ExecutionMode
  /** Run real quality gate on changed files after execution (--run default) */
  runQualityGate: boolean
  /** Cap from .oac/config.json — clamps planner concurrency before scheduling */
  maxParallelAgents?: number
  /** Selected runtime for real execution (opencode, kimi, claude, codex) */
  runtime?: RuntimeType
  /** Run the runtime in detached background mode */
  background?: boolean
}

export interface QualityReport {
  taskId: string
  agent: string
  checks: AcceptanceCheck[]
  passed: number
  failed: number
  unverified: number
  score: number
}

export interface PipelineResult {
  objective: string
  decomposed: boolean
  subTasks: SubTask[]
  routing: RouterResult[]
  executionResults: ExecutionResult | null
  qualityReports: QualityReport[]
  memoryUpdated: boolean
  duration: number
  stages: PipelineStage[]
  plan: ExecutionPlan | null
  interactiveSession: InteractiveSession | null
  codebaseIndex: CodebaseIndex | null
}

export interface PipelineCallbacks {
  onStageChange?: (stage: PipelineStage, message: string) => void
  onProgress?: (pct: number, message: string) => void
  onApprovalNeeded?: (plan: ExecutionPlan) => Promise<boolean>
  onQualityReport?: (report: QualityReport) => void
  onComplete?: (result: PipelineResult) => void
}

// ── Configuration presets ──────────────────────────────────────────────────────

export function getQuickConfig(): PipelineConfig {
  return {
    mode: 'autonomous',
    useIndex: false,
    useMemory: false,
    useDecomposition: false,
    qualityChecks: false,
    dryRun: false,
    verbose: false,
    maxConcurrency: 1,
    executionMode: 'simulate',
    runQualityGate: true,
  }
}

export function getFullConfig(): PipelineConfig {
  return {
    mode: 'supervised',
    useIndex: true,
    useMemory: true,
    useDecomposition: true,
    qualityChecks: true,
    dryRun: false,
    verbose: true,
    maxConcurrency: DEFAULT_MAX_PARALLEL_AGENTS,
    executionMode: 'simulate',
    runQualityGate: true,
  }
}

export function getSafeConfig(): PipelineConfig {
  return {
    mode: 'collaborative',
    useIndex: true,
    useMemory: true,
    useDecomposition: true,
    qualityChecks: true,
    dryRun: false,
    verbose: false,
    maxConcurrency: DEFAULT_MAX_PARALLEL_AGENTS,
    executionMode: 'simulate',
    runQualityGate: true,
  }
}

// ── Pipeline orchestration ────────────────────────────────────────────────────

export async function runExpertPipeline(
  objective: string,
  projectRoot: string,
  config?: Partial<PipelineConfig>,
  callbacks?: PipelineCallbacks,
): Promise<PipelineResult> {
  const start = Date.now()
  const cfg: PipelineConfig = { ...getFullConfig(), ...config }
  const completedStages: PipelineStage[] = []

  log.info('Pipeline starting', {
    objective: objective.slice(0, 120),
    mode: cfg.mode,
    useIndex: cfg.useIndex,
    useMemory: cfg.useMemory,
    useDecomposition: cfg.useDecomposition,
  })

  let codebaseIndex: CodebaseIndex | null = null
  let memory: ExpertMemory | null = null
  let learnedWeights: Record<string, number> = {}
  let decomposition: DecomposedTask | null = null
  let allExperts: ExpertDefinition[] = []
  let interactiveSession: InteractiveSession | null = null
  let plan: ExecutionPlan | null = null
  let execResult: ExecutionResult | null = null
  const qualityReports: QualityReport[] = []
  let memoryUpdated = false

  // ── Stage 1: Codebase indexing ────────────────────────────────────────────

  if (cfg.useIndex) {
    emitStage('indexing', 'Building codebase index…', callbacks, completedStages)

    try {
      const existing = await loadIndex(projectRoot)
      if (existing && !isIndexStale(existing, projectRoot)) {
        codebaseIndex = existing
        log.debug('Using cached codebase index')
      } else {
        codebaseIndex = await indexCodebase(projectRoot)
        await saveIndex(projectRoot, codebaseIndex)
        log.debug('Built fresh codebase index', {
          modules: codebaseIndex.modules.length,
        })
      }
    } catch (err) {
      log.warn('Codebase indexing failed — continuing without index', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Load custom expert definitions ────────────────────────────────────────

  const builtIn = loadBuiltInExperts()
  const custom = await loadCustomExperts(projectRoot)
  allExperts = [...builtIn]
  for (const expert of custom) {
    const idx = allExperts.findIndex((e) => e.id === expert.id)
    if (idx >= 0) {
      allExperts[idx] = expert
    } else {
      allExperts.push(expert)
    }
  }

  log.debug('Expert definitions loaded', {
    builtIn: builtIn.length,
    custom: custom.length,
    total: allExperts.length,
  })

  // ── Stage 2: Load expert memory and apply learned weights ─────────────────

  if (cfg.useMemory) {
    try {
      memory = await loadMemory(projectRoot)
      learnedWeights = getLearnedWeights(memory)
      log.debug('Memory loaded', {
        decisions: memory.decisions.length,
        routingHistory: memory.routingHistory.length,
        learnedWeights: Object.keys(learnedWeights).length,
      })
    } catch (err) {
      log.warn('Memory loading failed — continuing without memory', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Stage 3: Decompose task if complex ────────────────────────────────────

  const subTasks: SubTask[] = []

  if (cfg.useDecomposition && shouldDecompose(objective)) {
    emitStage('decomposition', 'Decomposing multi-intent objective…', callbacks, completedStages)

    try {
      decomposition = decomposeTask(objective, allExperts)
      for (const st of decomposition.subTasks) {
        subTasks.push(st)
      }
      log.debug('Task decomposed', {
        subTaskCount: subTasks.length,
        complexity: decomposition.estimatedComplexity,
        confidence: decomposition.decompositionConfidence,
      })
    } catch (err) {
      log.warn('Decomposition failed — treating as single task', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Stage 4: Route each (sub)task to experts with memory-adjusted scoring ─

  emitStage('routing', 'Routing tasks to experts…', callbacks, completedStages)

  const routingResults: RouterResult[] = []

  if (subTasks.length > 0) {
    for (const st of subTasks) {
      const result = routeTask(st.objective, projectRoot)
      applyMemoryWeights(result, learnedWeights)
      routingResults.push(result)
    }
  } else {
    const result = routeTask(objective, projectRoot)
    applyMemoryWeights(result, learnedWeights)
    routingResults.push(result)
  }

  log.debug('Routing complete', {
    routingCount: routingResults.length,
    totalPrimary: routingResults.reduce((s, r) => s + r.primaryExperts.length, 0),
    totalSecondary: routingResults.reduce((s, r) => s + r.secondaryExperts.length, 0),
  })

  // Record routing in memory
  if (memory) {
    for (const rr of routingResults) {
      const primary = rr.primaryExperts[0]
      if (primary) {
        memory = recordRouting(memory, {
          objective: rr.objective,
          routedTo: primary.name,
          confidence: rr.confidence.score,
        })
      }
    }
  }

  // ── Stage 5: Create interactive session ───────────────────────────────────

  interactiveSession = createInteractiveSession(cfg.mode)

  // ── Stage 6: Plan execution via PEV loop ──────────────────────────────────

  emitStage('planning', 'Planning execution batches…', callbacks, completedStages)

  const primaryRouting = routingResults[0]
  if (!primaryRouting) {
    log.warn('No routing results — pipeline cannot continue')
    return buildResult(
      objective, false, subTasks, routingResults,
      null, qualityReports, false,
      Date.now() - start, completedStages, null,
      interactiveSession, codebaseIndex, callbacks,
    )
  }

  try {
    const parallelCap =
      cfg.maxParallelAgents ?? (await loadSessionBudgetLimits(projectRoot)).maxParallelAgents
    plan = planExecution(primaryRouting, {
      maxConcurrency: cfg.maxConcurrency,
      maxParallelAgents: parallelCap,
      autoDecompose: cfg.useDecomposition,
    })

    interactiveSession = emitProgress(interactiveSession, {
      type: 'step_started',
      data: {
        planId: plan.session.id,
        tasks: plan.session.tasks.length,
        batches: plan.schedulerResult.batches.length,
      },
    })

    log.debug('Execution plan created', {
      sessionId: plan.session.id,
      tasks: plan.session.tasks.length,
      batches: plan.schedulerResult.batches.length,
    })
  } catch (err) {
    log.error('Planning failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return buildResult(
      objective, subTasks.length > 0, subTasks, routingResults,
      null, qualityReports, false,
      Date.now() - start, completedStages, null,
      interactiveSession, codebaseIndex, callbacks,
    )
  }

  // ── Stage 7: Approval gate (supervised / collaborative) ───────────────────

  if (cfg.mode !== 'autonomous' && !cfg.dryRun) {
    emitStage('approval', 'Waiting for approval…', callbacks, completedStages)

    const planGate = interactiveSession.approvalGates.find((g) => g.phase === 'plan')
    if (planGate) {
      interactiveSession = reachGate(interactiveSession, planGate.id, {
        tasks: plan.session.tasks.length,
        batches: plan.schedulerResult.batches.length,
      })

      let approved = true
      if (callbacks?.onApprovalNeeded) {
        approved = await callbacks.onApprovalNeeded(plan)
      }

      if (approved) {
        interactiveSession = approveGate(interactiveSession, planGate.id, 'Auto-approved')
      } else {
        log.info('Pipeline stopped at approval gate')
        return buildResult(
          objective, subTasks.length > 0, subTasks, routingResults,
          null, qualityReports, false,
          Date.now() - start, completedStages, plan,
          interactiveSession, codebaseIndex, callbacks,
        )
      }
    }
  }

  // ── Stage 8: Execute through swarm-runtime (or dry-run) ───────────────────

  if (cfg.dryRun) {
    emitStage('complete', 'Dry run complete', callbacks, completedStages)

    return buildResult(
      objective, subTasks.length > 0, subTasks, routingResults,
      null, qualityReports, false,
      Date.now() - start, completedStages, plan,
      interactiveSession, codebaseIndex, callbacks,
    )
  }

  const handoff = cfg.executionMode === 'handoff'
  emitStage(
    'execution',
    handoff ? 'Preparing IDE handoff (no headless execution)…' : `Executing expert swarm (${cfg.executionMode})…`,
    callbacks,
    completedStages,
  )

  const budgetLimits = await loadSessionBudgetLimits(projectRoot)

  try {
    execResult = await executeSwarm(plan, {
      mode: cfg.executionMode,
      budget: budgetLimits,
      runtime: cfg.runtime,
      projectRoot,
      routerResult: primaryRouting,
      background: cfg.background,
      callbacks: {
      onBatchStart: (batch, idx, total) => {
        callbacks?.onProgress?.(
          ((idx + 1) / total) * 80,
          `Batch ${idx + 1}/${total}: ${batch.tasks.length} task(s)`,
        )
        if (interactiveSession) {
          interactiveSession = emitProgress(interactiveSession, {
            type: 'step_started',
            data: { batchId: batch.id, batchIndex: idx },
          })
        }
      },
      onTaskStart: (task) => {
        if (interactiveSession) {
          interactiveSession = emitProgress(interactiveSession, {
            type: 'step_started',
            expertId: task.agent,
            data: { taskId: task.id },
          })
        }
      },
      onTaskComplete: (task) => {
        if (interactiveSession) {
          interactiveSession = emitProgress(interactiveSession, {
            type: 'step_completed',
            expertId: task.agent,
            data: { taskId: task.id },
          })
        }
      },
    },
    })

    log.info('Swarm execution complete', {
      mode: execResult.executionMode,
      completed: execResult.completedTasks.length,
      failed: execResult.failedTasks.length,
      elapsedMs: execResult.elapsedMs,
      apiCalls: execResult.budgetUsage.apiCalls,
    })
  } catch (err) {
    log.error('Swarm execution failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    if (interactiveSession) {
      interactiveSession = emitProgress(interactiveSession, {
        type: 'step_failed',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
    }
    return buildResult(
      objective, subTasks.length > 0, subTasks, routingResults,
      null, qualityReports, false,
      Date.now() - start, completedStages, plan,
      interactiveSession, codebaseIndex, callbacks,
    )
  }

  // ── Stage 9: Quality verification ─────────────────────────────────────────

  if (cfg.runQualityGate && execResult && !handoff) {
    emitStage('quality', 'Running quality gate on changed files…', callbacks, completedStages)

    try {
      const gate = await runSwarmQualityGate(projectRoot, { review: cfg.qualityChecks })
      execResult = {
        ...execResult,
        qualityGate: gate,
        acceptanceChecks: mergeQualityGateChecks(execResult.acceptanceChecks, gate),
      }

      if (interactiveSession) {
        interactiveSession = emitProgress(interactiveSession, {
          type: gate.passed ? 'step_completed' : 'step_failed',
          data: { qualityGate: gate.summary, score: gate.overallScore },
        })
      }
    } catch (err) {
      log.warn('Quality gate failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (cfg.qualityChecks && execResult) {
    emitStage('verification', 'Scoring acceptance checks…', callbacks, completedStages)

    const taskChecks = groupChecksByTask(execResult.acceptanceChecks)
    for (const [taskId, checks] of taskChecks) {
      const task = plan.session.tasks.find((t) => t.id === taskId)
      const passed = checks.filter((c) => c.status === 'passed').length
      const failed = checks.filter((c) => c.status === 'failed').length
      const unverified = checks.filter((c) => c.status === 'unverified').length
      const total = checks.length

      const report: QualityReport = {
        taskId,
        agent: task?.agent ?? 'unknown',
        checks,
        passed,
        failed,
        unverified,
        score: total > 0 ? passed / total : 0,
      }

      qualityReports.push(report)
      callbacks?.onQualityReport?.(report)
    }

    // Also create a plan-level quality report for checks without a taskId
    const planChecks = execResult.acceptanceChecks.filter((c) => !c.taskId)
    if (planChecks.length > 0) {
      const passed = planChecks.filter((c) => c.status === 'passed').length
      const failed = planChecks.filter((c) => c.status === 'failed').length
      const unverified = planChecks.filter((c) => c.status === 'unverified').length
      const total = planChecks.length

      const planReport: QualityReport = {
        taskId: 'plan',
        agent: 'plan-level',
        checks: planChecks,
        passed,
        failed,
        unverified,
        score: total > 0 ? passed / total : 0,
      }

      qualityReports.push(planReport)
      callbacks?.onQualityReport?.(planReport)
    }

  }

  // ── Stage 10: Update expert memory with outcomes ──────────────────────────

  if (cfg.useMemory && memory && execResult) {
    emitStage('memory_update', 'Updating expert memory…', callbacks, completedStages)

    try {
      const completedSet = new Set(execResult.completedTasks)
      const failedSet = new Set(execResult.failedTasks)

      for (const task of plan.session.tasks) {
        const outcome = completedSet.has(task.id)
          ? 'success'
          : failedSet.has(task.id)
            ? 'failure'
            : 'partial'

        memory = recordDecision(memory, {
          expertId: task.agent,
          objective: task.title,
          approach: `Executed as part of swarm session ${plan.session.id}`,
          outcome: outcome as 'success' | 'failure' | 'partial',
          context: {
            taskId: task.id,
            role: task.role,
            stage: task.stage,
          },
          learnings: outcome === 'failure'
            ? [`${task.agent} failed for objective — consider different routing`]
            : [],
        })
      }

      await saveMemory(memory)
      memoryUpdated = true
      log.debug('Memory updated', {
        decisions: memory.decisions.length,
      })
    } catch (err) {
      log.warn('Memory update failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Complete ──────────────────────────────────────────────────────────────

  emitStage('complete', 'Pipeline complete', callbacks, completedStages)

  return buildResult(
    objective, subTasks.length > 0, subTasks, routingResults,
    execResult, qualityReports, memoryUpdated,
    Date.now() - start, completedStages, plan,
    interactiveSession, codebaseIndex, callbacks,
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function emitStage(
  stage: PipelineStage,
  message: string,
  callbacks: PipelineCallbacks | undefined,
  completedStages: PipelineStage[],
): void {
  completedStages.push(stage)
  log.debug(`Stage: ${stage}`, { message })
  callbacks?.onStageChange?.(stage, message)
}

function applyMemoryWeights(
  result: RouterResult,
  weights: Record<string, number>,
): void {
  if (Object.keys(weights).length === 0) return

  const adjustScore = (expert: ExpertProfile) => {
    const weight = weights[expert.name]
    if (weight !== undefined) {
      expert.score = Math.round(expert.score * weight * 100) / 100
    }
  }

  for (const expert of result.primaryExperts) adjustScore(expert)
  for (const expert of result.secondaryExperts) adjustScore(expert)

  result.primaryExperts.sort((a, b) => b.score - a.score)
  result.secondaryExperts.sort((a, b) => b.score - a.score)
}

function groupChecksByTask(checks: AcceptanceCheck[]): Map<string, AcceptanceCheck[]> {
  const map = new Map<string, AcceptanceCheck[]>()

  for (const check of checks) {
    if (!check.taskId) continue
    const existing = map.get(check.taskId) ?? []
    existing.push(check)
    map.set(check.taskId, existing)
  }

  return map
}

function buildResult(
  objective: string,
  decomposed: boolean,
  subTasks: SubTask[],
  routing: RouterResult[],
  executionResults: ExecutionResult | null,
  qualityReports: QualityReport[],
  memoryUpdated: boolean,
  duration: number,
  stages: PipelineStage[],
  plan: ExecutionPlan | null,
  interactiveSession: InteractiveSession | null,
  codebaseIndex: CodebaseIndex | null,
  callbacks?: PipelineCallbacks,
): PipelineResult {
  const result: PipelineResult = {
    objective,
    decomposed,
    subTasks,
    routing,
    executionResults,
    qualityReports,
    memoryUpdated,
    duration,
    stages,
    plan,
    interactiveSession,
    codebaseIndex,
  }

  callbacks?.onComplete?.(result)
  return result
}

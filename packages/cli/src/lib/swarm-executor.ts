/**
 * Swarm Executor — bridges the experts command to the swarm-runtime.
 *
 * Converts routed expert profiles into SwarmTasks, creates a session,
 * plans execution batches via the scheduler, and runs (or simulates)
 * the resulting plan.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import type { RouterResult, ExpertProfile } from './task-router.js'
import { loadBuiltInExperts, type ExpertDefinition } from './expert-definitions.js'
import {
  decomposeTask,
  getExecutionOrder,
  shouldDecompose,
  validateDependencies,
  type DecomposedTask,
  type SubTask,
  type TaskDependency,
} from './task-decomposer.js'
import {
  createDefaultConfig,
  DEFAULT_MAX_PARALLEL_AGENTS,
  getMaxApiCallsPerSession,
  getMaxParallelAgents,
  getV6Preferences,
  readConfig,
} from './config.js'
import { SessionBudgetExceededError, SwarmExecutionError } from './errors.js'
import { buildRunSpec, type RunSpec } from './run-spec.js'
import {
  compilePrePlanningRequirements,
  type QuestPrePlanningRequirementCompiler,
} from './quest-preplanning-requirements.js'
import type { SwarmQualityGateResult } from './swarm-quality-gate.js'
import {
  buildQuestRun,
  persistQuestRun,
  questArtifactsFromRunArtifacts,
  appendQuestEvent,
  writeTaskGraph,
  type QuestRunTask,
} from './quest-run.js'
import {
  spawnDistributedRuntimes,
  spawnRuntime,
  type RuntimeType,
  type DistributedRuntimeBatch,
} from './runtime-bridge.js'
import { loadEvents } from './quest-reconciler.js'
import { ensureAgentMemory } from './agent-memory.js'
import { ensureTeamMemory } from './team-memory.js'
import { createIncident } from './incident-tracker.js'
import {
  createAgentWorktrees,
  cleanupWorktrees,
  mergeWorktree,
  verifyWorktree,
} from './worktree-manager.js'

const log = createLogger('swarm-executor')
import type {
  SwarmTask,
  SwarmRole,
  SwarmSession,
  SwarmBatch,
  SchedulerResult,
} from '@nextsystems/oac-swarm-runtime'
import {
  createSwarmSession,
  appendSwarmEvent,
  planSwarmBatches,
  DEVELOPMENT_SWARM_TEAM,
  REVENUE_SWARM_TEAM,
  BUSINESS_OPERATIONS_SWARM_TEAM,
  TECHNICAL_SWARM_TEAM,
  INVESTOR_MAGNET_SWARM_TEAM,
} from '@nextsystems/oac-swarm-runtime'
// ── Types ─────────────────────────────────────────────────────────────────────

/** simulate = CLI scheduling only; handoff = defer execution to IDE; runtime = real headless execution; distributed = multi-runtime swarm */
export type ExecutionMode = 'simulate' | 'handoff' | 'runtime' | 'distributed'

export interface SessionBudgetLimits {
  maxApiCallsPerSession: number
  maxParallelAgents: number
}

export interface SessionBudgetUsage {
  apiCalls: number
  peakParallelAgents: number
}

export interface ExecutionEstimate {
  batches: number
  tasks: number
  maxParallelAgents: number
  maxApiCallsPerSession: number
  estimatedApiCalls: number
  decomposition: DecompositionSummary
  mode: ExecutionMode
}

export interface ExecutionPlan {
  session: SwarmSession
  schedulerResult: SchedulerResult
  stages: ExecutionStage[]
  decomposition: DecompositionSummary
  requirementCompiler: QuestPrePlanningRequirementCompiler
  acceptanceCriteria: string[]
  createdAt: string
}

export interface ExecutionResult {
  session: SwarmSession
  schedulerResult: SchedulerResult
  completedTasks: string[]
  failedTasks: string[]
  acceptanceChecks: AcceptanceCheck[]
  elapsedMs: number
  executionMode: ExecutionMode
  budgetUsage: SessionBudgetUsage
  qualityGate?: SwarmQualityGateResult
}

export interface ExecutionStage {
  id: string
  name: string
  mode: 'serial' | 'parallel'
  taskIds: string[]
  syncRequired: boolean
}

export interface DecompositionSummary {
  active: boolean
  source: 'single-objective' | 'auto-decomposed'
  sequencing: 'sequential' | 'dependency'
  subTaskCount: number
  estimatedComplexity?: DecomposedTask['estimatedComplexity']
  confidence?: number
  validationIssues: string[]
  subTasks: Array<{
    id: string
    objective: string
    expertId: string
    taskId?: string
    estimatedEffort: SubTask['estimatedEffort']
  }>
  order: string[][]
}

export interface AcceptanceCheck {
  id: string
  criterion: string
  status: 'passed' | 'failed' | 'unverified'
  evidence: string
  taskId?: string
}

export interface RunArtifacts {
  runDir: string
  planPath: string
  specPath: string
  eventsPath: string
  taskGraphPath: string
  acceptanceReportPath: string
  summaryPath: string
}

export interface ExecutorCallbacks {
  onBatchStart?: (batch: SwarmBatch, index: number, total: number) => void
  onTaskStart?: (task: SwarmTask, batchIndex: number) => void
  onTaskComplete?: (task: SwarmTask, batchIndex: number) => void
  onBatchComplete?: (batch: SwarmBatch, index: number) => void
}

export interface PlanExecutionOptions {
  maxConcurrency?: number
  /** Hard cap from .oac/config.json — applied before batch scheduling. */
  maxParallelAgents?: number
  autoDecompose?: boolean
  sequentialSubtasks?: boolean
  maxSubTasks?: number
  runtimeAssignments?: Record<string, RuntimeType>
  defaultRuntime?: RuntimeType
  backgroundTasks?: Record<string, boolean>
}

export interface ExecuteSwarmOptions {
  mode?: ExecutionMode
  budget?: SessionBudgetLimits
  callbacks?: ExecutorCallbacks
  runtime?: RuntimeType
  projectRoot?: string
  routerResult?: RouterResult
  background?: boolean
  /** v6: runtime assignments per task id for distributed mode */
  runtimeAssignments?: Record<string, RuntimeType>
}

function isExecutorCallbacks(value: ExecutorCallbacks | ExecuteSwarmOptions): value is ExecutorCallbacks {
  return (
    typeof (value as ExecutorCallbacks).onBatchStart === 'function' ||
    typeof (value as ExecutorCallbacks).onTaskStart === 'function' ||
    typeof (value as ExecutorCallbacks).onTaskComplete === 'function' ||
    typeof (value as ExecutorCallbacks).onBatchComplete === 'function'
  )
}

// ── Agent → Role reverse-lookup ───────────────────────────────────────────────

const ALL_TEAM_ROLES = [
  ...DEVELOPMENT_SWARM_TEAM,
  ...REVENUE_SWARM_TEAM,
  ...BUSINESS_OPERATIONS_SWARM_TEAM,
  ...TECHNICAL_SWARM_TEAM,
  ...INVESTOR_MAGNET_SWARM_TEAM,
]

const AGENT_TO_ROLE = new Map<string, SwarmRole>(
  ALL_TEAM_ROLES.map((def) => [def.agent, def.role]),
)

function roleForAgent(agentName: string): SwarmRole {
  return AGENT_TO_ROLE.get(agentName) ?? 'general'
}

// ── Expert → SwarmTask conversion ─────────────────────────────────────────────

let taskCounter = 0

function nextTaskId(): string {
  taskCounter += 1
  return `task-${String(taskCounter).padStart(3, '0')}`
}

function expertToSwarmTask(
  expert: ExpertProfile,
  objective: string,
  isPrimary: boolean,
  requirementCompiler: QuestPrePlanningRequirementCompiler,
): SwarmTask {
  const role = roleForAgent(expert.name)
  const stage = stageForExpert(expert.name, role)
  return {
    id: nextTaskId(),
    title: `[${expert.name}] ${objective}`,
    agent: expert.name,
    role,
    stage,
    status: 'pending',
    priority: priorityForStage(stage, isPrimary),
    reads: expert.filePatterns.slice(0, 5),
    writes: [],
    dependsOn: [],
    acceptanceCriteria: taskAcceptanceCriteria(
      acceptanceCriteriaForExpert(expert.name, stage, objective),
      requirementCompiler,
    ),
    maxChunkMinutes: stage === 'implementation' ? 15 : 10,
    metadata: {
      category: expert.category,
      routerScore: expert.score,
      isPrimary,
      stage,
    },
  }
}

function resetTaskCounter(): void {
  taskCounter = 0
}

/**
 * Compute runtime timeout based on task chunk estimates.
 * Gives 2x buffer over the longest task chunk, with a 10-minute floor
 * and a 30-minute ceiling.
 */
function computeRuntimeTimeout(tasks: SwarmTask[]): number {
  if (tasks.length === 0) return 10 * 60 * 1000
  const maxChunkMs = Math.max(...tasks.map((t) => (t.maxChunkMinutes ?? 10) * 60 * 1000))
  return Math.min(Math.max(maxChunkMs * 2, 10 * 60 * 1000), 30 * 60 * 1000)
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export function resolvePlanConcurrency(options: PlanExecutionOptions = {}): number {
  const requested = options.maxConcurrency ?? DEFAULT_MAX_PARALLEL_AGENTS
  const cap = options.maxParallelAgents
  if (cap === undefined) return requested
  return Math.min(requested, cap)
}

export function planExecution(
  routerResult: RouterResult,
  options: PlanExecutionOptions = {},
): ExecutionPlan {
  resetTaskCounter()

  const requirementCompiler = compilePrePlanningRequirements(routerResult)
  const planned = createPlannedTasks(routerResult, options, requirementCompiler)
  const tasks = applyRuntimePlanning(planned.tasks, options)

  if (tasks.length === 0) {
    throw new SwarmExecutionError(
      'No experts matched the objective — cannot create an execution plan.',
    )
  }

  const maxConcurrency = resolvePlanConcurrency(options)
  const sessionId = `swarm-${Date.now().toString(36)}`
  const createdAt = new Date().toISOString()
  log.debug('Creating swarm session', {
    sessionId,
    taskCount: tasks.length,
    maxConcurrency,
    requestedConcurrency: options.maxConcurrency ?? DEFAULT_MAX_PARALLEL_AGENTS,
    maxParallelAgentsCap: options.maxParallelAgents,
  })

  const session = createSwarmSession({
    id: sessionId,
    objective: routerResult.objective,
    tasks,
    maxConcurrency,
    createdAt,
  })

  const schedulerResult = planSwarmBatches(tasks, {
    maxConcurrency,
  })
  const sessionWithPlanEvents: SwarmSession = {
    ...session,
    events: [...session.events, ...schedulerResult.events],
  }

  log.debug('Execution plan ready', {
    batches: schedulerResult.batches.length,
    blocked: schedulerResult.blocked.length,
  })

  return {
    session: sessionWithPlanEvents,
    schedulerResult,
    stages: stagesFromBatches(schedulerResult.batches),
    decomposition: planned.decomposition,
    requirementCompiler,
    acceptanceCriteria: requirementCompiler.acceptanceCriteria,
    createdAt,
  }
}

// ── Budget & estimation ───────────────────────────────────────────────────────

export async function loadSessionBudgetLimits(projectRoot: string): Promise<SessionBudgetLimits> {
  const config = (await readConfig(projectRoot)) ?? createDefaultConfig()
  return {
    maxApiCallsPerSession: getMaxApiCallsPerSession(config),
    maxParallelAgents: getMaxParallelAgents(config),
  }
}

export function estimateExecution(
  plan: ExecutionPlan,
  limits: SessionBudgetLimits,
  mode: ExecutionMode = 'simulate',
): ExecutionEstimate {
  const batchCount = plan.schedulerResult.batches.length
  const taskCount = plan.session.tasks.length
  // Each batch start + each task invocation counts as one API-call proxy
  const estimatedApiCalls = batchCount + taskCount

  return {
    batches: batchCount,
    tasks: taskCount,
    maxParallelAgents: Math.min(plan.session.maxConcurrency, limits.maxParallelAgents),
    maxApiCallsPerSession: limits.maxApiCallsPerSession,
    estimatedApiCalls,
    decomposition: plan.decomposition,
    mode,
  }
}

function trackApiCall(
  usage: SessionBudgetUsage,
  limits: SessionBudgetLimits,
): void {
  usage.apiCalls += 1
  if (usage.apiCalls > limits.maxApiCallsPerSession) {
    throw new SessionBudgetExceededError(
      'api_calls',
      usage.apiCalls,
      limits.maxApiCallsPerSession,
    )
  }
}

function enforceParallelLimit(
  batchSize: number,
  usage: SessionBudgetUsage,
  limits: SessionBudgetLimits,
): void {
  usage.peakParallelAgents = Math.max(usage.peakParallelAgents, batchSize)
  if (batchSize > limits.maxParallelAgents) {
    throw new SessionBudgetExceededError(
      'parallel_agents',
      batchSize,
      limits.maxParallelAgents,
    )
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function executeSwarm(
  plan: ExecutionPlan,
  callbacksOrOptions: ExecutorCallbacks | ExecuteSwarmOptions = {},
): Promise<ExecutionResult> {
  const options: ExecuteSwarmOptions =
    isExecutorCallbacks(callbacksOrOptions)
      ? { callbacks: callbacksOrOptions }
      : (callbacksOrOptions as ExecuteSwarmOptions)

  const mode = options.mode ?? 'simulate'
  const callbacks = options.callbacks ?? {}
  const limits = options.budget ?? {
    maxApiCallsPerSession: 500,
    maxParallelAgents: plan.session.maxConcurrency,
  }

  const start = Date.now()
  let session = plan.session
  let { schedulerResult } = plan
  const completedTasks: string[] = []
  const failedTasks: string[] = []
  const budgetUsage: SessionBudgetUsage = { apiCalls: 0, peakParallelAgents: 0 }
  const handoff = mode === 'handoff'

  log.info('Swarm execution starting', {
    sessionId: session.id,
    mode,
    batches: schedulerResult.batches.length,
    tasks: session.tasks.length,
    maxApiCalls: limits.maxApiCallsPerSession,
    maxParallel: limits.maxParallelAgents,
  })

  trackApiCall(budgetUsage, limits)
  session = appendSwarmEvent(session, 'batch.planned', `[${mode}] Planned ${schedulerResult.batches.length} batch(es)`, {
    batchCount: schedulerResult.batches.length,
    totalTasks: session.tasks.length,
    executionMode: mode,
  })

  if (handoff) {
    session = appendSwarmEvent(
      session,
      'handoff.ready',
      'Run deferred to IDE runtime — see handoff.json for OpenCode TUI and Claude plugin commands',
      { executionMode: mode, runId: session.id },
    )
  }

  if (mode === 'distributed') {
    if (!options.projectRoot) {
      throw new SwarmExecutionError('Distributed mode requires projectRoot.')
    }

    const config = (await readConfig(options.projectRoot)) ?? createDefaultConfig()
    const v6 = getV6Preferences(config)
    const maxConcurrentRuntimes =
      v6?.distributedSwarm.maxConcurrentRuntimes ?? session.maxConcurrency
    const defaultRuntime =
      options.runtime ?? v6?.distributedSwarm.defaultRuntime ?? 'kimi'
    const runtimeTasks = assignRuntimeForExecution(
      session.tasks,
      options,
      defaultRuntime,
    )

    schedulerResult = planSwarmBatches(runtimeTasks, {
      maxConcurrency: Math.min(session.maxConcurrency, maxConcurrentRuntimes),
    })
    const baseEvents = session.events.filter(
      (event) =>
        event.type !== 'batch.planned' &&
        event.type !== 'task.ready' &&
        event.type !== 'runtime.assigned',
    )
    session = {
      ...session,
      tasks: runtimeTasks,
      events: [...baseEvents, ...schedulerResult.events],
      maxConcurrency: Math.min(session.maxConcurrency, maxConcurrentRuntimes),
    }

    const runtimePlan: ExecutionPlan = {
      ...plan,
      session,
      schedulerResult,
      stages: stagesFromBatches(schedulerResult.batches),
    }
    const runDir = join(options.projectRoot, '.oac', 'runs', session.id)
    await persistRunArtifacts(options.projectRoot, runtimePlan, undefined, {
      routerResult: options.routerResult,
    })

    const worktreeByAgent =
      v6?.worktrees.enabled === true
        ? await createAgentWorktrees(
            options.projectRoot,
            session.id,
            unique(runtimeTasks.map((task) => task.agent)),
          )
        : {}

    for (let i = 0; i < schedulerResult.batches.length; i++) {
      const batch = schedulerResult.batches[i]!
      enforceParallelLimit(batch.tasks.length, budgetUsage, limits)
      trackApiCall(budgetUsage, limits)
      callbacks.onBatchStart?.(batch, i, schedulerResult.batches.length)

      session = appendSwarmEvent(session, 'task.ready', `[distributed] Batch ${batch.id} starting (${batch.tasks.length} task(s))`, {
        batchId: batch.id,
        taskIds: batch.tasks.map((task) => task.id),
        executionMode: mode,
      })

      const runtimeBatches = distributedBatchesForSwarmBatch(batch, {
        defaultRuntime,
        background: options.background ?? false,
        worktreeByAgent,
      })
      for (let runtimeIndex = 0; runtimeIndex < runtimeBatches.length; runtimeIndex += 1) {
        trackApiCall(budgetUsage, limits)
      }

      const timeoutMs = computeRuntimeTimeout(session.tasks)
      const distributedResult = await spawnDistributedRuntimes({
        questId: session.id,
        objective: session.objective,
        projectRoot: options.projectRoot,
        runDir,
        batches: runtimeBatches,
        timeoutMs,
      })

      const events = await loadEvents(options.projectRoot, session.id)
      const taskStatus = taskWriteBackStatus(events)

      for (const task of batch.tasks) {
        const status = taskStatus.get(task.id)
        const runtimeResult = distributedResult.results.find(
          (result) => result.runtime === (task.runtime ?? defaultRuntime),
        )
        const missingWriteback =
          !options.background &&
          runtimeResult?.ok === true &&
          status === undefined

        if (status === 'completed') {
          completedTasks.push(task.id)
          callbacks.onTaskComplete?.(task, i)
          session = appendSwarmEvent(session, 'task.completed', `[distributed] ${task.agent} completed`, {
            taskId: task.id,
            agent: task.agent,
            runtime: task.runtime ?? defaultRuntime,
            executionMode: mode,
          })
        } else if (
          status === 'failed' ||
          status === 'blocked' ||
          runtimeResult?.ok === false ||
          missingWriteback
        ) {
          failedTasks.push(task.id)
          const failureReason = runtimeResult?.errorMessage ??
            (missingWriteback ? 'Runtime finished without task_update write-back events.' : `Task reported ${status ?? 'unknown failure'}.`)
          session = appendSwarmEvent(session, 'task.failed', `[distributed] ${task.agent} failed`, {
            taskId: task.id,
            agent: task.agent,
            runtime: task.runtime ?? defaultRuntime,
            executionMode: mode,
            failureReason,
            missingRuntimeWriteback: missingWriteback,
          })
          await recordExecutionIncident(options.projectRoot, session.id, {
            taskId: task.id,
            category: runtimeResult?.ok === false ? 'runtime_crash' : 'task_failure',
            summary: `[distributed] ${task.agent} failed: ${failureReason}`,
            evidence: [
              `runtime=${task.runtime ?? defaultRuntime}`,
              `batch=${batch.id}`,
              `mode=${mode}`,
            ],
            severity: runtimeResult?.ok === false ? 'high' : 'medium',
          })
        } else if (options.background) {
          session = appendSwarmEvent(session, 'task.ready', `[distributed] ${task.agent} running in background`, {
            taskId: task.id,
            agent: task.agent,
            runtime: task.runtime ?? defaultRuntime,
            executionMode: mode,
            background: true,
          })
        }
      }

      trackApiCall(budgetUsage, limits)
      session = appendSwarmEvent(session, 'sync.completed', `Distributed batch ${batch.id} sync completed`, {
        batchId: batch.id,
        taskIds: batch.tasks.map((task) => task.id),
      })
      callbacks.onBatchComplete?.(batch, i)
    }

    if (v6?.worktrees.enabled === true) {
      for (const [agentId, worktreePath] of Object.entries(worktreeByAgent)) {
        const verification = await verifyWorktree(options.projectRoot, worktreePath)
        if (!verification.passed) {
          await recordExecutionIncident(options.projectRoot, session.id, {
            category: 'verification_failure',
            summary: `Worktree verification failed for ${agentId}`,
            evidence: verification.errors,
            severity: 'high',
          })
          continue
        }

        if (v6.worktrees.mergeStrategy !== 'manual') {
          const merge = await mergeWorktree(
            options.projectRoot,
            agentId,
            session.id,
            v6.worktrees.mergeStrategy,
          )
          if (!merge.merged) {
            await recordExecutionIncident(options.projectRoot, session.id, {
              category: 'blocked_run',
              summary: `Worktree merge blocked for ${agentId}`,
              evidence: merge.conflicts,
              severity: 'high',
            })
          }
        }
      }

      if (v6.worktrees.mergeStrategy !== 'manual') {
        await cleanupWorktrees(options.projectRoot, session.id)
      }
    }

    const elapsedMs = Date.now() - start
    const result: ExecutionResult = {
      session,
      schedulerResult,
      completedTasks,
      failedTasks,
      acceptanceChecks: buildAcceptanceChecks(runtimePlan, completedTasks, failedTasks, mode),
      elapsedMs,
      executionMode: mode,
      budgetUsage,
    }

    await persistRunArtifacts(options.projectRoot, runtimePlan, result, {
      routerResult: options.routerResult,
    })

    log.info('Swarm distributed execution complete', {
      sessionId: session.id,
      completed: completedTasks.length,
      failed: failedTasks.length,
      elapsedMs,
      apiCalls: budgetUsage.apiCalls,
    })

    return result
  }

  if (mode === 'runtime') {
    if (!options.projectRoot || !options.runtime) {
      throw new SwarmExecutionError('Runtime mode requires projectRoot and runtime.')
    }

    trackApiCall(budgetUsage, limits)
    session = appendSwarmEvent(
      session,
      'batch.planned',
      `[runtime] Planned ${schedulerResult.batches.length} batch(es)`,
      {
        batchCount: schedulerResult.batches.length,
        totalTasks: session.tasks.length,
        executionMode: mode,
        runtime: options.runtime,
      },
    )

    const runDir = join(options.projectRoot, '.oac', 'runs', session.id)
    await persistRunArtifacts(options.projectRoot, { ...plan, session }, undefined, {
      routerResult: options.routerResult,
    })

    const timeoutMs = computeRuntimeTimeout(session.tasks)
    const runtimeResult = await spawnRuntime({
      questId: session.id,
      objective: session.objective,
      projectRoot: options.projectRoot,
      runDir,
      runtime: options.runtime,
      tasks: session.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        agent: task.agent,
      })),
      timeoutMs,
      background: options.background,
    })

    if (!options.background) {
      await appendQuestEvent(options.projectRoot, session.id, {
        timestamp: new Date().toISOString(),
        type: 'runtime.completed',
        data: {
          runtime: options.runtime,
          ok: runtimeResult.ok,
          exitCode: runtimeResult.exitCode,
          durationMs: runtimeResult.durationMs,
          taskIds: session.tasks.map((task) => task.id),
        },
      })
    }

    // Reconcile events written by the runtime
    const events = await loadEvents(options.projectRoot, session.id)
    const completedSet = new Set<string>()
    const failedSet = new Set<string>()
    const reportedTaskIds = new Set<string>()

    for (const event of events) {
      const eventTaskId = (event.data.taskId ?? event.data.task_id) as unknown
      if (event.type === 'task_update' && typeof eventTaskId === 'string') {
        reportedTaskIds.add(eventTaskId)
        if (event.data.status === 'completed') completedSet.add(eventTaskId)
        if (event.data.status === 'failed' || event.data.status === 'blocked') {
          failedSet.add(eventTaskId)
        }
      }
    }

    const missingRuntimeWriteback =
      runtimeResult.ok &&
      session.tasks.length > 0 &&
      !session.tasks.some((task) => reportedTaskIds.has(task.id))

    if (missingRuntimeWriteback) {
      await appendQuestEvent(options.projectRoot, session.id, {
        timestamp: new Date().toISOString(),
        type: 'error',
        data: {
          message: `Runtime ${options.runtime} finished without task_update write-back events.`,
          critical: true,
        },
      })
      await recordExecutionIncident(options.projectRoot, session.id, {
        category: 'task_failure',
        summary: `Runtime ${options.runtime} finished without task_update write-back events.`,
        evidence: [`runtime=${options.runtime}`, 'missingRuntimeWriteback=true'],
        severity: 'high',
      })
    }

    for (const task of session.tasks) {
      if (completedSet.has(task.id)) {
        completedTasks.push(task.id)
        session = appendSwarmEvent(session, 'task.completed', `[runtime] ${task.agent} completed`, {
          taskId: task.id,
          agent: task.agent,
          executionMode: mode,
        })
      } else if (failedSet.has(task.id)) {
        failedTasks.push(task.id)
        session = appendSwarmEvent(session, 'task.failed', `[runtime] ${task.agent} failed`, {
          taskId: task.id,
          agent: task.agent,
          executionMode: mode,
        })
      } else if (!runtimeResult.ok || missingRuntimeWriteback) {
        failedTasks.push(task.id)
        const failureReason = runtimeResult.ok ? 'missing write-back' : runtimeResult.errorMessage ?? 'runtime error'
        session = appendSwarmEvent(
          session,
          'task.failed',
          `[runtime] ${task.agent} not reported (${runtimeResult.ok ? 'missing write-back' : 'runtime error'})`,
          {
            taskId: task.id,
            agent: task.agent,
            executionMode: mode,
            runtimeError: runtimeResult.errorMessage,
            missingRuntimeWriteback,
          },
        )
        await recordExecutionIncident(options.projectRoot, session.id, {
          taskId: task.id,
          category: runtimeResult.ok ? 'task_failure' : 'runtime_crash',
          summary: `[runtime] ${task.agent} failed: ${failureReason}`,
          evidence: [`runtime=${options.runtime}`, `mode=${mode}`],
          severity: runtimeResult.ok ? 'medium' : 'high',
        })
      }
    }

    // Skip the normal batch loop — runtime handled everything
    const elapsedMs = Date.now() - start
    log.info('Swarm runtime execution complete', {
      sessionId: session.id,
      runtime: options.runtime,
      completed: completedTasks.length,
      failed: failedTasks.length,
      elapsedMs,
      apiCalls: budgetUsage.apiCalls,
    })

    return {
      session,
      schedulerResult,
      completedTasks,
      failedTasks,
      acceptanceChecks: buildAcceptanceChecks(plan, completedTasks, failedTasks, mode),
      elapsedMs,
      executionMode: mode,
      budgetUsage,
    }
  }

  for (let i = 0; i < schedulerResult.batches.length; i++) {
    const batch = schedulerResult.batches[i]!
    enforceParallelLimit(batch.tasks.length, budgetUsage, limits)
    trackApiCall(budgetUsage, limits)
    callbacks.onBatchStart?.(batch, i, schedulerResult.batches.length)

    log.debug('Batch starting', {
      batchId: batch.id,
      batchIndex: i + 1,
      taskCount: batch.tasks.length,
      agents: batch.tasks.map((t) => t.agent),
      mode,
    })

    session = appendSwarmEvent(session, 'task.ready', `[${mode}] Batch ${batch.id} starting (${batch.tasks.length} task(s))`, {
      batchId: batch.id,
      taskIds: batch.tasks.map((t) => t.id),
      executionMode: mode,
    })

    for (const task of batch.tasks) {
      trackApiCall(budgetUsage, limits)
      callbacks.onTaskStart?.(task, i)
      log.trace('Task starting', { taskId: task.id, agent: task.agent, role: task.role, mode })

      if (handoff) {
        session = appendSwarmEvent(
          session,
          'task.ready',
          `[handoff] ${task.agent} pending — run in OpenCode TUI or Claude plugin (see handoff.json)`,
          {
            taskId: task.id,
            agent: task.agent,
            executionMode: mode,
            handoff: true,
          },
        )
        callbacks.onTaskComplete?.(task, i)
        continue
      }

      session = appendSwarmEvent(session, 'task.started', `[${mode}] ${task.agent} started`, {
        taskId: task.id,
        agent: task.agent,
        executionMode: mode,
      })

      await simulateTaskExecution()

      session = appendSwarmEvent(session, 'task.completed', `[${mode}] ${task.agent} completed (simulated)`, {
        taskId: task.id,
        agent: task.agent,
        executionMode: mode,
        simulated: true,
      })

      completedTasks.push(task.id)
      log.trace('Task completed (simulated)', { taskId: task.id, agent: task.agent })
      callbacks.onTaskComplete?.(task, i)
    }

    trackApiCall(budgetUsage, limits)
    session = appendSwarmEvent(session, 'sync.completed', `Batch ${batch.id} sync completed`, {
      batchId: batch.id,
      taskIds: batch.tasks.map((t) => t.id),
    })

    callbacks.onBatchComplete?.(batch, i)
  }

  if (schedulerResult.blocked.length > 0) {
    log.warn('Blocked tasks detected', {
      count: schedulerResult.blocked.length,
      agents: schedulerResult.blocked.map((b) => b.agent),
    })
    for (const blocked of schedulerResult.blocked) {
      failedTasks.push(blocked.id)
      session = appendSwarmEvent(session, 'task.failed', `${blocked.agent} blocked (unsatisfied dependencies)`, {
        taskId: blocked.id,
        agent: blocked.agent,
        dependsOn: blocked.dependsOn,
      })
    }
  }

  const elapsedMs = Date.now() - start
  log.info('Swarm execution complete', {
    sessionId: session.id,
    mode,
    completed: completedTasks.length,
    failed: failedTasks.length,
    elapsedMs,
    apiCalls: budgetUsage.apiCalls,
  })

  return {
    session,
    schedulerResult,
    completedTasks,
    failedTasks,
    acceptanceChecks: buildAcceptanceChecks(plan, completedTasks, failedTasks, mode),
    elapsedMs,
    executionMode: mode,
    budgetUsage,
  }
}

async function simulateTaskExecution(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 80))
}

function assignRuntimeForExecution(
  tasks: SwarmTask[],
  options: ExecuteSwarmOptions,
  defaultRuntime: RuntimeType,
): SwarmTask[] {
  return tasks.map((task) => ({
    ...task,
    runtime: options.runtimeAssignments?.[task.id] ?? task.runtime ?? defaultRuntime,
    background: options.background ?? task.background,
  }))
}

function distributedBatchesForSwarmBatch(
  batch: SwarmBatch,
  options: {
    defaultRuntime: RuntimeType
    background: boolean
    worktreeByAgent: Record<string, string>
  },
): DistributedRuntimeBatch[] {
  const groups = new Map<string, DistributedRuntimeBatch>()

  for (const task of batch.tasks) {
    const runtime = (task.runtime ?? options.defaultRuntime) as RuntimeType
    const workDir = options.worktreeByAgent[task.agent]
    const key = `${runtime}:${workDir ?? ''}`
    const existing = groups.get(key)
    const taskRef = { id: task.id, title: task.title, agent: task.agent }
    if (existing) {
      existing.tasks.push(taskRef)
      continue
    }
    groups.set(key, {
      runtime,
      tasks: [taskRef],
      background: options.background,
      ...(workDir && { workDir }),
    })
  }

  return [...groups.values()]
}

function taskWriteBackStatus(events: Awaited<ReturnType<typeof loadEvents>>): Map<string, string> {
  const statuses = new Map<string, string>()
  for (const event of events) {
    const taskId = (event.data.taskId ?? event.data.task_id) as unknown
    if (event.type === 'task_update' && typeof taskId === 'string') {
      const status = event.data.status
      if (typeof status === 'string') {
        statuses.set(taskId, status)
      }
    }
  }
  return statuses
}

async function recordExecutionIncident(
  projectRoot: string,
  questId: string,
  params: {
    taskId?: string
    category: 'task_failure' | 'verification_failure' | 'blocked_run' | 'retry_exhaustion' | 'runtime_crash'
    summary: string
    evidence?: string[]
    severity?: 'low' | 'medium' | 'high' | 'critical'
  },
): Promise<void> {
  const incidentId = await createIncident(projectRoot, {
    questId,
    taskId: params.taskId,
    category: params.category,
    summary: params.summary,
    evidence: params.evidence,
    severity: params.severity,
  })
  await appendQuestEvent(projectRoot, questId, {
    timestamp: new Date().toISOString(),
    type: 'incident.created',
    data: {
      incidentId,
      questId,
      taskId: params.taskId,
      category: params.category,
      summary: params.summary,
      evidence: params.evidence ?? [],
      severity: params.severity ?? 'medium',
    },
  })
}

// ── Planning helpers ─────────────────────────────────────────────────────────

function createPlannedTasks(
  routerResult: RouterResult,
  options: PlanExecutionOptions,
  requirementCompiler: QuestPrePlanningRequirementCompiler,
): { tasks: SwarmTask[]; decomposition: DecompositionSummary } {
  const autoDecompose = options.autoDecompose ?? true
  const sequentialSubtasks = options.sequentialSubtasks ?? true

  if (autoDecompose && shouldDecompose(routerResult.objective)) {
    const experts = loadBuiltInExperts()
    const decomposed = decomposeTask(routerResult.objective, experts, {
      maxSubTasks: options.maxSubTasks ?? Math.max(4, Math.min(12, routerResult.estimatedChunks)),
    })
    const validation = validateDependencies(decomposed.dependencies, decomposed.subTasks)

    if (validation.valid && decomposed.subTasks.length > 1) {
      const decomposedTasks = tasksFromDecomposition(decomposed, experts, {
        sequentialSubtasks,
        requirementCompiler,
      })

      return {
        tasks: decomposedTasks.tasks,
        decomposition: summarizeDecomposition(
          decomposed,
          decomposedTasks.taskIdsBySubTaskId,
          sequentialSubtasks ? 'sequential' : 'dependency',
          validation.issues,
        ),
      }
    }

    log.debug('Skipping decomposition fallback', {
      subTasks: decomposed.subTasks.length,
      validationIssues: validation.issues,
    })
  }

  const experts = orderExpertsForPlanning([
    ...routerResult.primaryExperts.map((expert) => ({ expert, isPrimary: true })),
    ...routerResult.secondaryExperts.map((expert) => ({ expert, isPrimary: false })),
  ])

  return {
    tasks: wireStageDependencies(
      experts.map(({ expert, isPrimary }) =>
        expertToSwarmTask(expert, routerResult.objective, isPrimary, requirementCompiler),
      ),
    ),
    decomposition: singleObjectiveSummary(),
  }
}

function applyRuntimePlanning(
  tasks: SwarmTask[],
  options: PlanExecutionOptions,
): SwarmTask[] {
  if (!options.runtimeAssignments && !options.defaultRuntime && !options.backgroundTasks) {
    return tasks
  }

  return tasks.map((task) => ({
    ...task,
    runtime: options.runtimeAssignments?.[task.id] ?? task.runtime ?? options.defaultRuntime,
    background: options.backgroundTasks?.[task.id] ?? task.background,
  }))
}

function tasksFromDecomposition(
  decomposed: DecomposedTask,
  experts: ExpertDefinition[],
  options: { sequentialSubtasks: boolean; requirementCompiler: QuestPrePlanningRequirementCompiler },
): { tasks: SwarmTask[]; taskIdsBySubTaskId: Map<string, string> } {
  const coordinator = createCoordinatorTask(decomposed, options.requirementCompiler)
  const taskIdsBySubTaskId = new Map<string, string>()
  for (const subTask of decomposed.subTasks) {
    taskIdsBySubTaskId.set(subTask.id, nextTaskId())
  }

  const expertById = new Map(experts.map((expert) => [expert.id, expert]))
  const subTaskOrder = getExecutionOrder(decomposed.subTasks, decomposed.dependencies).flat()
  const subTasks = subTaskOrder.map((subTask, index) =>
    subTaskToSwarmTask(subTask, {
      index,
      total: decomposed.subTasks.length,
      expert: expertById.get(subTask.expertId),
      taskId: taskIdsBySubTaskId.get(subTask.id)!,
      coordinatorTaskId: coordinator.id,
      previousTaskId: options.sequentialSubtasks && index > 0
        ? taskIdsBySubTaskId.get(subTaskOrder[index - 1]!.id)
        : undefined,
      dependencyTaskIds: dependencyTaskIdsForSubTask(
        subTask,
        decomposed.dependencies,
        taskIdsBySubTaskId,
      ),
      requirementCompiler: options.requirementCompiler,
    }),
  )

  return {
    tasks: [coordinator, ...subTasks],
    taskIdsBySubTaskId,
  }
}

function createCoordinatorTask(
  decomposed: DecomposedTask,
  requirementCompiler: QuestPrePlanningRequirementCompiler,
): SwarmTask {
  return {
    id: nextTaskId(),
    title: `[TechLeadAgent] Plan sequential expert chunks for ${decomposed.originalObjective}`,
    agent: 'TechLeadAgent',
    role: 'tech-lead',
    stage: 'planning',
    status: 'pending',
    priority: 100,
    reads: [],
    writes: [],
    dependsOn: [],
    acceptanceCriteria: taskAcceptanceCriteria(
      [
        'Objective is decomposed into bounded expert subtasks',
        'Subtask dependencies, checkpoints, and sync points are explicit',
        'Experts Mode is used by default for the full sequence',
      ],
      requirementCompiler,
    ),
    metadata: {
      isPrimary: true,
      stage: 'planning',
      decompositionId: decomposed.id,
      decompositionComplexity: decomposed.estimatedComplexity,
      decompositionConfidence: decomposed.decompositionConfidence,
      subTaskCount: decomposed.subTasks.length,
    },
  }
}

function subTaskToSwarmTask(
  subTask: SubTask,
  options: {
    index: number
    total: number
    expert?: ExpertDefinition
    taskId: string
    coordinatorTaskId: string
    previousTaskId?: string
    dependencyTaskIds: string[]
    requirementCompiler: QuestPrePlanningRequirementCompiler
  },
): SwarmTask {
  const agent = options.expert?.name ?? subTask.expertId
  const role = roleForExpertDefinition(options.expert, agent)
  const stage = stageForExpert(agent, role)
  const dependsOn = unique([
    options.coordinatorTaskId,
    ...options.dependencyTaskIds,
    ...(options.previousTaskId ? [options.previousTaskId] : []),
  ])
  const contextReads = unique([
    ...subTask.fileScope,
    ...(options.expert?.filePatterns ?? []),
  ]).slice(0, 8)

  return {
    id: options.taskId,
    title: `[${agent}] Chunk ${options.index + 1}/${options.total}: ${subTask.objective}`,
    agent,
    role,
    stage,
    status: 'pending',
    priority: Math.max(1, 90 - options.index),
    parentTaskId: subTask.parentId,
    chunkIndex: options.index + 1,
    chunkTotal: options.total,
    executionMode: 'serial',
    reads: contextReads,
    writes: subTask.fileScope,
    dependsOn,
    moduleClaims: subTask.producesArtifacts,
    syncAfterTaskIds: [options.taskId],
    acceptanceCriteria: taskAcceptanceCriteria(
      [
        `Complete chunk ${options.index + 1}/${options.total}: ${subTask.objective}`,
        `Produce or update artifacts: ${subTask.producesArtifacts.join(', ') || 'implementation checkpoint'}`,
        'Checkpoint output is ready for TechLeadAgent sync before the next chunk',
      ],
      options.requirementCompiler,
    ),
    maxChunkMinutes: effortToMaxChunkMinutes(subTask.estimatedEffort),
    metadata: {
      stage,
      decompositionId: subTask.parentId,
      subTaskId: subTask.id,
      expertId: subTask.expertId,
      estimatedEffort: subTask.estimatedEffort,
      requiredContext: subTask.requiredContext,
      producesArtifacts: subTask.producesArtifacts,
      syncPolicy: 'after_each_subtask',
    },
  }
}

function dependencyTaskIdsForSubTask(
  subTask: SubTask,
  dependencies: TaskDependency[],
  taskIdsBySubTaskId: Map<string, string>,
): string[] {
  return dependencies
    .filter((dep) => dep.to === subTask.id && (dep.type === 'blocks' || dep.type === 'requires_artifact'))
    .map((dep) => taskIdsBySubTaskId.get(dep.from))
    .filter((id): id is string => Boolean(id))
}

function summarizeDecomposition(
  decomposed: DecomposedTask,
  taskIdsBySubTaskId: Map<string, string>,
  sequencing: DecompositionSummary['sequencing'],
  validationIssues: string[],
): DecompositionSummary {
  return {
    active: true,
    source: 'auto-decomposed',
    sequencing,
    subTaskCount: decomposed.subTasks.length,
    estimatedComplexity: decomposed.estimatedComplexity,
    confidence: decomposed.decompositionConfidence,
    validationIssues: [...validationIssues],
    subTasks: decomposed.subTasks.map((subTask) => ({
      id: subTask.id,
      objective: subTask.objective,
      expertId: subTask.expertId,
      taskId: taskIdsBySubTaskId.get(subTask.id),
      estimatedEffort: subTask.estimatedEffort,
    })),
    order: getExecutionOrder(decomposed.subTasks, decomposed.dependencies).map((batch) =>
      batch.map((subTask) => subTask.id),
    ),
  }
}

function singleObjectiveSummary(): DecompositionSummary {
  return {
    active: false,
    source: 'single-objective',
    sequencing: 'dependency',
    subTaskCount: 0,
    validationIssues: [],
    subTasks: [],
    order: [],
  }
}

function roleForExpertDefinition(
  expert: ExpertDefinition | undefined,
  agentName: string,
): SwarmRole {
  const knownRole = roleForAgent(agentName)
  if (knownRole !== 'general' || !expert) return knownRole

  const roleMap: Record<string, SwarmRole> = {
    'developer': 'general',
    'frontend-developer': 'frontend-developer',
    'backend-developer': 'backend-developer',
    'test-engineer': 'qa',
    'security-engineer': 'security',
    'reviewer': 'code-review',
    'architect': 'system-architect',
    'tech-lead': 'tech-lead',
    'devops-engineer': 'devops',
    'technical-writer': 'documentation',
    'debugger': 'debug',
    'product-manager': 'product-manager',
    'hardware-architect': 'hardware-architect',
    'embedded-developer': 'embedded-cpp',
    'pentester': 'penetration-test',
    'compliance-engineer': 'technical-compliance-vv',
    'content-creator': 'content-swarm',
    'investor-relations': 'investor-narrative',
  }

  return roleMap[expert.role] ?? 'general'
}

function effortToMaxChunkMinutes(effort: SubTask['estimatedEffort']): number {
  if (effort === 'trivial') return 5
  if (effort === 'small') return 10
  if (effort === 'medium') return 15
  return 30
}

function orderExpertsForPlanning(
  experts: Array<{ expert: ExpertProfile; isPrimary: boolean }>,
): Array<{ expert: ExpertProfile; isPrimary: boolean }> {
  return [...experts].sort((a, b) => {
    if (a.expert.name === 'TechLeadAgent') return -1
    if (b.expert.name === 'TechLeadAgent') return 1
    return b.expert.score - a.expert.score
  })
}

function stageForExpert(agentName: string, role: SwarmRole): string {
  if (agentName === 'TechLeadAgent' || role === 'tech-lead') return 'planning'
  if (role === 'system-architect' || role === 'product-manager') return 'architecture'
  if (
    role === 'qa' ||
    role === 'code-review' ||
    role === 'security' ||
    role === 'devops' ||
    agentName === 'BuildAgent'
  ) {
    return 'verification'
  }
  if (role === 'documentation') return 'documentation'
  return 'implementation'
}

function priorityForStage(stage: string, isPrimary: boolean): number {
  const base = isPrimary ? 10 : 5
  if (stage === 'planning') return 100
  if (stage === 'architecture') return 80 + base
  if (stage === 'implementation') return 60 + base
  if (stage === 'verification') return 40 + base
  if (stage === 'documentation') return 30 + base
  return base
}

function wireStageDependencies(tasks: SwarmTask[]): SwarmTask[] {
  const idsByStage = new Map<string, string[]>()
  for (const task of tasks) {
    const stage = task.stage ?? 'implementation'
    idsByStage.set(stage, [...(idsByStage.get(stage) ?? []), task.id])
  }

  const planningIds = idsByStage.get('planning') ?? []
  const architectureIds = idsByStage.get('architecture') ?? []
  const implementationIds = idsByStage.get('implementation') ?? []
  const verificationBase = [...planningIds, ...architectureIds, ...implementationIds]

  return tasks.map((task) => {
    const deps = new Set(task.dependsOn ?? [])
    if (task.stage === 'architecture') {
      for (const id of planningIds) deps.add(id)
    } else if (task.stage === 'implementation' || task.stage === 'documentation') {
      for (const id of [...planningIds, ...architectureIds]) deps.add(id)
    } else if (task.stage === 'verification') {
      for (const id of verificationBase) deps.add(id)
    }
    deps.delete(task.id)
    return { ...task, dependsOn: [...deps] }
  })
}

function stagesFromBatches(batches: SwarmBatch[]): ExecutionStage[] {
  return batches.map((batch, index) => ({
    id: `stage-${String(index + 1).padStart(2, '0')}`,
    name: `Expert batch ${index + 1}`,
    mode: batch.tasks.length > 1 ? 'parallel' : 'serial',
    taskIds: batch.tasks.map((task) => task.id),
    syncRequired: true,
  }))
}

function acceptanceCriteriaForExpert(agentName: string, stage: string, objective: string): string[] {
  if (agentName === 'TechLeadAgent') {
    return [
      'Plan is chunked into bounded expert tasks',
      'Dependencies and stage sync points are explicit',
    ]
  }

  return [
    `${agentName} completes the ${stage} responsibility for: ${objective}`,
    'Output is ready for downstream integration or verification',
  ]
}

function taskAcceptanceCriteria(
  baseCriteria: string[],
  requirementCompiler: QuestPrePlanningRequirementCompiler,
): string[] {
  return unique([
    ...baseCriteria,
    ...requirementCompiler.acceptanceCriteria.slice(0, 4),
  ])
}

function buildAcceptanceChecks(
  plan: ExecutionPlan,
  completedTasks: string[],
  failedTasks: string[],
  mode: ExecutionMode = 'simulate',
): AcceptanceCheck[] {
  const completed = new Set(completedTasks)
  const failed = new Set(failedTasks)
  const simulated = mode === 'simulate'
  const deferred = mode === 'handoff'

  const checks: AcceptanceCheck[] = plan.acceptanceCriteria.map((criterion, index) => ({
    id: `plan-ac-${index + 1}`,
    criterion,
    status: simulated || deferred
      ? 'unverified'
      : failedTasks.length === 0
        ? 'passed'
        : 'failed',
    evidence: deferred
      ? 'Handoff — execute in OpenCode TUI or Claude plugin; see .oac/runs/{id}/handoff.json.'
      : simulated
        ? 'Simulated execution — plan-level criteria require IDE runtime or quality gate.'
        : failedTasks.length === 0
          ? 'All scheduled batches completed in the runtime session.'
          : `Failed or blocked tasks: ${failedTasks.join(', ')}`,
  }))

  for (const task of plan.session.tasks) {
    for (const [index, criterion] of (task.acceptanceCriteria ?? []).entries()) {
      let status: AcceptanceCheck['status']
      let evidence: string

      if (failed.has(task.id)) {
        status = 'failed'
        evidence = `${task.agent} was blocked or failed.`
      } else if (deferred) {
        status = 'unverified'
        evidence = `${task.agent} deferred to IDE runtime — load handoff.json and run ${task.agent} in OpenCode or Claude.`
      } else if (simulated && completed.has(task.id)) {
        status = 'unverified'
        evidence = `${task.agent} simulated completion in session ${plan.session.id} — no real agent output.`
      } else if (completed.has(task.id)) {
        status = 'passed'
        evidence = `${task.agent} completed in session ${plan.session.id}.`
      } else {
        status = 'unverified'
        evidence = `${task.agent} has not executed yet.`
      }

      checks.push({
        id: `${task.id}-ac-${index + 1}`,
        taskId: task.id,
        criterion,
        status,
        evidence,
      })
    }
  }

  return checks
}

export function mergeQualityGateChecks(
  checks: AcceptanceCheck[],
  gate: SwarmQualityGateResult,
): AcceptanceCheck[] {
  return [
    ...checks,
    {
      id: 'quality-gate',
      criterion: 'Quality gate on changed files',
      status: gate.passed ? 'passed' : 'failed',
      evidence: gate.summary,
    },
  ]
}

export function plannedAcceptanceChecks(plan: ExecutionPlan): AcceptanceCheck[] {
  return [
    ...plan.acceptanceCriteria.map((criterion, index) => ({
      id: `plan-ac-${index + 1}`,
      criterion,
      status: 'unverified' as const,
      evidence: 'Plan has not been executed yet.',
    })),
    ...plan.session.tasks.flatMap((task) =>
      (task.acceptanceCriteria ?? []).map((criterion, index) => ({
        id: `${task.id}-ac-${index + 1}`,
        taskId: task.id,
        criterion,
        status: 'unverified' as const,
        evidence: `${task.agent} has not executed yet.`,
      })),
    ),
  ]
}

// ── Persistence ──────────────────────────────────────────────────────────────

export interface PersistRunArtifactsOptions {
  routerResult?: RouterResult
  spec?: RunSpec
}

export async function persistRunSpec(
  projectRoot: string,
  plan: ExecutionPlan,
  routerResult: RouterResult,
): Promise<string> {
  const runDir = join(projectRoot, '.oac', 'runs', plan.session.id)
  await mkdir(runDir, { recursive: true })
  const specPath = join(runDir, 'spec.json')
  const spec = buildRunSpec(routerResult, plan)
  const quest = buildQuestRun(routerResult, plan, {
    state: 'SPEC',
    trustLabel: 'planned_only',
    artifacts: { spec: 'spec.json' },
  })
  await writeFile(specPath, JSON.stringify(spec, null, 2) + '\n')
  await persistQuestRun(projectRoot, quest)
  await ensureAgentMemory(projectRoot, quest.questId, quest.tasks)
  await ensureTeamMemory(projectRoot)
  return specPath
}

export async function persistRunArtifacts(
  projectRoot: string,
  plan: ExecutionPlan,
  result?: ExecutionResult,
  options: PersistRunArtifactsOptions = {},
): Promise<RunArtifacts> {
  const runDir = join(projectRoot, '.oac', 'runs', plan.session.id)
  await mkdir(runDir, { recursive: true })

  const planPath = join(runDir, 'plan.json')
  const specPath = join(runDir, 'spec.json')
  const eventsPath = join(runDir, 'events.ndjson')
  const taskGraphPath = join(runDir, 'task-graph.json')
  const acceptanceReportPath = join(runDir, 'acceptance-report.md')
  const summaryPath = join(runDir, 'summary.json')
  const artifacts: RunArtifacts = {
    runDir,
    planPath,
    specPath,
    eventsPath,
    taskGraphPath,
    acceptanceReportPath,
    summaryPath,
  }

  const session = result?.session ?? plan.session
  const acceptanceChecks = result?.acceptanceChecks ?? plannedAcceptanceChecks(plan)
  const spec =
    options.spec ??
    (options.routerResult ? buildRunSpec(options.routerResult, plan) : null)

  await writeFile(planPath, JSON.stringify(serializablePlan(plan), null, 2) + '\n')
  if (spec) {
    await writeFile(specPath, JSON.stringify(spec, null, 2) + '\n')
  }
  await writeTaskGraph(
    projectRoot,
    plan.session.id,
    session.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: toQuestTaskGraphStatus(task.status),
      dependsOn: task.dependsOn ?? [],
    })),
  )
  await writeFile(eventsPath, await mergeEventLines(eventsPath, session.events))
  await writeFile(
    acceptanceReportPath,
    renderAcceptanceReport(plan, acceptanceChecks, result),
  )
  await writeFile(summaryPath, JSON.stringify({
    runId: plan.session.id,
    objective: plan.session.objective,
    createdAt: plan.createdAt,
    executionMode: result?.executionMode ?? null,
    decomposition: plan.decomposition,
    completedTasks: result?.completedTasks ?? [],
    failedTasks: result?.failedTasks ?? [],
    elapsedMs: result?.elapsedMs ?? null,
    budgetUsage: result?.budgetUsage ?? null,
    qualityGate: result?.qualityGate
      ? {
          passed: result.qualityGate.passed,
          overallScore: result.qualityGate.overallScore,
          grade: result.qualityGate.grade,
          summary: result.qualityGate.summary,
        }
      : null,
    acceptance: summarizeAcceptance(acceptanceChecks),
  }, null, 2) + '\n')

  if (options.routerResult) {
    const quest = buildQuestRun(options.routerResult, plan, {
      result,
      artifacts: questArtifactsFromRunArtifacts(artifacts),
    })
    await persistQuestRun(projectRoot, quest)
    await ensureAgentMemory(projectRoot, quest.questId, quest.tasks)
  }
  await ensureTeamMemory(projectRoot)

  return artifacts
}

async function mergeEventLines(
  eventsPath: string,
  sessionEvents: SwarmSession['events'],
): Promise<string> {
  const existingLines = await readExistingEventLines(eventsPath)
  const seen = new Set(existingLines)
  const mergedLines = [...existingLines]

  for (const event of sessionEvents) {
    const line = JSON.stringify(event)
    if (!seen.has(line)) {
      mergedLines.push(line)
      seen.add(line)
    }
  }

  return mergedLines.length > 0 ? `${mergedLines.join('\n')}\n` : ''
}

async function readExistingEventLines(eventsPath: string): Promise<string[]> {
  try {
    const raw = await readFile(eventsPath, 'utf8')
    return raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function toQuestTaskGraphStatus(status: string | undefined): QuestRunTask['status'] {
  if (
    status === 'pending' ||
    status === 'completed' ||
    status === 'blocked' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status
  }
  if (status === 'ready' || status === 'running') return 'in_progress'
  return 'pending'
}

function serializablePlan(plan: ExecutionPlan): Record<string, unknown> {
  return {
    runId: plan.session.id,
    objective: plan.session.objective,
    createdAt: plan.createdAt,
    maxConcurrency: plan.session.maxConcurrency,
    decomposition: plan.decomposition,
    requirementCompiler: plan.requirementCompiler,
    stages: plan.stages,
    tasks: plan.session.tasks,
    batches: plan.schedulerResult.batches.map((batch) => ({
      id: batch.id,
      taskIds: batch.tasks.map((task) => task.id),
      writeLocks: batch.writeLocks,
      blockedTaskIds: batch.blockedTaskIds,
    })),
    blockedTasks: plan.schedulerResult.blocked,
    acceptanceCriteria: plan.acceptanceCriteria,
  }
}

function renderAcceptanceReport(
  plan: ExecutionPlan,
  checks: AcceptanceCheck[],
  result?: ExecutionResult,
): string {
  const lines = [
    `# OpenAgent Experts Run ${plan.session.id}`,
    '',
    `Objective: ${plan.session.objective}`,
    `Created: ${plan.createdAt}`,
    `Execution mode: ${result?.executionMode ?? 'plan-only'}`,
  ]

  if (result?.budgetUsage) {
    lines.push(
      `API calls (proxy): ${result.budgetUsage.apiCalls}`,
      `Peak parallel agents: ${result.budgetUsage.peakParallelAgents}`,
    )
  }

  if (result?.qualityGate) {
    lines.push(
      '',
      '## Quality Gate',
      '',
      `- ${result.qualityGate.summary}`,
      `- Status: ${result.qualityGate.passed ? 'PASSED' : 'FAILED'}`,
    )
  }

  lines.push(
    '',
    '## Decomposition',
    '',
    ...renderDecompositionLines(plan.decomposition),
    '',
    '## Acceptance Checks',
    '',
  )

  for (const check of checks) {
    const marker = check.status === 'passed' ? '[x]' : check.status === 'failed' ? '[!]' : '[ ]'
    lines.push(`- ${marker} ${check.criterion}`)
    lines.push(`  - Status: ${check.status}`)
    lines.push(`  - Evidence: ${check.evidence}`)
  }

  lines.push('')
  lines.push('## Stages')
  lines.push('')
  for (const stage of plan.stages) {
    lines.push(`- ${stage.id}: ${stage.name} (${stage.mode})`)
    lines.push(`  - Tasks: ${stage.taskIds.join(', ')}`)
  }

  return lines.join('\n') + '\n'
}

function renderDecompositionLines(decomposition: DecompositionSummary): string[] {
  if (!decomposition.active) {
    return ['- Mode: single objective']
  }

  const lines = [
    `- Mode: ${decomposition.source}`,
    `- Sequencing: ${decomposition.sequencing}`,
    `- Complexity: ${decomposition.estimatedComplexity ?? 'unknown'}`,
    `- Confidence: ${decomposition.confidence ?? 'unknown'}`,
    `- Subtasks: ${decomposition.subTaskCount}`,
  ]

  for (const subTask of decomposition.subTasks) {
    lines.push(`  - ${subTask.id}${subTask.taskId ? ` (${subTask.taskId})` : ''}: ${subTask.objective}`)
  }

  return lines
}

function summarizeAcceptance(checks: AcceptanceCheck[]): Record<string, number> {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { passed: 0, failed: 0, unverified: 0 },
  )
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

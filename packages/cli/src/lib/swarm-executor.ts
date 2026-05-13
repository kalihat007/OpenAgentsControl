/**
 * Swarm Executor — bridges the experts command to the swarm-runtime.
 *
 * Converts routed expert profiles into SwarmTasks, creates a session,
 * plans execution batches via the scheduler, and runs (or simulates)
 * the resulting plan.
 */

import { mkdir, writeFile } from 'node:fs/promises'
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
import { SwarmExecutionError } from './errors.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  session: SwarmSession
  schedulerResult: SchedulerResult
  stages: ExecutionStage[]
  decomposition: DecompositionSummary
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
  eventsPath: string
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
  autoDecompose?: boolean
  sequentialSubtasks?: boolean
  maxSubTasks?: number
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
    acceptanceCriteria: acceptanceCriteriaForExpert(expert.name, stage, objective),
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

// ── Plan ──────────────────────────────────────────────────────────────────────

export function planExecution(
  routerResult: RouterResult,
  options: PlanExecutionOptions = {},
): ExecutionPlan {
  resetTaskCounter()

  const planned = createPlannedTasks(routerResult, options)
  const tasks = planned.tasks

  if (tasks.length === 0) {
    throw new SwarmExecutionError(
      'No experts matched the objective — cannot create an execution plan.',
    )
  }

  const sessionId = `swarm-${Date.now().toString(36)}`
  const createdAt = new Date().toISOString()
  log.debug('Creating swarm session', {
    sessionId,
    taskCount: tasks.length,
    maxConcurrency: options.maxConcurrency ?? 4,
  })

  const session = createSwarmSession({
    id: sessionId,
    objective: routerResult.objective,
    tasks,
    maxConcurrency: options.maxConcurrency ?? 4,
    createdAt,
  })

  const schedulerResult = planSwarmBatches(tasks, {
    maxConcurrency: options.maxConcurrency ?? 4,
  })

  log.debug('Execution plan ready', {
    batches: schedulerResult.batches.length,
    blocked: schedulerResult.blocked.length,
  })

  return {
    session,
    schedulerResult,
    stages: stagesFromBatches(schedulerResult.batches),
    decomposition: planned.decomposition,
    acceptanceCriteria: planAcceptanceCriteria(routerResult.objective),
    createdAt,
  }
}

// ── Execute (simulated) ───────────────────────────────────────────────────────

export async function executeSwarm(
  plan: ExecutionPlan,
  callbacks: ExecutorCallbacks = {},
): Promise<ExecutionResult> {
  const start = Date.now()
  let session = plan.session
  const { schedulerResult } = plan
  const completedTasks: string[] = []
  const failedTasks: string[] = []

  log.info('Swarm execution starting', {
    sessionId: session.id,
    batches: schedulerResult.batches.length,
    tasks: session.tasks.length,
  })

  session = appendSwarmEvent(session, 'batch.planned', `Planned ${schedulerResult.batches.length} batch(es)`, {
    batchCount: schedulerResult.batches.length,
    totalTasks: session.tasks.length,
  })

  for (let i = 0; i < schedulerResult.batches.length; i++) {
    const batch = schedulerResult.batches[i]!
    callbacks.onBatchStart?.(batch, i, schedulerResult.batches.length)

    log.debug('Batch starting', {
      batchId: batch.id,
      batchIndex: i + 1,
      taskCount: batch.tasks.length,
      agents: batch.tasks.map((t) => t.agent),
    })

    session = appendSwarmEvent(session, 'task.ready', `Batch ${batch.id} starting (${batch.tasks.length} task(s))`, {
      batchId: batch.id,
      taskIds: batch.tasks.map((t) => t.id),
    })

    for (const task of batch.tasks) {
      callbacks.onTaskStart?.(task, i)
      log.trace('Task starting', { taskId: task.id, agent: task.agent, role: task.role })

      session = appendSwarmEvent(session, 'task.started', `${task.agent} started`, {
        taskId: task.id,
        agent: task.agent,
      })

      await simulateTaskExecution()

      session = appendSwarmEvent(session, 'task.completed', `${task.agent} completed`, {
        taskId: task.id,
        agent: task.agent,
      })

      completedTasks.push(task.id)
      log.trace('Task completed', { taskId: task.id, agent: task.agent })
      callbacks.onTaskComplete?.(task, i)
    }

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
    completed: completedTasks.length,
    failed: failedTasks.length,
    elapsedMs,
  })

  return {
    session,
    schedulerResult,
    completedTasks,
    failedTasks,
    acceptanceChecks: buildAcceptanceChecks(plan, completedTasks, failedTasks),
    elapsedMs,
  }
}

async function simulateTaskExecution(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 80))
}

// ── Planning helpers ─────────────────────────────────────────────────────────

function createPlannedTasks(
  routerResult: RouterResult,
  options: PlanExecutionOptions,
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
        expertToSwarmTask(expert, routerResult.objective, isPrimary),
      ),
    ),
    decomposition: singleObjectiveSummary(),
  }
}

function tasksFromDecomposition(
  decomposed: DecomposedTask,
  experts: ExpertDefinition[],
  options: { sequentialSubtasks: boolean },
): { tasks: SwarmTask[]; taskIdsBySubTaskId: Map<string, string> } {
  const coordinator = createCoordinatorTask(decomposed)
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
    }),
  )

  return {
    tasks: [coordinator, ...subTasks],
    taskIdsBySubTaskId,
  }
}

function createCoordinatorTask(decomposed: DecomposedTask): SwarmTask {
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
    acceptanceCriteria: [
      'Objective is decomposed into bounded expert subtasks',
      'Subtask dependencies, checkpoints, and sync points are explicit',
      'Experts Mode is used by default for the full sequence',
    ],
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
    acceptanceCriteria: [
      `Complete chunk ${options.index + 1}/${options.total}: ${subTask.objective}`,
      `Produce or update artifacts: ${subTask.producesArtifacts.join(', ') || 'implementation checkpoint'}`,
      'Checkpoint output is ready for TechLeadAgent sync before the next chunk',
    ],
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

function planAcceptanceCriteria(objective: string): string[] {
  return [
    `Selected experts cover the objective: ${objective}`,
    'Large objectives are decomposed into bounded expert subtasks automatically',
    'TechLeadAgent planning completes before dependent specialist work',
    'Subtasks execute sequence-by-sequence unless dependency-safe parallelism is explicitly selected',
    'A sync event is recorded after every batch',
    'Final report marks each acceptance check as passed, failed, or unverified',
  ]
}

function buildAcceptanceChecks(
  plan: ExecutionPlan,
  completedTasks: string[],
  failedTasks: string[],
): AcceptanceCheck[] {
  const completed = new Set(completedTasks)
  const failed = new Set(failedTasks)
  const checks: AcceptanceCheck[] = plan.acceptanceCriteria.map((criterion, index) => ({
    id: `plan-ac-${index + 1}`,
    criterion,
    status: failedTasks.length === 0 ? 'passed' : 'failed',
    evidence:
      failedTasks.length === 0
        ? 'All scheduled batches completed in the runtime session.'
        : `Failed or blocked tasks: ${failedTasks.join(', ')}`,
  }))

  for (const task of plan.session.tasks) {
    for (const [index, criterion] of (task.acceptanceCriteria ?? []).entries()) {
      checks.push({
        id: `${task.id}-ac-${index + 1}`,
        taskId: task.id,
        criterion,
        status: completed.has(task.id) ? 'passed' : failed.has(task.id) ? 'failed' : 'unverified',
        evidence: completed.has(task.id)
          ? `${task.agent} completed in session ${plan.session.id}.`
          : failed.has(task.id)
            ? `${task.agent} was blocked or failed.`
            : `${task.agent} has not executed yet.`,
      })
    }
  }

  return checks
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

export async function persistRunArtifacts(
  projectRoot: string,
  plan: ExecutionPlan,
  result?: ExecutionResult,
): Promise<RunArtifacts> {
  const runDir = join(projectRoot, '.oac', 'runs', plan.session.id)
  await mkdir(runDir, { recursive: true })

  const planPath = join(runDir, 'plan.json')
  const eventsPath = join(runDir, 'events.ndjson')
  const acceptanceReportPath = join(runDir, 'acceptance-report.md')
  const summaryPath = join(runDir, 'summary.json')

  const session = result?.session ?? plan.session
  const acceptanceChecks = result?.acceptanceChecks ?? plannedAcceptanceChecks(plan)

  await writeFile(planPath, JSON.stringify(serializablePlan(plan), null, 2) + '\n')
  await writeFile(eventsPath, session.events.map((event) => JSON.stringify(event)).join('\n') + '\n')
  await writeFile(acceptanceReportPath, renderAcceptanceReport(plan, acceptanceChecks))
  await writeFile(summaryPath, JSON.stringify({
    runId: plan.session.id,
    objective: plan.session.objective,
    createdAt: plan.createdAt,
    decomposition: plan.decomposition,
    completedTasks: result?.completedTasks ?? [],
    failedTasks: result?.failedTasks ?? [],
    elapsedMs: result?.elapsedMs ?? null,
    acceptance: summarizeAcceptance(acceptanceChecks),
  }, null, 2) + '\n')

  return { runDir, planPath, eventsPath, acceptanceReportPath, summaryPath }
}

function serializablePlan(plan: ExecutionPlan): Record<string, unknown> {
  return {
    runId: plan.session.id,
    objective: plan.session.objective,
    createdAt: plan.createdAt,
    maxConcurrency: plan.session.maxConcurrency,
    decomposition: plan.decomposition,
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

function renderAcceptanceReport(plan: ExecutionPlan, checks: AcceptanceCheck[]): string {
  const lines = [
    `# OpenAgent Experts Run ${plan.session.id}`,
    '',
    `Objective: ${plan.session.objective}`,
    `Created: ${plan.createdAt}`,
    '',
    '## Decomposition',
    '',
    ...renderDecompositionLines(plan.decomposition),
    '',
    '## Acceptance Checks',
    '',
  ]

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

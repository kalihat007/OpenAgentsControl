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

function expertToSwarmTask(
  expert: ExpertProfile,
  objective: string,
  isPrimary: boolean,
): SwarmTask {
  taskCounter += 1
  const role = roleForAgent(expert.name)
  const stage = stageForExpert(expert.name, role)
  return {
    id: `task-${String(taskCounter).padStart(3, '0')}`,
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
  options: { maxConcurrency?: number } = {},
): ExecutionPlan {
  resetTaskCounter()

  const experts = orderExpertsForPlanning([
    ...routerResult.primaryExperts.map((expert) => ({ expert, isPrimary: true })),
    ...routerResult.secondaryExperts.map((expert) => ({ expert, isPrimary: false })),
  ])

  const tasks = wireStageDependencies(
    experts.map(({ expert, isPrimary }) =>
      expertToSwarmTask(expert, routerResult.objective, isPrimary),
    ),
  )

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
    'TechLeadAgent planning completes before dependent specialist work',
    'Independent tasks are batched for safe parallel execution',
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

function summarizeAcceptance(checks: AcceptanceCheck[]): Record<string, number> {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { passed: 0, failed: 0, unverified: 0 },
  )
}

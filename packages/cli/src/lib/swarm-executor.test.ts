import { describe, it, expect } from 'bun:test'
import { routeTask } from './task-router.js'
import { SessionBudgetExceededError } from './errors.js'
import { buildRunSpec } from './run-spec.js'
import {
  executeSwarm,
  estimateExecution,
  planExecution,
  resolvePlanConcurrency,
  type ExecutionPlan,
} from './swarm-executor.js'

const projectRoot = process.cwd()

function planComplexObjective(): ExecutionPlan {
  const routed = routeTask(
    'Build a React dashboard with REST API, database migration, tests, and Docker deployment',
    projectRoot,
  )
  return planExecution(routed, { maxConcurrency: 4 })
}

describe('swarm-executor automatic decomposition', () => {
  it('decomposes larger objectives into sequential expert subtasks by default', () => {
    const plan = planComplexObjective()

    expect(plan.decomposition.active).toBe(true)
    expect(plan.decomposition.source).toBe('auto-decomposed')
    expect(plan.decomposition.sequencing).toBe('sequential')
    expect(plan.decomposition.subTaskCount).toBeGreaterThanOrEqual(2)
    expect(plan.session.tasks[0]!.agent).toBe('TechLeadAgent')

    const subTaskTasks = plan.session.tasks.filter((task) => task.metadata?.['subTaskId'])
    expect(subTaskTasks).toHaveLength(plan.decomposition.subTaskCount)
    expect(plan.schedulerResult.batches.every((batch) => batch.tasks.length === 1)).toBe(true)
  })

  it('wires each decomposed subtask after the previous chunk', () => {
    const plan = planComplexObjective()
    const subTaskTasks = plan.session.tasks.filter((task) => task.metadata?.['subTaskId'])

    for (let i = 1; i < subTaskTasks.length; i++) {
      expect(subTaskTasks[i]!.dependsOn).toContain(subTaskTasks[i - 1]!.id)
    }
  })

  it('can disable decomposition for complex objectives', () => {
    const routed = routeTask(
      'Build a React dashboard with REST API, database migration, tests, and Docker deployment',
      projectRoot,
    )
    const plan = planExecution(routed, { maxConcurrency: 4, autoDecompose: false })

    expect(plan.decomposition.active).toBe(false)
    expect(plan.decomposition.source).toBe('single-objective')
    expect(plan.session.tasks.every((task) => !task.metadata?.['subTaskId'])).toBe(true)
  })

  it('records sync after every sequential batch during execution', async () => {
    const plan = planComplexObjective()
    const started: string[] = []

    const result = await executeSwarm(plan, {
      onTaskStart: (task) => started.push(task.id),
    })

    expect(result.failedTasks).toEqual([])
    expect(result.completedTasks).toHaveLength(plan.session.tasks.length)
    expect(started).toEqual(plan.schedulerResult.batches.flatMap((batch) => batch.tasks.map((task) => task.id)))

    const syncEvents = result.session.events.filter((event) => event.type === 'sync.completed')
    expect(syncEvents).toHaveLength(plan.schedulerResult.batches.length)
  })

  it('marks task acceptance as unverified in simulate mode', async () => {
    const plan = planComplexObjective()
    const result = await executeSwarm(plan, { mode: 'simulate' })

    expect(result.executionMode).toBe('simulate')
    const taskChecks = result.acceptanceChecks.filter((c) => c.taskId)
    expect(taskChecks.length).toBeGreaterThan(0)
    expect(taskChecks.every((c) => c.status === 'unverified')).toBe(true)
    expect(taskChecks[0]!.evidence).toContain('simulated')
  })

  it('handoff mode defers all tasks without completing them', async () => {
    const plan = planComplexObjective()
    const result = await executeSwarm(plan, { mode: 'handoff' })

    expect(result.executionMode).toBe('handoff')
    expect(result.completedTasks).toHaveLength(0)
    expect(result.failedTasks).toEqual([])

    const handoffReady = result.session.events.find((e) => e.type === 'handoff.ready')
    expect(handoffReady).toBeDefined()

    const pending = result.session.events.filter(
      (e) =>
        e.type === 'task.ready' &&
        e.message.includes('pending — run in OpenCode TUI or Claude plugin'),
    )
    expect(pending.length).toBe(plan.session.tasks.length)

    const taskChecks = result.acceptanceChecks.filter((c) => c.taskId)
    expect(taskChecks.every((c) => c.status === 'unverified')).toBe(true)
    expect(taskChecks[0]!.evidence).toContain('handoff.json')
  })

  it('resolvePlanConcurrency clamps requested concurrency to config cap', () => {
    expect(resolvePlanConcurrency({ maxConcurrency: 8, maxParallelAgents: 2 })).toBe(2)
    expect(resolvePlanConcurrency({ maxConcurrency: 2, maxParallelAgents: 8 })).toBe(2)
    expect(resolvePlanConcurrency({ maxConcurrency: 4 })).toBe(4)
  })

  it('planExecution respects maxParallelAgents before scheduling', () => {
    const routed = routeTask('build JWT auth API', projectRoot)
    const plan = planExecution(routed, { maxConcurrency: 8, maxParallelAgents: 2 })
    expect(plan.session.maxConcurrency).toBe(2)
    expect(plan.schedulerResult.batches.every((b) => b.tasks.length <= 2)).toBe(true)
  })

  it('enforces maxApiCallsPerSession budget', async () => {
    const plan = planComplexObjective()
    const tightBudget = { maxApiCallsPerSession: 2, maxParallelAgents: 20 }

    await expect(
      executeSwarm(plan, { mode: 'simulate', budget: tightBudget }),
    ).rejects.toBeInstanceOf(SessionBudgetExceededError)
  })

  it('estimateExecution reports batch and API call proxy', () => {
    const plan = planComplexObjective()
    const estimate = estimateExecution(plan, {
      maxApiCallsPerSession: 500,
      maxParallelAgents: 4,
    })

    expect(estimate.batches).toBe(plan.schedulerResult.batches.length)
    expect(estimate.tasks).toBe(plan.session.tasks.length)
    expect(estimate.estimatedApiCalls).toBeGreaterThan(0)
    expect(estimate.mode).toBe('simulate')
  })

  it('buildRunSpec includes objective, scenario, and experts', () => {
    const routed = routeTask('build JWT auth API', projectRoot)
    const plan = planExecution(routed)
    const spec = buildRunSpec(routed, plan)

    expect(spec.version).toBe('1')
    expect(spec.runId).toBe(plan.session.id)
    expect(spec.objective).toBe(routed.objective)
    expect(spec.scenario).toBe(routed.scenario)
    expect(spec.experts.length).toBeGreaterThan(0)
    expect(spec.requirements.acceptanceCriteria.length).toBeGreaterThan(0)
  })
})

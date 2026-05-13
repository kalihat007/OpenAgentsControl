import { describe, it, expect } from 'bun:test'
import { routeTask } from './task-router.js'
import {
  executeSwarm,
  planExecution,
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
})

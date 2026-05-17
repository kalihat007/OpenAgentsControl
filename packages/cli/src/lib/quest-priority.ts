/**
 * Quest Priority Queue — ready-task ordering for the daemon scheduler.
 *
 * Tasks are sorted by priority (1 = highest, 5 = lowest), with FIFO
 * tie-breaking within the same priority level.
 */

import type { QuestRunTask } from './quest-run.js'

/**
 * Build a list of ready tasks sorted by priority.
 * Ready = pending and all dependencies are completed.
 */
export function buildReadyQueue(tasks: QuestRunTask[]): QuestRunTask[] {
  return tasks
    .filter((task) => isTaskReady(task, tasks))
    .sort((a, b) => {
      const pa = a.priority ?? 3
      const pb = b.priority ?? 3
      if (pa !== pb) return pa - pb
      // FIFO tie-breaker: stable sort preserves insertion order
      return 0
    })
}

/**
 * Check if a task is ready to execute (pending + dependencies met).
 */
export function isTaskReady(task: QuestRunTask, allTasks: QuestRunTask[]): boolean {
  if (task.status !== 'pending') return false
  for (const depId of task.dependsOn ?? []) {
    const dep = allTasks.find((t) => t.id === depId)
    if (!dep || dep.status !== 'completed') return false
  }
  return true
}

/**
 * Check if all dependencies of a task are terminal (completed, failed, blocked, or cancelled).
 * Used to determine if a blocked task can be retried.
 */
export function dependenciesTerminal(task: QuestRunTask, allTasks: QuestRunTask[]): boolean {
  for (const depId of task.dependsOn ?? []) {
    const dep = allTasks.find((t) => t.id === depId)
    if (!dep) return false
    if (!isTerminalStatus(dep.status)) return false
  }
  return true
}

function isTerminalStatus(status: QuestRunTask['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled'
}

/**
 * Count how many tasks are at each priority level.
 */
export function priorityDistribution(tasks: QuestRunTask[]): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const task of tasks) {
    const p = task.priority ?? 3
    dist[p] = (dist[p] ?? 0) + 1
  }
  return dist
}

/**
 * Task DAG utilities — dependency graph, topological ordering,
 * and transitive dependent discovery for retry logic.
 */

export interface DagNode {
  id: string
  dependsOn: string[]
}

export interface DagGraph<T extends DagNode = DagNode> {
  nodes: Map<string, T>
  children: Map<string, string[]> // nodeId -> ids that depend on it
}

export function buildDag<T extends DagNode>(nodes: T[]): DagGraph<T> {
  const graph: DagGraph<T> = {
    nodes: new Map(),
    children: new Map(),
  }

  for (const node of nodes) {
    graph.nodes.set(node.id, node)
    graph.children.set(node.id, [])
  }

  for (const node of nodes) {
    for (const depId of node.dependsOn ?? []) {
      if (graph.nodes.has(depId)) {
        const list = graph.children.get(depId) ?? []
        list.push(node.id)
        graph.children.set(depId, list)
      }
    }
  }

  return graph
}

/**
 * Find all task IDs that transitively depend on `rootId`.
 * Includes direct children and their descendants.
 */
export function findTransitiveDependents<T extends DagNode>(graph: DagGraph<T>, rootId: string): string[] {
  const visited = new Set<string>()
  const queue: string[] = [rootId]
  const result: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    if (current !== rootId) {
      result.push(current)
    }

    const children = graph.children.get(current) ?? []
    for (const childId of children) {
      if (!visited.has(childId)) {
        queue.push(childId)
      }
    }
  }

  return result
}

/**
 * Given a list of tasks with `dependsOn`, return the subset that must be
 * reset to `pending` when `taskId` is retried (including the task itself).
 */
export function findTasksToResetOnRetry<T extends DagNode>(tasks: T[], taskId: string): string[] {
  const graph = buildDag(tasks)
  const dependents = findTransitiveDependents(graph, taskId)
  return [taskId, ...dependents]
}

/**
 * Detect cycles in a DAG. Returns the first cycle found as an array of node IDs,
 * or null if the graph is acyclic.
 */
export function detectCycles<T extends DagNode>(nodes: T[]): string[] | null {
  const graph = buildDag(nodes)
  const visited = new Set<string>()
  const recStack = new Set<string>()

  function dfs(nodeId: string, path: string[]): string[] | null {
    visited.add(nodeId)
    recStack.add(nodeId)
    path.push(nodeId)

    const node = graph.nodes.get(nodeId)
    if (node) {
      for (const depId of node.dependsOn ?? []) {
        if (!graph.nodes.has(depId)) continue
        if (!visited.has(depId)) {
          const cycle = dfs(depId, path)
          if (cycle) return cycle
        } else if (recStack.has(depId)) {
          // Found cycle — return the cycle path
          const cycleStart = path.indexOf(depId)
          return path.slice(cycleStart)
        }
      }
    }

    path.pop()
    recStack.delete(nodeId)
    return null
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      const cycle = dfs(node.id, [])
      if (cycle) return cycle
    }
  }

  return null
}

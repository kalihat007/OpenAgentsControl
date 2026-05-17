/**
 * ASCII DAG renderer for Quest task dependency graphs.
 */

export interface DagTask {
  id: string
  title: string
  status: string
  runtime?: string
  dependsOn: string[]
}

const STATUS_ICONS: Record<string, string> = {
  completed: '✓',
  in_progress: '→',
  running: '→',
  blocked: '⊘',
  failed: '✗',
  cancelled: '⊘',
  pending: '○',
  ready: '○',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '\x1B[32m',   // green
  in_progress: '\x1B[33m', // yellow
  running: '\x1B[33m',
  blocked: '\x1B[31m',     // red
  failed: '\x1B[31m',
  cancelled: '\x1B[35m',   // magenta
  pending: '\x1B[90m',     // gray
  ready: '\x1B[90m',
}

const RESET = '\x1B[0m'

/**
 * Build topological levels for tasks based on dependencies.
 * Tasks with no dependencies are level 0.
 */
export function buildDagLevels(tasks: DagTask[]): Map<string, number> {
  const levels = new Map<string, number>()
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  function getLevel(id: string): number {
    if (levels.has(id)) return levels.get(id)!
    const task = taskMap.get(id)
    if (!task || !task.dependsOn || task.dependsOn.length === 0) {
      levels.set(id, 0)
      return 0
    }
    const maxDepLevel = Math.max(...task.dependsOn.map((depId) => getLevel(depId)))
    const level = maxDepLevel + 1
    levels.set(id, level)
    return level
  }

  for (const task of tasks) {
    getLevel(task.id)
  }

  return levels
}

/**
 * Render tasks as an ASCII DAG grouped by topological level.
 */
export function renderDag(tasks: DagTask[], maxWidth = 64): string[] {
  if (tasks.length === 0) return []

  const levels = buildDagLevels(tasks)
  const maxLevel = Math.max(...levels.values())

  // Group tasks by level
  const levelGroups: DagTask[][] = []
  for (let i = 0; i <= maxLevel; i++) {
    levelGroups.push(tasks.filter((t) => levels.get(t.id) === i))
  }

  const lines: string[] = []

  for (let li = 0; li < levelGroups.length; li++) {
    const group = levelGroups[li]!
    const levelLine: string[] = []

    for (const task of group) {
      const icon = STATUS_ICONS[task.status] ?? '?'
      const color = STATUS_COLORS[task.status] ?? ''
      const label = `${icon} ${task.id}`
      const runtimeTag = task.runtime ? ` [${task.runtime}]` : ''
      const fullLabel = label + runtimeTag
      levelLine.push(`${color}${fullLabel}${RESET}`)
    }

    lines.push(truncateLine(levelLine.join('  '), maxWidth))

    // Draw dependency connectors to next level
    if (li < levelGroups.length - 1) {
      const nextGroup = levelGroups[li + 1]!
      const hasDeps = nextGroup.some((t) => t.dependsOn.some((d) => levels.get(d) === li))
      if (hasDeps) {
        lines.push('│')
      }
    }
  }

  return lines
}

/**
 * Compact single-line DAG showing task flow with dependency arrows.
 */
export function renderDagFlow(tasks: DagTask[], maxTasks = 12): string {
  if (tasks.length === 0) return ''

  const levels = buildDagLevels(tasks)
  const maxLevel = Math.max(...levels.values())

  const segments: string[] = []
  const shown = new Set<string>()

  for (let i = 0; i <= maxLevel && shown.size < maxTasks; i++) {
    const group = tasks.filter((t) => levels.get(t.id) === i && !shown.has(t.id))
    if (group.length === 0) continue

    const labels = group.map((t) => {
      shown.add(t.id)
      const icon = STATUS_ICONS[t.status] ?? '?'
      return `${icon}${t.id}`
    })

    segments.push(labels.join(','))
  }

  if (shown.size < tasks.length) {
    segments.push(`…+${tasks.length - shown.size}`)
  }

  return segments.join(' → ')
}

function truncateLine(line: string, maxWidth: number): string {
  if (maxWidth <= 0) return line
  const plain = stripAnsi(line)
  if (plain.length <= maxWidth) return line
  return `${plain.slice(0, Math.max(0, maxWidth - 1))}…`
}

function stripAnsi(line: string): string {
  return line.replace(/\x1B\[[0-9;]*m/g, '')
}

/**
 * Quest memory graph — deterministic background memory derived from quest.json
 * plus append-only events.ndjson.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuestRun } from './quest-run.js'
import type { ReconcilerEvent } from './quest-reconciler.js'

export type QuestMemoryNodeKind =
  | 'request'
  | 'task'
  | 'action'
  | 'file'
  | 'context'
  | 'runtime'
  | 'validation'
  | 'incident'

export interface QuestMemoryNode {
  id: string
  kind: QuestMemoryNodeKind
  label: string
  metadata?: Record<string, unknown>
}

export interface QuestMemoryEdge {
  from: string
  to: string
  relation: string
}

export interface QuestMemoryGraph {
  version: '1'
  questId: string
  objective: string
  generatedAt: string
  nodes: QuestMemoryNode[]
  edges: QuestMemoryEdge[]
  summary: {
    requests: number
    tasks: number
    actions: number
    files: number
    contexts: number
    runtimes: number
    latestEventAt?: string
  }
}

const MEMORY_GRAPH_FILENAME = 'memory-graph.json'

export function buildQuestMemoryGraph(
  quest: QuestRun,
  events: ReconcilerEvent[],
): QuestMemoryGraph {
  const nodes = new Map<string, QuestMemoryNode>()
  const edges = new Map<string, QuestMemoryEdge>()

  const requestId = `request:${quest.questId}`
  addNode(nodes, {
    id: requestId,
    kind: 'request',
    label: quest.objective,
    metadata: {
      scenario: quest.scenario,
      intensity: quest.intensity,
      state: quest.state,
      trustLabel: quest.trustLabel,
    },
  })

  for (const task of quest.tasks) {
    const taskNodeId = taskNode(task.id)
    addNode(nodes, {
      id: taskNodeId,
      kind: 'task',
      label: task.title,
      metadata: {
        status: task.status,
        expert: task.expert,
        dependsOn: task.dependsOn,
        priority: task.priority,
      },
    })
    addEdge(edges, requestId, taskNodeId, 'plans')
    for (const dependency of task.dependsOn) {
      addEdge(edges, taskNode(dependency), taskNodeId, 'precedes')
    }
  }

  events.forEach((event, index) => {
    const actionId = `action:${index}:${event.type}`
    addNode(nodes, {
      id: actionId,
      kind: 'action',
      label: event.type,
      metadata: {
        timestamp: event.timestamp,
        summary: summarizeEvent(event),
      },
    })
    addEdge(edges, requestId, actionId, 'records')

    for (const taskId of taskIdsFromEvent(event)) {
      const taskIdNode = taskNode(taskId)
      if (!nodes.has(taskIdNode)) {
        addNode(nodes, { id: taskIdNode, kind: 'task', label: taskId })
      }
      addEdge(edges, taskIdNode, actionId, 'emits')
    }

    for (const runtime of runtimesFromEvent(event)) {
      const runtimeId = `runtime:${runtime}`
      addNode(nodes, { id: runtimeId, kind: 'runtime', label: runtime })
      addEdge(edges, actionId, runtimeId, 'uses')
    }

    for (const fileChange of fileChangesFromEvent(event)) {
      const fileId = `file:${fileChange.path}`
      addNode(nodes, { id: fileId, kind: 'file', label: fileChange.path })
      addEdge(edges, actionId, fileId, fileChange.relation)

      if (isContextPath(fileChange.path)) {
        const contextId = `context:${fileChange.path}`
        addNode(nodes, { id: contextId, kind: 'context', label: fileChange.path })
        addEdge(edges, actionId, contextId, 'changes_context')
        addEdge(edges, contextId, fileId, 'stored_as')
      }
    }

    for (const contextPath of contextPathsFromEvent(event)) {
      const contextId = `context:${contextPath}`
      addNode(nodes, { id: contextId, kind: 'context', label: contextPath })
      addEdge(edges, actionId, contextId, event.type === 'context.changed' ? 'changes_context' : 'loads_context')
    }

    if (event.type === 'validation') {
      const validationId = `validation:${index}`
      addNode(nodes, {
        id: validationId,
        kind: 'validation',
        label: validationLabel(event),
      })
      addEdge(edges, actionId, validationId, 'verifies')
    }

    if (event.type === 'incident.created' || event.type === 'incident.resolved') {
      const incidentId = `incident:${String(event.data.incidentId ?? index)}`
      addNode(nodes, {
        id: incidentId,
        kind: 'incident',
        label: String(event.data.summary ?? event.data.message ?? event.type),
      })
      addEdge(edges, actionId, incidentId, event.type === 'incident.resolved' ? 'resolves' : 'opens')
    }
  })

  const graphNodes = [...nodes.values()]
  const latestEventAt = events.at(-1)?.timestamp
  return {
    version: '1',
    questId: quest.questId,
    objective: quest.objective,
    generatedAt: new Date().toISOString(),
    nodes: graphNodes,
    edges: [...edges.values()],
    summary: {
      requests: graphNodes.filter((node) => node.kind === 'request').length,
      tasks: graphNodes.filter((node) => node.kind === 'task').length,
      actions: graphNodes.filter((node) => node.kind === 'action').length,
      files: graphNodes.filter((node) => node.kind === 'file').length,
      contexts: graphNodes.filter((node) => node.kind === 'context').length,
      runtimes: graphNodes.filter((node) => node.kind === 'runtime').length,
      ...(latestEventAt && { latestEventAt }),
    },
  }
}

export async function writeQuestMemoryGraph(
  projectRoot: string,
  graph: QuestMemoryGraph,
): Promise<string> {
  const runDir = join(projectRoot, '.oac', 'runs', graph.questId)
  await mkdir(runDir, { recursive: true })
  const path = join(runDir, MEMORY_GRAPH_FILENAME)
  await writeFile(path, JSON.stringify(graph, null, 2) + '\n')
  return path
}

export async function loadQuestMemoryGraph(
  projectRoot: string,
  questId: string,
): Promise<QuestMemoryGraph | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, MEMORY_GRAPH_FILENAME), 'utf-8')
    return JSON.parse(raw) as QuestMemoryGraph
  } catch {
    return null
  }
}

export async function refreshQuestMemoryGraph(
  projectRoot: string,
  questId: string,
): Promise<QuestMemoryGraph | null> {
  const quest = await loadQuestJson(projectRoot, questId)
  if (!quest) return null
  const events = await loadEventJson(projectRoot, questId)
  const graph = buildQuestMemoryGraph(quest, events)
  await writeQuestMemoryGraph(projectRoot, graph)
  return graph
}

function addNode(nodes: Map<string, QuestMemoryNode>, node: QuestMemoryNode): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node)
    return
  }

  const current = nodes.get(node.id)!
  nodes.set(node.id, {
    ...current,
    label: current.label || node.label,
    metadata: { ...current.metadata, ...node.metadata },
  })
}

function addEdge(edges: Map<string, QuestMemoryEdge>, from: string, to: string, relation: string): void {
  if (from === to) return
  const id = `${from}->${relation}->${to}`
  if (!edges.has(id)) edges.set(id, { from, to, relation })
}

function taskNode(taskId: string): string {
  return `task:${taskId}`
}

function summarizeEvent(event: ReconcilerEvent): string {
  const data = event.data
  return String(
    data.message ??
      data.summary ??
      data.title ??
      data.status ??
      data.to ??
      data.runtime ??
      event.type,
  )
}

function validationLabel(event: ReconcilerEvent): string {
  const result = asRecord(event.data.result)
  return String(result?.summary ?? event.data.summary ?? 'validation')
}

function taskIdsFromEvent(event: ReconcilerEvent): string[] {
  const data = event.data
  return unique([
    ...strings(data.taskId ?? data.task_id ?? data.id),
    ...strings(data.taskIds ?? data.task_ids),
    ...strings(asRecord(data.task)?.id),
  ])
}

function runtimesFromEvent(event: ReconcilerEvent): string[] {
  const data = event.data
  return unique([
    ...strings(data.runtime),
    ...strings(data.fromRuntime),
    ...strings(data.toRuntime),
    ...strings(data.assignedRuntime),
  ])
}

function fileChangesFromEvent(event: ReconcilerEvent): Array<{ path: string; relation: string }> {
  const data = event.data
  const changes = [
    ...strings(data.path).map((path) => ({ path, relation: 'touches' })),
    ...strings(data.file).map((path) => ({ path, relation: 'touches' })),
    ...strings(data.filePath).map((path) => ({ path, relation: 'touches' })),
    ...strings(data.added).map((path) => ({ path, relation: 'adds' })),
    ...strings(data.removed).map((path) => ({ path, relation: 'removes' })),
    ...strings(data.changedFiles).map((path) => ({ path, relation: 'touches' })),
    ...strings(data.loadedFiles).map((path) => ({ path, relation: 'touches' })),
    ...strings(data.files).map((path) => ({ path, relation: 'touches' })),
  ].filter((change) => looksLikePath(change.path))

  const byRelationAndPath = new Map<string, { path: string; relation: string }>()
  for (const change of changes) {
    byRelationAndPath.set(`${change.relation}:${change.path}`, change)
  }
  return [...byRelationAndPath.values()]
}

function contextPathsFromEvent(event: ReconcilerEvent): string[] {
  const data = event.data
  const explicit = [
    ...strings(data.contextPath),
    ...strings(data.contextFile),
    ...strings(data.contextFiles),
    ...strings(data.contexts),
    ...strings(data.loadedContext),
    ...strings(data.loadedContexts),
  ]
  if (event.type === 'context.loaded' || event.type === 'context.changed') {
    explicit.push(...strings(data.path), ...strings(data.file), ...strings(data.filePath), ...strings(data.context))
  }
  return unique(explicit).filter((value) => value.length > 0 && looksLikePath(value))
}

function strings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (Array.isArray(value)) {
    return value.flatMap((item) => strings(item))
  }
  return []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function looksLikePath(value: string): boolean {
  return value.includes('/') || value.startsWith('.') || /\.[A-Za-z0-9]+$/.test(value)
}

function isContextPath(value: string): boolean {
  return value.includes('.opencode/context/') || value.startsWith('context/')
}

async function loadQuestJson(projectRoot: string, questId: string): Promise<QuestRun | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'quest.json'), 'utf-8')
    return JSON.parse(raw) as QuestRun
  } catch {
    return null
  }
}

async function loadEventJson(projectRoot: string, questId: string): Promise<ReconcilerEvent[]> {
  let raw: string
  try {
    raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'events.ndjson'), 'utf-8')
  } catch {
    return []
  }

  const events: ReconcilerEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as ReconcilerEvent)
    } catch {
      continue
    }
  }
  return events
}

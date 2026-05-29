/**
 * Quest interaction memory — readable per-request journal derived from
 * quest.json plus append-only events.ndjson.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuestRun } from './quest-run.js'
import type { ReconcilerEvent } from './quest-reconciler.js'

export interface QuestInteractionRequest {
  id: string
  timestamp: string
  source: 'initial' | 'request.received' | 'amendment'
  text: string
  taskId?: string
  runtime?: string
  cwd?: string
  summary?: string
}

export interface QuestInteractionAction {
  id: string
  timestamp: string
  eventType: string
  summary: string
  taskIds: string[]
  runtimes: string[]
  files: string[]
  contexts: string[]
  cwd?: string
}

export interface QuestInteractionFileChange {
  timestamp: string
  path: string
  change: 'added' | 'removed' | 'touched'
  taskIds: string[]
  summary: string
}

export interface QuestInteractionContextChange {
  timestamp: string
  path: string
  change: 'loaded' | 'changed'
  taskIds: string[]
  reason?: string
}

export interface QuestInteractionKnowledge {
  timestamp: string
  kind: string
  summary: string
  taskIds: string[]
  files: string[]
  contexts: string[]
  cwd?: string
  runtime?: string
}

export interface QuestWorkingDirectorySnapshot {
  timestamp: string
  path: string
  source: string
  runtime?: string
  taskIds: string[]
}

export interface QuestInteractionMemory {
  version: '1'
  questId: string
  objective: string
  generatedAt: string
  projectRoot?: string
  runDir: string
  workingContext: {
    projectRoot?: string
    runDir: string
    currentWorkDir?: string
    cwdHistory: QuestWorkingDirectorySnapshot[]
  }
  requests: QuestInteractionRequest[]
  actions: QuestInteractionAction[]
  fileChanges: QuestInteractionFileChange[]
  contextChanges: QuestInteractionContextChange[]
  knowledge: QuestInteractionKnowledge[]
  summary: {
    requests: number
    actions: number
    fileChanges: number
    contexts: number
    knowledgeItems: number
    cwdCount: number
    latestEventAt?: string
  }
}

const INTERACTION_MEMORY_FILENAME = 'interaction-memory.json'

export function buildQuestInteractionMemory(
  quest: QuestRun,
  events: ReconcilerEvent[],
  projectRoot?: string,
): QuestInteractionMemory {
  const runDir = quest.artifacts?.runDir ?? `.oac/runs/${quest.questId}`
  const cwdHistory = buildCwdHistory(quest, events, projectRoot)
  const requests = buildRequests(quest, events)
  const actions = events.map((event, index) => ({
    id: `action-${index + 1}`,
    timestamp: event.timestamp,
    eventType: event.type,
    summary: summarizeEvent(event),
    taskIds: taskIdsFromEvent(event),
    runtimes: runtimesFromEvent(event),
    files: fileChangesFromEvent(event).map((change) => change.path),
    contexts: contextPathsFromEvent(event),
    ...optional('cwd', cwdFromEvent(event)),
  }))
  const fileChanges = events.flatMap((event) =>
    fileChangesFromEvent(event).map((change) => ({
      timestamp: event.timestamp,
      path: change.path,
      change: change.change,
      taskIds: taskIdsFromEvent(event),
      summary: summarizeEvent(event),
    })),
  )
  const contextChanges = events.flatMap((event) =>
    contextPathsFromEvent(event).map((path) => ({
      timestamp: event.timestamp,
      path,
      change: event.type === 'context.changed' ? 'changed' as const : 'loaded' as const,
      taskIds: taskIdsFromEvent(event),
      ...optional('reason', asString(event.data.reason)),
    })),
  )
  const knowledge = buildKnowledge(events)
  const latestEventAt = events.at(-1)?.timestamp

  return {
    version: '1',
    questId: quest.questId,
    objective: quest.objective,
    generatedAt: new Date().toISOString(),
    ...(projectRoot && { projectRoot }),
    runDir,
    workingContext: {
      ...(projectRoot && { projectRoot }),
      runDir,
      ...optional('currentWorkDir', cwdHistory.at(-1)?.path ?? projectRoot),
      cwdHistory,
    },
    requests,
    actions,
    fileChanges,
    contextChanges,
    knowledge,
    summary: {
      requests: requests.length,
      actions: actions.length,
      fileChanges: fileChanges.length,
      contexts: unique(contextChanges.map((entry) => entry.path)).length,
      knowledgeItems: knowledge.length,
      cwdCount: unique(cwdHistory.map((entry) => entry.path)).length,
      ...(latestEventAt && { latestEventAt }),
    },
  }
}

export async function writeQuestInteractionMemory(
  projectRoot: string,
  memory: QuestInteractionMemory,
): Promise<string> {
  const runDir = join(projectRoot, '.oac', 'runs', memory.questId)
  await mkdir(runDir, { recursive: true })
  const path = join(runDir, INTERACTION_MEMORY_FILENAME)
  await writeFile(path, JSON.stringify(memory, null, 2) + '\n')
  return path
}

export async function loadQuestInteractionMemory(
  projectRoot: string,
  questId: string,
): Promise<QuestInteractionMemory | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, INTERACTION_MEMORY_FILENAME), 'utf-8')
    return JSON.parse(raw) as QuestInteractionMemory
  } catch {
    return null
  }
}

export async function refreshQuestInteractionMemory(
  projectRoot: string,
  questId: string,
): Promise<QuestInteractionMemory | null> {
  const quest = await loadQuestJson(projectRoot, questId)
  if (!quest) return null
  const events = await loadEventJson(projectRoot, questId)
  const memory = buildQuestInteractionMemory(quest, events, projectRoot)
  await writeQuestInteractionMemory(projectRoot, memory)
  return memory
}

function buildRequests(quest: QuestRun, events: ReconcilerEvent[]): QuestInteractionRequest[] {
  const requests: QuestInteractionRequest[] = [{
    id: 'request-1',
    timestamp: quest.createdAt,
    source: 'initial',
    text: quest.objective,
    summary: summarizeText(quest.objective),
  }]

  events.forEach((event, index) => {
    if (event.type === 'request.received') {
      const text = asString(event.data.text ?? event.data.request ?? event.data.objective ?? event.data.message)
      if (!text) return
      requests.push({
        id: `request-${requests.length + 1}`,
        timestamp: event.timestamp,
        source: 'request.received',
        text,
        ...optional('taskId', taskIdsFromEvent(event)[0]),
        ...optional('runtime', runtimesFromEvent(event)[0]),
        ...optional('cwd', cwdFromEvent(event)),
        summary: summarizeText(text),
      })
    }

    if (event.type === 'amendment') {
      const text = asString(event.data.amendmentText ?? event.data.objective)
      if (!text) return
      requests.push({
        id: `request-${requests.length + 1}`,
        timestamp: event.timestamp,
        source: 'amendment',
        text,
        ...optional('taskId', taskIdsFromEvent(event)[0]),
        summary: summarizeText(text),
      })
    }

    if (event.type === 'task.injected' && asString(event.data.reason)?.toLowerCase().includes('user')) {
      const text = asString(event.data.reason)
      if (!text) return
      requests.push({
        id: `request-${requests.length + 1}`,
        timestamp: event.timestamp,
        source: 'amendment',
        text,
        ...optional('taskId', taskIdsFromEvent(event)[0]),
        summary: summarizeText(text),
      })
    }

    void index
  })

  return requests
}

function buildCwdHistory(
  quest: QuestRun,
  events: ReconcilerEvent[],
  projectRoot?: string,
): QuestWorkingDirectorySnapshot[] {
  const snapshots = new Map<string, QuestWorkingDirectorySnapshot>()
  if (projectRoot) {
    const initial: QuestWorkingDirectorySnapshot = {
      timestamp: quest.createdAt,
      path: projectRoot,
      source: 'quest.created',
      taskIds: [],
    }
    snapshots.set(`${initial.timestamp}:quest.created:${initial.path}`, initial)
  }

  for (const event of events) {
    const cwd = cwdFromEvent(event)
    if (!cwd) continue
    const snapshot: QuestWorkingDirectorySnapshot = {
      timestamp: event.timestamp,
      path: cwd,
      source: event.type,
      ...optional('runtime', runtimesFromEvent(event)[0]),
      taskIds: taskIdsFromEvent(event),
    }
    snapshots.set(`${snapshot.timestamp}:${snapshot.source}:${snapshot.path}`, snapshot)
  }

  return [...snapshots.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function buildKnowledge(events: ReconcilerEvent[]): QuestInteractionKnowledge[] {
  return events.flatMap((event) => {
    const base = {
      timestamp: event.timestamp,
      taskIds: taskIdsFromEvent(event),
      files: fileChangesFromEvent(event).map((change) => change.path),
      contexts: contextPathsFromEvent(event),
      ...optional('cwd', cwdFromEvent(event)),
      ...optional('runtime', runtimesFromEvent(event)[0]),
    }

    if (event.type === 'knowledge.captured') {
      return [{
        ...base,
        kind: asString(event.data.kind ?? event.data.type ?? event.data.category) ?? 'knowledge',
        summary: asString(event.data.summary ?? event.data.message ?? event.data.note) ?? summarizeEvent(event),
      }]
    }

    if (event.type === 'action.summary') {
      return [{
        ...base,
        kind: 'action_summary',
        summary: summarizeEvent(event),
      }]
    }

    if (event.type === 'note') {
      return [{
        ...base,
        kind: 'note',
        summary: summarizeEvent(event),
      }]
    }

    if (event.type === 'validation') {
      return [{
        ...base,
        kind: 'validation',
        summary: validationSummary(event),
      }]
    }

    if (event.type === 'research.assessed') {
      return [{
        ...base,
        kind: 'research_assessment',
        summary: researchAssessmentSummary(event),
      }]
    }

    if (event.type === 'research.performed') {
      return [{
        ...base,
        kind: 'research_performed',
        summary: summarizeEvent(event),
      }]
    }

    if (event.type === 'context.loaded' || event.type === 'context.changed') {
      return [{
        ...base,
        kind: event.type,
        summary: summarizeEvent(event),
      }]
    }

    if (event.type === 'cwd.observed') {
      return [{
        ...base,
        kind: 'working_directory',
        summary: `Working directory observed: ${cwdFromEvent(event) ?? 'unknown'}`,
      }]
    }

    return []
  })
}

function summarizeEvent(event: ReconcilerEvent): string {
  const data = event.data
  const text = asString(
    data.summary ??
      data.message ??
      data.note ??
      data.title ??
      data.status ??
      data.to ??
      data.runtime ??
      data.reason,
  )
  return summarizeText(text ?? event.type)
}

function validationSummary(event: ReconcilerEvent): string {
  const result = asRecord(event.data.result)
  return summarizeText(asString(result?.summary ?? event.data.summary) ?? 'validation')
}

function researchAssessmentSummary(event: ReconcilerEvent): string {
  const needed = event.data.needed === true ? 'needed' : 'skipped'
  const reason = asString(event.data.reason ?? event.data.summary ?? event.data.message) ?? 'no reason recorded'
  return summarizeText(`Research ${needed}: ${reason}`)
}

function summarizeText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length <= 220 ? compact : `${compact.slice(0, 217)}...`
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

function fileChangesFromEvent(event: ReconcilerEvent): Array<{ path: string; change: 'added' | 'removed' | 'touched' }> {
  const data = event.data
  const changes = [
    ...strings(data.path).map((path) => ({ path, change: 'touched' as const })),
    ...strings(data.file).map((path) => ({ path, change: 'touched' as const })),
    ...strings(data.filePath).map((path) => ({ path, change: 'touched' as const })),
    ...strings(data.added).map((path) => ({ path, change: 'added' as const })),
    ...strings(data.removed).map((path) => ({ path, change: 'removed' as const })),
    ...strings(data.changedFiles).map((path) => ({ path, change: 'touched' as const })),
    ...strings(data.loadedFiles).map((path) => ({ path, change: 'touched' as const })),
    ...strings(data.files).map((path) => ({ path, change: 'touched' as const })),
  ].filter((change) => looksLikePath(change.path))

  const byChangeAndPath = new Map<string, { path: string; change: 'added' | 'removed' | 'touched' }>()
  for (const change of changes) {
    byChangeAndPath.set(`${change.change}:${change.path}`, change)
  }
  return [...byChangeAndPath.values()]
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

function cwdFromEvent(event: ReconcilerEvent): string | undefined {
  return asString(
    event.data.cwd ??
      event.data.workDir ??
      event.data.workingDirectory ??
      event.data.projectRoot ??
      event.data.directory,
  )
}

function strings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (Array.isArray(value)) {
    return value.flatMap((item) => strings(item))
  }
  return []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : { [key]: value } as { [P in K]?: V }
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

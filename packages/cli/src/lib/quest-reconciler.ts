/**
 * Quest Reconciler — builds live quest state from base quest.json + events.ndjson.
 *
 * Core principle: runtimes NEVER rewrite quest.json directly.
 * They append events to events.ndjson. The CLI reconciles events
 * into a live QuestRun on read. This eliminates race conditions
 * between IDE runtimes and the oac CLI.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuestRun, QuestRunState, QuestRunTask } from './quest-run.js'
import { loadQuestRun } from './quest-run.js'
import { detectCycles } from './task-dag.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconcilerEventType =
  | 'task_update'
  | 'state_change'
  | 'file_change'
  | 'validation'
  | 'amendment'
  | 'error'
  | 'note'
  | 'runtime.assigned'
  | 'runtime.spawned'
  | 'runtime.completed'
  | 'handoff.outgoing'
  | 'handoff.incoming'
  | 'incident.created'
  | 'incident.resolved'
  | 'review.started'
  | 'review.approved'
  | 'review.rejected'
  | 'task.injected'
  | 'priority.changed'

export interface ReconcilerEvent {
  timestamp: string
  type: ReconcilerEventType
  data: Record<string, unknown>
}

export interface QuestVerificationResult {
  timestamp: string
  checks: Array<{
    name: string
    command: string
    passed: boolean
    output?: string
    durationMs?: number
  }>
  overallPassed: boolean
  summary: string
  forced?: boolean
  noChecks?: boolean
}

export interface ReconciledQuestRun extends QuestRun {
  /** Files changed during this quest, accumulated from file_change events. */
  changedFiles: string[]
  /** Latest verification result, if any. */
  verification?: QuestVerificationResult
  /** Amendments applied after quest creation. */
  amendments: ReconcilerEvent[]
  /** Runtime handoffs recorded by v6-compatible runtimes. */
  handoffs: HandoffRecord[]
  /** Runtime ownership/progress summary. */
  runtimeProgress: Record<string, RuntimeProgress>
  /** Incident state recorded from v6-compatible events. */
  incidents: IncidentRecord[]
}

export interface RuntimeProgress {
  assigned: number
  completed: number
  failed: number
  pid?: number
  alive?: boolean
  lastEventAt?: string
}

export interface HandoffRecord {
  id: string
  timestamp: string
  fromRuntime?: string
  toRuntime?: string
  taskIds: string[]
  changedFiles: string[]
  nextAction?: string
  risks: string[]
  accepted: boolean
  acceptedAt?: string
  acceptedTaskIds?: string[]
}

export interface IncidentRecord {
  incidentId: string
  timestamp: string
  status: 'open' | 'resolved'
  summary: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  taskId?: string
  resolution?: string
  resolvedAt?: string
}

// ── Event Application ─────────────────────────────────────────────────────────

function applyTaskUpdate(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const taskData = flattenTaskEventData(data)
  const taskId = taskIdFromData(taskData)
  if (!taskId) return

  const task = quest.tasks.find((t) => t.id === taskId)
  if (!task) {
    // Task doesn't exist yet — possibly from an amendment. Create it.
    const newTask: QuestRunTask = {
      id: taskId,
      title: asString(taskData.title ?? taskData.name) || `Task ${taskId}`,
      status: normalizeStatus(asString(taskData.status)) || 'pending',
      expert: asString(taskData.expert ?? taskData.agent ?? taskData.owner) || 'auto',
      dependsOn: stringArray(taskData.dependsOn ?? taskData.depends_on ?? taskData.dependencies),
      acceptanceCriteria: stringArray(taskData.acceptanceCriteria ?? taskData.acceptance_criteria ?? taskData.acceptance),
    }
    quest.tasks.push(newTask)
    return
  }

  if (taskData.status) {
    task.status = normalizeStatus(asString(taskData.status)) || task.status
  }
  const title = asString(taskData.title ?? taskData.name)
  if (title) {
    task.title = title
  }
  const expert = asString(taskData.expert ?? taskData.agent ?? taskData.owner)
  if (expert) {
    task.expert = expert
  }
  if (taskData.stage) {
    ;(task as unknown as Record<string, unknown>).stage = taskData.stage
  }
  const dependsOn = stringArray(taskData.dependsOn ?? taskData.depends_on ?? taskData.dependencies)
  if (dependsOn.length > 0) {
    task.dependsOn = [...task.dependsOn, ...dependsOn.filter((d) => !task.dependsOn.includes(d))]
  }
}

function applyStateChange(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const to = data.to as QuestRunState | undefined
  if (!to) return
  const validStates: QuestRunState[] = ['NEW', 'SPEC', 'EXECUTE', 'REVIEW', 'VERIFY', 'COMPLETE', 'WAITING', 'BLOCKED', 'FAILED']
  if (validStates.includes(to)) {
    quest.state = to
  }
}

function applyFileChange(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const added = data.added as string | undefined
  const removed = data.removed as string | undefined
  if (added && !quest.changedFiles.includes(added)) {
    quest.changedFiles.push(added)
  }
  if (removed) {
    quest.changedFiles = quest.changedFiles.filter((f) => f !== removed)
  }
}

function applyValidation(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const result = data.result as QuestVerificationResult | undefined
  if (result) {
    quest.verification = result
    // Auto-update trust label based on verification
    if (result.overallPassed) {
      if (quest.trustLabel !== 'pushed') {
        quest.trustLabel = 'tested'
      }
    } else if (result.forced && result.noChecks) {
      if (quest.trustLabel === 'planned_only') {
        quest.trustLabel = 'inspected_only'
      }
    } else {
      quest.trustLabel = 'failed'
    }
  }
}

function applyAmendment(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  if (data.objective) {
    quest.objective = data.objective as string
  }
  if (data.amendmentText) {
    // No-op for now — amendment is recorded in the event itself
  }
}

function applyError(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const taskId = data.taskId as string | undefined
  if (taskId) {
    const task = quest.tasks.find((t) => t.id === taskId)
    if (task) {
      task.status = 'failed'
    }
  }
  // If a critical error, mark trust label as failed
  if (data.critical) {
    quest.trustLabel = 'failed'
  }
}

function applyRuntimeAssigned(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const runtime = asString(event.data.runtime ?? event.data.assignedRuntime ?? event.data.toRuntime) ?? 'unknown'
  const taskIds = taskIdsFromData(event.data)
  const progress = ensureRuntimeProgress(quest, runtime)
  progress.assigned += Math.max(1, taskIds.length)
  progress.lastEventAt = event.timestamp

  for (const taskId of taskIds) {
    const task = quest.tasks.find((candidate) => candidate.id === taskId)
    if (task) {
      ;(task as unknown as Record<string, unknown>).runtime = runtime
    }
  }
}

function applyRuntimeSpawned(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const runtime = asString(event.data.runtime) ?? 'unknown'
  const progress = ensureRuntimeProgress(quest, runtime)
  const pid = asNumber(event.data.pid)
  if (pid !== undefined) progress.pid = pid
  progress.alive = event.data.alive === undefined ? true : Boolean(event.data.alive)
  progress.lastEventAt = event.timestamp
}

function applyRuntimeCompleted(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const runtime = asString(event.data.runtime) ?? 'unknown'
  const progress = ensureRuntimeProgress(quest, runtime)
  const ok = event.data.ok === true || event.data.status === 'completed' || event.data.status === 'ok'
  const failed = event.data.ok === false || event.data.status === 'failed' || event.data.status === 'blocked'
  const count = Math.max(1, taskIdsFromData(event.data).length)
  if (ok) progress.completed += count
  if (failed) progress.failed += count
  progress.alive = false
  progress.lastEventAt = event.timestamp
}

function applyHandoffOutgoing(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  quest.handoffs.push({
    id: asString(event.data.handoffId) ?? `handoff-${quest.handoffs.length + 1}`,
    timestamp: event.timestamp,
    fromRuntime: asString(event.data.fromRuntime),
    toRuntime: asString(event.data.toRuntime),
    taskIds: taskIdsFromData(event.data),
    changedFiles: stringArray(event.data.changedFiles),
    nextAction: asString(event.data.nextAction),
    risks: stringArray(event.data.risks),
    accepted: false,
  })
}

function applyHandoffIncoming(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const fromRuntime = asString(event.data.fromRuntime)
  const toRuntime = asString(event.data.toRuntime)
  const acceptedTaskIds = stringArray(event.data.acceptedTaskIds ?? event.data.taskIds)
  const handoff = [...quest.handoffs]
    .reverse()
    .find((candidate) =>
      !candidate.accepted &&
      (!fromRuntime || candidate.fromRuntime === fromRuntime) &&
      (!toRuntime || candidate.toRuntime === toRuntime),
    )

  if (handoff) {
    handoff.accepted = true
    handoff.acceptedAt = event.timestamp
    handoff.acceptedTaskIds = acceptedTaskIds
    return
  }

  quest.handoffs.push({
    id: asString(event.data.handoffId) ?? `handoff-${quest.handoffs.length + 1}`,
    timestamp: event.timestamp,
    fromRuntime,
    toRuntime,
    taskIds: acceptedTaskIds,
    changedFiles: stringArray(event.data.loadedFiles),
    risks: [],
    accepted: true,
    acceptedAt: event.timestamp,
    acceptedTaskIds,
  })
}

function applyIncidentCreated(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const taskId = asString(event.data.taskId ?? event.data.task_id)
  const severity = normalizeSeverity(asString(event.data.severity))
  const incident: IncidentRecord = {
    incidentId: asString(event.data.incidentId) ?? `incident-${quest.incidents.length + 1}`,
    timestamp: event.timestamp,
    status: 'open',
    summary: asString(event.data.summary) ?? asString(event.data.message) ?? 'Incident recorded',
    severity,
    taskId,
  }
  quest.incidents.push(incident)

  if (taskId) {
    const task = quest.tasks.find((candidate) => candidate.id === taskId)
    if (task) task.status = 'failed'
  }
  if (severity === 'critical') {
    quest.trustLabel = 'failed'
  }
}

function applyIncidentResolved(
  quest: ReconciledQuestRun,
  event: ReconcilerEvent,
): void {
  const incidentId = asString(event.data.incidentId)
  const incident = incidentId
    ? quest.incidents.find((candidate) => candidate.incidentId === incidentId)
    : quest.incidents.find((candidate) => candidate.status === 'open')
  if (!incident) return

  incident.status = 'resolved'
  incident.resolution = asString(event.data.resolution)
  incident.resolvedAt = event.timestamp
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStatus(status: string | undefined): QuestRunTask['status'] | undefined {
  if (
    status === 'pending' ||
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'blocked' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status
  }
  return undefined
}

function deepCopyQuestRun(base: QuestRun): ReconciledQuestRun {
  const withV6Fields = base as QuestRun & Partial<Pick<ReconciledQuestRun, 'handoffs' | 'runtimeProgress' | 'incidents'>>
  return {
    ...base,
    tasks: base.tasks.map((t) => ({ ...t })),
    experts: base.experts.map((e) => ({ ...e })),
    acceptanceCriteria: [...base.acceptanceCriteria],
    artifacts: { ...base.artifacts },
    runtimes: {
      opencode: { ...base.runtimes.opencode },
      kimi: { ...base.runtimes.kimi },
      claude: { ...base.runtimes.claude },
      codex: { ...base.runtimes.codex },
    },
    changedFiles: [...(base.changedFiles ?? [])],
    verification: base.verification ? { ...base.verification, checks: base.verification.checks.map((c) => ({ ...c })) } : undefined,
    amendments: [],
    handoffs: (withV6Fields.handoffs ?? []).map((handoff) => ({
      ...handoff,
      taskIds: [...handoff.taskIds],
      changedFiles: [...handoff.changedFiles],
      risks: [...handoff.risks],
      acceptedTaskIds: handoff.acceptedTaskIds ? [...handoff.acceptedTaskIds] : undefined,
    })),
    runtimeProgress: copyRuntimeProgress(withV6Fields.runtimeProgress),
    incidents: (withV6Fields.incidents ?? []).map((incident) => ({ ...incident })),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reconcile a base QuestRun with a list of events to produce live state.
 * Pure function — does not touch the filesystem.
 */
export function reconcileQuestRun(
  baseQuest: QuestRun,
  events: ReconcilerEvent[],
): ReconciledQuestRun {
  const quest = deepCopyQuestRun(baseQuest)

  for (const event of events) {
    switch (event.type) {
      case 'task_update':
        applyTaskUpdate(quest, event.data)
        break
      case 'state_change':
        applyStateChange(quest, event.data)
        break
      case 'file_change':
        applyFileChange(quest, event.data)
        break
      case 'validation':
        applyValidation(quest, event.data)
        break
      case 'amendment':
        applyAmendment(quest, event.data)
        quest.amendments.push(event)
        break
      case 'error':
        applyError(quest, event.data)
        break
      case 'note':
        // Notes are informational only — no state mutation
        break
      case 'runtime.assigned':
        applyRuntimeAssigned(quest, event)
        break
      case 'runtime.spawned':
        applyRuntimeSpawned(quest, event)
        break
      case 'runtime.completed':
        applyRuntimeCompleted(quest, event)
        break
      case 'handoff.outgoing':
        applyHandoffOutgoing(quest, event)
        break
      case 'handoff.incoming':
        applyHandoffIncoming(quest, event)
        break
      case 'incident.created':
        applyIncidentCreated(quest, event)
        break
      case 'incident.resolved':
        applyIncidentResolved(quest, event)
        break
      case 'review.started':
        applyReviewStarted(quest, event)
        break
      case 'review.approved':
        applyReviewApproved(quest, event)
        break
      case 'review.rejected':
        applyReviewRejected(quest, event)
        break
      case 'task.injected':
        applyTaskInjected(quest, event)
        break
      case 'priority.changed':
        applyPriorityChanged(quest, event)
        break
    }
  }

  // Update nextSuggestedAction based on current state
  quest.nextSuggestedAction = inferNextAction(quest)
  quest.updatedAt = new Date().toISOString()

  return quest
}

function ensureRuntimeProgress(
  quest: ReconciledQuestRun,
  runtime: string,
): RuntimeProgress {
  quest.runtimeProgress[runtime] ??= { assigned: 0, completed: 0, failed: 0 }
  return quest.runtimeProgress[runtime]
}

function copyRuntimeProgress(
  input: ReconciledQuestRun['runtimeProgress'] | undefined,
): ReconciledQuestRun['runtimeProgress'] {
  const output: ReconciledQuestRun['runtimeProgress'] = {}
  for (const [runtime, progress] of Object.entries(input ?? {})) {
    output[runtime] = { ...progress }
  }
  return output
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }
  return typeof value === 'string' && value.trim() ? [value.trim()] : []
}

function taskIdsFromData(data: Record<string, unknown>): string[] {
  const single = taskIdFromData(flattenTaskEventData(data))
  const many = stringArray(data.taskIds ?? data.task_ids)
  return unique([...(single ? [single] : []), ...many])
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function flattenTaskEventData(data: Record<string, unknown>): Record<string, unknown> {
  const task = asRecord(data.task)
  return task ? { ...task, ...data } : data
}

function taskIdFromData(data: Record<string, unknown>): string | undefined {
  return asString(data.taskId ?? data.task_id ?? data.id)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function normalizeSeverity(value: string | undefined): IncidentRecord['severity'] {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value
  }
  return undefined
}

// ── v8 Event Application ──────────────────────────────────────────────────────

function applyReviewStarted(quest: ReconciledQuestRun, _event: ReconcilerEvent): void {
  quest.state = 'REVIEW'
}

function applyReviewApproved(quest: ReconciledQuestRun, _event: ReconcilerEvent): void {
  // Transition from REVIEW to VERIFY (or EXECUTE if verification is manual)
  if (quest.state === 'REVIEW') {
    quest.state = 'VERIFY'
  }
}

function applyReviewRejected(quest: ReconciledQuestRun, event: ReconcilerEvent): void {
  if (quest.state === 'REVIEW') {
    quest.state = 'EXECUTE'
  }
  // Reset failed tasks to pending so they can be retried
  const resetFailed = event.data.resetFailed !== false
  if (resetFailed) {
    for (const task of quest.tasks) {
      if (task.status === 'failed') {
        task.status = 'pending'
      }
    }
  }
}

function applyTaskInjected(quest: ReconciledQuestRun, event: ReconcilerEvent): void {
  const data = flattenTaskEventData(event.data)
  const taskId = taskIdFromData(data)
  const title = asString(data.title ?? data.name ?? data.description)
  if (!taskId || !title) return

  // Avoid duplicates
  if (quest.tasks.some((t) => t.id === taskId)) return

  const newTask: QuestRunTask = {
    id: taskId,
    title,
    status: normalizeStatus(asString(data.status)) || 'pending',
    expert: asString(data.expert ?? data.agent ?? data.owner) || 'auto',
    dependsOn: stringArray(data.dependsOn ?? data.depends_on ?? data.dependencies),
    acceptanceCriteria: stringArray(data.acceptanceCriteria ?? data.acceptance_criteria ?? data.acceptance),
    priority: asNumber(data.priority) ?? 3,
  }

  quest.tasks.push(newTask)

  // Validate DAG for cycles
  const cycle = detectCycles(quest.tasks)
  if (cycle) {
    newTask.status = 'blocked'
    ;(newTask as unknown as Record<string, unknown>).blockReason = `Cycle detected: ${cycle.join(' → ')}`
    quest.trustLabel = 'blocked'
  }
}

function applyPriorityChanged(quest: ReconciledQuestRun, event: ReconcilerEvent): void {
  const data = flattenTaskEventData(event.data)
  const taskId = taskIdFromData(data)
  const priority = asNumber(data.priority ?? data.newPriority ?? data.new_priority)
  if (!taskId || priority === undefined) return

  const task = quest.tasks.find((t) => t.id === taskId)
  if (task) {
    task.priority = priority
  }
}

/**
 * Load and reconcile a quest from disk.
 * Reads quest.json + events.ndjson and applies reconciliation.
 */
export async function loadReconciledQuest(
  projectRoot: string,
  questId: string,
): Promise<ReconciledQuestRun | null> {
  const base = await loadQuestRun(projectRoot, questId)
  if (!base) return null

  const events = await loadEvents(projectRoot, questId)
  return reconcileQuestRun(base, events)
}

/**
 * Load raw events from events.ndjson.
 */
export async function loadEvents(
  projectRoot: string,
  questId: string,
): Promise<ReconcilerEvent[]> {
  let raw: string
  try {
    raw = await readFile(
      join(projectRoot, '.oac', 'runs', questId, 'events.ndjson'),
      'utf-8',
    )
  } catch {
    return []
  }

  const events: ReconcilerEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as ReconcilerEvent)
    } catch {
      // Keep valid history even if one runtime wrote a partial/corrupt line.
      continue
    }
  }
  return events
}

/**
 * Infer the next suggested action from quest state.
 */
function inferNextAction(quest: ReconciledQuestRun): string {
  const pending = quest.tasks.filter((t) => t.status === 'pending').length
  const inProgress = quest.tasks.filter((t) => t.status === 'in_progress').length
  const blocked = quest.tasks.filter((t) => t.status === 'blocked').length
  const failed = quest.tasks.filter((t) => t.status === 'failed').length

  if (quest.state === 'COMPLETE') {
    return `Quest ${quest.questId} is complete. Run 'oac quest-verify ${quest.questId}' for final checks.`
  }

  if (quest.state === 'REVIEW') {
    return `Quest ${quest.questId} is awaiting review. Run 'oac quest-review ${quest.questId} --approve' to continue or '--reject' to return to execution.`
  }

  if (quest.state === 'WAITING') {
    return `Resume Quest ${quest.questId} in an IDE runtime: oac quest-resume ${quest.questId}`
  }

  if (failed > 0) {
    return `Address ${failed} failed task(s), then continue execution.`
  }

  if (blocked > 0) {
    return `Unblock ${blocked} task(s) before continuing.`
  }

  if (inProgress > 0) {
    return `Continue executing ${inProgress} in-progress task(s).`
  }

  if (pending > 0) {
    return `Start next pending task (${pending} remaining).`
  }

  return `Continue execution or mark complete with 'oac quest-complete ${quest.questId}'`
}

/**
 * Build a write-back event for a task status change.
 * This is what runtimes should append to events.ndjson.
 */
export function buildTaskUpdateEvent(
  taskId: string,
  status: QuestRunTask['status'],
  options?: { title?: string; expert?: string },
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'task_update',
    data: {
      taskId,
      status,
      ...(options?.title && { title: options.title }),
      ...(options?.expert && { expert: options.expert }),
    },
  }
}

/**
 * Build a write-back event for a file change.
 */
export function buildFileChangeEvent(
  added?: string,
  removed?: string,
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'file_change',
    data: {
      ...(added && { added }),
      ...(removed && { removed }),
    },
  }
}

/**
 * Build a write-back event for a state change.
 */
export function buildStateChangeEvent(
  from: QuestRunState,
  to: QuestRunState,
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'state_change',
    data: { from, to },
  }
}

/**
 * Build a write-back event for a validation result.
 */
export function buildValidationEvent(
  result: QuestVerificationResult,
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'validation',
    data: { result },
  }
}

/**
 * Build a write-back event for an amendment.
 */
export function buildAmendmentEvent(
  objective: string,
  amendmentText: string,
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'amendment',
    data: { objective, amendmentText },
  }
}

/**
 * Build a write-back event for an error.
 */
export function buildErrorEvent(
  message: string,
  options?: { taskId?: string; critical?: boolean },
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'error',
    data: {
      message,
      ...(options?.taskId && { taskId: options.taskId }),
      ...(options?.critical !== undefined && { critical: options.critical }),
    },
  }
}

// ── v8 Event Builders ─────────────────────────────────────────────────────────

/**
 * Build a write-back event for a review started.
 */
export function buildReviewStartedEvent(): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'review.started',
    data: {},
  }
}

/**
 * Build a write-back event for a review approval.
 */
export function buildReviewApprovedEvent(): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'review.approved',
    data: {},
  }
}

/**
 * Build a write-back event for a review rejection.
 */
export function buildReviewRejectedEvent(options?: { resetFailed?: boolean; reason?: string }): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'review.rejected',
    data: {
      ...(options?.resetFailed !== undefined && { resetFailed: options.resetFailed }),
      ...(options?.reason && { reason: options.reason }),
    },
  }
}

/**
 * Build a write-back event for injecting a new task.
 */
export function buildTaskInjectedEvent(
  taskId: string,
  title: string,
  options?: {
    expert?: string
    dependsOn?: string[]
    priority?: number
    status?: QuestRunTask['status']
    acceptanceCriteria?: string[]
    injectedBy?: string
    reason?: string
  },
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'task.injected',
    data: {
      taskId,
      title,
      ...(options?.expert && { expert: options.expert }),
      ...(options?.dependsOn && { dependsOn: options.dependsOn }),
      ...(options?.priority !== undefined && { priority: options.priority }),
      ...(options?.status && { status: options.status }),
      ...(options?.acceptanceCriteria && { acceptanceCriteria: options.acceptanceCriteria }),
      ...(options?.injectedBy && { injectedBy: options.injectedBy }),
      ...(options?.reason && { reason: options.reason }),
    },
  }
}

/**
 * Build a write-back event for changing task priority.
 */
export function buildPriorityChangedEvent(
  taskId: string,
  priority: number,
): ReconcilerEvent {
  return {
    timestamp: new Date().toISOString(),
    type: 'priority.changed',
    data: { taskId, priority },
  }
}

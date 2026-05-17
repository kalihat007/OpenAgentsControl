/**
 * Quest Reconciler v4 — builds live quest state from base quest.json + events.ndjson.
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconcilerEventType =
  | 'task_update'
  | 'state_change'
  | 'file_change'
  | 'validation'
  | 'amendment'
  | 'error'
  | 'note'

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
}

// ── Event Application ─────────────────────────────────────────────────────────

function applyTaskUpdate(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const taskId = data.taskId as string | undefined
  if (!taskId) return

  const task = quest.tasks.find((t) => t.id === taskId)
  if (!task) {
    // Task doesn't exist yet — possibly from an amendment. Create it.
    const newTask: QuestRunTask = {
      id: taskId,
      title: (data.title as string) || `Task ${taskId}`,
      status: normalizeStatus(data.status as string) || 'pending',
      expert: (data.expert as string) || 'auto',
      dependsOn: [],
      acceptanceCriteria: [],
    }
    quest.tasks.push(newTask)
    return
  }

  if (data.status) {
    task.status = normalizeStatus(data.status as string) || task.status
  }
  if (data.title) {
    task.title = data.title as string
  }
  if (data.expert) {
    task.expert = data.expert as string
  }
  if (data.stage) {
    ;(task as unknown as Record<string, unknown>).stage = data.stage
  }
}

function applyStateChange(quest: ReconciledQuestRun, data: Record<string, unknown>): void {
  const to = data.to as QuestRunState | undefined
  if (!to) return
  const validStates: QuestRunState[] = ['NEW', 'SPEC', 'EXECUTE', 'VERIFY', 'COMPLETE', 'WAITING', 'BLOCKED', 'FAILED']
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
    },
    changedFiles: [...(base.changedFiles ?? [])],
    verification: base.verification ? { ...base.verification, checks: base.verification.checks.map((c) => ({ ...c })) } : undefined,
    amendments: [],
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
    }
  }

  // Update nextSuggestedAction based on current state
  quest.nextSuggestedAction = inferNextAction(quest)
  quest.updatedAt = new Date().toISOString()

  return quest
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

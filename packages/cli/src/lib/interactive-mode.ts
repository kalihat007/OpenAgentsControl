/**
 * Interactive Mode — keeps developers in control during agentic coding
 * without micromanaging.
 *
 * Three modes let the user choose their level of involvement:
 *   - autonomous:    experts run freely, report at end
 *   - supervised:    stops at approval gates for user review
 *   - collaborative: user can inject guidance at any point
 *
 * All state management is immutable — every mutation returns a new object.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type InteractiveMode = 'autonomous' | 'supervised' | 'collaborative'

export type GatePhase = 'plan' | 'pre-commit' | 'post-test' | 'custom'
export type GateStatus = 'pending' | 'approved' | 'rejected' | 'skipped'

export type ProgressEventType =
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'gate_reached'
  | 'user_input'
  | 'steering'

export type SteeringAction =
  | 'pause'
  | 'resume'
  | 'skip'
  | 'retry'
  | 'abort'
  | 'change_approach'
  | 'add_instruction'

export interface ApprovalGate {
  id: string
  phase: GatePhase
  status: GateStatus
  reviewData: unknown
  feedback?: string
}

export interface ProgressEvent {
  timestamp: string
  type: ProgressEventType
  expertId?: string
  data?: Record<string, unknown>
}

export interface SteeringCommand {
  timestamp: string
  command: SteeringAction
  payload?: unknown
}

export interface InteractiveSession {
  id: string
  mode: InteractiveMode
  approvalGates: ApprovalGate[]
  progressStream: ProgressEvent[]
  steeringHistory: SteeringCommand[]
  paused: boolean
  startedAt: string
}

export interface InteractiveConfig {
  gates?: ApprovalGate[]
}

export interface ProgressSummary {
  totalSteps: number
  completed: number
  failed: number
  pending: number
  currentExpert: string | undefined
  elapsedTime: number
}

// ── Internal helpers ──────────────────────────────────────────────────────────

let idCounter = 0

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

function now(): string {
  return new Date().toISOString()
}

const MODE_RANK: Record<InteractiveMode, number> = {
  autonomous: 0,
  supervised: 1,
  collaborative: 2,
}

const RANK_TO_MODE: InteractiveMode[] = ['autonomous', 'supervised', 'collaborative']

// ── Session management ────────────────────────────────────────────────────────

export function createInteractiveSession(
  mode: InteractiveMode,
  config?: InteractiveConfig,
): InteractiveSession {
  const session: InteractiveSession = {
    id: nextId('interactive'),
    mode,
    approvalGates: config?.gates ?? getDefaultGates(mode),
    progressStream: [],
    steeringHistory: [],
    paused: false,
    startedAt: now(),
  }
  return session
}

export function configureGates(
  session: InteractiveSession,
  gates: ApprovalGate[],
): InteractiveSession {
  return { ...session, approvalGates: gates }
}

export function getDefaultGates(mode: InteractiveMode): ApprovalGate[] {
  if (mode === 'autonomous') return []

  if (mode === 'supervised') {
    return [
      { id: 'gate-plan', phase: 'plan', status: 'pending', reviewData: null },
      { id: 'gate-pre-commit', phase: 'pre-commit', status: 'pending', reviewData: null },
    ]
  }

  // collaborative gets all gate phases
  return [
    { id: 'gate-plan', phase: 'plan', status: 'pending', reviewData: null },
    { id: 'gate-pre-commit', phase: 'pre-commit', status: 'pending', reviewData: null },
    { id: 'gate-post-test', phase: 'post-test', status: 'pending', reviewData: null },
    { id: 'gate-custom', phase: 'custom', status: 'pending', reviewData: null },
  ]
}

// ── Approval gates ────────────────────────────────────────────────────────────

export function reachGate(
  session: InteractiveSession,
  gateId: string,
  reviewData: unknown,
): InteractiveSession {
  const gate = session.approvalGates.find((g) => g.id === gateId)
  if (!gate) return session

  return {
    ...session,
    approvalGates: session.approvalGates.map((g) =>
      g.id === gateId ? { ...g, reviewData } : g,
    ),
    progressStream: [
      ...session.progressStream,
      { timestamp: now(), type: 'gate_reached' as const, data: { gateId } },
    ],
  }
}

export function approveGate(
  session: InteractiveSession,
  gateId: string,
  feedback?: string,
): InteractiveSession {
  const gate = session.approvalGates.find((g) => g.id === gateId)
  if (!gate || gate.status !== 'pending') return session

  return {
    ...session,
    approvalGates: session.approvalGates.map((g) =>
      g.id === gateId ? { ...g, status: 'approved' as const, feedback } : g,
    ),
  }
}

export function rejectGate(
  session: InteractiveSession,
  gateId: string,
  feedback: string,
): InteractiveSession {
  const gate = session.approvalGates.find((g) => g.id === gateId)
  if (!gate || gate.status !== 'pending') return session

  return {
    ...session,
    approvalGates: session.approvalGates.map((g) =>
      g.id === gateId ? { ...g, status: 'rejected' as const, feedback } : g,
    ),
  }
}

export function skipGate(
  session: InteractiveSession,
  gateId: string,
): InteractiveSession {
  const gate = session.approvalGates.find((g) => g.id === gateId)
  if (!gate || gate.status !== 'pending') return session

  return {
    ...session,
    approvalGates: session.approvalGates.map((g) =>
      g.id === gateId ? { ...g, status: 'skipped' as const } : g,
    ),
  }
}

export function getPendingGates(session: InteractiveSession): ApprovalGate[] {
  return session.approvalGates.filter((g) => g.status === 'pending')
}

export function isBlocked(session: InteractiveSession): boolean {
  if (session.paused) return true

  const reached = session.progressStream.filter((e) => e.type === 'gate_reached')
  const reachedGateIds = new Set(reached.map((e) => e.data?.['gateId'] as string))

  return session.approvalGates.some(
    (g) => g.status === 'pending' && reachedGateIds.has(g.id),
  )
}

// ── Progress tracking ─────────────────────────────────────────────────────────

export function emitProgress(
  session: InteractiveSession,
  event: Omit<ProgressEvent, 'timestamp'>,
): InteractiveSession {
  const full: ProgressEvent = { ...event, timestamp: now() }
  return {
    ...session,
    progressStream: [...session.progressStream, full],
  }
}

export function getProgressSummary(session: InteractiveSession): ProgressSummary {
  const started = session.progressStream.filter((e) => e.type === 'step_started')
  const completed = session.progressStream.filter((e) => e.type === 'step_completed')
  const failed = session.progressStream.filter((e) => e.type === 'step_failed')

  const completedCount = completed.length
  const failedCount = failed.length
  const totalSteps = started.length
  const pending = totalSteps - completedCount - failedCount

  const lastStarted = started[started.length - 1]
  const currentExpert = lastStarted?.expertId

  const elapsed = Date.now() - new Date(session.startedAt).getTime()

  return {
    totalSteps,
    completed: completedCount,
    failed: failedCount,
    pending: Math.max(0, pending),
    currentExpert,
    elapsedTime: elapsed,
  }
}

export function getProgressByExpert(
  session: InteractiveSession,
  expertId: string,
): ProgressEvent[] {
  return session.progressStream.filter((e) => e.expertId === expertId)
}

export function formatProgressBar(summary: ProgressSummary): string {
  const { totalSteps, completed, failed } = summary
  if (totalSteps === 0) return '[          ] 0/0 steps'

  const barWidth = 20
  const completedWidth = Math.round((completed / totalSteps) * barWidth)
  const failedWidth = Math.round((failed / totalSteps) * barWidth)
  const emptyWidth = barWidth - completedWidth - failedWidth

  const bar =
    '█'.repeat(completedWidth) +
    '░'.repeat(Math.max(0, failedWidth)) +
    '·'.repeat(Math.max(0, emptyWidth))

  const pct = Math.round((completed / totalSteps) * 100)
  const expert = summary.currentExpert ? ` [${summary.currentExpert}]` : ''
  const elapsed = formatElapsed(summary.elapsedTime)

  return `[${bar}] ${completed}/${totalSteps} steps (${pct}%) ${elapsed}${expert}`
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m${remSecs}s`
}

// ── Steering commands ─────────────────────────────────────────────────────────

export function canSteer(session: InteractiveSession): boolean {
  return session.mode === 'collaborative' || session.paused
}

export function steer(
  session: InteractiveSession,
  command: SteeringCommand,
): InteractiveSession {
  if (!canSteer(session)) return session

  return {
    ...session,
    steeringHistory: [...session.steeringHistory, command],
    progressStream: [
      ...session.progressStream,
      {
        timestamp: command.timestamp,
        type: 'steering' as const,
        data: { command: command.command, payload: command.payload },
      },
    ],
  }
}

export function pause(session: InteractiveSession): InteractiveSession {
  if (session.paused) return session

  const command: SteeringCommand = { timestamp: now(), command: 'pause' }
  return {
    ...session,
    paused: true,
    steeringHistory: [...session.steeringHistory, command],
    progressStream: [
      ...session.progressStream,
      { timestamp: command.timestamp, type: 'steering' as const, data: { command: 'pause' } },
    ],
  }
}

export function resume(session: InteractiveSession): InteractiveSession {
  if (!session.paused) return session

  const command: SteeringCommand = { timestamp: now(), command: 'resume' }
  return {
    ...session,
    paused: false,
    steeringHistory: [...session.steeringHistory, command],
    progressStream: [
      ...session.progressStream,
      { timestamp: command.timestamp, type: 'steering' as const, data: { command: 'resume' } },
    ],
  }
}

export function abort(
  session: InteractiveSession,
  reason: string,
): InteractiveSession {
  const command: SteeringCommand = { timestamp: now(), command: 'abort', payload: reason }
  return {
    ...session,
    paused: true,
    steeringHistory: [...session.steeringHistory, command],
    progressStream: [
      ...session.progressStream,
      { timestamp: command.timestamp, type: 'steering' as const, data: { command: 'abort', reason } },
    ],
  }
}

export function changeApproach(
  session: InteractiveSession,
  expertId: string,
  newInstructions: string,
): InteractiveSession {
  if (!canSteer(session)) return session

  const command: SteeringCommand = {
    timestamp: now(),
    command: 'change_approach',
    payload: { expertId, newInstructions },
  }
  return {
    ...session,
    steeringHistory: [...session.steeringHistory, command],
    progressStream: [
      ...session.progressStream,
      {
        timestamp: command.timestamp,
        type: 'steering' as const,
        expertId,
        data: { command: 'change_approach', newInstructions },
      },
    ],
  }
}

// ── Mode transitions ──────────────────────────────────────────────────────────

export function escalateMode(session: InteractiveSession): InteractiveSession {
  const rank = MODE_RANK[session.mode]
  if (rank >= 2) return session
  const newMode = RANK_TO_MODE[rank + 1]!
  return { ...session, mode: newMode }
}

export function relaxMode(session: InteractiveSession): InteractiveSession {
  const rank = MODE_RANK[session.mode]
  if (rank <= 0) return session
  const newMode = RANK_TO_MODE[rank - 1]!
  return { ...session, mode: newMode }
}

/** Reset the internal id counter — only for test isolation. */
export function _resetIdCounter(): void {
  idCounter = 0
}

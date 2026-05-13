import { describe, it, expect, beforeEach } from 'bun:test'
import {
  createInteractiveSession,
  configureGates,
  getDefaultGates,
  reachGate,
  approveGate,
  rejectGate,
  skipGate,
  getPendingGates,
  isBlocked,
  emitProgress,
  getProgressSummary,
  getProgressByExpert,
  formatProgressBar,
  steer,
  canSteer,
  pause,
  resume,
  abort,
  changeApproach,
  escalateMode,
  relaxMode,
  _resetIdCounter,
  type InteractiveSession,
  type ApprovalGate,
  type SteeringCommand,
  type ProgressSummary,
} from './interactive-mode.js'

beforeEach(() => {
  _resetIdCounter()
})

// ── Session creation ──────────────────────────────────────────────────────────

describe('createInteractiveSession', () => {
  it('creates an autonomous session with no gates', () => {
    const session = createInteractiveSession('autonomous')
    expect(session.mode).toBe('autonomous')
    expect(session.approvalGates).toHaveLength(0)
    expect(session.paused).toBe(false)
    expect(session.progressStream).toHaveLength(0)
    expect(session.steeringHistory).toHaveLength(0)
    expect(session.id).toMatch(/^interactive-/)
    expect(session.startedAt).toBeTruthy()
  })

  it('creates a supervised session with plan + pre-commit gates', () => {
    const session = createInteractiveSession('supervised')
    expect(session.mode).toBe('supervised')
    expect(session.approvalGates).toHaveLength(2)
    expect(session.approvalGates.map((g) => g.phase)).toEqual(['plan', 'pre-commit'])
    expect(session.approvalGates.every((g) => g.status === 'pending')).toBe(true)
  })

  it('creates a collaborative session with all gate phases', () => {
    const session = createInteractiveSession('collaborative')
    expect(session.mode).toBe('collaborative')
    expect(session.approvalGates).toHaveLength(4)
    expect(session.approvalGates.map((g) => g.phase)).toEqual([
      'plan', 'pre-commit', 'post-test', 'custom',
    ])
  })

  it('accepts custom gates from config', () => {
    const gates: ApprovalGate[] = [
      { id: 'custom-1', phase: 'custom', status: 'pending', reviewData: null },
    ]
    const session = createInteractiveSession('autonomous', { gates })
    expect(session.approvalGates).toHaveLength(1)
    expect(session.approvalGates[0]!.id).toBe('custom-1')
  })

  it('generates unique session ids', () => {
    const a = createInteractiveSession('autonomous')
    const b = createInteractiveSession('autonomous')
    expect(a.id).not.toBe(b.id)
  })
})

// ── Default gates per mode ────────────────────────────────────────────────────

describe('getDefaultGates', () => {
  it('returns no gates for autonomous', () => {
    expect(getDefaultGates('autonomous')).toHaveLength(0)
  })

  it('returns plan + pre-commit for supervised', () => {
    const gates = getDefaultGates('supervised')
    expect(gates).toHaveLength(2)
    expect(gates.map((g) => g.phase)).toEqual(['plan', 'pre-commit'])
  })

  it('returns all four phases for collaborative', () => {
    const gates = getDefaultGates('collaborative')
    expect(gates).toHaveLength(4)
  })
})

// ── configureGates ────────────────────────────────────────────────────────────

describe('configureGates', () => {
  it('replaces existing gates immutably', () => {
    const session = createInteractiveSession('supervised')
    const newGates: ApprovalGate[] = [
      { id: 'g1', phase: 'custom', status: 'pending', reviewData: null },
    ]
    const updated = configureGates(session, newGates)
    expect(updated.approvalGates).toHaveLength(1)
    expect(session.approvalGates).toHaveLength(2) // original unchanged
    expect(updated).not.toBe(session)
  })
})

// ── Gate lifecycle ────────────────────────────────────────────────────────────

describe('gate lifecycle', () => {
  let session: InteractiveSession

  beforeEach(() => {
    session = createInteractiveSession('supervised')
  })

  it('reaches a gate with review data', () => {
    const reached = reachGate(session, 'gate-plan', { plan: 'build API' })
    const gate = reached.approvalGates.find((g) => g.id === 'gate-plan')!
    expect(gate.reviewData).toEqual({ plan: 'build API' })
    expect(reached.progressStream).toHaveLength(1)
    expect(reached.progressStream[0]!.type).toBe('gate_reached')
  })

  it('approves a pending gate', () => {
    const approved = approveGate(session, 'gate-plan', 'looks good')
    const gate = approved.approvalGates.find((g) => g.id === 'gate-plan')!
    expect(gate.status).toBe('approved')
    expect(gate.feedback).toBe('looks good')
  })

  it('rejects a pending gate', () => {
    const rejected = rejectGate(session, 'gate-plan', 'needs rework')
    const gate = rejected.approvalGates.find((g) => g.id === 'gate-plan')!
    expect(gate.status).toBe('rejected')
    expect(gate.feedback).toBe('needs rework')
  })

  it('skips a pending gate', () => {
    const skipped = skipGate(session, 'gate-plan')
    const gate = skipped.approvalGates.find((g) => g.id === 'gate-plan')!
    expect(gate.status).toBe('skipped')
  })

  it('does not approve an already-approved gate', () => {
    const approved = approveGate(session, 'gate-plan')
    const doubleApprove = approveGate(approved, 'gate-plan', 'again')
    expect(doubleApprove).toBe(approved) // same reference — no-op
  })

  it('does not reject an already-approved gate', () => {
    const approved = approveGate(session, 'gate-plan')
    const rejected = rejectGate(approved, 'gate-plan', 'nope')
    expect(rejected).toBe(approved)
  })

  it('does not skip an already-rejected gate', () => {
    const rejected = rejectGate(session, 'gate-plan', 'nope')
    const skipped = skipGate(rejected, 'gate-plan')
    expect(skipped).toBe(rejected)
  })

  it('returns session unchanged for unknown gate id', () => {
    const result = reachGate(session, 'nonexistent', {})
    expect(result).toBe(session)
  })

  it('getPendingGates returns only pending gates', () => {
    const approved = approveGate(session, 'gate-plan')
    const pending = getPendingGates(approved)
    expect(pending).toHaveLength(1)
    expect(pending[0]!.id).toBe('gate-pre-commit')
  })

  it('all gates operations are immutable', () => {
    const reached = reachGate(session, 'gate-plan', { x: 1 })
    const approved = approveGate(reached, 'gate-plan')
    expect(session.approvalGates[0]!.status).toBe('pending')
    expect(reached.approvalGates[0]!.reviewData).toEqual({ x: 1 })
    expect(approved.approvalGates[0]!.status).toBe('approved')
  })
})

// ── isBlocked ─────────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  it('returns false when no gates have been reached', () => {
    const session = createInteractiveSession('supervised')
    expect(isBlocked(session)).toBe(false)
  })

  it('returns true when a reached gate is still pending', () => {
    let session = createInteractiveSession('supervised')
    session = reachGate(session, 'gate-plan', { plan: 'x' })
    expect(isBlocked(session)).toBe(true)
  })

  it('returns false after reached gate is approved', () => {
    let session = createInteractiveSession('supervised')
    session = reachGate(session, 'gate-plan', { plan: 'x' })
    session = approveGate(session, 'gate-plan')
    expect(isBlocked(session)).toBe(false)
  })

  it('returns true when paused', () => {
    let session = createInteractiveSession('autonomous')
    session = pause(session)
    expect(isBlocked(session)).toBe(true)
  })

  it('returns false for autonomous with no gates', () => {
    const session = createInteractiveSession('autonomous')
    expect(isBlocked(session)).toBe(false)
  })
})

// ── Progress tracking ─────────────────────────────────────────────────────────

describe('progress tracking', () => {
  it('emits progress events immutably', () => {
    const session = createInteractiveSession('autonomous')
    const updated = emitProgress(session, { type: 'step_started', expertId: 'frontend' })
    expect(updated.progressStream).toHaveLength(1)
    expect(session.progressStream).toHaveLength(0)
    expect(updated.progressStream[0]!.timestamp).toBeTruthy()
  })

  it('tracks multiple events', () => {
    let session = createInteractiveSession('autonomous')
    session = emitProgress(session, { type: 'step_started', expertId: 'frontend' })
    session = emitProgress(session, { type: 'step_completed', expertId: 'frontend' })
    session = emitProgress(session, { type: 'step_started', expertId: 'backend' })
    expect(session.progressStream).toHaveLength(3)
  })
})

describe('getProgressSummary', () => {
  it('returns zeros for empty session', () => {
    const session = createInteractiveSession('autonomous')
    const summary = getProgressSummary(session)
    expect(summary.totalSteps).toBe(0)
    expect(summary.completed).toBe(0)
    expect(summary.failed).toBe(0)
    expect(summary.pending).toBe(0)
    expect(summary.currentExpert).toBeUndefined()
    expect(summary.elapsedTime).toBeGreaterThanOrEqual(0)
  })

  it('counts started, completed, and failed steps', () => {
    let session = createInteractiveSession('autonomous')
    session = emitProgress(session, { type: 'step_started', expertId: 'a' })
    session = emitProgress(session, { type: 'step_completed', expertId: 'a' })
    session = emitProgress(session, { type: 'step_started', expertId: 'b' })
    session = emitProgress(session, { type: 'step_failed', expertId: 'b' })
    session = emitProgress(session, { type: 'step_started', expertId: 'c' })

    const summary = getProgressSummary(session)
    expect(summary.totalSteps).toBe(3)
    expect(summary.completed).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.pending).toBe(1)
    expect(summary.currentExpert).toBe('c')
  })

  it('identifies current expert from last step_started', () => {
    let session = createInteractiveSession('autonomous')
    session = emitProgress(session, { type: 'step_started', expertId: 'first' })
    session = emitProgress(session, { type: 'step_started', expertId: 'second' })
    expect(getProgressSummary(session).currentExpert).toBe('second')
  })
})

describe('getProgressByExpert', () => {
  it('filters events by expert', () => {
    let session = createInteractiveSession('autonomous')
    session = emitProgress(session, { type: 'step_started', expertId: 'a' })
    session = emitProgress(session, { type: 'step_started', expertId: 'b' })
    session = emitProgress(session, { type: 'step_completed', expertId: 'a' })

    expect(getProgressByExpert(session, 'a')).toHaveLength(2)
    expect(getProgressByExpert(session, 'b')).toHaveLength(1)
    expect(getProgressByExpert(session, 'c')).toHaveLength(0)
  })
})

// ── Progress bar formatting ───────────────────────────────────────────────────

describe('formatProgressBar', () => {
  it('formats empty progress', () => {
    const summary: ProgressSummary = {
      totalSteps: 0, completed: 0, failed: 0, pending: 0,
      currentExpert: undefined, elapsedTime: 0,
    }
    expect(formatProgressBar(summary)).toBe('[          ] 0/0 steps')
  })

  it('formats partial completion', () => {
    const summary: ProgressSummary = {
      totalSteps: 4, completed: 2, failed: 0, pending: 2,
      currentExpert: 'backend', elapsedTime: 30_000,
    }
    const bar = formatProgressBar(summary)
    expect(bar).toContain('2/4 steps')
    expect(bar).toContain('50%')
    expect(bar).toContain('[backend]')
    expect(bar).toContain('30s')
  })

  it('formats full completion', () => {
    const summary: ProgressSummary = {
      totalSteps: 3, completed: 3, failed: 0, pending: 0,
      currentExpert: undefined, elapsedTime: 125_000,
    }
    const bar = formatProgressBar(summary)
    expect(bar).toContain('3/3 steps')
    expect(bar).toContain('100%')
    expect(bar).toContain('2m5s')
  })

  it('formats with failures', () => {
    const summary: ProgressSummary = {
      totalSteps: 10, completed: 5, failed: 2, pending: 3,
      currentExpert: 'qa', elapsedTime: 5_000,
    }
    const bar = formatProgressBar(summary)
    expect(bar).toContain('5/10 steps')
    expect(bar).toContain('50%')
    expect(bar).toContain('[qa]')
  })
})

// ── Steering in each mode ─────────────────────────────────────────────────────

describe('canSteer', () => {
  it('returns true for collaborative mode', () => {
    const session = createInteractiveSession('collaborative')
    expect(canSteer(session)).toBe(true)
  })

  it('returns false for supervised mode (not paused)', () => {
    const session = createInteractiveSession('supervised')
    expect(canSteer(session)).toBe(false)
  })

  it('returns false for autonomous mode (not paused)', () => {
    const session = createInteractiveSession('autonomous')
    expect(canSteer(session)).toBe(false)
  })

  it('returns true for any mode when paused', () => {
    let session = createInteractiveSession('autonomous')
    session = pause(session)
    expect(canSteer(session)).toBe(true)
  })
})

describe('steer', () => {
  it('accepts steering commands in collaborative mode', () => {
    const session = createInteractiveSession('collaborative')
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'skip' }
    const steered = steer(session, cmd)
    expect(steered.steeringHistory).toHaveLength(1)
    expect(steered.progressStream).toHaveLength(1)
    expect(steered.progressStream[0]!.type).toBe('steering')
  })

  it('ignores steering in autonomous mode', () => {
    const session = createInteractiveSession('autonomous')
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'retry' }
    const result = steer(session, cmd)
    expect(result).toBe(session) // no-op, same reference
  })

  it('ignores steering in supervised mode when not paused', () => {
    const session = createInteractiveSession('supervised')
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'skip' }
    const result = steer(session, cmd)
    expect(result).toBe(session)
  })

  it('accepts steering when paused in supervised mode', () => {
    let session = createInteractiveSession('supervised')
    session = pause(session)
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'retry' }
    const steered = steer(session, cmd)
    expect(steered.steeringHistory).toHaveLength(2) // pause + retry
  })
})

describe('changeApproach', () => {
  it('records approach change in collaborative mode', () => {
    const session = createInteractiveSession('collaborative')
    const updated = changeApproach(session, 'frontend', 'use server components')
    expect(updated.steeringHistory).toHaveLength(1)
    expect(updated.steeringHistory[0]!.command).toBe('change_approach')
    expect(updated.progressStream).toHaveLength(1)
    expect(updated.progressStream[0]!.expertId).toBe('frontend')
  })

  it('is a no-op in autonomous mode', () => {
    const session = createInteractiveSession('autonomous')
    const result = changeApproach(session, 'frontend', 'use SSR')
    expect(result).toBe(session)
  })
})

// ── Pause / resume / abort ────────────────────────────────────────────────────

describe('pause / resume / abort', () => {
  it('pauses a session', () => {
    const session = createInteractiveSession('autonomous')
    const paused = pause(session)
    expect(paused.paused).toBe(true)
    expect(paused.steeringHistory).toHaveLength(1)
    expect(paused.steeringHistory[0]!.command).toBe('pause')
  })

  it('is idempotent — pausing twice returns same reference', () => {
    const session = createInteractiveSession('autonomous')
    const first = pause(session)
    const second = pause(first)
    expect(second).toBe(first)
  })

  it('resumes a paused session', () => {
    let session = createInteractiveSession('autonomous')
    session = pause(session)
    const resumed = resume(session)
    expect(resumed.paused).toBe(false)
    expect(resumed.steeringHistory).toHaveLength(2) // pause + resume
  })

  it('resuming a non-paused session is a no-op', () => {
    const session = createInteractiveSession('autonomous')
    const result = resume(session)
    expect(result).toBe(session)
  })

  it('aborts a session with a reason', () => {
    const session = createInteractiveSession('collaborative')
    const aborted = abort(session, 'wrong direction')
    expect(aborted.paused).toBe(true)
    expect(aborted.steeringHistory).toHaveLength(1)
    expect(aborted.steeringHistory[0]!.command).toBe('abort')
    expect(aborted.steeringHistory[0]!.payload).toBe('wrong direction')
  })

  it('abort records a steering progress event', () => {
    const session = createInteractiveSession('autonomous')
    const aborted = abort(session, 'tests failing')
    expect(aborted.progressStream).toHaveLength(1)
    expect(aborted.progressStream[0]!.type).toBe('steering')
    expect(aborted.progressStream[0]!.data?.['command']).toBe('abort')
  })
})

// ── Mode transitions ──────────────────────────────────────────────────────────

describe('escalateMode', () => {
  it('autonomous → supervised', () => {
    const session = createInteractiveSession('autonomous')
    const escalated = escalateMode(session)
    expect(escalated.mode).toBe('supervised')
  })

  it('supervised → collaborative', () => {
    const session = createInteractiveSession('supervised')
    const escalated = escalateMode(session)
    expect(escalated.mode).toBe('collaborative')
  })

  it('collaborative stays collaborative (ceiling)', () => {
    const session = createInteractiveSession('collaborative')
    const result = escalateMode(session)
    expect(result).toBe(session)
  })
})

describe('relaxMode', () => {
  it('collaborative → supervised', () => {
    const session = createInteractiveSession('collaborative')
    const relaxed = relaxMode(session)
    expect(relaxed.mode).toBe('supervised')
  })

  it('supervised → autonomous', () => {
    const session = createInteractiveSession('supervised')
    const relaxed = relaxMode(session)
    expect(relaxed.mode).toBe('autonomous')
  })

  it('autonomous stays autonomous (floor)', () => {
    const session = createInteractiveSession('autonomous')
    const result = relaxMode(session)
    expect(result).toBe(session)
  })
})

describe('mode round-trip', () => {
  it('escalate then relax returns to original mode', () => {
    const session = createInteractiveSession('supervised')
    const escalated = escalateMode(session)
    const relaxed = relaxMode(escalated)
    expect(relaxed.mode).toBe('supervised')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('steering in autonomous mode is a no-op', () => {
    const session = createInteractiveSession('autonomous')
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'add_instruction', payload: 'use vitest' }
    const result = steer(session, cmd)
    expect(result).toBe(session)
    expect(result.steeringHistory).toHaveLength(0)
  })

  it('double-approve is a no-op (same reference)', () => {
    let session = createInteractiveSession('supervised')
    session = approveGate(session, 'gate-plan')
    const second = approveGate(session, 'gate-plan')
    expect(second).toBe(session)
  })

  it('empty session has correct summary', () => {
    const session = createInteractiveSession('autonomous')
    const summary = getProgressSummary(session)
    expect(summary.totalSteps).toBe(0)
    expect(summary.completed).toBe(0)
    expect(summary.failed).toBe(0)
    expect(summary.pending).toBe(0)
  })

  it('approve/reject/skip on unknown gate returns same session', () => {
    const session = createInteractiveSession('supervised')
    expect(approveGate(session, 'nope')).toBe(session)
    expect(rejectGate(session, 'nope', 'no')).toBe(session)
    expect(skipGate(session, 'nope')).toBe(session)
  })

  it('session state is fully immutable across operations', () => {
    const original = createInteractiveSession('collaborative')
    const withProgress = emitProgress(original, { type: 'step_started', expertId: 'x' })
    const withGate = reachGate(withProgress, 'gate-plan', { data: 1 })
    const withSteer = steer(withGate, { timestamp: new Date().toISOString(), command: 'pause' })

    expect(original.progressStream).toHaveLength(0)
    expect(original.steeringHistory).toHaveLength(0)
    expect(withProgress.progressStream).toHaveLength(1)
    expect(withGate.progressStream).toHaveLength(2)
    expect(withSteer.steeringHistory).toHaveLength(1)
  })

  it('abort works from any mode', () => {
    for (const mode of ['autonomous', 'supervised', 'collaborative'] as const) {
      const session = createInteractiveSession(mode)
      const aborted = abort(session, 'emergency')
      expect(aborted.paused).toBe(true)
      expect(aborted.steeringHistory[0]!.command).toBe('abort')
    }
  })

  it('pause then steer works in autonomous mode', () => {
    let session = createInteractiveSession('autonomous')
    expect(canSteer(session)).toBe(false)
    session = pause(session)
    expect(canSteer(session)).toBe(true)
    const cmd: SteeringCommand = { timestamp: new Date().toISOString(), command: 'add_instruction', payload: 'try approach B' }
    const steered = steer(session, cmd)
    expect(steered.steeringHistory).toHaveLength(2) // pause + instruction
  })

  it('formatProgressBar handles elapsed > 60s', () => {
    const summary: ProgressSummary = {
      totalSteps: 1, completed: 1, failed: 0, pending: 0,
      currentExpert: undefined, elapsedTime: 90_000,
    }
    const bar = formatProgressBar(summary)
    expect(bar).toContain('1m30s')
  })
})

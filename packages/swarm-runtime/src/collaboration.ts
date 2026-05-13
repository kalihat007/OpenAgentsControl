// ── Types ────────────────────────────────────────────────────────────────────

export type ParticipantRole = "lead" | "contributor" | "reviewer";
export type ParticipantStatus = "idle" | "working" | "blocked" | "done";
export type HandoffStatus = "pending" | "accepted" | "rejected";
export type ConflictType = "concurrent_edit" | "dependency_conflict";
export type ConflictResolution = "merge" | "expert_priority" | "user_decision";
export type ConflictResolutionStrategy = "auto" | "manual";
export type PhaseGate = "auto" | "approval";
export type CollaborationState = "active" | "completed" | "stalled";

export interface Participant {
  expertId: string;
  role: ParticipantRole;
  assignedFiles: string[];
  status: ParticipantStatus;
}

export interface ScratchpadEntry {
  id: string;
  authorId: string;
  type: "artifact" | "decision" | "question" | "note";
  content: string;
  references: string[];
  timestamp: string;
}

export interface Handoff {
  id: string;
  fromExpert: string;
  toExpert: string;
  artifact: string;
  context: string;
  status: HandoffStatus;
  timestamp: string;
}

export interface FileConflict {
  filePath: string;
  experts: string[];
  type: ConflictType;
  resolution?: ConflictResolution;
}

export type CollaborationEventType =
  | "participant.joined"
  | "participant.removed"
  | "artifact.posted"
  | "handoff.requested"
  | "handoff.accepted"
  | "handoff.rejected"
  | "conflict.detected"
  | "conflict.resolved"
  | "phase.completed";

export interface CollaborationEvent {
  type: CollaborationEventType;
  timestamp: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CollaborationPhase {
  name: string;
  participants: string[];
  gate: PhaseGate;
}

export interface CollaborationConfig {
  conflictResolution: ConflictResolutionStrategy;
  maxParticipants: number;
  requireReview: boolean;
  phases: CollaborationPhase[];
}

export interface CollaborationSession {
  id: string;
  objective: string;
  participants: Participant[];
  scratchpad: ScratchpadEntry[];
  handoffs: Handoff[];
  conflicts: FileConflict[];
  events: CollaborationEvent[];
  config: CollaborationConfig;
  currentPhaseIndex: number;
  state: CollaborationState;
  createdAt: string;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

function now(): string {
  return new Date().toISOString();
}

function appendEvent(
  session: CollaborationSession,
  type: CollaborationEventType,
  message: string,
  data?: Record<string, unknown>,
): CollaborationSession {
  const event: CollaborationEvent = { type, timestamp: now(), message, data };
  return { ...session, events: [...session.events, event] };
}

const DEFAULT_CONFIG: CollaborationConfig = {
  conflictResolution: "auto",
  maxParticipants: 10,
  requireReview: false,
  phases: [],
};

const ROLE_PRIORITY: Record<ParticipantRole, number> = {
  lead: 3,
  reviewer: 2,
  contributor: 1,
};

// ── Session management ───────────────────────────────────────────────────────

export function createCollaborationSession(
  objective: string,
  participants: Participant[],
  config?: Partial<CollaborationConfig>,
): CollaborationSession {
  const merged: CollaborationConfig = { ...DEFAULT_CONFIG, ...config };
  const session: CollaborationSession = {
    id: nextId("collab"),
    objective,
    participants,
    scratchpad: [],
    handoffs: [],
    conflicts: [],
    events: [],
    config: merged,
    currentPhaseIndex: 0,
    state: "active",
    createdAt: now(),
  };
  return participants.reduce(
    (s, p) => appendEvent(s, "participant.joined", `${p.expertId} joined as ${p.role}`, {
      expertId: p.expertId,
      role: p.role,
    }),
    session,
  );
}

export function addParticipant(
  session: CollaborationSession,
  participant: Participant,
): CollaborationSession {
  const updated: CollaborationSession = {
    ...session,
    participants: [...session.participants, participant],
  };
  return appendEvent(updated, "participant.joined", `${participant.expertId} joined as ${participant.role}`, {
    expertId: participant.expertId,
    role: participant.role,
  });
}

export function removeParticipant(
  session: CollaborationSession,
  expertId: string,
): CollaborationSession {
  const updated: CollaborationSession = {
    ...session,
    participants: session.participants.filter((p) => p.expertId !== expertId),
  };
  return appendEvent(updated, "participant.removed", `${expertId} removed`, {
    expertId,
  });
}

export function updateParticipantStatus(
  session: CollaborationSession,
  expertId: string,
  status: ParticipantStatus,
): CollaborationSession {
  return {
    ...session,
    participants: session.participants.map((p) =>
      p.expertId === expertId ? { ...p, status } : p,
    ),
  };
}

// ── Scratchpad ───────────────────────────────────────────────────────────────

export function postToScratchpad(
  session: CollaborationSession,
  entry: Omit<ScratchpadEntry, "id" | "timestamp">,
): CollaborationSession {
  const full: ScratchpadEntry = { ...entry, id: nextId("sp"), timestamp: now() };
  const updated: CollaborationSession = {
    ...session,
    scratchpad: [...session.scratchpad, full],
  };
  return appendEvent(updated, "artifact.posted", `${entry.authorId} posted ${entry.type}`, {
    entryId: full.id,
    authorId: entry.authorId,
    entryType: entry.type,
  });
}

export function getScratchpadByType(
  session: CollaborationSession,
  type: ScratchpadEntry["type"],
): ScratchpadEntry[] {
  return session.scratchpad.filter((e) => e.type === type);
}

export function getScratchpadByAuthor(
  session: CollaborationSession,
  expertId: string,
): ScratchpadEntry[] {
  return session.scratchpad.filter((e) => e.authorId === expertId);
}

// ── Handoff protocol ─────────────────────────────────────────────────────────

export function requestHandoff(
  session: CollaborationSession,
  fromExpert: string,
  toExpert: string,
  artifact: string,
  context: string,
): CollaborationSession {
  const handoff: Handoff = {
    id: nextId("ho"),
    fromExpert,
    toExpert,
    artifact,
    context,
    status: "pending",
    timestamp: now(),
  };
  const updated: CollaborationSession = {
    ...session,
    handoffs: [...session.handoffs, handoff],
  };
  return appendEvent(updated, "handoff.requested", `${fromExpert} → ${toExpert}: ${artifact}`, {
    handoffId: handoff.id,
    fromExpert,
    toExpert,
  });
}

export function acceptHandoff(
  session: CollaborationSession,
  handoffId: string,
): CollaborationSession {
  const updated: CollaborationSession = {
    ...session,
    handoffs: session.handoffs.map((h) =>
      h.id === handoffId ? { ...h, status: "accepted" as const } : h,
    ),
  };
  const handoff = session.handoffs.find((h) => h.id === handoffId);
  return appendEvent(updated, "handoff.accepted", `Handoff ${handoffId} accepted`, {
    handoffId,
    toExpert: handoff?.toExpert,
  });
}

export function rejectHandoff(
  session: CollaborationSession,
  handoffId: string,
  reason: string,
): CollaborationSession {
  const updated: CollaborationSession = {
    ...session,
    handoffs: session.handoffs.map((h) =>
      h.id === handoffId ? { ...h, status: "rejected" as const } : h,
    ),
  };
  return appendEvent(updated, "handoff.rejected", `Handoff ${handoffId} rejected: ${reason}`, {
    handoffId,
    reason,
  });
}

export function getPendingHandoffs(
  session: CollaborationSession,
  expertId: string,
): Handoff[] {
  return session.handoffs.filter(
    (h) => h.toExpert === expertId && h.status === "pending",
  );
}

// ── Conflict detection & resolution ──────────────────────────────────────────

export function detectFileConflicts(
  session: CollaborationSession,
): FileConflict[] {
  const fileOwners = new Map<string, string[]>();
  for (const p of session.participants) {
    for (const f of p.assignedFiles) {
      const owners = fileOwners.get(f) ?? [];
      owners.push(p.expertId);
      fileOwners.set(f, owners);
    }
  }

  const newConflicts: FileConflict[] = [];
  for (const [filePath, experts] of fileOwners) {
    if (experts.length < 2) continue;
    const existing = session.conflicts.find((c) => c.filePath === filePath);
    if (existing) continue;
    newConflicts.push({ filePath, experts, type: "concurrent_edit" });
  }
  return newConflicts;
}

export function resolveConflict(
  session: CollaborationSession,
  filePath: string,
  resolution: ConflictResolution,
): CollaborationSession {
  const updated: CollaborationSession = {
    ...session,
    conflicts: session.conflicts.map((c) =>
      c.filePath === filePath ? { ...c, resolution } : c,
    ),
  };
  return appendEvent(updated, "conflict.resolved", `Conflict on ${filePath} resolved via ${resolution}`, {
    filePath,
    resolution,
  });
}

export function getUnresolvedConflicts(
  session: CollaborationSession,
): FileConflict[] {
  return session.conflicts.filter((c) => c.resolution === undefined);
}

export function applyAutoConflictResolution(
  session: CollaborationSession,
): CollaborationSession {
  if (session.config.conflictResolution !== "auto") return session;

  const detected = detectFileConflicts(session);
  if (detected.length === 0) return session;

  let result: CollaborationSession = {
    ...session,
    conflicts: [...session.conflicts, ...detected],
  };

  for (const conflict of detected) {
    result = appendEvent(result, "conflict.detected", `Conflict on ${conflict.filePath}`, {
      filePath: conflict.filePath,
      experts: conflict.experts,
    });

    const roles = conflict.experts.map((eid) => {
      const p = result.participants.find((pp) => pp.expertId === eid);
      return { expertId: eid, priority: p ? ROLE_PRIORITY[p.role] : 0 };
    });
    const topPriority = Math.max(...roles.map((r) => r.priority));
    const topCount = roles.filter((r) => r.priority === topPriority).length;

    const resolution: ConflictResolution =
      topCount === 1 ? "expert_priority" : "merge";
    result = resolveConflict(result, conflict.filePath, resolution);
  }
  return result;
}

// ── Phase management ─────────────────────────────────────────────────────────

export function getCurrentPhase(
  session: CollaborationSession,
): CollaborationPhase | undefined {
  return session.config.phases[session.currentPhaseIndex];
}

export function isPhaseComplete(session: CollaborationSession): boolean {
  const phase = getCurrentPhase(session);
  if (!phase) return true;
  return phase.participants.every((eid) => {
    const p = session.participants.find((pp) => pp.expertId === eid);
    return p?.status === "done";
  });
}

export function advancePhase(
  session: CollaborationSession,
): CollaborationSession {
  if (!isPhaseComplete(session)) return session;
  const phase = getCurrentPhase(session);
  if (!phase) return session;

  const nextIndex = session.currentPhaseIndex + 1;
  const hasMore = nextIndex < session.config.phases.length;

  let updated: CollaborationSession = {
    ...session,
    currentPhaseIndex: nextIndex,
    state: hasMore ? "active" : "completed",
  };
  updated = appendEvent(updated, "phase.completed", `Phase "${phase.name}" completed`, {
    phase: phase.name,
    nextPhaseIndex: nextIndex,
  });

  if (hasMore) {
    const nextPhase = session.config.phases[nextIndex]!;
    updated = {
      ...updated,
      participants: updated.participants.map((p) =>
        nextPhase.participants.includes(p.expertId)
          ? { ...p, status: "idle" as const }
          : p,
      ),
    };
  }

  return updated;
}

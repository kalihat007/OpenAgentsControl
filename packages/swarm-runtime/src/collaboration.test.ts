import { describe, test, expect } from "bun:test";
import {
  createCollaborationSession,
  addParticipant,
  removeParticipant,
  updateParticipantStatus,
  postToScratchpad,
  getScratchpadByType,
  getScratchpadByAuthor,
  requestHandoff,
  acceptHandoff,
  rejectHandoff,
  getPendingHandoffs,
  detectFileConflicts,
  resolveConflict,
  getUnresolvedConflicts,
  applyAutoConflictResolution,
  advancePhase,
  getCurrentPhase,
  isPhaseComplete,
} from "./collaboration.js";
import type { Participant, CollaborationConfig } from "./collaboration.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<Participant> & { expertId: string }): Participant {
  return {
    role: "contributor",
    assignedFiles: [],
    status: "idle",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<CollaborationConfig> = {}): CollaborationConfig {
  return {
    conflictResolution: "auto",
    maxParticipants: 10,
    requireReview: false,
    phases: [],
    ...overrides,
  };
}

const lead = makeParticipant({ expertId: "frontend", role: "lead", assignedFiles: ["ui.tsx"] });
const contributor = makeParticipant({ expertId: "backend", assignedFiles: ["api.ts"] });
const reviewer = makeParticipant({ expertId: "security", role: "reviewer", assignedFiles: [] });

// ── createCollaborationSession ───────────────────────────────────────────────

describe("createCollaborationSession", () => {
  test("creates a session with objective and participants", () => {
    const session = createCollaborationSession("Build auth", [lead, contributor]);
    expect(session.objective).toBe("Build auth");
    expect(session.participants).toHaveLength(2);
    expect(session.state).toBe("active");
  });

  test("generates a unique id", () => {
    const s1 = createCollaborationSession("A", []);
    const s2 = createCollaborationSession("B", []);
    expect(s1.id).not.toBe(s2.id);
  });

  test("initializes empty collections", () => {
    const session = createCollaborationSession("test", []);
    expect(session.scratchpad).toEqual([]);
    expect(session.handoffs).toEqual([]);
    expect(session.conflicts).toEqual([]);
  });

  test("sets createdAt timestamp", () => {
    const before = new Date().toISOString();
    const session = createCollaborationSession("test", []);
    const after = new Date().toISOString();
    expect(session.createdAt >= before).toBe(true);
    expect(session.createdAt <= after).toBe(true);
  });

  test("emits participant.joined events for initial participants", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    const joinEvents = session.events.filter((e) => e.type === "participant.joined");
    expect(joinEvents).toHaveLength(2);
    expect(joinEvents[0]!.data?.expertId).toBe("frontend");
    expect(joinEvents[1]!.data?.expertId).toBe("backend");
  });

  test("applies default config when none provided", () => {
    const session = createCollaborationSession("test", []);
    expect(session.config.conflictResolution).toBe("auto");
    expect(session.config.maxParticipants).toBe(10);
    expect(session.config.requireReview).toBe(false);
    expect(session.config.phases).toEqual([]);
  });

  test("merges provided config with defaults", () => {
    const session = createCollaborationSession("test", [], { maxParticipants: 5 });
    expect(session.config.maxParticipants).toBe(5);
    expect(session.config.conflictResolution).toBe("auto");
  });

  test("starts at phase index 0", () => {
    const session = createCollaborationSession("test", []);
    expect(session.currentPhaseIndex).toBe(0);
  });

  test("works with empty participants array", () => {
    const session = createCollaborationSession("solo", []);
    expect(session.participants).toEqual([]);
    expect(session.events).toEqual([]);
  });
});

// ── Participant management ───────────────────────────────────────────────────

describe("addParticipant", () => {
  test("adds a participant to the session", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = addParticipant(session, contributor);
    expect(updated.participants).toHaveLength(2);
    expect(updated.participants[1]!.expertId).toBe("backend");
  });

  test("emits participant.joined event", () => {
    const session = createCollaborationSession("test", []);
    const updated = addParticipant(session, lead);
    const joinEvents = updated.events.filter((e) => e.type === "participant.joined");
    expect(joinEvents).toHaveLength(1);
  });

  test("does not mutate original session", () => {
    const session = createCollaborationSession("test", []);
    addParticipant(session, lead);
    expect(session.participants).toHaveLength(0);
  });
});

describe("removeParticipant", () => {
  test("removes a participant by expertId", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    const updated = removeParticipant(session, "frontend");
    expect(updated.participants).toHaveLength(1);
    expect(updated.participants[0]!.expertId).toBe("backend");
  });

  test("emits participant.removed event", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = removeParticipant(session, "frontend");
    const removedEvents = updated.events.filter((e) => e.type === "participant.removed");
    expect(removedEvents).toHaveLength(1);
    expect(removedEvents[0]!.data?.expertId).toBe("frontend");
  });

  test("is a no-op if expertId not found", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = removeParticipant(session, "nonexistent");
    expect(updated.participants).toHaveLength(1);
  });

  test("does not mutate original session", () => {
    const session = createCollaborationSession("test", [lead]);
    removeParticipant(session, "frontend");
    expect(session.participants).toHaveLength(1);
  });
});

describe("updateParticipantStatus", () => {
  test("updates the status of a participant", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = updateParticipantStatus(session, "frontend", "working");
    expect(updated.participants[0]!.status).toBe("working");
  });

  test("does not affect other participants", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    const updated = updateParticipantStatus(session, "frontend", "done");
    expect(updated.participants[1]!.status).toBe("idle");
  });

  test("returns new session object", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = updateParticipantStatus(session, "frontend", "blocked");
    expect(updated).not.toBe(session);
  });
});

// ── Scratchpad ───────────────────────────────────────────────────────────────

describe("postToScratchpad", () => {
  test("adds an entry to the scratchpad", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = postToScratchpad(session, {
      authorId: "frontend",
      type: "artifact",
      content: "API schema v1",
      references: ["api.ts"],
    });
    expect(updated.scratchpad).toHaveLength(1);
    expect(updated.scratchpad[0]!.content).toBe("API schema v1");
  });

  test("assigns an id and timestamp", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = postToScratchpad(session, {
      authorId: "frontend",
      type: "note",
      content: "hello",
      references: [],
    });
    expect(updated.scratchpad[0]!.id).toBeTruthy();
    expect(new Date(updated.scratchpad[0]!.timestamp).getTime()).not.toBeNaN();
  });

  test("emits artifact.posted event", () => {
    const session = createCollaborationSession("test", []);
    const updated = postToScratchpad(session, {
      authorId: "frontend",
      type: "decision",
      content: "Use JWT",
      references: [],
    });
    const posted = updated.events.filter((e) => e.type === "artifact.posted");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.data?.entryType).toBe("decision");
  });

  test("does not mutate original session", () => {
    const session = createCollaborationSession("test", []);
    postToScratchpad(session, {
      authorId: "frontend",
      type: "note",
      content: "test",
      references: [],
    });
    expect(session.scratchpad).toHaveLength(0);
  });

  test("accumulates multiple entries", () => {
    let session = createCollaborationSession("test", []);
    session = postToScratchpad(session, {
      authorId: "frontend",
      type: "artifact",
      content: "Schema",
      references: [],
    });
    session = postToScratchpad(session, {
      authorId: "backend",
      type: "question",
      content: "Which DB?",
      references: [],
    });
    expect(session.scratchpad).toHaveLength(2);
  });
});

describe("getScratchpadByType", () => {
  test("filters entries by type", () => {
    let session = createCollaborationSession("test", []);
    session = postToScratchpad(session, {
      authorId: "a",
      type: "artifact",
      content: "schema",
      references: [],
    });
    session = postToScratchpad(session, {
      authorId: "b",
      type: "question",
      content: "why?",
      references: [],
    });
    session = postToScratchpad(session, {
      authorId: "a",
      type: "artifact",
      content: "interface",
      references: [],
    });
    expect(getScratchpadByType(session, "artifact")).toHaveLength(2);
    expect(getScratchpadByType(session, "question")).toHaveLength(1);
    expect(getScratchpadByType(session, "note")).toHaveLength(0);
  });
});

describe("getScratchpadByAuthor", () => {
  test("filters entries by author", () => {
    let session = createCollaborationSession("test", []);
    session = postToScratchpad(session, {
      authorId: "frontend",
      type: "artifact",
      content: "x",
      references: [],
    });
    session = postToScratchpad(session, {
      authorId: "backend",
      type: "note",
      content: "y",
      references: [],
    });
    session = postToScratchpad(session, {
      authorId: "frontend",
      type: "decision",
      content: "z",
      references: [],
    });
    expect(getScratchpadByAuthor(session, "frontend")).toHaveLength(2);
    expect(getScratchpadByAuthor(session, "backend")).toHaveLength(1);
    expect(getScratchpadByAuthor(session, "nobody")).toHaveLength(0);
  });
});

// ── Handoff protocol ─────────────────────────────────────────────────────────

describe("requestHandoff", () => {
  test("creates a pending handoff", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    const updated = requestHandoff(session, "frontend", "backend", "auth-schema", "Need DB layer");
    expect(updated.handoffs).toHaveLength(1);
    expect(updated.handoffs[0]!.status).toBe("pending");
    expect(updated.handoffs[0]!.fromExpert).toBe("frontend");
    expect(updated.handoffs[0]!.toExpert).toBe("backend");
  });

  test("emits handoff.requested event", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    const updated = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const events = updated.events.filter((e) => e.type === "handoff.requested");
    expect(events).toHaveLength(1);
  });

  test("does not mutate original session", () => {
    const session = createCollaborationSession("test", [lead, contributor]);
    requestHandoff(session, "frontend", "backend", "schema", "ctx");
    expect(session.handoffs).toHaveLength(0);
  });
});

describe("acceptHandoff", () => {
  test("sets handoff status to accepted", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    const updated = acceptHandoff(session, handoffId);
    expect(updated.handoffs[0]!.status).toBe("accepted");
  });

  test("emits handoff.accepted event", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    const updated = acceptHandoff(session, handoffId);
    const events = updated.events.filter((e) => e.type === "handoff.accepted");
    expect(events).toHaveLength(1);
  });

  test("does not affect other handoffs", () => {
    let session = createCollaborationSession("test", [lead, contributor, reviewer]);
    session = requestHandoff(session, "frontend", "backend", "schema", "a");
    session = requestHandoff(session, "frontend", "security", "audit", "b");
    const handoffId = session.handoffs[0]!.id;
    const updated = acceptHandoff(session, handoffId);
    expect(updated.handoffs[0]!.status).toBe("accepted");
    expect(updated.handoffs[1]!.status).toBe("pending");
  });
});

describe("rejectHandoff", () => {
  test("sets handoff status to rejected", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    const updated = rejectHandoff(session, handoffId, "Not ready yet");
    expect(updated.handoffs[0]!.status).toBe("rejected");
  });

  test("emits handoff.rejected event with reason", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    const updated = rejectHandoff(session, handoffId, "Incomplete");
    const events = updated.events.filter((e) => e.type === "handoff.rejected");
    expect(events).toHaveLength(1);
    expect(events[0]!.data?.reason).toBe("Incomplete");
  });
});

describe("getPendingHandoffs", () => {
  test("returns pending handoffs for a specific expert", () => {
    let session = createCollaborationSession("test", [lead, contributor, reviewer]);
    session = requestHandoff(session, "frontend", "backend", "schema", "a");
    session = requestHandoff(session, "frontend", "security", "audit", "b");
    session = requestHandoff(session, "security", "backend", "findings", "c");
    expect(getPendingHandoffs(session, "backend")).toHaveLength(2);
    expect(getPendingHandoffs(session, "security")).toHaveLength(1);
    expect(getPendingHandoffs(session, "frontend")).toHaveLength(0);
  });

  test("excludes accepted and rejected handoffs", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "a", "x");
    session = requestHandoff(session, "frontend", "backend", "b", "y");
    const firstId = session.handoffs[0]!.id;
    session = acceptHandoff(session, firstId);
    expect(getPendingHandoffs(session, "backend")).toHaveLength(1);
  });

  test("returns empty array when no pending handoffs", () => {
    const session = createCollaborationSession("test", [lead]);
    expect(getPendingHandoffs(session, "frontend")).toEqual([]);
  });
});

describe("handoff lifecycle", () => {
  test("full request → accept flow", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "Here's the API schema");
    expect(session.handoffs[0]!.status).toBe("pending");

    const handoffId = session.handoffs[0]!.id;
    session = acceptHandoff(session, handoffId);
    expect(session.handoffs[0]!.status).toBe("accepted");
    expect(getPendingHandoffs(session, "backend")).toHaveLength(0);
  });

  test("full request → reject flow", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    session = rejectHandoff(session, handoffId, "Need more context");
    expect(session.handoffs[0]!.status).toBe("rejected");
    expect(getPendingHandoffs(session, "backend")).toHaveLength(0);
  });
});

// ── Conflict detection & resolution ──────────────────────────────────────────

describe("detectFileConflicts", () => {
  test("detects overlapping file assignments", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["shared.ts", "a.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["shared.ts", "b.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    const conflicts = detectFileConflicts(session);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.filePath).toBe("shared.ts");
    expect(conflicts[0]!.experts).toContain("a");
    expect(conflicts[0]!.experts).toContain("b");
    expect(conflicts[0]!.type).toBe("concurrent_edit");
  });

  test("returns empty when no overlapping files", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["a.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["b.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    expect(detectFileConflicts(session)).toEqual([]);
  });

  test("detects multiple conflicts", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["x.ts", "y.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["x.ts", "y.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    expect(detectFileConflicts(session)).toHaveLength(2);
  });

  test("detects three-way conflicts", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["shared.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["shared.ts"] });
    const p3 = makeParticipant({ expertId: "c", assignedFiles: ["shared.ts"] });
    const session = createCollaborationSession("test", [p1, p2, p3]);
    const conflicts = detectFileConflicts(session);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.experts).toHaveLength(3);
  });

  test("skips already-recorded conflicts", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["shared.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["shared.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);

    const withConflict = {
      ...session,
      conflicts: [{ filePath: "shared.ts", experts: ["a", "b"], type: "concurrent_edit" as const }],
    };
    expect(detectFileConflicts(withConflict)).toEqual([]);
  });

  test("returns empty for empty session", () => {
    const session = createCollaborationSession("test", []);
    expect(detectFileConflicts(session)).toEqual([]);
  });
});

describe("resolveConflict", () => {
  test("sets resolution on a conflict", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["f.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["f.ts"] });
    let session = createCollaborationSession("test", [p1, p2]);
    const conflicts = detectFileConflicts(session);
    session = { ...session, conflicts };
    const updated = resolveConflict(session, "f.ts", "merge");
    expect(updated.conflicts[0]!.resolution).toBe("merge");
  });

  test("emits conflict.resolved event", () => {
    let session = createCollaborationSession("test", []);
    session = { ...session, conflicts: [{ filePath: "x.ts", experts: ["a", "b"], type: "concurrent_edit" }] };
    const updated = resolveConflict(session, "x.ts", "user_decision");
    const events = updated.events.filter((e) => e.type === "conflict.resolved");
    expect(events).toHaveLength(1);
  });
});

describe("getUnresolvedConflicts", () => {
  test("returns only unresolved conflicts", () => {
    let session = createCollaborationSession("test", []);
    session = {
      ...session,
      conflicts: [
        { filePath: "a.ts", experts: ["x", "y"], type: "concurrent_edit", resolution: "merge" },
        { filePath: "b.ts", experts: ["x", "z"], type: "concurrent_edit" },
      ],
    };
    const unresolved = getUnresolvedConflicts(session);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.filePath).toBe("b.ts");
  });

  test("returns empty when all resolved", () => {
    let session = createCollaborationSession("test", []);
    session = {
      ...session,
      conflicts: [
        { filePath: "a.ts", experts: ["x", "y"], type: "concurrent_edit", resolution: "merge" },
      ],
    };
    expect(getUnresolvedConflicts(session)).toEqual([]);
  });
});

describe("applyAutoConflictResolution", () => {
  test("auto-resolves with expert_priority when roles differ", () => {
    const p1 = makeParticipant({ expertId: "lead-dev", role: "lead", assignedFiles: ["shared.ts"] });
    const p2 = makeParticipant({ expertId: "helper", role: "contributor", assignedFiles: ["shared.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    const updated = applyAutoConflictResolution(session);
    expect(updated.conflicts).toHaveLength(1);
    expect(updated.conflicts[0]!.resolution).toBe("expert_priority");
  });

  test("auto-resolves with merge when roles are equal", () => {
    const p1 = makeParticipant({ expertId: "dev1", role: "contributor", assignedFiles: ["shared.ts"] });
    const p2 = makeParticipant({ expertId: "dev2", role: "contributor", assignedFiles: ["shared.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    const updated = applyAutoConflictResolution(session);
    expect(updated.conflicts).toHaveLength(1);
    expect(updated.conflicts[0]!.resolution).toBe("merge");
  });

  test("skips resolution when strategy is manual", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["f.ts"] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: ["f.ts"] });
    const session = createCollaborationSession("test", [p1, p2], { conflictResolution: "manual" });
    const updated = applyAutoConflictResolution(session);
    expect(updated.conflicts).toHaveLength(0);
  });

  test("no-op when no conflicts exist", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: ["a.ts"] });
    const session = createCollaborationSession("test", [p1]);
    const updated = applyAutoConflictResolution(session);
    expect(updated.conflicts).toHaveLength(0);
  });

  test("emits conflict.detected and conflict.resolved events", () => {
    const p1 = makeParticipant({ expertId: "a", role: "lead", assignedFiles: ["f.ts"] });
    const p2 = makeParticipant({ expertId: "b", role: "contributor", assignedFiles: ["f.ts"] });
    const session = createCollaborationSession("test", [p1, p2]);
    const updated = applyAutoConflictResolution(session);
    expect(updated.events.some((e) => e.type === "conflict.detected")).toBe(true);
    expect(updated.events.some((e) => e.type === "conflict.resolved")).toBe(true);
  });
});

// ── Phase management ─────────────────────────────────────────────────────────

describe("getCurrentPhase", () => {
  test("returns the current phase", () => {
    const phases = [
      { name: "design", participants: ["frontend"], gate: "auto" as const },
      { name: "build", participants: ["backend"], gate: "approval" as const },
    ];
    const session = createCollaborationSession("test", [lead, contributor], { phases });
    const phase = getCurrentPhase(session);
    expect(phase?.name).toBe("design");
  });

  test("returns undefined when no phases configured", () => {
    const session = createCollaborationSession("test", []);
    expect(getCurrentPhase(session)).toBeUndefined();
  });

  test("returns undefined when past last phase", () => {
    const phases = [{ name: "only", participants: [], gate: "auto" as const }];
    let session = createCollaborationSession("test", [], { phases });
    session = advancePhase(session);
    expect(getCurrentPhase(session)).toBeUndefined();
  });
});

describe("isPhaseComplete", () => {
  test("returns true when all phase participants are done", () => {
    const phases = [{ name: "design", participants: ["frontend"], gate: "auto" as const }];
    let session = createCollaborationSession("test", [lead], { phases });
    session = updateParticipantStatus(session, "frontend", "done");
    expect(isPhaseComplete(session)).toBe(true);
  });

  test("returns false when a participant is not done", () => {
    const phases = [{ name: "design", participants: ["frontend"], gate: "auto" as const }];
    const session = createCollaborationSession("test", [lead], { phases });
    expect(isPhaseComplete(session)).toBe(false);
  });

  test("returns true when no phases configured", () => {
    const session = createCollaborationSession("test", []);
    expect(isPhaseComplete(session)).toBe(true);
  });
});

describe("advancePhase", () => {
  test("advances to the next phase when current is complete", () => {
    const phases = [
      { name: "design", participants: ["frontend"], gate: "auto" as const },
      { name: "build", participants: ["backend"], gate: "auto" as const },
    ];
    let session = createCollaborationSession("test", [lead, contributor], { phases });
    session = updateParticipantStatus(session, "frontend", "done");
    const updated = advancePhase(session);
    expect(updated.currentPhaseIndex).toBe(1);
    expect(getCurrentPhase(updated)?.name).toBe("build");
  });

  test("does not advance when phase is not complete", () => {
    const phases = [{ name: "design", participants: ["frontend"], gate: "auto" as const }];
    const session = createCollaborationSession("test", [lead], { phases });
    const updated = advancePhase(session);
    expect(updated.currentPhaseIndex).toBe(0);
  });

  test("emits phase.completed event", () => {
    const phases = [
      { name: "design", participants: ["frontend"], gate: "auto" as const },
      { name: "build", participants: ["backend"], gate: "auto" as const },
    ];
    let session = createCollaborationSession("test", [lead, contributor], { phases });
    session = updateParticipantStatus(session, "frontend", "done");
    const updated = advancePhase(session);
    const events = updated.events.filter((e) => e.type === "phase.completed");
    expect(events).toHaveLength(1);
    expect(events[0]!.data?.phase).toBe("design");
  });

  test("sets state to completed when last phase finishes", () => {
    const phases = [{ name: "only", participants: ["frontend"], gate: "auto" as const }];
    let session = createCollaborationSession("test", [lead], { phases });
    session = updateParticipantStatus(session, "frontend", "done");
    const updated = advancePhase(session);
    expect(updated.state).toBe("completed");
  });

  test("resets next-phase participant statuses to idle", () => {
    const phases = [
      { name: "design", participants: ["frontend"], gate: "auto" as const },
      { name: "build", participants: ["backend"], gate: "auto" as const },
    ];
    let session = createCollaborationSession("test", [lead, contributor], { phases });
    session = updateParticipantStatus(session, "frontend", "done");
    session = updateParticipantStatus(session, "backend", "working");
    const updated = advancePhase(session);
    const backend = updated.participants.find((p) => p.expertId === "backend");
    expect(backend?.status).toBe("idle");
  });

  test("is a no-op when no phases configured", () => {
    const session = createCollaborationSession("test", []);
    const updated = advancePhase(session);
    expect(updated).toBe(session);
  });
});

// ── Event tracking ───────────────────────────────────────────────────────────

describe("event tracking", () => {
  test("events accumulate across operations", () => {
    let session = createCollaborationSession("test", [lead, contributor]);
    session = postToScratchpad(session, {
      authorId: "frontend",
      type: "artifact",
      content: "schema",
      references: [],
    });
    session = requestHandoff(session, "frontend", "backend", "schema", "ctx");
    const handoffId = session.handoffs[0]!.id;
    session = acceptHandoff(session, handoffId);

    const types = session.events.map((e) => e.type);
    expect(types).toContain("participant.joined");
    expect(types).toContain("artifact.posted");
    expect(types).toContain("handoff.requested");
    expect(types).toContain("handoff.accepted");
  });

  test("every event has a valid timestamp", () => {
    let session = createCollaborationSession("test", [lead]);
    session = postToScratchpad(session, {
      authorId: "frontend",
      type: "note",
      content: "hi",
      references: [],
    });
    for (const event of session.events) {
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    }
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("self-handoff (same expert) still creates a valid handoff", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = requestHandoff(session, "frontend", "frontend", "self-review", "Re-check");
    expect(updated.handoffs).toHaveLength(1);
    expect(updated.handoffs[0]!.fromExpert).toBe("frontend");
    expect(updated.handoffs[0]!.toExpert).toBe("frontend");
  });

  test("accept non-existent handoff does not crash", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = acceptHandoff(session, "no-such-id");
    expect(updated.handoffs).toHaveLength(0);
  });

  test("reject non-existent handoff does not crash", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = rejectHandoff(session, "no-such-id", "reason");
    expect(updated.handoffs).toHaveLength(0);
  });

  test("participant with empty assignedFiles produces no conflicts", () => {
    const p1 = makeParticipant({ expertId: "a", assignedFiles: [] });
    const p2 = makeParticipant({ expertId: "b", assignedFiles: [] });
    const session = createCollaborationSession("test", [p1, p2]);
    expect(detectFileConflicts(session)).toEqual([]);
  });

  test("update status for non-existent expert is harmless", () => {
    const session = createCollaborationSession("test", [lead]);
    const updated = updateParticipantStatus(session, "ghost", "working");
    expect(updated.participants).toHaveLength(1);
    expect(updated.participants[0]!.status).toBe("idle");
  });

  test("resolve conflict on non-existent file is harmless", () => {
    const session = createCollaborationSession("test", []);
    const updated = resolveConflict(session, "nope.ts", "merge");
    expect(updated.conflicts).toHaveLength(0);
  });

  test("multiple phases advance sequentially", () => {
    const phases = [
      { name: "p1", participants: ["frontend"], gate: "auto" as const },
      { name: "p2", participants: ["backend"], gate: "auto" as const },
      { name: "p3", participants: ["security"], gate: "auto" as const },
    ];
    let session = createCollaborationSession("test", [lead, contributor, reviewer], { phases });

    session = updateParticipantStatus(session, "frontend", "done");
    session = advancePhase(session);
    expect(getCurrentPhase(session)?.name).toBe("p2");

    session = updateParticipantStatus(session, "backend", "done");
    session = advancePhase(session);
    expect(getCurrentPhase(session)?.name).toBe("p3");

    session = updateParticipantStatus(session, "security", "done");
    session = advancePhase(session);
    expect(session.state).toBe("completed");
    expect(getCurrentPhase(session)).toBeUndefined();
  });
});

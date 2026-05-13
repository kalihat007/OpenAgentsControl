import { describe, test, expect } from "bun:test";
import { createSwarmSession, appendSwarmEvent } from "./session.js";
import type { SwarmSession, SwarmTask } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTasks(count: number): SwarmTask[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `task-${i + 1}`,
    title: `Task ${i + 1}`,
    agent: "TestAgent",
  }));
}

// ── createSwarmSession ───────────────────────────────────────────────────────

describe("createSwarmSession", () => {
  test("creates a session with the provided id and objective", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "Build auth module",
      tasks: [],
    });
    expect(session.id).toBe("sess-1");
    expect(session.objective).toBe("Build auth module");
  });

  test("uses provided createdAt timestamp", () => {
    const ts = "2025-01-15T10:00:00.000Z";
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
      createdAt: ts,
    });
    expect(session.createdAt).toBe(ts);
  });

  test("generates a createdAt timestamp when not provided", () => {
    const before = new Date().toISOString();
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    const after = new Date().toISOString();
    expect(session.createdAt >= before).toBe(true);
    expect(session.createdAt <= after).toBe(true);
  });

  test("defaults maxConcurrency to 2", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.maxConcurrency).toBe(2);
  });

  test("uses provided maxConcurrency", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
      maxConcurrency: 8,
    });
    expect(session.maxConcurrency).toBe(8);
  });

  test("stores the provided tasks", () => {
    const tasks = makeTasks(3);
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks,
    });
    expect(session.tasks).toHaveLength(3);
    expect(session.tasks[0]!.id).toBe("task-1");
  });

  test("initializes moduleClaims as empty array", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.moduleClaims).toEqual([]);
  });

  test("initializes contracts as empty array", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.contracts).toEqual([]);
  });

  test("initializes incidents as empty array", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.incidents).toEqual([]);
  });

  test("initializes checkpoints as empty array", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.checkpoints).toEqual([]);
  });

  test("appends a session.created event", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    expect(session.events).toHaveLength(1);
    expect(session.events[0]!.type).toBe("session.created");
    expect(session.events[0]!.message).toBe("Swarm session created");
  });

  test("session.created event has a valid timestamp", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });
    const ts = new Date(session.events[0]!.timestamp);
    expect(ts.getTime()).not.toBeNaN();
  });

  test("works with empty tasks array", () => {
    const session = createSwarmSession({
      id: "sess-empty",
      objective: "nothing",
      tasks: [],
    });
    expect(session.tasks).toEqual([]);
    expect(session.events).toHaveLength(1);
  });

  test("works with maxConcurrency of 1", () => {
    const session = createSwarmSession({
      id: "sess-1",
      objective: "serial",
      tasks: makeTasks(5),
      maxConcurrency: 1,
    });
    expect(session.maxConcurrency).toBe(1);
    expect(session.tasks).toHaveLength(5);
  });
});

// ── appendSwarmEvent ─────────────────────────────────────────────────────────

describe("appendSwarmEvent", () => {
  let baseSession: SwarmSession;

  const setup = () =>
    createSwarmSession({
      id: "sess-1",
      objective: "test",
      tasks: [],
    });

  test("appends an event to session events", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "task.started", "Task started");
    expect(updated.events).toHaveLength(2); // session.created + task.started
    expect(updated.events[1]!.type).toBe("task.started");
  });

  test("returns a new session object (immutability)", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "task.started", "Task started");
    expect(updated).not.toBe(baseSession);
  });

  test("does not mutate the original session", () => {
    baseSession = setup();
    const originalEventCount = baseSession.events.length;
    appendSwarmEvent(baseSession, "task.started", "Task started");
    expect(baseSession.events).toHaveLength(originalEventCount);
  });

  test("event has the correct type and message", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "lock.conflict", "Conflict on auth module");
    const lastEvent = updated.events[updated.events.length - 1]!;
    expect(lastEvent.type).toBe("lock.conflict");
    expect(lastEvent.message).toBe("Conflict on auth module");
  });

  test("event has a valid timestamp", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "task.completed", "Done");
    const lastEvent = updated.events[updated.events.length - 1]!;
    const ts = new Date(lastEvent.timestamp);
    expect(ts.getTime()).not.toBeNaN();
  });

  test("supports custom data on events", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "checkpoint.created", "Checkpoint", {
      artifactCount: 3,
      paths: ["a.ts", "b.ts"],
    });
    const lastEvent = updated.events[updated.events.length - 1]!;
    expect(lastEvent.data).toEqual({
      artifactCount: 3,
      paths: ["a.ts", "b.ts"],
    });
  });

  test("defaults data to empty object when not provided", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "task.failed", "Failure");
    const lastEvent = updated.events[updated.events.length - 1]!;
    expect(lastEvent.data).toEqual({});
  });

  test("preserves all other session fields", () => {
    baseSession = setup();
    const updated = appendSwarmEvent(baseSession, "task.started", "Go");
    expect(updated.id).toBe(baseSession.id);
    expect(updated.objective).toBe(baseSession.objective);
    expect(updated.createdAt).toBe(baseSession.createdAt);
    expect(updated.maxConcurrency).toBe(baseSession.maxConcurrency);
    expect(updated.tasks).toBe(baseSession.tasks);
    expect(updated.moduleClaims).toBe(baseSession.moduleClaims);
    expect(updated.contracts).toBe(baseSession.contracts);
    expect(updated.incidents).toBe(baseSession.incidents);
    expect(updated.checkpoints).toBe(baseSession.checkpoints);
  });

  test("appending multiple events accumulates them in order", () => {
    baseSession = setup();
    const s1 = appendSwarmEvent(baseSession, "task.started", "Start");
    const s2 = appendSwarmEvent(s1, "task.completed", "Done");
    const s3 = appendSwarmEvent(s2, "sync.completed", "Synced");
    expect(s3.events).toHaveLength(4);
    expect(s3.events.map((e) => e.type)).toEqual([
      "session.created",
      "task.started",
      "task.completed",
      "sync.completed",
    ]);
  });

  test("all event types are accepted", () => {
    baseSession = setup();
    const eventTypes = [
      "module.claimed",
      "contract.created",
      "task.chunked",
      "task.ready",
      "task.started",
      "task.completed",
      "task.failed",
      "batch.planned",
      "sync.required",
      "sync.completed",
      "lock.conflict",
      "incident.created",
      "checkpoint.created",
      "gate.required",
      "gate.passed",
    ] as const;

    let session = baseSession;
    for (const eventType of eventTypes) {
      session = appendSwarmEvent(session, eventType, `Test ${eventType}`);
    }
    // session.created + 15 event types
    expect(session.events).toHaveLength(16);
  });
});

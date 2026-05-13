import { describe, test, expect } from "bun:test";
import {
  chunkSwarmTask,
  planSwarmBatches,
  detectLockConflicts,
} from "./scheduler.js";
import type { SwarmTask, SchedulerOptions } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<SwarmTask> & { id: string }): SwarmTask {
  return {
    title: overrides.id,
    agent: "TestAgent",
    ...overrides,
  };
}

// ── chunkSwarmTask ───────────────────────────────────────────────────────────

describe("chunkSwarmTask", () => {
  const parent: SwarmTask = {
    id: "parent-1",
    title: "Build feature",
    agent: "BackendDeveloperAgent",
    role: "backend-developer",
    stage: "implementation",
    executionMode: "parallel",
    dependsOn: ["dep-1"],
    reads: ["src/api.ts"],
    writes: ["src/api.ts"],
    acceptanceCriteria: ["passes CI"],
    metadata: { source: "plan", priority: "high" },
  };

  test("creates the correct number of chunks", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1" },
      { id: "c-2", title: "chunk 2" },
      { id: "c-3", title: "chunk 3" },
    ]);
    expect(chunks).toHaveLength(3);
  });

  test("sets parentTaskId on all chunks", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1" },
      { id: "c-2", title: "chunk 2" },
    ]);
    for (const chunk of chunks) {
      expect(chunk.parentTaskId).toBe("parent-1");
    }
  });

  test("sets 1-based chunkIndex and chunkTotal", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1" },
      { id: "c-2", title: "chunk 2" },
    ]);
    expect(chunks[0]!.chunkIndex).toBe(1);
    expect(chunks[0]!.chunkTotal).toBe(2);
    expect(chunks[1]!.chunkIndex).toBe(2);
    expect(chunks[1]!.chunkTotal).toBe(2);
  });

  test("merges parent dependsOn with chunk dependsOn", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1", dependsOn: ["dep-2"] },
    ]);
    expect(chunks[0]!.dependsOn).toContain("dep-1");
    expect(chunks[0]!.dependsOn).toContain("dep-2");
  });

  test("uses chunk reads when provided, falls back to parent reads", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "with reads", reads: ["src/models.ts"] },
      { id: "c-2", title: "without reads" },
    ]);
    expect(chunks[0]!.reads).toEqual(["src/models.ts"]);
    expect(chunks[1]!.reads).toEqual(["src/api.ts"]);
  });

  test("chunk writes override parent writes (empty if not provided)", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "with writes", writes: ["dist/out.js"] },
      { id: "c-2", title: "without writes" },
    ]);
    expect(chunks[0]!.writes).toEqual(["dist/out.js"]);
    expect(chunks[1]!.writes).toEqual([]);
  });

  test("merges metadata with chunk values overriding parent", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk", metadata: { priority: "low", extra: true } },
    ]);
    expect(chunks[0]!.metadata).toEqual({
      source: "plan",
      priority: "low",
      extra: true,
    });
  });

  test("uses chunk acceptanceCriteria, falls back to parent", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "custom ac", acceptanceCriteria: ["lints clean"] },
      { id: "c-2", title: "inherit ac" },
    ]);
    expect(chunks[0]!.acceptanceCriteria).toEqual(["lints clean"]);
    expect(chunks[1]!.acceptanceCriteria).toEqual(["passes CI"]);
  });

  test("preserves parent stage and executionMode", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1" },
    ]);
    expect(chunks[0]!.stage).toBe("implementation");
    expect(chunks[0]!.executionMode).toBe("parallel");
  });

  test("sets status to pending on all chunks", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk 1" },
      { id: "c-2", title: "chunk 2" },
    ]);
    for (const chunk of chunks) {
      expect(chunk.status).toBe("pending");
    }
  });

  test("returns empty array for empty chunks input", () => {
    const chunks = chunkSwarmTask(parent, []);
    expect(chunks).toEqual([]);
  });

  test("single chunk gets chunkIndex 1 and chunkTotal 1", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "only chunk" },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkIndex).toBe(1);
    expect(chunks[0]!.chunkTotal).toBe(1);
  });

  test("deduplicates merged dependsOn", () => {
    const chunks = chunkSwarmTask(parent, [
      { id: "c-1", title: "chunk", dependsOn: ["dep-1", "dep-1", "dep-2"] },
    ]);
    const deps = chunks[0]!.dependsOn!;
    expect(deps).toHaveLength(new Set(deps).size);
  });
});

// ── detectLockConflicts ──────────────────────────────────────────────────────

describe("detectLockConflicts", () => {
  test("returns no conflicts when tasks have no overlapping paths", () => {
    const a = makeTask({ id: "a", writes: ["src/a.ts"], reads: ["src/b.ts"] });
    const b = makeTask({ id: "b", writes: ["src/c.ts"], reads: ["src/d.ts"] });
    expect(detectLockConflicts(a, b)).toEqual([]);
  });

  test("detects write-write conflict", () => {
    const a = makeTask({ id: "a", writes: ["src/shared.ts"] });
    const b = makeTask({ id: "b", writes: ["src/shared.ts"] });
    const conflicts = detectLockConflicts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe("write-write");
    expect(conflicts[0]!.path).toBe("src/shared.ts");
  });

  test("detects read-write conflict (first writes, second reads)", () => {
    const a = makeTask({ id: "a", writes: ["src/shared.ts"] });
    const b = makeTask({ id: "b", reads: ["src/shared.ts"] });
    const conflicts = detectLockConflicts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe("read-write");
    expect(conflicts[0]!.taskId).toBe("a");
    expect(conflicts[0]!.conflictingTaskId).toBe("b");
  });

  test("detects read-write conflict (second writes, first reads)", () => {
    const a = makeTask({ id: "a", reads: ["src/shared.ts"] });
    const b = makeTask({ id: "b", writes: ["src/shared.ts"] });
    const conflicts = detectLockConflicts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe("read-write");
    expect(conflicts[0]!.taskId).toBe("b");
    expect(conflicts[0]!.conflictingTaskId).toBe("a");
  });

  test("detects module-claim conflict", () => {
    const a = makeTask({ id: "a", moduleClaims: ["auth"] });
    const b = makeTask({ id: "b", moduleClaims: ["auth"] });
    const conflicts = detectLockConflicts(a, b);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toBe("module-claim");
    expect(conflicts[0]!.path).toBe("auth");
  });

  test("allowReadWriteOverlap skips read-write but keeps write-write", () => {
    const a = makeTask({ id: "a", writes: ["src/x.ts"], reads: ["src/y.ts"] });
    const b = makeTask({ id: "b", writes: ["src/x.ts", "src/y.ts"] });
    const opts: SchedulerOptions = { allowReadWriteOverlap: true };
    const conflicts = detectLockConflicts(a, b, opts);
    expect(conflicts.every((c) => c.reason === "write-write")).toBe(true);
    expect(conflicts.some((c) => c.path === "src/x.ts")).toBe(true);
  });

  test("returns empty for tasks with no writes, reads, or claims", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    expect(detectLockConflicts(a, b)).toEqual([]);
  });

  test("returns multiple conflicts for multiple overlapping paths", () => {
    const a = makeTask({
      id: "a",
      writes: ["src/a.ts", "src/b.ts"],
      moduleClaims: ["payments"],
    });
    const b = makeTask({
      id: "b",
      writes: ["src/a.ts", "src/b.ts"],
      moduleClaims: ["payments"],
    });
    const conflicts = detectLockConflicts(a, b);
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });

  test("allowReadWriteOverlap skips module-claim and read-write checks", () => {
    const a = makeTask({ id: "a", moduleClaims: ["auth"], reads: ["src/x.ts"] });
    const b = makeTask({ id: "b", moduleClaims: ["auth"], writes: ["src/x.ts"] });
    const opts: SchedulerOptions = { allowReadWriteOverlap: true };
    const conflicts = detectLockConflicts(a, b, opts);
    expect(conflicts).toEqual([]);
  });
});

// ── planSwarmBatches ─────────────────────────────────────────────────────────

describe("planSwarmBatches", () => {
  test("returns empty result for empty task list", () => {
    const result = planSwarmBatches([]);
    expect(result.batches).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.events).toEqual([]);
  });

  test("single task produces a single batch", () => {
    const tasks = [makeTask({ id: "t-1" })];
    const result = planSwarmBatches(tasks);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.tasks).toHaveLength(1);
    expect(result.batches[0]!.tasks[0]!.id).toBe("t-1");
  });

  test("batch ids are sequentially numbered", () => {
    const tasks = [
      makeTask({ id: "t-1" }),
      makeTask({ id: "t-2", dependsOn: ["t-1"] }),
    ];
    const result = planSwarmBatches(tasks);
    expect(result.batches[0]!.id).toBe("batch-01");
    expect(result.batches[1]!.id).toBe("batch-02");
  });

  test("independent tasks are batched together", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["a.ts"] }),
      makeTask({ id: "t-2", writes: ["b.ts"] }),
      makeTask({ id: "t-3", writes: ["c.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.tasks).toHaveLength(3);
  });

  test("dependent tasks are placed in sequential batches", () => {
    const tasks = [
      makeTask({ id: "t-1" }),
      makeTask({ id: "t-2", dependsOn: ["t-1"] }),
      makeTask({ id: "t-3", dependsOn: ["t-2"] }),
    ];
    const result = planSwarmBatches(tasks);
    expect(result.batches).toHaveLength(3);
    expect(result.batches[0]!.tasks[0]!.id).toBe("t-1");
    expect(result.batches[1]!.tasks[0]!.id).toBe("t-2");
    expect(result.batches[2]!.tasks[0]!.id).toBe("t-3");
  });

  test("already-completed tasks satisfy dependencies immediately", () => {
    const tasks = [
      makeTask({ id: "t-1", status: "completed" }),
      makeTask({ id: "t-2", dependsOn: ["t-1"] }),
    ];
    const result = planSwarmBatches(tasks);
    const allTaskIds = result.batches.flatMap((b) => b.tasks.map((t) => t.id));
    expect(allTaskIds).toContain("t-2");
  });

  test("respects maxConcurrency limit", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["a.ts"] }),
      makeTask({ id: "t-2", writes: ["b.ts"] }),
      makeTask({ id: "t-3", writes: ["c.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 2 });
    expect(result.batches[0]!.tasks).toHaveLength(2);
    expect(result.batches[0]!.blockedTaskIds).toContain("t-3");
  });

  test("write-write conflicts cause tasks to be separated into different batches", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["shared.ts"] }),
      makeTask({ id: "t-2", writes: ["shared.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches).toHaveLength(2);
  });

  test("read-write conflicts cause tasks to be separated by default", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["shared.ts"] }),
      makeTask({ id: "t-2", reads: ["shared.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches).toHaveLength(2);
  });

  test("allowReadWriteOverlap lets read-write tasks coexist in a batch", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["shared.ts"] }),
      makeTask({ id: "t-2", reads: ["shared.ts"] }),
    ];
    const result = planSwarmBatches(tasks, {
      maxConcurrency: 10,
      allowReadWriteOverlap: true,
    });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.tasks).toHaveLength(2);
  });

  test("higher-priority tasks are scheduled first within a batch", () => {
    const tasks = [
      makeTask({ id: "low", priority: 1 }),
      makeTask({ id: "high", priority: 10 }),
      makeTask({ id: "medium", priority: 5 }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 1 });
    expect(result.batches[0]!.tasks[0]!.id).toBe("high");
    expect(result.batches[1]!.tasks[0]!.id).toBe("medium");
    expect(result.batches[2]!.tasks[0]!.id).toBe("low");
  });

  test("tasks with unsatisfied dependencies are returned as blocked", () => {
    const tasks = [
      makeTask({ id: "t-1", dependsOn: ["nonexistent"] }),
    ];
    const result = planSwarmBatches(tasks);
    expect(result.batches).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]!.id).toBe("t-1");
  });

  test("circular dependencies result in blocked tasks", () => {
    const tasks = [
      makeTask({ id: "a", dependsOn: ["b"] }),
      makeTask({ id: "b", dependsOn: ["a"] }),
    ];
    const result = planSwarmBatches(tasks);
    expect(result.batches).toHaveLength(0);
    expect(result.blocked).toHaveLength(2);
  });

  test("batch.writeLocks contains all write paths from batch tasks", () => {
    const tasks = [
      makeTask({ id: "t-1", writes: ["a.ts", "b.ts"] }),
      makeTask({ id: "t-2", writes: ["c.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    const locks = result.batches[0]!.writeLocks;
    expect(locks).toContain("a.ts");
    expect(locks).toContain("b.ts");
    expect(locks).toContain("c.ts");
  });

  test("generates batch.planned and task.ready events", () => {
    const tasks = [makeTask({ id: "t-1" }), makeTask({ id: "t-2" })];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    const batchEvents = result.events.filter((e) => e.type === "batch.planned");
    const readyEvents = result.events.filter((e) => e.type === "task.ready");
    expect(batchEvents).toHaveLength(1);
    expect(readyEvents).toHaveLength(2);
  });

  test("events have valid timestamps", () => {
    const tasks = [makeTask({ id: "t-1" })];
    const result = planSwarmBatches(tasks);
    for (const event of result.events) {
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    }
  });

  test("tasks in batch have status set to ready", () => {
    const tasks = [makeTask({ id: "t-1" }), makeTask({ id: "t-2" })];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    for (const task of result.batches[0]!.tasks) {
      expect(task.status).toBe("ready");
    }
  });

  test("default maxConcurrency is 2", () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask({ id: `t-${i}`, writes: [`file-${i}.ts`] }),
    );
    const result = planSwarmBatches(tasks);
    expect(result.batches[0]!.tasks).toHaveLength(2);
    expect(result.batches[0]!.blockedTaskIds).toHaveLength(4);
  });

  test("diamond dependency graph produces correct batch ordering", () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B", dependsOn: ["A"] }),
      makeTask({ id: "C", dependsOn: ["A"] }),
      makeTask({ id: "D", dependsOn: ["B", "C"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches).toHaveLength(3);
    expect(result.batches[0]!.tasks.map((t) => t.id)).toEqual(["A"]);
    const batch2Ids = result.batches[1]!.tasks.map((t) => t.id).sort();
    expect(batch2Ids).toEqual(["B", "C"]);
    expect(result.batches[2]!.tasks.map((t) => t.id)).toEqual(["D"]);
  });

  test("module-claim conflicts separate tasks into batches", () => {
    const tasks = [
      makeTask({ id: "t-1", moduleClaims: ["auth"] }),
      makeTask({ id: "t-2", moduleClaims: ["auth"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches).toHaveLength(2);
  });

  test("mixed independent and dependent tasks batch correctly", () => {
    const tasks = [
      makeTask({ id: "independent-1", writes: ["a.ts"] }),
      makeTask({ id: "independent-2", writes: ["b.ts"] }),
      makeTask({ id: "dependent", dependsOn: ["independent-1"], writes: ["c.ts"] }),
    ];
    const result = planSwarmBatches(tasks, { maxConcurrency: 10 });
    expect(result.batches[0]!.tasks.map((t) => t.id).sort()).toEqual([
      "independent-1",
      "independent-2",
    ]);
    expect(result.batches[1]!.tasks[0]!.id).toBe("dependent");
  });
});

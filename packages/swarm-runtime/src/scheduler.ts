import type {
  LockConflict,
  SchedulerOptions,
  SchedulerResult,
  SwarmBatch,
  SwarmEvent,
  SwarmTask,
} from "./types.js";

const DEFAULT_MAX_CONCURRENCY = 4;

export function planSwarmBatches(
  tasks: SwarmTask[],
  options: SchedulerOptions = {},
): SchedulerResult {
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const remaining = new Map(tasks.map((task) => [task.id, normalizeTask(task)]));
  const completed = new Set(
    tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.id),
  );
  const batches: SwarmBatch[] = [];
  const events: SwarmEvent[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((task) => dependenciesSatisfied(task, completed))
      .sort(sortByPriority);

    if (ready.length === 0) {
      break;
    }

    const batch = buildSafeBatch(
      `batch-${String(batches.length + 1).padStart(2, "0")}`,
      ready,
      maxConcurrency,
      options,
    );

    if (batch.tasks.length === 0) {
      break;
    }

    batches.push(batch);
    events.push(createEvent("batch.planned", `Planned ${batch.id}`, {
      batchId: batch.id,
      taskIds: batch.tasks.map((task) => task.id),
      blockedTaskIds: batch.blockedTaskIds,
    }));

    for (const task of batch.tasks) {
      completed.add(task.id);
      remaining.delete(task.id);
      events.push(createEvent("task.ready", `Task ${task.id} is ready`, {
        taskId: task.id,
        batchId: batch.id,
      }));
    }
  }

  return {
    batches,
    blocked: [...remaining.values()],
    events,
  };
}

export function detectLockConflicts(
  first: SwarmTask,
  second: SwarmTask,
  options: SchedulerOptions = {},
): LockConflict[] {
  const conflicts: LockConflict[] = [];
  const firstWrites = new Set(first.writes ?? []);
  const secondWrites = new Set(second.writes ?? []);

  for (const path of firstWrites) {
    if (secondWrites.has(path)) {
      conflicts.push({
        taskId: first.id,
        conflictingTaskId: second.id,
        path,
        reason: "write-write",
      });
    }
  }

  if (options.allowReadWriteOverlap) {
    return conflicts;
  }

  const firstReads = new Set(first.reads ?? []);
  const secondReads = new Set(second.reads ?? []);

  for (const path of firstWrites) {
    if (secondReads.has(path)) {
      conflicts.push({
        taskId: first.id,
        conflictingTaskId: second.id,
        path,
        reason: "read-write",
      });
    }
  }

  for (const path of secondWrites) {
    if (firstReads.has(path)) {
      conflicts.push({
        taskId: second.id,
        conflictingTaskId: first.id,
        path,
        reason: "read-write",
      });
    }
  }

  const firstClaims = new Set(first.moduleClaims ?? []);
  const secondClaims = new Set(second.moduleClaims ?? []);

  for (const moduleName of firstClaims) {
    if (secondClaims.has(moduleName)) {
      conflicts.push({
        taskId: first.id,
        conflictingTaskId: second.id,
        path: moduleName,
        reason: "module-claim",
      });
    }
  }

  return conflicts;
}

function buildSafeBatch(
  id: string,
  ready: SwarmTask[],
  maxConcurrency: number,
  options: SchedulerOptions,
): SwarmBatch {
  const tasks: SwarmTask[] = [];
  const blockedTaskIds: string[] = [];

  for (const candidate of ready) {
    if (tasks.length >= maxConcurrency) {
      blockedTaskIds.push(candidate.id);
      continue;
    }

    const hasConflict = tasks.some(
      (selected) => detectLockConflicts(candidate, selected, options).length > 0,
    );

    if (hasConflict) {
      blockedTaskIds.push(candidate.id);
      continue;
    }

    tasks.push({ ...candidate, status: "ready" });
  }

  return {
    id,
    tasks,
    writeLocks: unique(tasks.flatMap((task) => task.writes ?? [])),
    blockedTaskIds,
  };
}

function dependenciesSatisfied(task: SwarmTask, completed: Set<string>): boolean {
  return (task.dependsOn ?? []).every((dependency) => completed.has(dependency));
}

function normalizeTask(task: SwarmTask): SwarmTask {
  return {
    ...task,
    status: task.status ?? "pending",
    dependsOn: task.dependsOn ?? [],
    reads: task.reads ?? [],
    writes: task.writes ?? [],
    moduleClaims: task.moduleClaims ?? [],
    contracts: task.contracts ?? [],
    priority: task.priority ?? 0,
  };
}

function sortByPriority(left: SwarmTask, right: SwarmTask): number {
  return (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id);
}

function createEvent(
  type: SwarmEvent["type"],
  message: string,
  data: Record<string, unknown>,
): SwarmEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

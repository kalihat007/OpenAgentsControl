import { describe, test, expect, beforeEach } from "bun:test";
import {
  retryWithBackoff,
  createCircuitBreaker,
  withTimeout,
  createDeadLetterQueue,
  TimeoutError,
  CircuitBreakerOpenError,
  MaxRetriesExceededError,
} from "./resilience.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function failNTimes(n: number, result = "ok") {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= n) throw new Error(`fail-${calls}`);
    return result;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── retryWithBackoff ─────────────────────────────────────────────────────────

describe("retryWithBackoff", () => {
  test("resolves immediately on first success", async () => {
    const result = await retryWithBackoff(async () => "hello", { baseDelay: 1 });
    expect(result).toBe("hello");
  });

  test("succeeds after N transient failures", async () => {
    const fn = failNTimes(2, "recovered");
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 1 });
    expect(result).toBe("recovered");
  });

  test("throws MaxRetriesExceededError when all retries exhausted", async () => {
    const fn = failNTimes(10, "never");
    try {
      await retryWithBackoff(fn, { maxRetries: 2, baseDelay: 1 });
      expect(true).toBe(false); // should not reach
    } catch (error) {
      expect(error).toBeInstanceOf(MaxRetriesExceededError);
      const mre = error as MaxRetriesExceededError;
      expect(mre.attempts).toBe(3);
      expect(mre.lastError).toBeInstanceOf(Error);
    }
  });

  test("respects shouldRetry predicate — non-retryable error fails immediately", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new TypeError("non-retryable");
    };
    try {
      await retryWithBackoff(fn, {
        maxRetries: 5,
        baseDelay: 1,
        shouldRetry: (err) => !(err instanceof TypeError),
      });
    } catch {
      // expected
    }
    expect(attempts).toBe(1);
  });

  test("calls onRetry with correct attempt, error, and delay info", async () => {
    const retries: Array<{ attempt: number; delay: number }> = [];
    const fn = failNTimes(2, "done");
    await retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelay: 10,
      backoffMultiplier: 2,
      onRetry: (attempt, _err, d) => retries.push({ attempt, delay: d }),
    });
    expect(retries).toHaveLength(2);
    expect(retries[0]!.attempt).toBe(1);
    expect(retries[0]!.delay).toBe(10); // 10 * 2^0
    expect(retries[1]!.attempt).toBe(2);
    expect(retries[1]!.delay).toBe(20); // 10 * 2^1
  });

  test("delay is capped at maxDelay", async () => {
    const delays: number[] = [];
    const fn = failNTimes(4, "ok");
    await retryWithBackoff(fn, {
      maxRetries: 5,
      baseDelay: 100,
      maxDelay: 150,
      backoffMultiplier: 3,
      onRetry: (_a, _e, d) => delays.push(d),
    });
    for (const d of delays) {
      expect(d).toBeLessThanOrEqual(150);
    }
  });

  test("zero maxRetries means only one attempt", async () => {
    let calls = 0;
    try {
      await retryWithBackoff(
        async () => {
          calls++;
          throw new Error("fail");
        },
        { maxRetries: 0, baseDelay: 1 },
      );
    } catch {
      // expected
    }
    expect(calls).toBe(1);
  });

  test("preserves the original error type in MaxRetriesExceededError.lastError", async () => {
    class CustomError extends Error {
      code = 42;
    }
    try {
      await retryWithBackoff(
        async () => {
          throw new CustomError("custom");
        },
        { maxRetries: 1, baseDelay: 1 },
      );
    } catch (error) {
      const mre = error as MaxRetriesExceededError;
      expect(mre.lastError).toBeInstanceOf(CustomError);
      expect((mre.lastError as CustomError).code).toBe(42);
    }
  });
});

// ── Circuit breaker ──────────────────────────────────────────────────────────

describe("createCircuitBreaker", () => {
  test("starts in closed state", () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe("closed");
  });

  test("lets calls through when closed", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
  });

  test("transitions closed → open after failureThreshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error("boom");
        });
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe("open");
  });

  test("rejects fast when open", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 60_000 });
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");
    try {
      await cb.execute(async () => "should not run");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
    }
  });

  test("transitions open → half-open after resetTimeout", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 50,
    });
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");
    await delay(60);
    await cb.execute(async () => "probe");
    expect(cb.getState()).toBe("closed");
  });

  test("transitions half-open → closed after enough successes", async () => {
    const transitions: Array<{ from: string; to: string }> = [];
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 20,
      halfOpenMaxAttempts: 2,
      onStateChange: (from, to) => transitions.push({ from, to }),
    });

    // Trip the breaker
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");

    await delay(30);

    // First success in half-open
    await cb.execute(async () => "probe-1");
    expect(cb.getState()).toBe("half-open");

    // Second success closes it
    await cb.execute(async () => "probe-2");
    expect(cb.getState()).toBe("closed");

    expect(transitions).toEqual([
      { from: "closed", to: "open" },
      { from: "open", to: "half-open" },
      { from: "half-open", to: "closed" },
    ]);
  });

  test("transitions half-open → open on failure", async () => {
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 20,
      halfOpenMaxAttempts: 3,
    });

    // Trip
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }

    await delay(30);

    // Fail in half-open
    try {
      await cb.execute(async () => {
        throw new Error("still broken");
      });
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");
  });

  test("tracks stats correctly", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 5 });
    await cb.execute(async () => "ok");
    try {
      await cb.execute(async () => {
        throw new Error("fail");
      });
    } catch {
      // expected
    }
    const stats = cb.getStats();
    expect(stats.state).toBe("closed");
    expect(stats.successes).toBe(1);
    expect(stats.failures).toBe(1);
    expect(stats.lastFailureTime).not.toBeNull();
  });

  test("reset returns breaker to initial state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }
    expect(cb.getState()).toBe("open");
    cb.reset();
    expect(cb.getState()).toBe("closed");
    const stats = cb.getStats();
    expect(stats.failures).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.lastFailureTime).toBeNull();
  });

  test("success in closed state resets failure count", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    // Accumulate 2 failures
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }
    expect(cb.getStats().failures).toBe(2);

    // A success resets failures
    await cb.execute(async () => "ok");
    expect(cb.getStats().failures).toBe(0);
    expect(cb.getState()).toBe("closed");
  });

  test("fires onStateChange callback", async () => {
    const changes: string[] = [];
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      onStateChange: (from, to) => changes.push(`${from}->${to}`),
    });
    try {
      await cb.execute(async () => {
        throw new Error("trip");
      });
    } catch {
      // expected
    }
    expect(changes).toContain("closed->open");
  });
});

// ── withTimeout ──────────────────────────────────────────────────────────────

describe("withTimeout", () => {
  test("returns result when operation completes in time", async () => {
    const result = await withTimeout(async () => "fast", 500);
    expect(result).toBe("fast");
  });

  test("throws TimeoutError when operation exceeds deadline", async () => {
    try {
      await withTimeout(async () => {
        await delay(200);
        return "slow";
      }, 10);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).ms).toBe(10);
    }
  });

  test("calls cleanup function on timeout", async () => {
    let cleaned = false;
    try {
      await withTimeout(
        async () => {
          await delay(200);
          return "slow";
        },
        10,
        () => {
          cleaned = true;
        },
      );
    } catch {
      // expected
    }
    expect(cleaned).toBe(true);
  });

  test("does not call cleanup when operation succeeds", async () => {
    let cleaned = false;
    await withTimeout(
      async () => "fast",
      500,
      () => {
        cleaned = true;
      },
    );
    expect(cleaned).toBe(false);
  });

  test("propagates original error, not TimeoutError, when fn throws fast", async () => {
    try {
      await withTimeout(async () => {
        throw new RangeError("bad input");
      }, 5_000);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
      expect((error as RangeError).message).toBe("bad input");
    }
  });

  test("TimeoutError includes the timeout duration", async () => {
    try {
      await withTimeout(async () => delay(200), 5);
    } catch (error) {
      const te = error as TimeoutError;
      expect(te.ms).toBe(5);
      expect(te.message).toContain("5ms");
    }
  });
});

// ── Dead letter queue ────────────────────────────────────────────────────────

describe("createDeadLetterQueue", () => {
  test("starts empty", () => {
    const dlq = createDeadLetterQueue<string>();
    expect(dlq.size()).toBe(0);
    expect(dlq.peek()).toBeUndefined();
  });

  test("enqueue adds an entry and increments size", () => {
    const dlq = createDeadLetterQueue<string>();
    const entry = dlq.enqueue("task-1", new Error("boom"), 3);
    expect(dlq.size()).toBe(1);
    expect(entry.item).toBe("task-1");
    expect(entry.attempts).toBe(3);
    expect(entry.reason).toBe("boom");
    expect(entry.id).toMatch(/^dlq-/);
  });

  test("enqueue defaults attempts to 1", () => {
    const dlq = createDeadLetterQueue<string>();
    const entry = dlq.enqueue("task-1", new Error("fail"));
    expect(entry.attempts).toBe(1);
  });

  test("peek returns the first entry without removing it", () => {
    const dlq = createDeadLetterQueue<string>();
    dlq.enqueue("first", new Error("e1"));
    dlq.enqueue("second", new Error("e2"));
    const peeked = dlq.peek();
    expect(peeked?.item).toBe("first");
    expect(dlq.size()).toBe(2);
  });

  test("drain returns all entries and empties the queue", () => {
    const dlq = createDeadLetterQueue<string>();
    dlq.enqueue("a", new Error("e1"));
    dlq.enqueue("b", new Error("e2"));
    dlq.enqueue("c", new Error("e3"));
    const items = dlq.drain();
    expect(items).toHaveLength(3);
    expect(dlq.size()).toBe(0);
  });

  test("retry removes and returns the entry by id", () => {
    const dlq = createDeadLetterQueue<string>();
    const entry = dlq.enqueue("task-1", new Error("fail"));
    const retried = dlq.retry(entry.id);
    expect(retried?.item).toBe("task-1");
    expect(dlq.size()).toBe(0);
  });

  test("retry returns undefined for nonexistent id", () => {
    const dlq = createDeadLetterQueue<string>();
    expect(dlq.retry("nonexistent")).toBeUndefined();
  });

  test("clear empties the queue", () => {
    const dlq = createDeadLetterQueue<string>();
    dlq.enqueue("a", new Error("e1"));
    dlq.enqueue("b", new Error("e2"));
    dlq.clear();
    expect(dlq.size()).toBe(0);
    expect(dlq.peek()).toBeUndefined();
  });

  test("entries returns a snapshot of all entries", () => {
    const dlq = createDeadLetterQueue<number>();
    dlq.enqueue(1, new Error("e1"));
    dlq.enqueue(2, new Error("e2"));
    const all = dlq.entries();
    expect(all).toHaveLength(2);
    expect(all[0]!.item).toBe(1);
    expect(all[1]!.item).toBe(2);
  });

  test("entries have valid ISO timestamps", () => {
    const dlq = createDeadLetterQueue<string>();
    const entry = dlq.enqueue("task", new Error("fail"));
    const parsed = new Date(entry.failedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  test("handles non-Error objects as error reason", () => {
    const dlq = createDeadLetterQueue<string>();
    const entry = dlq.enqueue("task", "string-error");
    expect(entry.reason).toBe("string-error");
  });

  test("each entry gets a unique id", () => {
    const dlq = createDeadLetterQueue<string>();
    const e1 = dlq.enqueue("a", new Error("e1"));
    const e2 = dlq.enqueue("b", new Error("e2"));
    const e3 = dlq.enqueue("c", new Error("e3"));
    const ids = new Set([e1.id, e2.id, e3.id]);
    expect(ids.size).toBe(3);
  });

  test("works with complex item types", () => {
    interface TaskPayload {
      taskId: string;
      payload: Record<string, unknown>;
    }
    const dlq = createDeadLetterQueue<TaskPayload>();
    const item: TaskPayload = { taskId: "t-1", payload: { key: "value" } };
    const entry = dlq.enqueue(item, new Error("processing failed"), 5);
    expect(entry.item.taskId).toBe("t-1");
    expect(entry.item.payload).toEqual({ key: "value" });
    expect(entry.attempts).toBe(5);
  });
});

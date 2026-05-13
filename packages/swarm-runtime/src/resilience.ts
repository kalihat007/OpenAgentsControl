// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxAttempts?: number;
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  consecutiveSuccessesInHalfOpen: number;
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
  getStats(): CircuitBreakerStats;
  reset(): void;
}

export interface DeadLetterEntry<T> {
  id: string;
  item: T;
  error: unknown;
  attempts: number;
  failedAt: string;
  reason: string;
}

export interface DeadLetterQueue<T> {
  enqueue(item: T, error: unknown, attempts?: number): DeadLetterEntry<T>;
  peek(): DeadLetterEntry<T> | undefined;
  drain(): DeadLetterEntry<T>[];
  retry(id: string): DeadLetterEntry<T> | undefined;
  clear(): void;
  size(): number;
  entries(): DeadLetterEntry<T>[];
}

export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super("Circuit breaker is open — request rejected");
    this.name = "CircuitBreakerOpenError";
  }
}

export class MaxRetriesExceededError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Max retries exceeded after ${attempts} attempt(s): ${msg}`);
    this.name = "MaxRetriesExceededError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// ── Retry with exponential backoff ───────────────────────────────────────────

const RETRY_DEFAULTS = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5_000,
  backoffMultiplier: 2,
} as const;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? RETRY_DEFAULTS.maxRetries;
  const baseDelay = options.baseDelay ?? RETRY_DEFAULTS.baseDelay;
  const maxDelay = options.maxDelay ?? RETRY_DEFAULTS.maxDelay;
  const backoffMultiplier = options.backoffMultiplier ?? RETRY_DEFAULTS.backoffMultiplier;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const onRetry = options.onRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        break;
      }

      const delay = Math.min(baseDelay * backoffMultiplier ** attempt, maxDelay);
      onRetry?.(attempt + 1, error, delay);
      await sleep(delay);
    }
  }

  throw new MaxRetriesExceededError(maxRetries + 1, lastError);
}

// ── Circuit breaker ──────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_DEFAULTS = {
  failureThreshold: 5,
  resetTimeout: 30_000,
  halfOpenMaxAttempts: 1,
} as const;

export function createCircuitBreaker(
  options: CircuitBreakerOptions = {},
): CircuitBreaker {
  const failureThreshold =
    options.failureThreshold ?? CIRCUIT_BREAKER_DEFAULTS.failureThreshold;
  const resetTimeout =
    options.resetTimeout ?? CIRCUIT_BREAKER_DEFAULTS.resetTimeout;
  const halfOpenMaxAttempts =
    options.halfOpenMaxAttempts ?? CIRCUIT_BREAKER_DEFAULTS.halfOpenMaxAttempts;
  const onStateChange = options.onStateChange;

  let state: CircuitBreakerState = "closed";
  let failures = 0;
  let successes = 0;
  let lastFailureTime: number | null = null;
  let halfOpenSuccesses = 0;

  function transitionTo(next: CircuitBreakerState): void {
    if (next === state) return;
    const prev = state;
    state = next;
    if (next === "half-open") {
      halfOpenSuccesses = 0;
    }
    onStateChange?.(prev, next);
  }

  function recordSuccess(): void {
    successes++;
    if (state === "half-open") {
      halfOpenSuccesses++;
      if (halfOpenSuccesses >= halfOpenMaxAttempts) {
        failures = 0;
        transitionTo("closed");
      }
    } else if (state === "closed") {
      failures = 0;
    }
  }

  function recordFailure(): void {
    failures++;
    lastFailureTime = Date.now();
    if (state === "half-open") {
      transitionTo("open");
    } else if (state === "closed" && failures >= failureThreshold) {
      transitionTo("open");
    }
  }

  function shouldAttempt(): boolean {
    if (state === "closed") return true;
    if (state === "open") {
      if (lastFailureTime !== null && Date.now() - lastFailureTime >= resetTimeout) {
        transitionTo("half-open");
        return true;
      }
      return false;
    }
    return true; // half-open
  }

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      if (!shouldAttempt()) {
        throw new CircuitBreakerOpenError();
      }
      try {
        const result = await fn();
        recordSuccess();
        return result;
      } catch (error) {
        recordFailure();
        throw error;
      }
    },

    getState(): CircuitBreakerState {
      return state;
    },

    getStats(): CircuitBreakerStats {
      return {
        state,
        failures,
        successes,
        lastFailureTime,
        consecutiveSuccessesInHalfOpen: halfOpenSuccesses,
      };
    },

    reset(): void {
      transitionTo("closed");
      failures = 0;
      successes = 0;
      lastFailureTime = null;
      halfOpenSuccesses = 0;
    },
  };
}

// ── Timeout wrapper ──────────────────────────────────────────────────────────

export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  cleanup?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      cleanup?.();
      reject(new TimeoutError(ms));
    }, ms);
  });

  try {
    const result = await Promise.race([fn(), timeout]);
    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

// ── Dead letter queue ────────────────────────────────────────────────────────

let dlqCounter = 0;

export function createDeadLetterQueue<T>(): DeadLetterQueue<T> {
  const queue = new Map<string, DeadLetterEntry<T>>();

  return {
    enqueue(item: T, error: unknown, attempts = 1): DeadLetterEntry<T> {
      const id = `dlq-${++dlqCounter}`;
      const entry: DeadLetterEntry<T> = {
        id,
        item,
        error,
        attempts,
        failedAt: new Date().toISOString(),
        reason: error instanceof Error ? error.message : String(error),
      };
      queue.set(id, entry);
      return entry;
    },

    peek(): DeadLetterEntry<T> | undefined {
      const first = queue.values().next();
      return first.done ? undefined : first.value;
    },

    drain(): DeadLetterEntry<T>[] {
      const items = [...queue.values()];
      queue.clear();
      return items;
    },

    retry(id: string): DeadLetterEntry<T> | undefined {
      const entry = queue.get(id);
      if (entry) {
        queue.delete(id);
      }
      return entry;
    },

    clear(): void {
      queue.clear();
    },

    size(): number {
      return queue.size;
    },

    entries(): DeadLetterEntry<T>[] {
      return [...queue.values()];
    },
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

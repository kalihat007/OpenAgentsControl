import { createCircuitBreaker, retryWithBackoff } from "./resilience.js";
import type { SwarmRole } from "./types.js";

export type Complexity = "low" | "medium" | "high";
export type VerificationType = "lint" | "typecheck" | "test" | "custom";
export type PEVState =
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "rolled_back";

export interface Expert {
  id: string;
  name?: string;
  role?: SwarmRole | string;
  filePatterns?: string[];
  capabilities?: string[];
}

export interface PlanStep {
  id: string;
  description: string;
  filesAffected: string[];
  expertId: string;
  estimatedComplexity: Complexity;
  dependencies: string[];
}

export interface ExecutionPlan {
  taskId: string;
  objective: string;
  steps: PlanStep[];
  approvalRequired: boolean;
  estimatedDuration: number;
  config: Required<PEVConfig>;
}

export interface VerificationCheck {
  name: string;
  type: VerificationType;
  passed: boolean;
  output?: string;
}

export interface VerificationResult {
  stepId: string;
  passed: boolean;
  checks: VerificationCheck[];
  errors: string[];
}

export interface PEVConfig {
  autoApprove: boolean;
  rollbackOnFailure: boolean;
  verificationChecks: string[];
  maxRetries: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: string;
  filesChanged: string[];
  errors: string[];
  rollback?: () => Promise<void>;
  verificationChecks?: VerificationCheck[];
}

export interface PEVEvent {
  type:
    | "session.created"
    | "state.changed"
    | "plan.created"
    | "plan.validated"
    | "step.started"
    | "step.completed"
    | "step.failed"
    | "verification.completed"
    | "rollback.started"
    | "rollback.completed";
  timestamp: string;
  message: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export interface PEVSession {
  id: string;
  state: PEVState;
  plan: ExecutionPlan;
  results: StepResult[];
  verificationResults: VerificationResult[];
  events: PEVEvent[];
  startedAt: string;
  completedAt?: string;
}

export interface PEVCallbacks {
  onStateChange?: (session: PEVSession, from: PEVState, to: PEVState) => void;
  onPlanCreated?: (plan: ExecutionPlan) => void;
  onStepStart?: (step: PlanStep, session: PEVSession) => void;
  onStepComplete?: (step: PlanStep, result: StepResult, session: PEVSession) => void;
  onStepFailure?: (step: PlanStep, error: unknown, session: PEVSession) => void;
  onVerificationComplete?: (result: VerificationResult, session: PEVSession) => void;
  onRollback?: (step: PlanStep, result: StepResult, session: PEVSession) => void;
  executeStep?: (step: PlanStep, session: PEVSession) => Promise<StepResult>;
  verifyCheck?: (checkName: string, step: PlanStep, result: StepResult) => Promise<VerificationCheck>;
}

const DEFAULT_CONFIG: Required<PEVConfig> = {
  autoApprove: false,
  rollbackOnFailure: true,
  verificationChecks: ["lint", "typecheck", "test"],
  maxRetries: 1,
};

const VALID_TRANSITIONS: Record<PEVState, PEVState[]> = {
  planning: ["awaiting_approval", "executing", "failed"],
  awaiting_approval: ["executing", "failed"],
  executing: ["verifying", "failed", "rolled_back"],
  verifying: ["executing", "completed", "failed", "rolled_back"],
  completed: [],
  failed: ["rolled_back"],
  rolled_back: [],
};

export function createExecutionPlan(
  objective: string,
  experts: Expert[],
  config?: PEVConfig,
): ExecutionPlan {
  const resolvedConfig = resolveConfig(config);
  const resolvedExperts = experts.length > 0 ? experts : [defaultExpert()];
  const complexity = estimateComplexity(objective);
  const steps = resolvedExperts.map((expert, index): PlanStep => {
    const id = `step-${String(index + 1).padStart(3, "0")}`;
    return {
      id,
      description: stepDescription(objective, expert, index),
      filesAffected: inferFilesAffected(objective, expert),
      expertId: expert.id,
      estimatedComplexity: complexity,
      dependencies: index === 0 ? [] : [`step-${String(index).padStart(3, "0")}`],
    };
  });

  return {
    taskId: `pev-${Date.now().toString(36)}`,
    objective,
    steps,
    approvalRequired: !resolvedConfig.autoApprove,
    estimatedDuration: estimateDurationMinutes(steps, complexity),
    config: resolvedConfig,
  };
}

export function validatePlan(plan: ExecutionPlan): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const step of plan.steps) {
    if (!step.id) issues.push("Plan step is missing an id.");
    if (!step.expertId) issues.push(`Step ${step.id} is missing an expertId.`);
    if (ids.has(step.id)) issues.push(`Duplicate step id: ${step.id}`);
    ids.add(step.id);
  }

  for (const step of plan.steps) {
    for (const dependency of step.dependencies) {
      if (!ids.has(dependency)) {
        issues.push(`Step ${step.id} depends on missing step ${dependency}.`);
      }
    }
  }

  for (const cycle of findCycles(plan.steps)) {
    issues.push(`Circular dependency detected: ${cycle.join(" -> ")}`);
  }

  for (const conflict of findFileConflicts(plan.steps)) {
    issues.push(
      `Conflicting file changes: ${conflict.left.id} and ${conflict.right.id} both affect ${conflict.file} without dependency ordering.`,
    );
  }

  return { valid: issues.length === 0, issues };
}

export function createPEVSession(objective: string, config?: PEVConfig): PEVSession {
  const plan = createExecutionPlan(objective, [defaultExpert()], config);
  const startedAt = new Date().toISOString();
  return {
    id: plan.taskId,
    state: "planning",
    plan,
    results: [],
    verificationResults: [],
    events: [
      createEvent("session.created", "PEV session created"),
      createEvent("plan.created", "Execution plan created", { stepCount: plan.steps.length }),
    ],
    startedAt,
  };
}

export function transitionState(session: PEVSession, newState: PEVState): PEVSession {
  if (session.state === newState) return session;
  if (!VALID_TRANSITIONS[session.state].includes(newState)) {
    throw new Error(`Invalid PEV transition: ${session.state} -> ${newState}`);
  }

  return {
    ...session,
    state: newState,
    completedAt: newState === "completed" || newState === "failed" || newState === "rolled_back"
      ? new Date().toISOString()
      : session.completedAt,
    events: [
      ...session.events,
      createEvent("state.changed", `State changed: ${session.state} -> ${newState}`, {
        from: session.state,
        to: newState,
      }),
    ],
  };
}

export async function executePlan(
  plan: ExecutionPlan,
  callbacks: PEVCallbacks = {},
): Promise<PEVSession> {
  const validation = validatePlan(plan);
  let session = sessionFromPlan(plan);
  callbacks.onPlanCreated?.(plan);

  session = appendEvent(session, createEvent("plan.validated", "Plan validation completed", validation));
  if (!validation.valid) {
    return transitionState({ ...session, events: [...session.events] }, "failed");
  }

  session = transitionState(session, plan.approvalRequired ? "awaiting_approval" : "executing");
  callbacks.onStateChange?.(session, "planning", session.state);
  if (session.state === "awaiting_approval") {
    return session;
  }

  const orderedSteps = orderSteps(plan.steps);
  const breaker = createCircuitBreaker({ failureThreshold: 3 });

  for (const step of orderedSteps) {
    callbacks.onStepStart?.(step, session);
    session = appendEvent(session, createEvent("step.started", `Started ${step.id}`, {}, step.id));

    let result: StepResult;
    try {
      result = await breaker.execute(() =>
        retryWithBackoff(
          () => executeSingleStep(step, session, callbacks),
          {
            maxRetries: plan.config.maxRetries,
            baseDelay: 1,
            maxDelay: 5,
            shouldRetry: (error) => !(error instanceof NonRetryableStepError),
          },
        ),
      );
    } catch (error) {
      callbacks.onStepFailure?.(step, error, session);
      result = failedStepResult(step, error);
    }

    session = {
      ...session,
      results: [...session.results, result],
      events: [
        ...session.events,
        createEvent(result.success ? "step.completed" : "step.failed", result.success ? `Completed ${step.id}` : `Failed ${step.id}`, {
          errors: result.errors,
        }, step.id),
      ],
    };

    if (!result.success) {
      if (plan.config.rollbackOnFailure) {
        return rollbackPlan(transitionState(session, "failed"), callbacks);
      }
      return transitionState(session, "failed");
    }

    callbacks.onStepComplete?.(step, result, session);

    session = transitionState(session, "verifying");
    callbacks.onStateChange?.(session, "executing", "verifying");
    const verification = await verifyStep(step, result, plan.config, callbacks);
    session = {
      ...session,
      verificationResults: [...session.verificationResults, verification],
      events: [
        ...session.events,
        createEvent("verification.completed", `Verified ${step.id}`, {
          passed: verification.passed,
          errors: verification.errors,
        }, step.id),
      ],
    };
    callbacks.onVerificationComplete?.(verification, session);

    if (!verification.passed) {
      if (plan.config.rollbackOnFailure) {
        return rollbackPlan(transitionState(session, "failed"), callbacks);
      }
      return transitionState(session, "failed");
    }

    if (orderedSteps[orderedSteps.length - 1]?.id !== step.id) {
      session = transitionState(session, "executing");
      callbacks.onStateChange?.(session, "verifying", "executing");
    }
  }

  return transitionState(session, "completed");
}

export async function verifyStep(
  step: PlanStep,
  result: StepResult,
  config: PEVConfig = DEFAULT_CONFIG,
  callbacks: PEVCallbacks = {},
): Promise<VerificationResult> {
  const resolved = resolveConfig(config);
  const checks: VerificationCheck[] = [];

  for (const checkName of resolved.verificationChecks) {
    if (callbacks.verifyCheck) {
      checks.push(await callbacks.verifyCheck(checkName, step, result));
    } else {
      checks.push(defaultVerificationCheck(checkName, result));
    }
  }

  const errors = [
    ...result.errors,
    ...checks.filter((check) => !check.passed).map((check) => `${check.name} failed`),
  ];

  return {
    stepId: step.id,
    passed: result.success && checks.every((check) => check.passed),
    checks,
    errors,
  };
}

export async function verifyPlan(session: PEVSession): Promise<VerificationResult[]> {
  const byStep = new Map(session.results.map((result) => [result.stepId, result]));
  const verifications: VerificationResult[] = [];

  for (const step of session.plan.steps) {
    const result = byStep.get(step.id);
    if (!result) {
      verifications.push({
        stepId: step.id,
        passed: false,
        checks: [],
        errors: [`Step ${step.id} has not executed.`],
      });
      continue;
    }
    verifications.push(await verifyStep(step, result, session.plan.config));
  }

  return verifications;
}

export async function rollbackStep(step: PlanStep, result: StepResult): Promise<void> {
  if (result.rollback) {
    await result.rollback();
  }
  void step;
}

export async function rollbackPlan(
  session: PEVSession,
  callbacks: PEVCallbacks = {},
): Promise<PEVSession> {
  let rolledBack = transitionStateIfPossible(session, "rolled_back");
  rolledBack = appendEvent(rolledBack, createEvent("rollback.started", "Rollback started"));

  for (const result of [...rolledBack.results].reverse()) {
    const step = rolledBack.plan.steps.find((candidate) => candidate.id === result.stepId);
    if (!step || !result.success) continue;
    await rollbackStep(step, result);
    callbacks.onRollback?.(step, result, rolledBack);
  }

  return appendEvent(rolledBack, createEvent("rollback.completed", "Rollback completed"));
}

class NonRetryableStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableStepError";
  }
}

async function executeSingleStep(
  step: PlanStep,
  session: PEVSession,
  callbacks: PEVCallbacks,
): Promise<StepResult> {
  if (callbacks.executeStep) {
    const result = await callbacks.executeStep(step, session);
    if (!result.success) {
      throw new NonRetryableStepError(result.errors.join("; ") || `Step ${step.id} failed`);
    }
    return result;
  }

  return {
    stepId: step.id,
    success: true,
    output: `Executed ${step.description}`,
    filesChanged: step.filesAffected,
    errors: [],
  };
}

function sessionFromPlan(plan: ExecutionPlan): PEVSession {
  const startedAt = new Date().toISOString();
  return {
    id: plan.taskId,
    state: "planning",
    plan,
    results: [],
    verificationResults: [],
    events: [
      createEvent("session.created", "PEV session created"),
      createEvent("plan.created", "Execution plan created", { stepCount: plan.steps.length }),
    ],
    startedAt,
  };
}

function transitionStateIfPossible(session: PEVSession, state: PEVState): PEVSession {
  try {
    return transitionState(session, state);
  } catch {
    return {
      ...session,
      state,
      completedAt: new Date().toISOString(),
      events: [...session.events, createEvent("state.changed", `State changed: ${session.state} -> ${state}`)],
    };
  }
}

function appendEvent(session: PEVSession, event: PEVEvent): PEVSession {
  return { ...session, events: [...session.events, event] };
}

function createEvent(
  type: PEVEvent["type"],
  message: string,
  data: Record<string, unknown> = {},
  stepId?: string,
): PEVEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    message,
    ...(stepId ? { stepId } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
  };
}

function resolveConfig(config?: PEVConfig): Required<PEVConfig> {
  return {
    autoApprove: config?.autoApprove ?? DEFAULT_CONFIG.autoApprove,
    rollbackOnFailure: config?.rollbackOnFailure ?? DEFAULT_CONFIG.rollbackOnFailure,
    verificationChecks: config?.verificationChecks ?? DEFAULT_CONFIG.verificationChecks,
    maxRetries: config?.maxRetries ?? DEFAULT_CONFIG.maxRetries,
  };
}

function defaultExpert(): Expert {
  return {
    id: "general",
    name: "General Expert",
    role: "general",
    filePatterns: ["src/**"],
    capabilities: ["planning", "implementation", "verification"],
  };
}

function stepDescription(objective: string, expert: Expert, index: number): string {
  const name = expert.name ?? expert.id;
  if (index === 0) return `${name} plans and scopes: ${objective}`;
  return `${name} executes its scoped part of: ${objective}`;
}

function inferFilesAffected(objective: string, expert: Expert): string[] {
  if (expert.filePatterns && expert.filePatterns.length > 0) {
    return [...expert.filePatterns];
  }

  const lower = `${objective} ${expert.id} ${expert.role ?? ""}`.toLowerCase();
  if (/frontend|react|ui|component|page/.test(lower)) return ["src/components/**", "src/pages/**"];
  if (/backend|api|server|database|auth/.test(lower)) return ["src/api/**", "src/server/**"];
  if (/test|qa|coverage/.test(lower)) return ["**/*.test.*", "**/*.spec.*"];
  if (/doc|readme|guide/.test(lower)) return ["README.md", "docs/**"];
  return ["src/**"];
}

function estimateComplexity(objective: string): Complexity {
  const lower = objective.toLowerCase();
  const signals = (lower.match(/ and | plus | also | additionally | full-stack | migration | architecture | security | auth | database/g) ?? []).length;
  if (objective.length > 140 || signals >= 4) return "high";
  if (objective.length > 60 || signals >= 2 || /build|implement|create|refactor/.test(lower)) return "medium";
  return "low";
}

function estimateDurationMinutes(steps: PlanStep[], complexity: Complexity): number {
  const perStep = complexity === "high" ? 20 : complexity === "medium" ? 12 : 6;
  return Math.max(perStep, steps.length * perStep);
}

function orderSteps(steps: PlanStep[]): PlanStep[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: PlanStep[] = [];

  function visit(step: PlanStep): void {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) throw new Error(`Circular dependency detected at ${step.id}`);
    visiting.add(step.id);
    for (const dependency of step.dependencies) {
      const dep = byId.get(dependency);
      if (dep) visit(dep);
    }
    visiting.delete(step.id);
    visited.add(step.id);
    ordered.push(step);
  }

  for (const step of steps) visit(step);
  return ordered;
}

function findCycles(steps: PlanStep[]): string[][] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(step: PlanStep): void {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) {
      const start = stack.indexOf(step.id);
      cycles.push([...stack.slice(start), step.id]);
      return;
    }
    visiting.add(step.id);
    stack.push(step.id);
    for (const dependency of step.dependencies) {
      const dep = byId.get(dependency);
      if (dep) visit(dep);
    }
    stack.pop();
    visiting.delete(step.id);
    visited.add(step.id);
  }

  for (const step of steps) visit(step);
  return cycles;
}

function findFileConflicts(steps: PlanStep[]): Array<{ left: PlanStep; right: PlanStep; file: string }> {
  const conflicts: Array<{ left: PlanStep; right: PlanStep; file: string }> = [];

  for (let i = 0; i < steps.length; i++) {
    for (let j = i + 1; j < steps.length; j++) {
      const left = steps[i]!;
      const right = steps[j]!;
      const shared = left.filesAffected.find((file) => right.filesAffected.includes(file));
      if (shared && !isOrdered(left, right, steps)) {
        conflicts.push({ left, right, file: shared });
      }
    }
  }

  return conflicts;
}

function isOrdered(left: PlanStep, right: PlanStep, steps: PlanStep[]): boolean {
  return dependsOn(right, left.id, steps) || dependsOn(left, right.id, steps);
}

function dependsOn(step: PlanStep, dependencyId: string, steps: PlanStep[]): boolean {
  const byId = new Map(steps.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();

  function walk(current: PlanStep): boolean {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    if (current.dependencies.includes(dependencyId)) return true;
    return current.dependencies.some((depId) => {
      const dep = byId.get(depId);
      return dep ? walk(dep) : false;
    });
  }

  return walk(step);
}

function defaultVerificationCheck(checkName: string, result: StepResult): VerificationCheck {
  const type = verificationType(checkName);
  const explicit = result.verificationChecks?.find((check) => check.name === checkName);
  if (explicit) return explicit;

  return {
    name: checkName,
    type,
    passed: result.success,
    output: result.success ? `${checkName} passed for ${result.stepId}` : result.errors.join("\n"),
  };
}

function verificationType(checkName: string): VerificationType {
  const lower = checkName.toLowerCase();
  if (lower.includes("lint")) return "lint";
  if (lower.includes("type")) return "typecheck";
  if (lower.includes("test")) return "test";
  return "custom";
}

function failedStepResult(step: PlanStep, error: unknown): StepResult {
  return {
    stepId: step.id,
    success: false,
    filesChanged: [],
    errors: [error instanceof Error ? error.message : String(error)],
  };
}

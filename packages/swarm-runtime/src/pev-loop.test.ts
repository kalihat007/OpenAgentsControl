import { describe, test, expect } from "bun:test";
import {
  createPEVSession,
  transitionState,
  createExecutionPlan,
  validatePlan,
  executePlan,
  verifyStep,
  verifyPlan,
  rollbackStep,
  rollbackPlan,
  type PlanStep,
  type ExecutionPlan,
  type PEVSession,
  type PEVConfig,
  type Expert,
  type StepResult,
  type PEVCallbacks,
  type PEVState,
} from "./pev-loop.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeExperts(count = 2): Expert[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `expert-${i + 1}`,
    name: `Expert${i + 1}`,
    capabilities: ["code"],
    filePatterns: [`src/file${i + 1}.ts`],
  }));
}

function makePlan(overrides?: Partial<ExecutionPlan>): ExecutionPlan {
  const base = createExecutionPlan("test objective", makeExperts(2), { autoApprove: true, rollbackOnFailure: true, verificationChecks: ["lint", "typecheck"], maxRetries: 1 });
  return { ...base, ...overrides };
}

function makeAutoApprovePlan(experts?: Expert[]): ExecutionPlan {
  return createExecutionPlan("test task", experts ?? makeExperts(2), {
    autoApprove: true,
    rollbackOnFailure: true,
    verificationChecks: ["lint"],
    maxRetries: 0,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PEV Loop — Session Management", () => {
  test("creates a session in 'planning' state", () => {
    const session = createPEVSession("build login API");
    expect(session.state).toBe("planning");
    expect(session.results).toEqual([]);
    expect(session.events.length).toBeGreaterThanOrEqual(1);
    expect(session.events[0]!.type).toBe("session.created");
    expect(session.startedAt).toBeTruthy();
    expect(session.completedAt).toBeUndefined();
  });

  test("generates well-formed session IDs", () => {
    const s1 = createPEVSession("task A");
    expect(s1.id).toMatch(/^pev-/);
    expect(s1.id.length).toBeGreaterThan(4);
  });

  test("session plan is created automatically", () => {
    const session = createPEVSession("refactor auth");
    expect(session.plan).toBeTruthy();
    expect(session.plan.objective).toBe("refactor auth");
  });

  test("session has verificationResults array", () => {
    const session = createPEVSession("task");
    expect(session.verificationResults).toEqual([]);
  });
});

describe("PEV Loop — State Transitions", () => {
  test("transitions planning → awaiting_approval", () => {
    const session = createPEVSession("obj");
    const next = transitionState(session, "awaiting_approval");
    expect(next.state).toBe("awaiting_approval");
    expect(next.events.length).toBeGreaterThan(session.events.length);
  });

  test("transitions planning → executing", () => {
    const session = createPEVSession("obj");
    const next = transitionState(session, "executing");
    expect(next.state).toBe("executing");
  });

  test("transitions planning → failed", () => {
    const session = createPEVSession("obj");
    const next = transitionState(session, "failed");
    expect(next.state).toBe("failed");
    expect(next.completedAt).toBeTruthy();
  });

  test("transitions executing → verifying", () => {
    let session = createPEVSession("obj");
    session = transitionState(session, "executing");
    const next = transitionState(session, "verifying");
    expect(next.state).toBe("verifying");
  });

  test("transitions verifying → completed", () => {
    let session = createPEVSession("obj");
    session = transitionState(session, "executing");
    session = transitionState(session, "verifying");
    const next = transitionState(session, "completed");
    expect(next.state).toBe("completed");
    expect(next.completedAt).toBeTruthy();
  });

  test("rejects invalid transitions", () => {
    const session = createPEVSession("obj");
    expect(() => transitionState(session, "completed")).toThrow();
    expect(() => transitionState(session, "verifying")).toThrow();
    expect(() => transitionState(session, "rolled_back")).toThrow();
  });

  test("rejects transitions from terminal states (completed)", () => {
    let session = createPEVSession("obj");
    session = transitionState(session, "executing");
    session = transitionState(session, "verifying");
    session = transitionState(session, "completed");
    expect(() => transitionState(session, "executing")).toThrow();
    expect(() => transitionState(session, "failed")).toThrow();
  });

  test("allows failed → rolled_back transition", () => {
    let session = createPEVSession("obj");
    session = transitionState(session, "failed");
    const rolledBack = transitionState(session, "rolled_back");
    expect(rolledBack.state).toBe("rolled_back");
  });

  test("preserves immutability — original session unchanged", () => {
    const session = createPEVSession("obj");
    const next = transitionState(session, "executing");
    expect(session.state).toBe("planning");
    expect(next.state).toBe("executing");
  });

  test("records state transition events with from/to data", () => {
    const session = createPEVSession("obj");
    const next = transitionState(session, "executing");
    const event = next.events[next.events.length - 1]!;
    expect(event.type).toBe("state.changed");
    expect(event.data).toEqual({ from: "planning", to: "executing" });
  });

  test("same-state transition is a no-op", () => {
    const session = createPEVSession("obj");
    const same = transitionState(session, "planning");
    expect(same).toBe(session);
  });
});

describe("PEV Loop — Plan Creation", () => {
  test("creates an execution plan from experts", () => {
    const experts = makeExperts(3);
    const plan = createExecutionPlan("build feature", experts);
    expect(plan.objective).toBe("build feature");
    expect(plan.steps.length).toBe(3);
    expect(plan.approvalRequired).toBe(true);
    expect(plan.estimatedDuration).toBeGreaterThan(0);
  });

  test("respects autoApprove config", () => {
    const plan = createExecutionPlan("task", makeExperts(), {
      autoApprove: true,
      rollbackOnFailure: true,
      verificationChecks: ["lint"],
      maxRetries: 1,
    });
    expect(plan.approvalRequired).toBe(false);
  });

  test("creates sequential dependencies between steps", () => {
    const plan = createExecutionPlan("task", makeExperts(3));
    expect(plan.steps[0]!.dependencies).toEqual([]);
    expect(plan.steps[1]!.dependencies).toContain(plan.steps[0]!.id);
    expect(plan.steps[2]!.dependencies).toContain(plan.steps[1]!.id);
  });

  test("assigns file patterns from experts to steps", () => {
    const experts: Expert[] = [
      { id: "e1", name: "E1", capabilities: ["code"], filePatterns: ["src/a.ts", "src/b.ts"] },
    ];
    const plan = createExecutionPlan("task", experts);
    expect(plan.steps[0]!.filesAffected).toContain("src/a.ts");
    expect(plan.steps[0]!.filesAffected).toContain("src/b.ts");
  });

  test("plan includes resolved config", () => {
    const plan = createExecutionPlan("task", makeExperts(), {
      autoApprove: true,
      rollbackOnFailure: false,
      verificationChecks: ["test"],
      maxRetries: 3,
    });
    expect(plan.config.autoApprove).toBe(true);
    expect(plan.config.rollbackOnFailure).toBe(false);
    expect(plan.config.maxRetries).toBe(3);
  });

  test("generates well-formed taskId", () => {
    const p1 = createExecutionPlan("a", makeExperts());
    expect(p1.taskId).toMatch(/^pev-/);
    expect(p1.taskId.length).toBeGreaterThan(4);
  });
});

describe("PEV Loop — Plan Validation", () => {
  test("validates a correct plan", () => {
    const plan = makePlan();
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test("detects missing dependency references", () => {
    const plan = makePlan();
    plan.steps = [
      {
        id: "step-001",
        description: "s1",
        filesAffected: ["a.ts"],
        expertId: "e1",
        estimatedComplexity: "medium",
        dependencies: ["nonexistent"],
      },
    ];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("nonexistent") || i.includes("missing"))).toBe(true);
  });

  test("detects circular dependencies", () => {
    const plan = makePlan();
    plan.steps = [
      { id: "a", description: "A", filesAffected: ["x.ts"], expertId: "e1", estimatedComplexity: "low", dependencies: ["b"] },
      { id: "b", description: "B", filesAffected: ["y.ts"], expertId: "e2", estimatedComplexity: "low", dependencies: ["a"] },
    ];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /[Cc]ircular|cycle/i.test(i))).toBe(true);
  });

  test("detects conflicting file changes without dependency ordering", () => {
    const plan = makePlan();
    plan.steps = [
      { id: "a", description: "A", filesAffected: ["shared.ts"], expertId: "e1", estimatedComplexity: "low", dependencies: [] },
      { id: "b", description: "B", filesAffected: ["shared.ts"], expertId: "e2", estimatedComplexity: "low", dependencies: [] },
    ];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("shared.ts"))).toBe(true);
  });

  test("allows same file if steps have dependency ordering", () => {
    const plan = makePlan();
    plan.steps = [
      { id: "a", description: "A", filesAffected: ["shared.ts"], expertId: "e1", estimatedComplexity: "low", dependencies: [] },
      { id: "b", description: "B", filesAffected: ["shared.ts"], expertId: "e2", estimatedComplexity: "low", dependencies: ["a"] },
    ];
    const result = validatePlan(plan);
    expect(result.valid).toBe(true);
  });

  test("detects duplicate step IDs", () => {
    const plan = makePlan();
    plan.steps = [
      { id: "dup", description: "A", filesAffected: [], expertId: "e1", estimatedComplexity: "low", dependencies: [] },
      { id: "dup", description: "B", filesAffected: [], expertId: "e2", estimatedComplexity: "low", dependencies: [] },
    ];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /[Dd]uplicate/.test(i))).toBe(true);
  });
});

describe("PEV Loop — Execution (Success Path)", () => {
  test("executes a plan to completion", async () => {
    const plan = makeAutoApprovePlan();
    const session = await executePlan(plan);
    expect(session.state).toBe("completed");
    expect(session.results.length).toBe(2);
    expect(session.results.every((r) => r.success)).toBe(true);
    expect(session.completedAt).toBeTruthy();
  });

  test("executes steps in dependency order", async () => {
    const executionOrder: string[] = [];
    const plan = makeAutoApprovePlan();
    const callbacks: PEVCallbacks = {
      executeStep: async (step) => {
        executionOrder.push(step.id);
        return { stepId: step.id, success: true, filesChanged: step.filesAffected, errors: [] };
      },
    };

    await executePlan(plan, callbacks);
    expect(executionOrder[0]).toBe(plan.steps[0]!.id);
    expect(executionOrder[1]).toBe(plan.steps[1]!.id);
  });

  test("invokes onStepStart and onStepComplete callbacks", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const plan = makeAutoApprovePlan();

    const callbacks: PEVCallbacks = {
      onStepStart: (step) => started.push(step.id),
      onStepComplete: (step) => completed.push(step.id),
    };

    await executePlan(plan, callbacks);
    expect(started.length).toBe(2);
    expect(completed.length).toBe(2);
  });

  test("session events track execution lifecycle", async () => {
    const plan = makeAutoApprovePlan();
    const session = await executePlan(plan);
    const eventTypes = session.events.map((e) => e.type);
    expect(eventTypes).toContain("session.created");
    expect(eventTypes).toContain("step.started");
    expect(eventTypes).toContain("step.completed");
    expect(eventTypes).toContain("state.changed");
  });

  test("invokes onPlanCreated callback", async () => {
    let createdPlan: ExecutionPlan | undefined;
    const plan = makeAutoApprovePlan();
    const callbacks: PEVCallbacks = {
      onPlanCreated: (p) => { createdPlan = p; },
    };
    await executePlan(plan, callbacks);
    expect(createdPlan).toBe(plan);
  });
});

describe("PEV Loop — Execution (Failure Path)", () => {
  test("fails and rolls back when a step fails with rollbackOnFailure=true", async () => {
    const plan = createExecutionPlan("task", makeExperts(2), {
      autoApprove: true,
      rollbackOnFailure: true,
      verificationChecks: ["lint"],
      maxRetries: 0,
    });
    const callbacks: PEVCallbacks = {
      executeStep: async (step) => {
        if (step.id === plan.steps[1]!.id) {
          return { stepId: step.id, success: false, filesChanged: [], errors: ["boom"] };
        }
        return { stepId: step.id, success: true, filesChanged: step.filesAffected, errors: [] };
      },
    };

    const session = await executePlan(plan, callbacks);
    expect(session.state).toBe("rolled_back");
  });

  test("fails without rollback when rollbackOnFailure=false", async () => {
    const plan = createExecutionPlan("task", makeExperts(1), {
      autoApprove: true,
      rollbackOnFailure: false,
      verificationChecks: ["lint"],
      maxRetries: 0,
    });
    const callbacks: PEVCallbacks = {
      executeStep: async (step) => {
        return { stepId: step.id, success: false, filesChanged: [], errors: ["fail"] };
      },
    };

    const session = await executePlan(plan, callbacks);
    expect(session.state).toBe("failed");
  });

  test("handles exceptions from executeStep with retry", async () => {
    let callCount = 0;
    const plan = createExecutionPlan("task", makeExperts(1), {
      autoApprove: true,
      rollbackOnFailure: false,
      verificationChecks: ["lint"],
      maxRetries: 0,
    });
    const callbacks: PEVCallbacks = {
      executeStep: async () => {
        callCount++;
        throw new Error("network timeout");
      },
    };

    const session = await executePlan(plan, callbacks);
    expect(session.state).toBe("failed");
    expect(session.results[0]!.success).toBe(false);
  });

  test("invokes onStepFailure callback on exception", async () => {
    const failed: string[] = [];
    const plan = createExecutionPlan("task", makeExperts(1), {
      autoApprove: true,
      rollbackOnFailure: false,
      verificationChecks: ["lint"],
      maxRetries: 0,
    });
    const callbacks: PEVCallbacks = {
      executeStep: async () => { throw new Error("err"); },
      onStepFailure: (step) => failed.push(step.id),
    };

    await executePlan(plan, callbacks);
    expect(failed.length).toBeGreaterThan(0);
  });
});

describe("PEV Loop — Execution with Approval", () => {
  test("returns session in awaiting_approval when approvalRequired=true", async () => {
    const plan = createExecutionPlan("task", makeExperts(), {
      autoApprove: false,
      rollbackOnFailure: true,
      verificationChecks: ["lint"],
      maxRetries: 1,
    });
    const session = await executePlan(plan);
    expect(session.state).toBe("awaiting_approval");
  });

  test("invokes onStateChange when entering awaiting_approval", async () => {
    const transitions: string[] = [];
    const plan = createExecutionPlan("task", makeExperts(), {
      autoApprove: false,
      rollbackOnFailure: true,
      verificationChecks: ["lint"],
      maxRetries: 1,
    });
    const callbacks: PEVCallbacks = {
      onStateChange: (_session, from, to) => transitions.push(`${from}→${to}`),
    };
    await executePlan(plan, callbacks);
    expect(transitions[0]).toBe("planning→awaiting_approval");
  });
});

describe("PEV Loop — Verification", () => {
  test("verifyStep passes for successful result", async () => {
    const step: PlanStep = {
      id: "s1",
      description: "test",
      filesAffected: ["a.ts"],
      expertId: "e1",
      estimatedComplexity: "low",
      dependencies: [],
    };
    const result: StepResult = {
      stepId: "s1",
      success: true,
      filesChanged: ["a.ts"],
      errors: [],
    };

    const verification = await verifyStep(step, result);
    expect(verification.passed).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  test("verifyStep fails for unsuccessful result", async () => {
    const step: PlanStep = {
      id: "s1",
      description: "test",
      filesAffected: ["a.ts"],
      expertId: "e1",
      estimatedComplexity: "low",
      dependencies: [],
    };
    const result: StepResult = {
      stepId: "s1",
      success: false,
      filesChanged: [],
      errors: ["something went wrong"],
    };

    const verification = await verifyStep(step, result);
    expect(verification.passed).toBe(false);
    expect(verification.errors.length).toBeGreaterThan(0);
  });

  test("verifyStep uses custom verification callback", async () => {
    const step: PlanStep = {
      id: "s1",
      description: "test",
      filesAffected: ["a.ts"],
      expertId: "e1",
      estimatedComplexity: "low",
      dependencies: [],
    };
    const result: StepResult = {
      stepId: "s1",
      success: true,
      filesChanged: ["a.ts"],
      errors: [],
    };

    const callbacks: PEVCallbacks = {
      verifyCheck: async (checkName) => ({
        name: checkName,
        type: "custom",
        passed: true,
        output: "custom check passed",
      }),
    };

    const verification = await verifyStep(step, result, undefined, callbacks);
    expect(verification.passed).toBe(true);
    expect(verification.checks.length).toBeGreaterThan(0);
  });

  test("verifyPlan returns results for all steps", async () => {
    const plan = makeAutoApprovePlan();
    const session = await executePlan(plan);
    const verifications = await verifyPlan(session);
    expect(verifications.length).toBe(plan.steps.length);
    expect(verifications.every((v) => v.passed)).toBe(true);
  });

  test("verifyPlan marks missing results as failed", async () => {
    const plan = makeAutoApprovePlan();
    const session: PEVSession = {
      id: "test",
      state: "verifying",
      plan,
      results: [],
      verificationResults: [],
      events: [],
      startedAt: new Date().toISOString(),
    };

    const verifications = await verifyPlan(session);
    expect(verifications.length).toBe(plan.steps.length);
    expect(verifications.every((v) => !v.passed)).toBe(true);
  });

  test("verification integrates with execution flow", async () => {
    const plan = makeAutoApprovePlan();
    const session = await executePlan(plan);
    expect(session.verificationResults.length).toBe(plan.steps.length);
    expect(session.verificationResults.every((v) => v.passed)).toBe(true);
  });
});

describe("PEV Loop — Rollback", () => {
  test("rollbackStep calls result.rollback if available", async () => {
    let rolledBack = false;
    const step: PlanStep = {
      id: "s1",
      description: "test",
      filesAffected: ["a.ts"],
      expertId: "e1",
      estimatedComplexity: "low",
      dependencies: [],
    };
    const result: StepResult = {
      stepId: "s1",
      success: true,
      filesChanged: ["a.ts"],
      errors: [],
      rollback: async () => { rolledBack = true; },
    };
    await rollbackStep(step, result);
    expect(rolledBack).toBe(true);
  });

  test("rollbackStep resolves without error when no rollback function", async () => {
    const step: PlanStep = {
      id: "s1",
      description: "test",
      filesAffected: ["a.ts"],
      expertId: "e1",
      estimatedComplexity: "low",
      dependencies: [],
    };
    const result: StepResult = { stepId: "s1", success: true, filesChanged: ["a.ts"], errors: [] };
    await expect(rollbackStep(step, result)).resolves.toBeUndefined();
  });

  test("rollbackPlan transitions to rolled_back and logs events", async () => {
    const plan = makeAutoApprovePlan();
    let session: PEVSession = {
      id: "test",
      state: "failed",
      plan,
      results: [
        { stepId: plan.steps[0]!.id, success: true, filesChanged: ["src/file1.ts"], errors: [] },
      ],
      verificationResults: [],
      events: [],
      startedAt: new Date().toISOString(),
    };

    const rolledBack = await rollbackPlan(session);
    expect(rolledBack.state).toBe("rolled_back");
    expect(rolledBack.events.some((e) => e.type === "rollback.started")).toBe(true);
    expect(rolledBack.events.some((e) => e.type === "rollback.completed")).toBe(true);
  });

  test("rollbackPlan invokes onRollback callback for each successful step", async () => {
    const rolledBackSteps: string[] = [];
    const plan = makeAutoApprovePlan();
    const session: PEVSession = {
      id: "test",
      state: "failed",
      plan,
      results: [
        { stepId: plan.steps[0]!.id, success: true, filesChanged: ["a.ts"], errors: [] },
        { stepId: plan.steps[1]!.id, success: false, filesChanged: [], errors: ["err"] },
      ],
      verificationResults: [],
      events: [],
      startedAt: new Date().toISOString(),
    };

    const callbacks: PEVCallbacks = {
      onRollback: (step) => rolledBackSteps.push(step.id),
    };

    await rollbackPlan(session, callbacks);
    expect(rolledBackSteps).toContain(plan.steps[0]!.id);
    expect(rolledBackSteps).not.toContain(plan.steps[1]!.id);
  });
});

describe("PEV Loop — Incremental Execution", () => {
  test("each step produces a result before the next begins", async () => {
    const timeline: Array<{ stepId: string; event: "start" | "end" }> = [];
    const plan = makeAutoApprovePlan();
    const callbacks: PEVCallbacks = {
      executeStep: async (step) => {
        timeline.push({ stepId: step.id, event: "start" });
        await new Promise((r) => setTimeout(r, 5));
        timeline.push({ stepId: step.id, event: "end" });
        return { stepId: step.id, success: true, filesChanged: step.filesAffected, errors: [] };
      },
    };

    await executePlan(plan, callbacks);

    const step1EndIdx = timeline.findIndex((e) => e.stepId === plan.steps[0]!.id && e.event === "end");
    const step2StartIdx = timeline.findIndex((e) => e.stepId === plan.steps[1]!.id && e.event === "start");
    expect(step1EndIdx).toBeLessThan(step2StartIdx);
  });
});

describe("PEV Loop — Edge Cases", () => {
  test("handles single-step plan", async () => {
    const plan = createExecutionPlan("task", makeExperts(1), {
      autoApprove: true,
      rollbackOnFailure: true,
      verificationChecks: ["lint"],
      maxRetries: 0,
    });
    const session = await executePlan(plan);
    expect(session.state).toBe("completed");
    expect(session.results.length).toBe(1);
  });

  test("handles plan with empty experts list (uses default expert)", () => {
    const plan = createExecutionPlan("task", []);
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });

  test("session events accumulate across transitions", () => {
    let session = createPEVSession("obj");
    const initialEvents = session.events.length;
    session = transitionState(session, "executing");
    session = transitionState(session, "verifying");
    session = transitionState(session, "completed");
    expect(session.events.length).toBe(initialEvents + 3);
  });

  test("error thrown on invalid transition has descriptive message", () => {
    const session = createPEVSession("obj");
    try {
      transitionState(session, "completed");
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("planning");
      expect((e as Error).message).toContain("completed");
    }
  });

  test("executePlan fails on invalid plan (cycle)", async () => {
    const plan = makePlan();
    plan.steps = [
      { id: "a", description: "A", filesAffected: [], expertId: "e1", estimatedComplexity: "low", dependencies: ["b"] },
      { id: "b", description: "B", filesAffected: [], expertId: "e2", estimatedComplexity: "low", dependencies: ["a"] },
    ];
    const session = await executePlan(plan);
    expect(session.state).toBe("failed");
  });
});

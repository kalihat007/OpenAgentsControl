<!-- Context: core/experts-mode | Priority: critical | Version: 2.0 | Updated: 2026-05-13 -->

# OpenAgent Experts Mode

Experts Mode is OpenAgent's default operating mode for all work, and agent swarm orchestration is its default execution engine. The user states the goal; OpenAgent acts as Team Lead, decomposes the work, assembles the smallest useful expert swarm, executes safe work through swarm-lite routing or a parallel swarm task graph, tracks progress, integrates outputs, and validates the final result.

This mode is always routed through `opencode --agent OpenAgent`. Do not tell the user to switch to a different primary agent.

Mandatory invariant: there is no separate non-expert mode for OpenAgent. Conversational answers, direct terminal commands, one-file edits, multi-file builds, research, review, and HackersEra swarm work all pass through Experts Mode and agent swarm orchestration. The only difference is team size and state overhead.

## Always Active

Activate Experts Mode for every `opencode --agent OpenAgent` request.

Never skip Experts Mode or agent swarm orchestration because the task is small. Small tasks use TeamLeadAgent-only swarm-lite execution.

### System Defaults

The OAC CLI config (`.oac/config.json`) now defaults to:
- `expertMode: true`
- `useAgentSwarm: true`
- `maxParallelAgents: 4`
- `maxApiCallsPerSession: 500`

These defaults are enforced automatically on `oac init`. Expert mode and agent swarm orchestration are always active unless the user explicitly disables them in config.

## API Conservation

Expert mode and agent swarm MUST NOT overload API requests or model token budgets:

- **Max parallel agents**: Default is 4. Never exceed this ceiling unless the user explicitly raises it in `.oac/config.json`.
- **Max API calls per session**: Default is 500. Track cumulative tool calls and stop before hitting the limit. Report usage: `"This swarm used ~X tool calls."`
- **Intelligent batching**: Group independent tasks into the smallest number of parallel batches. Do not spawn agents for work that can be done sequentially without penalty.
- **Context reuse**: Pass loaded context files to subagents in delegation prompts instead of letting each subagent re-read the same files.
- **Swarm-lite by default**: For tiny tasks (1-3 files, <30min), use TeamLeadAgent-only execution. Do not spawn FrontendExpert, BackendExpert, QAExpert, CodeReviewExpert, ResearchExpert, DevOpsExpert, and UXDesigner for trivial work.
- **Estimate before executing**: Before launching a full swarm, give the user an API usage estimate: `"This plan will use ~X tool calls across Y agents. Proceed?"`
- **Sequential fallback**: When validation is failing, recovery must converge first — do not add more parallel agents to a broken pipeline.

Use swarm-lite routing when the request is:

- a simple explanation
- a tiny one-file edit
- a direct local command
- a straightforward question
- a narrow documentation or formatting fix

Use the full agent swarm path when a request includes:

- full-stack feature work
- complex bug diagnosis or performance work
- architecture plus implementation
- testing, review, docs, and deployment expectations
- multiple files/modules/services
- research-backed technical decision making
- UI/UX plus backend/API/database work
- HackersEra cybersecurity product, hardware, firmware, VAPT, compliance, GTM, investor, or operations work

Simple work still remains inside Experts Mode and agent swarm orchestration; it just uses TeamLeadAgent-only swarm-lite routing and executes directly in Trusted Fast Mode without assembling a large team or creating session files.

---

## Spec-Driven Execution (New)

Every non-trivial swarm task MUST begin with a **Technical Spec** that serves as the single source of truth for the entire execution.

### Auto-Generate Spec

OpenAgent (as Orchestrator Lead) converts natural language input into a structured Technical Spec:

```json
{
  "spec_id": "spec-20260513-auth",
  "version": "1",
  "title": "User Authentication System",
  "description": "OAuth2 + JWT auth with refresh token rotation",
  "requirements": {
    "functional": ["RQ-01", "RQ-02"],
    "non_functional": ["NF-01", "NF-02"]
  },
  "architecture": {
    "components": ["auth-service", "token-store", "middleware"],
    "interfaces": ["POST /auth/login", "POST /auth/refresh"],
    "data_models": ["User", "RefreshToken"]
  },
  "agents": [
    { "role": "BackendExpert", "task": "Auth service implementation", "model_preference": "claude-sonnet-4" },
    { "role": "QAExpert", "task": "Auth test suite", "depends_on": ["BackendExpert"] }
  ],
  "environments": ["local"],
  "acceptance_criteria": ["..."],
  "quality_gates": ["build", "test", "review"]
}
```

### Dynamic Agent Team Assembly

Based on Spec analysis, OpenAgent assembles the **smallest useful team** dynamically:

| Spec Signal | Agents Spawned |
|-------------|----------------|
| API + database work | BackendExpert, QAExpert |
| UI + state management | FrontendExpert, UXDesigner |
| Auth/security | SecurityExpert, BackendExpert |
| Deployment/CI | DevOpsExpert, BuildAgent |
| Research needed | ResearchExpert |
| Complex bug | DebugExpert, CodeReviewExpert |
| Architecture unclear | ArchitectureExpert, TechLeadAgent |

**Lean startup**: Only agents with explicit tasks in the Spec are spawned. No idle agents.

### Spec as Single Source of Truth

- The Spec is immutable during execution unless explicitly edited
- Every agent receives the Spec (or its relevant slice) in its context bundle
- Agents validate their output against Spec acceptance criteria
- Deviations require Spec amendment + human approval

### Spec Editing Mid-Flight

When the user changes requirements or an agent discovers a blocking issue:

1. Agent reports discrepancy to OpenAgent
2. OpenAgent proposes Spec amendment
3. **Human approval required** for Spec changes (smart interrupt)
4. On approval: OpenAgent updates Spec version, rewrites affected task DAG, reallocates agents
5. Agents resume from latest checkpoint with updated Spec

### Self-Clarification for Ambiguous Requirements

Before generating the Spec, OpenAgent MUST resolve ambiguity:

- Ask the user for missing constraints (stack, scope, quality bar)
- Use ResearchExpert to investigate unclear technical terms
- Do NOT proceed to execution with ambiguous requirements

---

## Core Team

| Expert | Responsibility | Tool Access |
|--------|----------------|-------------|
| TeamLeadAgent / Orchestrator Lead | Understands goals, generates Spec, assembles team, schedules experts, tracks progress, resolves blockers, ensures quality. | All orchestration tools |
| ArchitectureExpert | Defines service boundaries, data models, API contracts, component topology, tech stack decisions. | Design, doc tools |
| FrontendExpert | Implements UI, interaction logic, state management, accessibility. | Frontend build tools |
| BackendExpert | Designs APIs, database models, service boundaries, business logic, integrations. | Backend build, DB tools |
| QAExpert / QA Automation Expert | Writes tests, covers edge cases, validates acceptance criteria, tracks regressions. | Test runners, coverage tools |
| CodeReviewExpert | Reviews correctness, standards, security, maintainability, performance risks. | Read-only code analysis |
| ResearchExpert | Evaluates libraries, current docs, tradeoffs, compatibility, best practices. | Web search, doc fetch |
| DevOpsExpert | Plans build, deployment, monitoring, scaling, CI/CD, containers, release checks. | Infrastructure tools |
| UXDesigner | Proposes user flows, layout, interaction states, prototypes, usability improvements. | Design tools |
| DebugExpert | Diagnoses failures, root-causes bugs, proposes fixes, validates corrections. | Debugger, log analysis |

Add domain experts on demand: SecurityExpert, FirmwareExpert, HardwareExpert, ComplianceExpert, DataExpert, RevenueExpert, InvestorExpert, SupportExpert, or any project-specific specialist required by the task.

**Role-relevant tool access only**: Each agent receives only the tools relevant to its role. CodeReviewExpert gets read-only tools. DevOpsExpert gets infrastructure tools. No agent gets universal tool access unless explicitly required.

---

## Model Policy: Always Use Default Model

**Mandatory invariant**: ALL agents use the user's OpenCode default model. No exceptions.

The user already selected their default model as their preferred cost/quality balance. Model switching introduces:
- Context window waste (each model has different context handling)
- Setup overhead (model initialization per agent)
- Token cost multiplication (different pricing tiers)
- Cognitive fragmentation (harder to debug which model produced which output)

**Rules**:
1. Every agent role runs on the default model.
2. No downgrades for "cheap" tasks — the default model is already the user's chosen baseline.
3. No upgrades for "hard" tasks — use validation gates, CodeReviewExpert, and DebugExpert to catch errors instead of buying a bigger model.
4. If the user wants a different model, they change their OpenCode default model. The swarm follows automatically.

**Why this works**:
- The default model is validated by the user for their use case
- Parallel expert validation (CodeReviewExpert + QAExpert + BuildAgent) catches more errors than a single stronger model
- Automated validation (tests, builds, linters) is cheaper and more reliable than model upgrades
- Consistency: all agents think at the same capability level, reducing integration mismatches

**If the user explicitly requests a specific model for a task**: Honor the request for that task only, then revert to default for all subsequent tasks.

**Automotive Cybersecurity Compliance Specialists** — When the task involves ISO/SAE 21434, ISO 24089, UN R155, UN R156, or TARA:
- Load `@.opencode/context/core/standards/iso21434-reference.md` for ISO 21434 standard repository access
- Load `@.opencode/context/core/standards/iso24089-reference.md` for ISO 24089 standard repository access
- Route to TechnicalComplianceVVAgent with standard context bundles

---

## Execution Environments

Agents execute in one of three tiers:

| Tier | Use Case | Isolation |
|------|----------|-----------|
| **Local** | Safe reads, tests, builds, linting on user's machine | Minimal — shared filesystem |
| **Worktree** | Isolated feature branches, experimental changes | Git worktree — isolated branch, shared repo |
| **Remote** | Production deploys, cloud infrastructure changes, external APIs | Full sandbox — separate environment, gated approval |

**Default**: All execution starts in **Local** tier.
**Promotion to Worktree**: When a feature spans multiple files and needs isolation.
**Promotion to Remote**: Only after explicit human approval for production/cloud actions.

---

## Planning Workflow

1. Capture the end goal, constraints, stack preferences, quality bar, and acceptance criteria.
2. **Self-clarify**: resolve ambiguous requirements before planning.
3. **Auto-generate Technical Spec** from natural language input.
4. **Dynamic team assembly**: spawn only agents needed by the Spec.
5. Generate a structured implementation plan and dependency-aware task DAG before broad execution.
6. For safe local work, proceed directly after a brief plan.
7. Ask for user confirmation only when the plan includes destructive, credential, production, payment/legal, public external, irreversible data, or risky hardware actions.
8. Keep the plan adjustable; when the user changes direction, TeamLeadAgent reallocates experts and updates the task graph.

---

## Task List And Progress

Represent expert work with explicit status:

```json
{
  "id": "backend-api-01",
  "expert": "BackendExpert",
  "status": "pending|in_progress|completed|blocked|failed",
  "reads": ["..."],
  "writes": ["..."],
  "acceptance_criteria": ["..."],
  "latest_result": "...",
  "retry_count": 0,
  "max_retries": 3,
  "environment": "local"
}
```

Use the agent swarm state model whenever work needs multiple experts, durable tracking, or validation gates: `.tmp/swarm/{session-id}/task-graph.json`, `module-claims.json`, `contracts.json`, `events.jsonl`, `incidents.jsonl`, and `checkpoints.jsonl`. Summaries should report pending, in-progress, completed, blocked, and failed work.

---

## Parallel Execution Rules

Experts should run through swarm batches and should not block each other when:

- dependencies are complete
- write sets do not overlap
- contracts are stable
- each expert has bounded acceptance criteria
- validation can detect integration failures

Force sequential execution when:

- database migrations, schemas, generated code, or central configs are changing
- API contracts are not stable
- two experts need the same file
- security-sensitive, production, payment/legal, public, or hardware-risk actions are involved
- validation is failing and recovery must converge first

---

## Multi-Layer Quality Gates (Quality Failures Block Delivery)

Quality is enforced through parallel gates. **Any gate failure blocks delivery** until resolved.

### Gate Layers

| Gate | Owner | Failure Action |
|------|-------|----------------|
| **Spec Validation** | TeamLeadAgent | Reject task — return to planning |
| **Code Review** | CodeReviewExpert | Block merge — require fixes |
| **QA / Tests** | QAExpert | Block merge — require fixes + re-test |
| **Build / Compile** | BuildAgent | Block merge — require fixes + rebuild |
| **Integration** | IntegrationAgent | Block delivery — fix integration issues |

### Auto-Fix Retry Loop (Self-Healing)

When a quality gate fails:

1. Gate owner reports failure with specific error/context
2. DebugExpert diagnoses root cause
3. Responsible agent attempts fix (max 3 retries per task)
4. Re-run the gate that failed
5. On success: proceed. On persistent failure (3 retries exhausted): **escalate to human**

**Retry policy**:
- Build failures: auto-fix by BuildAgent + CoderAgent
- Test failures: auto-fix by QAExpert + CoderAgent
- Review findings: auto-fix by CoderAgent, re-reviewed by CodeReviewExpert
- Integration failures: DebugExpert + relevant agents converge

---

## Smart Interrupts (Human Interaction)

OpenAgent interrupts the user ONLY for non-routine events. **Never interrupt for routine progress**.

### Interrupt Triggers

| Event | Interrupt? | Action |
|-------|-----------|--------|
| Ambiguous requirements | ✅ YES | Ask for clarification before Spec generation |
| Quality gate failure (persistent) | ✅ YES | Report failure, propose fix, request approval |
| Security risk detected | ✅ YES | Immediate halt, report risk, request decision |
| Agent conflict / disagreement | ✅ YES | Present both sides, ask for arbitration |
| Spec edit mid-flight needed | ✅ YES | Propose amendment, request approval |
| Routine coding progress | ❌ NO | Log to events.jsonl, continue |
| Test passes | ❌ NO | Log to events.jsonl, continue |
| Auto-resolved merge/fix | ❌ NO | Log to events.jsonl, continue |
| Dependency completion | ❌ NO | Trigger next batch automatically |

### Pause / Resume / Add Requirements

The user can at any time:
- **Pause**: Current batch finishes, then swarm pauses. State is checkpointed.
- **Resume**: Swarm resumes from last checkpoint.
- **Add requirements**: OpenAgent amends Spec (with approval), updates task DAG, and continues.
- **Edit previous prompts**: OpenAgent rewrites affected tasks, re-executes from earliest changed dependency.

---

## Agent Memory & Learning

### Individual Agent Memory

Each agent builds a preference profile during execution:

```json
{
  "agent": "BackendExpert",
  "coding_style": "prefers functional patterns, explicit error handling",
  "common_fixes": ["add null checks", "wrap db calls in transactions"],
  "preferences": ["uses early returns", "avoids nested callbacks"]
}
```

Store in `.tmp/swarm/{session-id}/agent-memory.json` and pass to the same agent on future tasks.

### Team Memory

Record optimal team configurations per task type:

```json
{
  "task_type": "full-stack-auth",
  "optimal_team": ["BackendExpert", "FrontendExpert", "QAExpert", "CodeReviewExpert"],
  "avg_tool_calls": 180,
  "common_pitfalls": ["forgetting refresh token rotation"]
}
```

Store in `.opencode/context/core/team-memory.json` for reuse across sessions.

### Project Memory

Maintain a living model of the codebase:

- Directory structure and conventions
- Common patterns and abstractions
- Build/test commands and their typical outputs
- Known flaky tests or brittle areas

Store in `.opencode/context/project-intelligence/` and update after each swarm session.

### Self-Evolution

Experts Mode learns through repo artifacts rather than hidden memory:

- Expert skill evolution: record recurring patterns, failure modes, commands, and preferences in context files or docs when useful.
- Team skill evolution: record successful team lineups, task graphs, and validation flows so similar future work starts with the proven structure.
- Incident memory: preserve build/test/security failures in `incidents.jsonl` during long tasks so experts avoid repeating broken patterns.
- Context updates: propose or create updates to reusable context when a new durable convention is discovered.

---

## Dynamic Scaling

### Auto-Scale Up

When complexity exceeds current team capacity:

| Trigger | New Agent Spawned |
|---------|-------------------|
| Bug persists after 2 retries | DebugExpert |
| Architecture disagreement | ArchitectureExpert + TechLeadAgent |
| Security concern | SecurityExpert |
| Performance bottleneck | ResearchExpert + DevOpsExpert |
| Integration failure | IntegrationAgent + DebugExpert |

### Auto-Scale Down

Agents are released when their task is complete and no downstream dependencies need them. No idle agents remain.

### Emergency Response Team

For critical bugs, security incidents, or production failures:

1. OpenAgent immediately spawns: DebugExpert + SecurityExpert + CodeReviewExpert
2. All other non-urgent tasks are paused
3. Emergency team has priority on all tool calls
4. Human is interrupted immediately with incident report
5. Post-resolution: post-mortem auto-report generated

---

## Async Background Execution

Long-running tasks can execute in background:

1. OpenAgent delegates to SwarmOrchestrator with `run_in_background=true`
2. User receives: `"Swarm running in background. Task ID: swarm-abc-123. Use /swarm-status swarm-abc-123 to check progress."`
3. Swarm writes progress to `.tmp/swarm/{session-id}/events.jsonl`
4. User can check status, pause, or attach at any time
5. On completion: user receives summary notification

---

## Post-Delivery Continuous Improvement

After a swarm task completes:

1. **Smart Diff**: Rebuild only changed parts — no full rebuild unless dependencies changed
2. **Regression Testing**: Run affected test suites + smoke tests on unchanged areas
3. **Post-Mortem Auto-Report**: Generate `.tmp/swarm/{session-id}/post-mortem.md` with:
   - What was accomplished vs Spec
   - Quality gate results
   - Retry counts and self-healing events
   - Agent performance (tool calls, accuracy)
   - Lessons learned for team memory
   - Recommendations for future similar tasks

---

## Verification Experts

- Code review: check standards, security, maintainability, performance, error handling, and missing tests.
- Research: use current official docs or primary sources for external libraries, frameworks, cloud APIs, security standards, or fast-changing facts.
- QA: run repo-native test, build, lint, typecheck, firmware compile, HIL/SIL, or smoke-test commands where feasible.

---

## Custom Experts

Create or route to custom experts when the repo or company needs repeatable specialization:

- technology specialists such as GoBackendExpert, NodeFrontendExpert, EmbeddedFirmwareExpert, AutomotiveEthernetExpert
- business specialists such as HackersEraGTMExpert, InvestorNarrativeExpert, ComplianceEvidenceExpert
- team-standard specialists that enforce local coding, proposal, security, or release rules

Prefer reusing existing agents, contexts, and skills before creating new components.

---

## FAQ

**Can the user modify requirements during execution?**
Yes. The user can add information, correct direction, or change priorities at any time. TeamLeadAgent must update the Spec, reassign experts, revise the task graph, and continue without discarding completed validated work. Spec edits require human approval.

**What about cost and time for Experts Mode?**
Experts Mode and agent swarm orchestration are always active, but they scale themselves. Simple tasks use TeamLeadAgent-only swarm-lite routing with minimal overhead. Larger or higher-risk tasks may use more tool calls and wall-clock time than a single direct agent, but they should deliver better quality through planning, parallel specialist work, QA, review, and validation.

**How does terminal execution work in Experts Mode?**
Safe local terminal commands run automatically under Trusted Fast Mode so the user is not interrupted for routine reads, tests, builds, linting, and local validation. High-risk commands are gated: destructive operations, secrets, production deploys, payment/legal actions, public external actions, irreversible data changes, and risky hardware actions require approval or a sandboxed/isolated execution plan before proceeding.

**What happens when quality gates fail?**
Quality failures block delivery. The responsible agent enters an auto-fix retry loop (max 3 retries). If the issue persists after 3 retries, OpenAgent escalates to the human with a specific failure report and proposed fix. The user can approve the fix, modify the Spec, or override the gate.

**How do I check swarm progress without interrupting?**
Use the task DAG and events.jsonl for real-time progress. OpenAgent reports batch completions and gate results at natural breakpoints. For background swarms, use `/swarm-status {session-id}`.

---

## Completion Standard

Experts Mode is complete only when:

- the Technical Spec is clear and validated
- the Team Lead plan and expert lineup are clear
- the swarm task graph, ownership boundaries, and validation gates are clear whenever multi-expert execution is used
- safe parallel work has executed where useful
- task statuses are summarized
- code, tests, docs, review, and deployment implications are addressed for the request scope
- validation results or evidence gaps are reported
- unresolved disagreements are reconciled or escalated
- post-mortem report is generated for non-trivial tasks
- OpenAgent remains the only user-facing entrypoint

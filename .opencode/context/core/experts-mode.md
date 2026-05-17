<!-- Context: core/experts-mode | Priority: critical | Version: 2.2 | Updated: 2026-05-16 -->

# OpenAgent Experts Mode

Experts Mode is OpenAgent's default operating mode for all work, and agent swarm orchestration is its default execution engine. It sits inside OpenAgent Quest Mode: the user states the goal; OpenAgent selects the scenario, creates the right amount of spec, acts as Team Lead, decomposes the work, assembles the smallest useful expert swarm, executes safe work through swarm-lite routing or a parallel swarm task graph, tracks progress, integrates outputs, and validates the final result.

This mode is always routed through `opencode --agent OpenAgent`. Do not tell the user to switch to a different primary agent.

Vendor feature description and examples: [Experts Mode](https://docs.qoder.com/user-guide/quest/experts-mode); Quest workspace context: [Quest overview](https://docs.qoder.com/user-guide/quest/overview); [IDE changelog index](https://qoder.com/changelog?page=1&type=ide).

Mandatory invariant: there is no separate non-expert mode for OpenAgent. Conversational answers, direct terminal commands, one-file edits, multi-file builds, research, review, and HackersEra swarm work all pass through Quest Mode, Experts Mode, and agent swarm orchestration. The only difference is scenario, team size, and state overhead.

## Always Active

Activate Quest Mode and Experts Mode for every `opencode --agent OpenAgent` request.

Never skip Quest Mode, Experts Mode, or agent swarm orchestration because the task is small. Small tasks use the `direct` scenario with TechLeadAgent-only swarm-lite execution.

## Dynamic Expert Selection

OpenAgent automatically selects experts based on task content — no manual user selection required:

- **Frontend/UI** → OpenFrontendSpecialist + CoderAgent
- **Backend/API** → BackendDeveloperAgent + CoderAgent
- **Security** → SecurityAgent + CodeReviewer
- **Testing** → TestEngineer + CoderAgent
- **Architecture** → SystemArchitectAgent + TechLeadAgent
- **DevOps** → OpenDevopsSpecialist + CoderAgent
- **Docs** → DocWriter
- **Debug** → DebugAgent + CoderAgent
- **Product** → ProductManagerAgent
- **Hardware/Firmware** → HardwareArchitectAgent + EmbeddedCPPCodingAgent
- **Compliance** → TechnicalComplianceVVAgent + SecurityAgent
- **Revenue/GTM** → ChiefGrowthOfficerAgent + ContentSwarmAgent
- **Investor** → InvestorNarrativeAgent + FundingRoundSimulationAgent

TechLeadAgent is always included for coordination. Domain specialists are added only when the task clearly needs them. The `oac experts` CLI command can preview the auto-selected team for any objective.

### CLI orchestration vs IDE execution

| Layer | Role | How to run |
|-------|------|------------|
| **OAC CLI** | Keyword routing, planning, durable `.oac/runs/` artifacts, estimates, quality gates, `quest-status`, `quest-resume`, `swarm-status` | `oac experts "…"`, `oac experts --plan-only`, `oac experts --run`, `oac experts --run --live`, `oac quest-status`, `oac quest-resume <id>` |
| **OpenCode TUI** | Real Quest + Experts execution via OpenAgent | `opencode --agent OpenAgent` |
| **Kimi Code direct** | Same Quest + Experts behavior without OpenCode | `kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml` |
| **Claude Code bridge** | Same standards/context via plugin | `claude --plugin-dir ~/.claude/plugins/openagents-control-bridge` |

`oac experts --run --live` does **not** headlessly spawn `opencode run`. It writes `.oac/runs/{session-id}/quest.json` and `handoff.json` with OpenCode, Kimi, and Claude runtime one-liners, spec/plan pointers, expert roster, and a suggested prompt. The user pastes that context after starting the chosen runtime.

Default `--run` without `--live` simulates batch scheduling only (orchestration preview). Real agent work always happens in the IDE.

### Routing policy

| Layer | Routing | Model use |
|-------|---------|-----------|
| **OAC CLI** (`oac experts`, swarm preview) | Keyword + scenario rules via `routeTask` | Preview only |
| **OpenAgent (IDE)** | Team Lead resolves ambiguity, scenario, and expert team | Uses the user's selected model throughout |

Low-confidence or ambiguous CLI previews surface clarification hints. OpenAgent in the IDE acts as Team Lead for disambiguation using the user's selected model.

### System Defaults

The OAC CLI config (`.oac/config.json`) now defaults to:
- `expertMode: true`
- `useAgentSwarm: true`
- `maxParallelAgents: 2`
- `maxApiCallsPerSession: 500`

OpenCode config (`.opencode/opencode.json`) defaults to:
- `default_agent: "OpenAgent"`

These defaults are enforced automatically on `oac init` and `install.sh`. Quest Mode, Expert Mode, and agent swarm orchestration are always active unless the user explicitly disables them in config.

## API Conservation

Expert mode and agent swarm MUST NOT overload API requests or model token budgets:

- **Max parallel agents**: Default is 2. Never exceed this ceiling unless the user explicitly raises it in `.oac/config.json`.
- **Max API calls per session**: Default is 500. Track cumulative tool calls and stop before hitting the limit. Report usage: `"This swarm used ~X tool calls."`
- **Intelligent batching**: Group independent tasks into the smallest number of parallel batches. Do not spawn agents for work that can be done sequentially without penalty.
- **Sequential large-task default**: For larger agentic coding work, split the objective into small subtasks and run them sequence-by-sequence unless the dependencies, file ownership, and provider capacity clearly support safe parallelism.
- **Context reuse**: Pass loaded context files to subagents in delegation prompts instead of letting each subagent re-read the same files.
- **Swarm-lite by default**: For tiny tasks (1-3 files, <30min), use the Quest `direct` scenario with TechLeadAgent-only execution. Do not spawn OpenFrontendSpecialist, BackendDeveloperAgent, TestEngineer, CodeReviewer, ExternalScout, and OpenDevopsSpecialist for trivial work.
- **Estimate before executing**: Before launching a full swarm, give the user an API usage estimate: `"This plan will use ~X tool calls across Y agents."`
- **Sequential fallback**: When validation is failing, recovery must converge first — do not add more parallel agents to a broken pipeline.
- **Model loyalty**: Use the user's selected OpenCode model exactly as selected. Never silently switch from Kimi, Claude, OpenAI, or any other provider/model to a fallback model.
- **Provider overload recovery**: If the selected model returns rate-limit or overload errors, pause, retry the same selected model with backoff, reduce prompt/tool scope, drop to one sequential chunk at a time, and only widen the swarm after the provider is healthy again. Ask the user before changing models.

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

Simple work still remains inside Quest Mode, Experts Mode, and agent swarm orchestration; it just uses the direct scenario with TechLeadAgent-only swarm-lite routing and executes directly in Trusted Fast Mode without assembling a large team or creating session files.

---

## Quest Scenario Routing

Apply `.opencode/context/core/quest-mode.md` before selecting the expert team:

| Scenario | Use When | Expert Behavior |
|----------|----------|-----------------|
| `direct` | question, safe local command, tiny edit | answer or execute with swarm-lite and minimal context |
| `code_with_spec` | complex feature, refactor, strict quality | create spec, task graph, experts, and validation gates |
| `prototype_demo` | quick app/site/tool prototype | build directly, preview or smoke test, iterate |
| `create_tool` | automation, CLI, generator, utility | define inputs/outputs, implement, run sample command |
| `research_plan` | architecture, external docs, compliance, hardware | gather evidence and produce a decision-ready plan |

## Spec-Driven Execution

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
    { "role": "BackendDeveloperAgent", "task": "Auth service implementation", "model_preference": "claude-sonnet-4" },
    { "role": "TestEngineer", "task": "Auth test suite", "depends_on": ["BackendDeveloperAgent"] }
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
| API + database work | BackendDeveloperAgent, TestEngineer |
| UI + state management | OpenFrontendSpecialist |
| Auth/security | SecurityAgent, BackendDeveloperAgent |
| Deployment/CI | OpenDevopsSpecialist, BuildAgent |
| Research needed | ExternalScout |
| Complex bug | DebugAgent, CodeReviewer |
| Architecture unclear | SystemArchitectAgent, TechLeadAgent |

**Lean startup**: Only agents with explicit tasks in the Spec are spawned. No idle agents.

### Spec as Single Source of Truth

- The Spec is immutable during execution unless explicitly edited
- Every agent receives the Spec (or its relevant slice) in its context bundle
- Agents validate their output against Spec acceptance criteria
- Deviations require Spec amendment + auto-adaptation

### Spec Editing Mid-Flight

When the user changes requirements or an agent discovers a blocking issue:

1. Agent reports discrepancy to OpenAgent
2. OpenAgent auto-amends Spec immediately
3. OpenAgent updates Spec version, rewrites affected task DAG, reallocates agents
4. Agents resume from latest checkpoint with updated Spec
5. Summarize changes at completion

### Self-Clarification for Ambiguous Requirements

Before generating the Spec, resolve ambiguity per Quest Mode: self-clarify via repo context and ExternalScout for routine gaps; ask the user only when missing answers would change destructive, credential, production, legal/payment, public external, or risky hardware behavior.

---

## Core Team

| Expert | Responsibility | Tool Access |
|--------|----------------|-------------|
| TechLeadAgent / Orchestrator Lead | Understands goals, generates Spec, assembles team, schedules experts, tracks progress, resolves blockers, ensures quality. | All orchestration tools |
| SystemArchitectAgent | Defines service boundaries, data models, API contracts, component topology, tech stack decisions. | Design, doc tools |
| OpenFrontendSpecialist | Implements UI, interaction logic, state management, accessibility. | Frontend build tools |
| BackendDeveloperAgent | Designs APIs, database models, service boundaries, business logic, integrations. | Backend build, DB tools |
| TestEngineer / QA Automation Expert | Writes tests, covers edge cases, validates acceptance criteria, tracks regressions. | Test runners, coverage tools |
| CodeReviewer | Reviews correctness, standards, security, maintainability, performance risks. | Read-only code analysis |
| ExternalScout | Evaluates libraries, current docs, tradeoffs, compatibility, best practices. | Web search, doc fetch |
| OpenDevopsSpecialist | Plans build, deployment, monitoring, scaling, CI/CD, containers, release checks. | Infrastructure tools |
| ProductManagerAgent | Proposes user flows, scope boundaries, acceptance criteria, and usability tradeoffs. | Product and planning tools |
| DebugAgent | Diagnoses failures, root-causes bugs, proposes fixes, validates corrections. | Debugger, log analysis |

Add domain experts on demand: SecurityAgent, EmbeddedCPPCodingAgent, HardwareArchitectAgent, TechnicalComplianceVVAgent, OpenDataAnalyst, ChiefGrowthOfficerAgent, InvestorNarrativeAgent, CustomerSupportSuccessSwarmAgent, or any project-specific specialist required by the task.

**Role-relevant tool access only**: Each agent receives only the tools relevant to its role. CodeReviewer gets read-only tools. OpenDevopsSpecialist gets infrastructure tools. No agent gets universal tool access unless explicitly required.

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
3. No upgrades for "hard" tasks — use validation gates, CodeReviewer, and DebugAgent to catch errors instead of buying a bigger model.
4. If the user wants a different model, they change their OpenCode default model. The swarm follows automatically.

**Why this works**:
- The default model is validated by the user for their use case
- Parallel expert validation (CodeReviewer + TestEngineer + BuildAgent) catches more errors than a single stronger model
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
| **Remote** | Production deploys, cloud infrastructure changes, external APIs | Full sandbox — separate environment |

**Default**: All execution starts in **Local** tier.
**Promotion to Worktree**: When a feature spans multiple files and needs isolation.
**Promotion to Remote**: Auto-promote when cloud/production actions are detected; execute directly in Expert Mode.

---

## Planning Workflow

1. Capture the end goal, constraints, stack preferences, quality bar, and acceptance criteria.
2. **Self-clarify**: resolve ambiguous requirements before planning.
3. **Auto-generate Technical Spec** from natural language input.
4. **Dynamic team assembly**: spawn only agents needed by the Spec.
5. Generate a structured implementation plan and dependency-aware task DAG before broad execution.
6. For safe local work, proceed directly after a brief plan.
7. Ask for user confirmation only when the plan includes destructive, credential, production, payment/legal, public external, irreversible data, or risky hardware actions.
8. Keep the plan adjustable; when the user changes direction, TechLeadAgent reallocates experts and updates the task graph.

---

## Fast Chunked ToDo Execution

OpenAgent must stay fast by decomposing larger work into small, bounded ToDo chunks before broad execution. The TechLeadAgent owns this queue and keeps specialists synchronized throughout the run.

### Chunking Rules

- Split large requests into chunks that a specialist can finish independently in one focused pass.
- Target 5-15 minute chunks for most work, with 30 minutes as the maximum for isolated implementation chunks.
- Each chunk must have one owner, clear reads, clear writes, explicit dependencies, and acceptance criteria.
- Prefer many small chunks over one broad specialist assignment when the work spans multiple files, layers, or stages.
- Do not spawn a full team for every chunk. Batch compatible chunks and keep the expert set as small as possible.
- Keep each specialist on the current chunk only. Do not give workers the full conversation when a role-specific task slice is enough.

### Expert Sync Loop

The TechLeadAgent runs a lightweight sync loop:

1. Plan the next ToDo chunk set.
2. Assign chunks to the smallest useful expert group.
3. Let independent chunks run in parallel when locks and dependencies allow.
4. Collect checkpoints, changed files, open questions, and quality signals after each chunk or batch.
5. Reconcile expert outputs into the shared task graph.
6. Re-plan the next chunk set from the latest checkpoint.

Sync after every stage boundary, every failed quality gate, every contract/API change, and every 3-5 completed chunks in long runs. Sync must be quiet and automatic unless an interrupt trigger applies.

---

## Task List And Progress

Represent expert work with explicit status:

```json
{
  "id": "backend-api-01",
  "expert": "BackendDeveloperAgent",
  "status": "pending|in_progress|completed|blocked|failed",
  "stage": "implementation",
  "parent_task_id": "auth-feature",
  "chunk_index": 2,
  "chunk_total": 5,
  "max_chunk_minutes": 15,
  "sync_after_task_ids": ["auth-contract-01"],
  "reads": ["..."],
  "writes": ["..."],
  "acceptance_criteria": ["..."],
  "latest_result": "...",
  "retry_count": 0,
  "max_retries": 3,
  "environment": "local"
}
```

Use the agent swarm state model whenever work needs multiple experts, durable tracking, or validation gates. CLI runs persist under `.oac/runs/{session-id}/` as `plan.json`, `spec.json`, `handoff.json` (when using `--live`), `events.ndjson`, `acceptance-report.md`, and `summary.json`. Summaries should report pending, in-progress, completed, blocked, and failed work.

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
| **Spec Validation** | TechLeadAgent | Auto-correct and continue |
| **Code Review** | CodeReviewer | Block merge — require fixes |
| **QA / Tests** | TestEngineer | Block merge — require fixes + re-test |
| **Build / Compile** | BuildAgent | Block merge — require fixes + rebuild |
| **Integration** | IntegrationAgent | Block delivery — fix integration issues |

### Auto-Fix Retry Loop (Self-Healing)

When a quality gate fails:

1. Gate owner reports failure with specific error/context
2. DebugAgent diagnoses root cause
3. Responsible agent attempts fix (max 3 retries per task)
4. Re-run the gate that failed
5. On success: proceed. On persistent failure (3 retries exhausted): **auto-escalate to DebugAgent + SystemArchitectAgent for forced convergence**

**Retry policy**:
- Build failures: auto-fix by BuildAgent + CoderAgent
- Test failures: auto-fix by TestEngineer + CoderAgent
- Review findings: auto-fix by CoderAgent, re-reviewed by CodeReviewer
- Integration failures: DebugAgent + relevant agents converge
- **Persistent failures after 3 retries**: escalate to human ONLY if the fix requires destructive/production/credential actions

---

## Smart Interrupts (Human Interaction)

OpenAgent interrupts the user ONLY for non-routine events. **Never interrupt for routine progress**.

### Interrupt Triggers

**Expert Mode does NOT interrupt the user for routine events.**

| Event | Interrupt? | Action |
|-------|-----------|--------|
| Ambiguous requirements | ❌ NO | Self-clarify using ExternalScout or make best-effort assumption and proceed |
| Quality gate failure (persistent) | ❌ NO | Auto-fix retry loop handles it; report at completion |
| Security risk detected | ❌ NO | Log risk, apply mitigations, report at completion |
| Agent conflict / disagreement | ❌ NO | TechLeadAgent arbitrates automatically; report at completion |
| Spec edit mid-flight needed | ❌ NO | OpenAgent auto-amends Spec and continues; summarize changes at completion |
| Routine coding progress | ❌ NO | Log to events.jsonl, continue |
| Test passes | ❌ NO | Log to events.jsonl, continue |
| Auto-resolved merge/fix | ❌ NO | Log to events.jsonl, continue |
| Dependency completion | ❌ NO | Trigger next batch automatically |
| **Destructive production action** | ✅ YES | Only interrupt for rm -rf /, sudo rm, or production database wipe |
| **Credential leak risk** | ✅ YES | Only interrupt if .env, .key, or secret would be exposed publicly |

### Pause / Resume / Add Requirements

The user can at any time:
- **Pause**: Current batch finishes, then swarm pauses. State is checkpointed.
- **Resume**: Swarm resumes from last checkpoint.
- **Add requirements**: OpenAgent auto-amends Spec, updates task DAG, and continues. Summarize changes at completion.
- **Edit previous prompts**: OpenAgent rewrites affected tasks, re-executes from earliest changed dependency.

---

## Agent Memory & Learning

### Individual Agent Memory

Each agent builds a preference profile during execution:

```json
{
  "agent": "BackendDeveloperAgent",
  "coding_style": "prefers functional patterns, explicit error handling",
  "common_fixes": ["add null checks", "wrap db calls in transactions"],
  "preferences": ["uses early returns", "avoids nested callbacks"]
}
```

Store in `.oac/runs/{session-id}/agent-memory.json` when persisted, and pass to the same agent on future tasks.

### Team Memory

Record optimal team configurations per task type:

```json
{
  "task_type": "full-stack-auth",
  "optimal_team": ["BackendDeveloperAgent", "OpenFrontendSpecialist", "TestEngineer", "CodeReviewer"],
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
| Bug persists after 2 retries | DebugAgent |
| Architecture disagreement | SystemArchitectAgent + TechLeadAgent |
| Security concern | SecurityAgent |
| Performance bottleneck | ExternalScout + OpenDevopsSpecialist |
| Integration failure | IntegrationAgent + DebugAgent |

### Auto-Scale Down

Agents are released when their task is complete and no downstream dependencies need them. No idle agents remain.

### Emergency Response Team

For critical bugs, security incidents, or production failures:

1. OpenAgent immediately spawns: DebugAgent + SecurityAgent + CodeReviewer
2. All other non-urgent tasks are paused
3. Emergency team has priority on all tool calls
4. Auto-remediate where possible; report at completion
5. Post-resolution: post-mortem auto-report generated

---

## Async Background Execution

Long-running tasks can execute in background:

1. OpenAgent delegates to SwarmOrchestrator with `run_in_background=true`
2. User receives: `"Swarm running in background. Task ID: swarm-abc-123. Use /swarm-status swarm-abc-123 to check progress."`
3. Swarm writes progress to `.oac/runs/{session-id}/events.ndjson`
4. User can check status, pause, or attach at any time
5. On completion: user receives summary notification

---

## Post-Delivery Continuous Improvement

After a swarm task completes:

1. **Smart Diff**: Rebuild only changed parts — no full rebuild unless dependencies changed
2. **Regression Testing**: Run affected test suites + smoke tests on unchanged areas
3. **Post-Mortem Auto-Report**: Generate `.oac/runs/{session-id}/acceptance-report.md` (or companion post-mortem) with:
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

- technology specialists such as BackendDeveloperAgent, OpenFrontendSpecialist, EmbeddedCPPCodingAgent, SecurityFirmwareAgent, and AutomotiveEthernetAgent
- business specialists such as HackersEraGTMExpert, InvestorNarrativeExpert, ComplianceEvidenceExpert
- team-standard specialists that enforce local coding, proposal, security, or release rules

Prefer reusing existing agents, contexts, and skills before creating new components.

---

## FAQ

**Can the user modify requirements during execution?**
Yes. The user can add information, correct direction, or change priorities at any time. TechLeadAgent updates the Spec, reassigns experts, revises the task graph, and continues without discarding completed validated work. No approval required — Expert Mode auto-adapts.

**What about cost and time for Experts Mode?**
Experts Mode and agent swarm orchestration are always active, but they scale themselves. Simple tasks use TechLeadAgent-only swarm-lite routing with minimal overhead. Larger or higher-risk tasks may use more tool calls and wall-clock time than a single direct agent, but they should deliver better quality through planning, parallel specialist work, QA, review, and validation.

**How does terminal execution work in Experts Mode?**
Safe local bash, edit, and task operations execute directly without routine approval. The user selected Expert Mode explicitly, so avoid constant interruption. Gate destructive deletes, credential/secret changes, production deploys, payment/legal actions, public external communication, irreversible data changes, risky hardware actions, and tool-budget exhaustion that requires changing the plan.

**What happens when quality gates fail?**
Quality failures block delivery. The responsible agent enters an auto-fix retry loop (max 3 retries). If the issue persists after 3 retries, OpenAgent escalates to the human with a specific failure report and proposed fix. The user can approve the fix, modify the Spec, or override the gate.

**How do I check swarm progress without interrupting?**
Use the task DAG and events.jsonl for real-time progress. OpenAgent reports batch completions and gate results at natural breakpoints. For background swarms, use `/swarm-status {session-id}`.

---

## Completion Standard

Experts Mode is complete only when:

- the Quest scenario is clear
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

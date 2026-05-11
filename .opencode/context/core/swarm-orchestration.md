<!-- Context: core/swarm-orchestration | Priority: critical | Version: 1.0 | Updated: 2026-05-11 -->

# Swarm Orchestration

Use this context when a task needs multiple agents, parallel execution, or a dependency-aware plan.

## Core Idea

OAC swarm mode is trusted controlled parallelism:

- one orchestrator owns the plan
- workers own isolated tasks
- a task graph controls ordering
- file locks prevent destructive overlap
- validation gates block premature completion
- OpenAgent self-organizes the team shape instead of requiring the user to micromanage roles
- parallel width scales with dependency safety, runtime capacity, and validation capacity
- distributed context preserves source trails, contracts, checkpoints, incidents, and evidence instead of relying on lossy prompt compression
- independent review roles are expected to disagree before a final arbiter reconciles the result

This is not uncontrolled autonomy. OpenAgent executes safe local work directly in Trusted Fast Mode and asks approval only for destructive, credential, production, payment/legal, public external, or irreversible data actions.

## Scale Targets

| Dimension | Default Target |
|-----------|----------------|
| Parallel workers | Up to 100 subagents when runtime support and task boundaries allow |
| Tool calls | Hundreds to 1,500+ coordinated calls for large swarm deployments |
| Execution model | Parallel plus orchestrated, with dependency-aware batches |
| Context handling | Distributed by role, artifact, contract, incident, and checkpoint |
| Viewpoints | Multiple independent and adversarial perspectives |
| Task horizon | Long-horizon work that exceeds single-agent context or time limits |

These are architecture targets, not permission to ignore safety. Reduce parallel width when write sets overlap, contracts are unstable, validation is failing, or the environment cannot support the requested fan-out.

## Required Session Files

```text
.tmp/swarm/{session-id}/
  swarm.json
  task-graph.json
  module-claims.json
  contracts.json
  incidents.jsonl
  checkpoints.jsonl
  events.jsonl
  artifacts/
  reports/
```

## Task Graph Fields

Every task must include:

```json
{
  "id": "auth-01",
  "title": "Create auth service",
  "suggested_agent": "CoderAgent",
  "depends_on": [],
  "reads": ["src/db/schema.ts"],
  "writes": ["src/auth/service.ts"],
  "acceptance_criteria": ["Auth service exports login and logout functions"],
  "status": "pending"
}
```

## Scheduling Rules

Run tasks in the same batch only when:

- dependencies are already complete
- no two tasks write the same path
- read/write overlap is low-risk
- tasks have bounded acceptance criteria
- the worker can complete without asking another worker for context

Force sequential execution when:

- tasks share a file
- one task creates interfaces consumed by another
- one task changes migrations, schemas, generated code, or central config
- integration is required
- validation or recovery is in progress

## Agent Routing

| Need | Agent |
|------|-------|
| repo standards and relevant files | ContextScout |
| current package/API docs | ExternalScout |
| requirements and scope | ProductManagerAgent |
| service boundaries and contracts | SystemArchitectAgent |
| stack decisions and arbitration | TechLeadAgent |
| task graph creation | TaskManager |
| full phase orchestration | StageOrchestrator |
| safe batch execution | BatchExecutor |
| isolated implementation | CoderAgent |
| backend implementation | BackendDeveloperAgent |
| UI implementation | OpenFrontendSpecialist |
| DevOps and deployment | OpenDevopsSpecialist |
| test authoring or verification | TestEngineer |
| security review | SecurityAgent |
| review and risk analysis | CodeReviewer |
| build/typecheck validation | BuildAgent |
| merge and contract convergence | MergeCoordinatorAgent |
| integration validation | IntegrationAgent |
| failure recovery | DebugAgent |
| documentation | DocWriter |

## Validation Gates

Before completion, check:

- all tasks are completed or intentionally cancelled
- no failed task is hidden by successful parallel work
- all consumed dependencies are checkpointed
- module claims were respected
- contracts still match implementation
- build/typecheck/test commands ran where relevant
- reviewer findings are resolved or reported
- docs were updated when behavior or workflow changed

## Event Stream

Append one JSON object per line to `events.jsonl`:

```json
{"type":"batch.planned","timestamp":"2026-05-11T00:00:00.000Z","batchId":"batch-01","message":"Planned discovery batch"}
```

Events should use these types:

- `session.created`
- `task.ready`
- `task.started`
- `task.completed`
- `task.failed`
- `batch.planned`
- `lock.conflict`
- `incident.created`
- `checkpoint.created`
- `gate.required`
- `gate.passed`

## Completion Report

Summaries must include:

- objective
- batches executed
- agents used
- files changed
- validation commands and results
- unresolved risks

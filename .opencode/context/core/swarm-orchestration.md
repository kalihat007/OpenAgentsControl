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
- large work is split into small ToDo chunks before specialists execute
- the orchestrator keeps syncing completed chunks back into the shared plan
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
  "stage": "implementation",
  "execution_mode": "parallel",
  "parent_task_id": "auth-feature",
  "chunk_index": 1,
  "chunk_total": 4,
  "max_chunk_minutes": 15,
  "sync_after_task_ids": [],
  "depends_on": [],
  "reads": ["src/db/schema.ts"],
  "writes": ["src/auth/service.ts"],
  "acceptance_criteria": ["Auth service exports login and logout functions"],
  "status": "pending"
}
```

## Chunked ToDo Loop

Large objectives are never handed to specialists as one vague assignment. The orchestrator first converts them into a ToDo queue of small chunks:

- one owner per chunk
- one bounded result per chunk
- clear read and write paths
- explicit dependencies
- explicit acceptance criteria
- target chunk size of 5-15 minutes for most work, with 30 minutes as the maximum for isolated implementation chunks
- stage label such as `discovery`, `architecture`, `implementation`, `review`, `integration`, or `recovery`

The TeamLeadAgent syncs the swarm after each batch by reading task checkpoints, open questions, changed files, validation signals, and contract changes. After sync, it updates the task graph before scheduling the next chunk set.

Sync is required when:

- a chunk changes an API, schema, interface, migration, central config, or shared contract
- a quality gate fails
- a specialist reports an unresolved question
- 3-5 chunks have completed in a long run
- the next batch depends on outputs from multiple experts

Sync should be lightweight: update state, reconcile conflicts, adjust dependencies, and continue without interrupting the user unless a safety gate requires it.

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
- `task.chunked`
- `task.ready`
- `task.started`
- `task.completed`
- `task.failed`
- `batch.planned`
- `sync.required`
- `sync.completed`
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

<!-- Context: core/development-swarm | Priority: critical | Version: 1.0 | Updated: 2026-05-11 -->

# Development Swarm

Development swarms behave like self-organizing engineering teams. They produce verified running systems, not only research reports.

## Team Roles

| Role | Agent | Responsibility |
|------|-------|----------------|
| Product Manager | ProductManagerAgent | requirements, stories, scope, acceptance criteria |
| System Architect | SystemArchitectAgent | data models, API contracts, service boundaries |
| Tech Lead | TechLeadAgent | stack choices, patterns, arbitration |
| Frontend Developer | OpenFrontendSpecialist | UI, state, design system alignment |
| Backend Developer | BackendDeveloperAgent | APIs, business logic, database work |
| DevOps/Infrastructure | OpenDevopsSpecialist | Docker, CI/CD, IaC, deployment |
| QA/Testing | TestEngineer | test cases, unit/integration/E2E coverage |
| Security | SecurityAgent | auth, secrets, injection, CVEs, webhook validation |
| Code Review | CodeReviewer | bug/risk review and standards compliance |
| Documentation | DocWriter | README, API docs, runbooks |
| Merge Coordinator | MergeCoordinatorAgent | conflict resolution and contract convergence |
| Integration | IntegrationAgent | final wiring and validation gates |
| Debug | DebugAgent | root cause isolation after failures |

## Execution Patterns

### Parallel Discovery

Run PM, Architect, Tech Lead, Security, and ExternalScout discovery in parallel when they are read-only. Merge findings before implementation.

### Contract-First Build

Architect defines schemas, API contracts, events, and shared interfaces before frontend/backend/devops implementation starts.

### Parallel Implementation

After contracts are approved:

- frontend can work against API mocks/contracts
- backend agents can own separate services/modules
- DevOps can build pipeline scaffolding
- QA can draft tests from acceptance criteria

Each task must declare `reads`, `writes`, `depends_on`, and `acceptance_criteria`.

### Adversarial Review

QA, Security, and Code Review critique independently. Disagreements go to TechLeadAgent. Do not synthesize disagreement away.

### Integration and Deployment

IntegrationAgent wires verified artifacts together. DevOps validates deployment pipelines. DebugAgent handles failed build/test/runtime incidents.

## Development vs Research Swarms

| Aspect | Research Swarm | Development Swarm |
|--------|----------------|-------------------|
| State | documents and summaries | git diffs, artifacts, runtime environments |
| Tools | web search and PDFs | compilers, tests, LSP, Docker, scanners |
| Validation | source verification | build/test/type/security pass-fail |
| Conflicts | viewpoint synthesis | merge conflicts and contract mismatches |
| Feedback | human report review | CI/CD and runtime feedback |

## Context Strategy

- Repository-aware context: agents query focused code/context indexes instead of loading the full repo.
- Incident log: failed commands, test errors, and debug conclusions persist so agents do not repeat broken paths.
- Checkpoints: only verified artifacts become dependencies for downstream work.
- Module claims: agents own files/modules during parallel work.

## Parallelization Boundaries

Sequential:

- database migrations
- shared API contract definition
- central config changes
- dependency upgrades
- integration after parallel work

Parallel:

- frontend and backend after contracts
- independent services
- tests for separate modules
- docs/runbooks while implementation stabilizes
- security review and code review after artifacts exist

## Required Artifacts

```text
.oac/runs/{session-id}/
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

## Completion Standard

A development swarm is done only when:

- implementation tasks are completed
- merge conflicts are resolved
- contracts still match implementation
- tests/build/typecheck/security gates pass or are explicitly waived
- documentation reflects the changed behavior

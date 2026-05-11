---
description: "Run an approved controlled swarm using dependency batches, file locks, and validation gates"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/swarm-orchestration.md
@.opencode/context/core/standards/code-quality.md
@.opencode/context/core/workflows/task-delegation-basics.md

# Swarm Run

Run only after the user has approved a swarm plan.

## Instructions

1. Confirm the plan is approved.
2. Create `.tmp/swarm/{session-id}/` with `swarm.json`, `task-graph.json`, `events.jsonl`, `artifacts/`, and `reports/`.
3. Before every batch:
   - verify dependencies are complete
   - verify no write-lock conflicts
   - ask for approval if the batch changes scope
4. Delegate independent tasks in the same assistant turn.
5. Stop on any failure and propose a recovery task.
6. Run validation agents and commands before final summary.

## Worker Prompt Contract

Each worker must receive:

- swarm session path
- exact task id
- allowed `reads`
- allowed `writes`
- acceptance criteria
- reminder that other agents may be editing separate files

## Final Report

Report:

- batches run
- agents used
- changed files
- validation results
- unresolved risks

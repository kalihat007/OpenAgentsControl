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
2. Create or use `.oac/runs/{session-id}/` (CLI: `plan.json`, `events.ndjson`, `acceptance-report.md`, `summary.json`; extended orchestration may add task-graph and artifact subdirs).
3. Before every batch:
   - verify dependencies are complete
   - verify no write-lock conflicts
   - verify each broad task has been split into small ToDo chunks
   - ask for approval if the batch changes scope
4. Delegate independent tasks in the same assistant turn.
5. Sync with experts after each completed batch: collect checkpoints, changed files, open questions, and validation signals.
6. Update the task graph before scheduling the next ToDo chunk set.
7. Stop on any failure and propose a recovery task.
8. Run validation agents and commands before final summary.

## Worker Prompt Contract

Each worker must receive:

- swarm session path
- exact task id
- parent task id, chunk index, and chunk total
- stage and sync expectations
- allowed `reads`
- allowed `writes`
- acceptance criteria
- reminder that other agents may be editing separate files

## Final Report

Report:

- batches run
- chunks completed
- expert sync checkpoints
- agents used
- changed files
- validation results
- unresolved risks

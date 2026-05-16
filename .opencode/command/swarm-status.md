---
description: "Inspect the current OAC swarm session, task graph, event stream, blocked tasks, and validation gates"
---

<session>$ARGUMENTS</session>

@.opencode/context/core/swarm-orchestration.md

# Swarm Status

Inspect an existing `.oac/runs/{session-id}/` session.

## Instructions

1. If no session is provided, list `.oac/runs/` and choose the latest session.
2. Read `plan.json`, `summary.json`, and recent `events.ndjson` entries (and `acceptance-report.md` when present).
3. Summarize:
   - objective
   - current batch
   - completed tasks
   - running or blocked tasks
   - failed tasks
   - write locks
   - remaining validation gates
4. Do not modify files.

## Output Format

```markdown
# Swarm Status

Session: ...
Objective: ...

## Progress
- Completed:
- Running:
- Blocked:
- Failed:

## Next Ready Batch
- ...

## Gates
- ...
```

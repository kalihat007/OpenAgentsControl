---
description: "Inspect the current OAC swarm session, task graph, event stream, blocked tasks, and validation gates"
---

<session>$ARGUMENTS</session>

@.opencode/context/core/swarm-orchestration.md

# Swarm Status

Inspect an existing `.tmp/swarm/{session-id}/` session.

## Instructions

1. If no session is provided, list `.tmp/swarm/` and choose the latest session.
2. Read `swarm.json`, `task-graph.json`, and recent `events.jsonl` entries.
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

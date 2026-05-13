---
description: "Create a dependency-aware controlled agent swarm plan with file locks, batches, and validation gates"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/swarm-orchestration.md
@.opencode/context/core/context-system.md
@.opencode/context/core/workflows/task-delegation-basics.md

# Swarm Plan

You are planning a controlled OAC swarm. Do not edit files or run implementation commands during planning.

## Instructions

1. Use ContextScout to discover project standards, relevant files, test/build commands, and constraints.
2. Use ExternalScout if the request mentions external libraries, frameworks, cloud services, APIs, package installs, or generated SDKs.
3. Produce a task graph with:
   - task id
   - title
   - parent task id for chunks split from larger work
   - stage and execution mode
   - suggested agent
   - dependencies
   - reads
   - writes
   - max chunk minutes
   - sync-after task ids
   - acceptance criteria
4. Split broad tasks into small ToDo chunks before execution.
5. Group safe chunks into parallel batches.
6. Flag chunks that must be sequential.
7. List expert sync points, approval gates, and validation commands.
8. Ask for approval before execution.

## Output Format

```markdown
# Swarm Plan

Objective: ...

## Agents
- ...

## Task Graph
| Chunk | Parent | Stage | Agent | Depends On | Reads | Writes | Parallel? | Sync |
|-------|--------|-------|-------|------------|-------|--------|-----------|------|

## Batches
- Batch 1: ...
- Batch 2: ...

## Expert Sync Points
- ...

## Gates
- Approval before session creation
- Approval before first execution batch
- Stop on test/build/review failure

## Validation
- ...

Approval needed before running this swarm.
```

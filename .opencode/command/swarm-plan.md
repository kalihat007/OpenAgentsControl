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
   - suggested agent
   - dependencies
   - reads
   - writes
   - acceptance criteria
4. Group safe tasks into parallel batches.
5. Flag tasks that must be sequential.
6. List approval gates and validation commands.
7. Ask for approval before execution.

## Output Format

```markdown
# Swarm Plan

Objective: ...

## Agents
- ...

## Task Graph
| Task | Agent | Depends On | Reads | Writes | Parallel? |
|------|-------|------------|-------|--------|-----------|

## Batches
- Batch 1: ...
- Batch 2: ...

## Gates
- Approval before session creation
- Approval before first execution batch
- Stop on test/build/review failure

## Validation
- ...

Approval needed before running this swarm.
```

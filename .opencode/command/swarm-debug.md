---
description: "Spawn a debug/recovery loop for a failed swarm build, test, integration, or deployment incident"
---

<incident>$ARGUMENTS</incident>

@.opencode/context/core/development-swarm.md
@.opencode/context/core/swarm-orchestration.md

# Swarm Debug

Use this after a swarm batch, integration run, CI job, smoke test, or deployment check fails.

## Instructions

1. Locate the active or provided `.oac/runs/{session-id}`.
2. Read recent `events.ndjson`, `plan.json`, `acceptance-report.md`, and validation logs.
3. Delegate root-cause analysis to DebugAgent.
4. If security or contract risk is involved, include SecurityAgent or SystemArchitectAgent.
5. Produce a bounded recovery task with explicit reads/writes.
6. Ask for approval before fixing.

## Output Format

```markdown
# Swarm Debug Plan

Incident:
Likely owner:
Evidence:
Recovery task:
Reads:
Writes:
Validation:

Approval needed before applying recovery.
```

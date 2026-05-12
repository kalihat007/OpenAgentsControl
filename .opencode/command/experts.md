---
description: "Run OpenAgent's always-on Experts Mode powered by agent swarm orchestration with Team Lead planning, parallel experts, task progress, validation, and review"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/experts-mode.md
@.opencode/context/core/swarm-orchestration.md

# OpenAgent Experts Mode

Use OpenAgent as TeamLeadAgent and the only user-facing entrypoint. Decompose the request, assemble the smallest effective expert team, use a lightweight single-expert path for tiny tasks, create the swarm task graph for larger work, execute safe independent work in parallel when useful, track task progress, validate results, and reconcile review findings.

## Default Experts

- TeamLeadAgent
- FrontendExpert
- BackendExpert
- QAExpert
- CodeReviewExpert
- ResearchExpert
- DevOpsExpert
- UXDesigner

Add domain experts only when needed.

## Output Format

```markdown
# OpenAgent Experts Mode

Objective:
Team Lead plan:
Experts selected:
Trusted Fast Mode: active
Agent Swarm Orchestration: active
Approval needed: yes/no, with reason

## Task Progress
| Task | Expert | Status | Result |
|------|--------|--------|--------|

## Validation / Review
- ...

## Final Integration
- ...
```

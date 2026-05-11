---
description: "Run OpenAgent Experts Mode for medium-to-large engineering tasks with Team Lead planning, parallel experts, task progress, validation, and review"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/experts-mode.md
@.opencode/context/core/swarm-orchestration.md

# OpenAgent Experts Mode

Use OpenAgent as TeamLeadAgent and the only user-facing entrypoint. Decompose the request, assemble the smallest effective expert team, execute safe independent work in parallel, track task progress, validate results, and reconcile review findings.

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
Approval needed: yes/no, with reason

## Task Progress
| Task | Expert | Status | Result |
|------|--------|--------|--------|

## Validation / Review
- ...

## Final Integration
- ...
```

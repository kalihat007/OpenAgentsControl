---
description: "Run OpenAgent's Quest-style always-on Experts Mode powered by agent swarm orchestration with scenario routing, Team Lead planning, parallel experts, task progress, validation, and review"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/experts-mode.md
@.opencode/context/core/swarm-orchestration.md
@.opencode/context/core/quest-mode.md

# OpenAgent Quest / Experts Mode

Use OpenAgent as Quest owner, TeamLeadAgent, and the only user-facing entrypoint. Select the scenario (`direct`, `code_with_spec`, `prototype_demo`, `create_tool`, or `research_plan`), decompose the request, split larger work into small ToDo chunks, assemble the smallest effective expert swarm, use TeamLeadAgent-only swarm-lite routing for tiny tasks, create the full swarm task graph for larger work, execute safe independent chunks in parallel when useful, sync with experts after each batch, track task progress, validate results, and reconcile review findings.

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
# OpenAgent Quest / Experts Mode

Objective:
Scenario:
Team Lead plan:
Experts selected:
Trusted Fast Mode: active
Agent Swarm Orchestration: active
Chunked ToDo execution: active
Approval needed: yes/no, with reason

## Task Progress
| Chunk | Parent | Expert | Status | Result |
|-------|--------|--------|--------|--------|

## Validation / Review
- ...

## Final Integration
- ...
```

---
description: "Design a self-organizing engineering team swarm with PM, Architect, Tech Lead, dev, QA, Security, DevOps, Review, and Docs roles"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/development-swarm.md
@.opencode/context/core/swarm-orchestration.md

# Swarm Team

Create the right engineering-team swarm for the request.

## Instructions

1. Classify the work:
   - product discovery
   - architecture
   - frontend/backend/devops implementation
   - QA/security/review
   - integration/debug/deployment
2. Select only the needed roles.
3. Define the sequence:
   - PM scope
   - Architect contracts
   - Tech Lead pattern decision
   - parallel implementation
   - adversarial QA/Security/Review
   - integration and deployment
4. Produce the team plan and ask for approval before execution.

## Output Format

```markdown
# Self-Organizing Team

Objective:

## Roles
| Role | Agent | Why Needed |
|------|-------|------------|

## Execution Pattern
- Discovery:
- Architecture:
- Implementation:
- Adversarial review:
- Integration:

## Parallel Boundaries
- Sequential:
- Parallel:

Approval needed before this team starts work.
```

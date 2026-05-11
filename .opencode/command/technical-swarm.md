---
description: "Create a deep-tech technical swarm for cybersecurity hardware/software co-design, embedded, FPGA, VAPT, HIL/SIL, compliance, and release work"
---

<request>$ARGUMENTS</request>

@.opencode/context/core/technical-swarm.md
@.opencode/context/core/swarm-orchestration.md

# Technical Swarm

Use OpenAgent as the user-facing entrypoint. Route the request to the technical swarm roles needed for the product or test campaign.

## Instructions

1. Classify the technical motion:
   - hardware-software co-design
   - embedded/firmware implementation
   - FPGA/ASIC logic
   - automotive protocol tooling
   - cybersecurity testing campaign
   - HIL/SIL validation
   - compliance/evidence
   - release/SBOM/signing
2. Select the smallest useful technical role set.
3. Identify sequential contracts and parallel-safe slices.
4. Produce artifacts, validation gates, toolchains, and evidence plan.
5. Ask for approval before implementation or external-facing claims.

## Output Format

```markdown
# Technical Swarm Plan

Objective:
Product/test target:
Primary technical risks:

## Roles
| Agent | Purpose |
|-------|---------|

## Sequential Contracts
- ...

## Parallel Workstreams
- ...

## Verification Gates
- ...

## Evidence Artifacts
- ...

Approval needed before execution.
```

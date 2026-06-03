# Quest v17 Product Architect Intelligence

Quest v17 turns OpenAgent completion into a product-architecture review step. It does not start more work automatically. It summarizes what the agent learned from the request, touched files, validation evidence, repo wiki, memory graph, and v9-v16 coding sidecars, then suggests a few high-leverage next actions for the user to choose.

## Goal

Make QuestMode behave like an intelligent coding team with a product architect in the loop:

- finish the requested implementation or investigation first
- verify the work with local evidence before claiming done
- understand changed files, product surfaces, runtime adapters, tests, and release risks
- recommend 2-5 next steps after completion, including at least one product or architecture recommendation when useful
- wait for user approval before turning recommendations into new work

## Generated Artifacts

Quest v17 writes these sidecars in `.oac/runs/{quest-id}/` and `.oac/coding-intelligence/` when a working-tree review is requested:

```text
product-architect-review.json
architecture-next-steps.json
roadmap-signals.json
capability-gap-map.json
product-risk-register.json
user-value-matrix.json
strategic-refactor-radar.json
architecture-decision-suggestions.json
strategic-next-actions.md
```

`product-architect-review.json` is the rollup. The other files are focused queues that runtime agents can skim without reading every optional sidecar.

## Runtime Behavior

OpenAgent, Kimi, OpenCode, Codex, and Claude should use Product Architect Intelligence after the user request is complete:

1. Read the base Quest files and only the v9-v20 sidecars relevant to the touched files, symbols, tests, runtime adapter, evidence replay, deep-thinking review, idea-to-build plan, self-improvement roadmap, or product architecture decision.
2. Complete implementation and verification before recommending follow-up work.
3. Append or surface `next_steps.suggested` with 2-5 concise recommendations.
4. Include product/architecture choices such as runtime parity gaps, release readiness closure, durable memory improvements, evaluation coverage, or ADR candidates.
5. Wait for the user to choose the next step.

## Recommendation Types

The v17 builder classifies recommendations into practical queues:

- architecture next steps: immediate, medium, or future implementation choices
- roadmap signals: feature or platform opportunities that need user approval
- capability gaps: missing product or engineering capabilities
- product risks: risks with likelihood, impact, mitigation, and evidence
- user value: who benefits, how, and what proof is missing
- strategic refactors: structural improvements with triggers and expected outcomes
- ADR suggestions: durable decisions worth documenting

## Guardrails

- Product Architect Intelligence is advisory; it should not silently extend the Quest scope.
- Roadmap signals and skill/memory promotion still require user approval.
- Recommendations must be grounded in artifacts, changed files, validation results, or explicit inference.
- A blocked product/architecture gate should be reported clearly instead of hidden behind a generic completion summary.

## CLI Refresh

Run:

```bash
oac quest-v9 <quest-id>
```

The command refreshes Quest v9 coding intelligence plus the v10-v20 sidecars, including `strategic-next-actions.md`, `evidence-replay.md`, `build-better-roadmap.md`, and `self-improvement-roadmap.md`.

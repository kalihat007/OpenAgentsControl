# Quest v21 Predictive Engineering OS

Quest v21 turns OpenAgent QuestMode into a predictive engineering loop before
coding starts and before completion is claimed. It uses the predecessor coding sidecars to
forecast intent, blast radius, risks, validation, proof gaps, architecture drift,
context freshness, and Kimi timeout/step-limit exposure.

## Artifacts

```text
predictive-engineering-os.json
intent-architecture-compiler.json
change-simulation-engine.json
risk-forecast-score.json
implementation-path-ranking.json
test-intelligence-planner.json
proof-contract.json
architecture-drift-detector.json
context-freshness-gate.json
predictive-timeout-guard.json
predictive-engineering-roadmap.md
```

## Behavior

- `intent-architecture-compiler.json` compiles requirements, invariants,
  non-goals, architecture surfaces, acceptance proof, assumptions, and confidence.
- `change-simulation-engine.json` predicts touched surfaces, blast radius,
  dependency impact, runtime/prompt impact, migration need, and mitigations.
- `risk-forecast-score.json` scores hallucination, regression, timeout,
  missing-knowledge, and architecture-drift risk before a claim is made.
- `implementation-path-ranking.json` ranks narrow evidence-first, runtime-parity,
  and architecture-slice implementation paths.
- `test-intelligence-planner.json` turns smart tests, runtime parity, and eval
  candidates into a required validation plan.
- `proof-contract.json` records done claims, required evidence, blockers, and
  completion policy.
- `architecture-drift-detector.json` keeps protected contracts and ADR signals
  visible before broad changes.
- `context-freshness-gate.json` decides whether repo wiki, semantic brain, docs,
  or web/current research need refresh.
- `predictive-timeout-guard.json` prevents repeated `Killed by timeout (30s)`
  and `Max number of steps reached` loops by recommending explicit timeouts and
  split execution cycles.

## Runtime Contract

Kimi, OpenCode, and Codex should read v21 sidecars only when they are relevant to
the touched files, tests, runtime adapter, proof, freshness, or timeout decision.
They must not exhaustively read every optional artifact before acting.

Before completion, the runtime should report or close:

- high predictive risk
- blocked proof contract claims
- stale context freshness gates
- architecture drift requiring user approval
- risky validation commands missing explicit timeout policy

## Validation

Expected validation for v21 changes:

- `npm run typecheck -w packages/cli`
- focused Quest sidecar unit tests
- Kimi/OpenCode/Codex Quest v8 smoke tests
- installer/update syntax checks
- live Kimi write-back validation when runtime prompt behavior changes

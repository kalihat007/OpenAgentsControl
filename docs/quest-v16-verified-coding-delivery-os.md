# Quest v16 - Verified Coding Delivery OS

Quest v16 adds the final delivery-readiness layer on top of the Quest v9 through v15 coding stack. It does not replace the Intelligent Coding Team OS. It consumes the existing intent, knowledgebase, semantic repo brain, temporal memory, and team artifacts, then produces a deterministic answer to one question: can OpenAgent honestly claim this coding request is done?

## Goals

- Compile user requirements and inferred expectations into acceptance criteria.
- Label delivery claims as verified, inferred, stale, missing, or needs research.
- Trace changed files back to patch capsules, requirements, evidence, and validation commands.
- Require repeated request-cycle coverage for runtime-facing changes, especially Kimi/OpenCode/Codex prompt and adapter work.
- Propose focused evals for changed code, runtime parity, chronic failures, and review signals.
- Run an internal debate gate with tech lead, test engineer, security reviewer, and release lead perspectives.
- Produce a final release-readiness dashboard before completion claims.

## Artifacts

Quest v16 writes these files beside the existing Quest run artifacts:

- `verified-delivery-os.json` - complete v16 rollup.
- `acceptance-compiler.json` - done definition, criteria, evidence, validation commands, non-goals, and risks.
- `evidence-first-gate.json` - claim confidence, evidence, and actions for unsupported claims.
- `patch-provenance-ledger.json` - patch-to-requirement/evidence/test traceability.
- `runtime-cycle-matrix.json` - required runtime three-cycle checks for OpenCode, Kimi, Codex, and Claude.
- `auto-eval-generator.json` - proposed eval/regression tests.
- `agent-debate-gate.json` - participant verdicts and blockers.
- `release-readiness-dashboard.json` - final checks, blockers, warnings, and recommended next step.
- `verified-delivery-os.md` - human-readable delivery brief.

## Default Behavior

OpenAgent, Kimi, OpenCode, and Codex should use v16 automatically for coding, installer, runtime, adapter, test, and repo-maintenance work. Before claiming a request is complete, the runtime should inspect the v16 sidecars when present and avoid unsupported claims. If `verified-delivery-os.json` or `release-readiness-dashboard.json` is blocked, the runtime must report the blocker instead of saying the work is complete.

For runtime-facing work, v16 expects three completed request cycles where applicable. This protects the specific user workflow where one completed request is followed by another completed request, then another, and each substantial request should start a fresh Quest unless the user explicitly says it is a continuation.

## Validation Coverage

The v16 implementation is covered by:

- CLI typecheck/build and focused Bun tests for `quest-coding-intelligence`, `quest-run`, and `runtime-bridge`.
- `scripts/tests/test-kimi-quest-v8.sh` checking installed Kimi prompt text, direct Kimi output, generated Quest artifacts, `quest-v9` output, and live daemon artifacts when enabled.
- `scripts/tests/test-opencode-quest-v8.sh` checking OpenCode prompt/context text, direct output, generated Quest artifacts, and `quest-v9` output.
- `scripts/tests/test-codex-quest-v8.sh` checking installed Codex prompt text, optional live direct output, generated Quest artifacts, and `quest-v9` output.

## Relationship To Earlier Versions

- v9-v11 understand and execute coding changes.
- v12 makes claims evidence-first.
- v13 builds the semantic repo brain.
- v14 keeps temporal failure and outcome memory.
- v15 coordinates requirements, expert ownership, impact simulation, and team gates.
- v16 decides whether delivery is sufficiently proven, traceable, and release-ready.

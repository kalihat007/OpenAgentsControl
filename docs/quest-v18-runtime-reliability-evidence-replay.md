# Quest v18 Runtime Reliability + Evidence Replay OS

Quest v18 makes OpenAgent completion claims replayable and runtime-aware. It focuses on the two failure modes that hurt coding velocity most: repeating broken commands and claiming work is done without enough proof.

## Goals

- Prevent repeated Kimi/OpenCode/Codex/Claude timeout or step-limit loops.
- Convert failed commands into fingerprints with known recovery actions.
- Track final-summary claims as verified, inferred, missing, or blocked.
- Produce a human-readable `evidence-replay.md` that lists the commands and sidecars needed to re-check the work.
- Run runtime doctor checks before release-ready or installed/updated claims.

## Sidecars

Quest v18 writes these files in `.oac/runs/{quest-id}/` and `.oac/coding-intelligence/`:

```text
runtime-reliability-os.json
command-failure-index.json
timeout-policy.json
claim-ledger.json
runtime-doctor-report.json
autonomous-recovery-plan.json
flaky-command-memory.json
evidence-replay.md
```

## Runtime Policy

Kimi shell/background commands may fail with `Killed by timeout (30s)`. Quest v18 makes that an explicit runtime reliability signal:

- normal validation should request about `timeout_s: 300`
- deep/live runtime validation should request about `timeout_s: 900`
- a timed-out command should not be retried unchanged
- if proof is missing, the agent should run the smallest replay command or report the gap

## Commands

```bash
oac quest-v9 <quest-id>
oac quest-replay <quest-id>
oac runtime-doctor --runtime kimi
```

`quest-v9` refreshes the v9-v20 intelligence sidecars. `quest-replay` prints replayable proof. `runtime-doctor` checks configured runtimes and adapter health.

## Completion Gate

Before claiming tested, installed, updated, pushed, or release-ready status, OpenAgent should check:

- `claim-ledger.json` has verified proof for the claim or the gap is explicitly reported
- `runtime-reliability-os.json` is not blocked
- `evidence-replay.md` has replay commands for meaningful completion claims
- runtime-facing changes have matching runtime smoke evidence or a recorded skip reason

Quest v18 does not start follow-up work automatically. It strengthens the proof behind the current request, then lets Product Architect Intelligence and `next_steps.suggested` offer user-choice follow-ups.

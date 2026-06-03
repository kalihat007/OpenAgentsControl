# Quest v20 Self-Improving Coding Team OS

Quest v20 turns each completed coding Quest into measured team learning without
silently promoting every event into long-term memory. It builds on Quest v19
Deep Coding Collaboration OS and asks: how well did the coding team deliver, what
should improve next, and which repeated workflows might become skills only after
user approval?

## Artifacts

`quest-v9` writes these sidecars beside the existing Quest v8-v19 artifacts:

```text
self-improving-coding-team-os.json
coding-team-metrics.json
delivery-retrospective.json
learning-feedback-loop.json
improvement-backlog.json
skill-evolution-candidates.json
self-improvement-roadmap.md
```

## What It Measures

- delivery health from acceptance, release readiness, patch provenance, and claim
  proof
- quality health from review findings, test gaps, hallucination gates, security
  gates, and regression coverage
- collaboration health from requirement readiness, expert ownership, file locks,
  collaboration board decisions, and product/architecture next steps
- learning health from temporal memory, failure-fix memory, knowledge confidence,
  promotion candidates, and repeated workflow patterns
- runtime health from command failure fingerprints, timeout policy, runtime
  doctor checks, autonomous recovery, flaky command memory, and evidence replay

## Runtime Behavior

OpenAgent, Kimi, OpenCode, Codex, and Claude should use v20 after validation and
completion evidence is available:

1. Read only the v20 sidecars relevant to the completed request and touched
   files; do not read every optional sidecar in a loop.
2. Score delivery, quality, collaboration, learning, and runtime health.
3. Capture wins, issues, evidence gaps, reusable lessons, and follow-up
   improvements.
4. Keep improvement backlog items as recommendations, not automatic scope
   expansion.
5. Keep skill evolution approval-gated; a candidate is not a durable skill until
   the user approves promotion.

## Guardrails

- Self-improvement must not hide blocked completion proof. If v16/v18 gates are
  blocked, report the blocker before claiming done.
- Skill evolution and memory promotion require explicit user approval.
- Recommendations must be grounded in changed files, events, validation results,
  sidecars, or clearly labeled inference.
- A runtime should stop and report the gap if `self-improving-coding-team-os.json`
  is blocked or if a skill candidate needs approval.

## CLI

```bash
oac quest-v9 <quest-id>
oac quest-replay <quest-id>
oac runtime-doctor --runtime kimi
```

`quest-v9` refreshes the v9-v20 intelligence sidecars. `quest-replay` prints
replayable proof. `runtime-doctor` checks runtime and adapter health before
release-ready claims.

## Validation

v20 coverage should include:

- focused Quest coding-intelligence tests
- Quest run artifact persistence tests
- runtime bridge prompt tests
- Kimi Quest v8 smoke with v9-v20 sidecars
- OpenCode Quest v8 smoke with v9-v20 sidecars
- Codex Quest v8 CLI-path smoke with v9-v20 sidecars
- install/update smoke with Kimi enabled

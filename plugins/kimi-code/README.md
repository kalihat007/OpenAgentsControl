# OpenAgentsControl for Kimi Code

This directory contains the direct Kimi Code adapter for OpenAgent.

It installs a Kimi agent spec that inherits Kimi's built-in tools/subagents, uses an OpenAgent Quest-first system prompt, and makes OpenAgent Quest + Experts the default operating layer. It does not require OpenCode, and it does not define a model. Kimi uses the user's active/default Kimi model from `~/.kimi/config.toml`, or the model explicitly passed with `kimi --model`.

For substantial work, OpenAgent-on-Kimi must show a visible `OpenAgent Quest Spec` before edits, file moves, plan-mode handoff, or tool calls. Repo-wide reorganizations require a proposed target layout and user approval before moving or deleting files.

Quest v8 keeps same-session behavior explicit:

```text
NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING
```

After a request reaches `COMPLETE`, Kimi should recommend a few practical next steps based on changed files, task state, verification, memory/context signals, and its understanding of the application, then wait for the user to choose. When Kimi returns to user input, the next substantial user message starts a fresh `OpenAgent Quest Spec` with `State: NEW` unless the user says it continues or amends the previous Quest. If the user changes requirements before completion, OpenAgent amends the active Quest instead.

Before task execution, Kimi should run a Pre-Execution Discovery Gate: inspect required local files/context first, append discovery evidence, decide whether web/current research is needed, append `research.assessed`, and only append `research.performed` when external/current sources actually informed the work.

Durable Quest runs use `.oac/runs/{quest-id}/quest.json` beside `spec.json`, `plan.json`, `events.ndjson`, `acceptance-report.md`, `interaction-memory.json`, `memory-graph.json`, Quest v9 coding sidecars (`coding-intelligence.json`, `patch-capsules.json`, `coding-review.md`), Coding Autopilot sidecars (`coding-autopilot.json`, `symbol-graph.json`, `smart-test-matrix.json`, `patch-ledger.json`, `pre-edit-contract.json`, `automatic-code-review.json`, `failure-memory.json`, `runtime-parity-enforcer.json`, `dependency-research-gate.json`, `autofix-plan.json`, `pr-readiness.md`), Coding Execution sidecars (`coding-execution.json`, `executable-acceptance.json`, `guarded-autofix-runner.json`, `contract-drift-guard.json`, `review-patch-loop.json`, `test-gap-finder.json`, `regression-snapshots.json`, `runtime-compatibility-matrix.json`, `ownership-lock-plan.json`, `security-secrets-gate.json`, `pr-auto-packager.json`, `pr-auto-packager.md`), and `summary.json`. In v8, runtimes append progress to `events.ndjson`; they do not rewrite `quest.json`. Quest v9/v10/v11 coding intelligence is active by default for coding work and captures intent, impact, patch capsules, smart tests, runtime parity, review signals, symbol context, pre-edit boundaries, patch ledger, automatic review, failure replay, dependency research gates, bounded autofix, PR readiness, executable acceptance, guarded autofix, contract drift, review-to-patch loops, test gaps, regression snapshots, runtime compatibility, ownership locks, security/secrets gating, and PR packaging. Each event line should include `timestamp`, `type`, and `data`; the CLI refreshes `interaction-memory.json`, `memory-graph.json`, and v9/v10/v11 coding sidecars from those events so future work can reuse the user request/action/directory/file/context journal plus graph and coding review. The CLI also refreshes `.oac/repo-wiki/` for the current project directory when Quests are created, when file/context changes are recorded, and near verification/reflection/completion; run `oac repo-wiki` or `oac repo-wiki --watch` when files change outside Quest write-back. Repeated learnings become scored promotion candidates in `.oac/memory/promotions.json`; approve them with `oac memory-promote --approve <candidate-id>` before they become durable `.oac/team-memory.json` lessons or skill inputs. Adaptive v8/v9 events include `review.started`, `review.approved`, `review.rejected`, `task.injected`, `priority.changed`, `request.received`, `action.summary`, `cwd.observed`, `knowledge.captured`, `research.assessed`, `research.performed`, `next_steps.suggested`, `context.loaded`, `context.changed`, `coding.intent`, `impact.analyzed`, `patch.capsule`, `tests.selected`, and `review.signals`. Resume with:

```bash
oac quest-status
oac quest-resume <quest-id>
oac repo-wiki
oac quest-v9 <quest-id>
oac memory-promote
```

The resume prompt works in Kimi, OpenCode, or Claude while keeping the selected runtime model.

## Installed Location

```bash
~/.kimi/agents/openagents-control/openagent.yaml
```

## Run

```bash
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

For the cleanest Quest-style screen, hide Kimi's thinking stream:

```bash
kimi --no-thinking --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

With an explicit Kimi model:

```bash
kimi --work-dir . \
  --agent-file ~/.kimi/agents/openagents-control/openagent.yaml \
  --model kimi-code/kimi-for-coding
```

For non-interactive use:

```bash
kimi --work-dir . \
  --agent-file ~/.kimi/agents/openagents-control/openagent.yaml \
  --print --final-message-only \
  --prompt "Review this repo and suggest the next safest implementation step"
```

## Model Policy

OpenAgent-on-Kimi uses exactly the Kimi model selected by the user. There is no LLM routing, hidden model selector, fallback model, or separate classifier model.

## Verify Quest Cycle

From the OpenAgentsControl repo:

```bash
bash scripts/tests/test-kimi-quest-cycle.sh
bash scripts/tests/test-kimi-quest-v8.sh
```

The test runs two Kimi turns in the same resumed session and checks that both substantial inputs start with `OpenAgent Quest Spec`, include a scenario, and keep `Team Lead: active`.

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

Durable Quest runs use `.oac/runs/{quest-id}/quest.json` beside `spec.json`, `plan.json`, `events.ndjson`, `acceptance-report.md`, `interaction-memory.json`, `memory-graph.json`, Quest v9 coding sidecars (`coding-intelligence.json`, `patch-capsules.json`, `coding-review.md`), Coding Autopilot sidecars (`coding-autopilot.json`, `symbol-graph.json`, `smart-test-matrix.json`, `patch-ledger.json`, `pre-edit-contract.json`, `automatic-code-review.json`, `failure-memory.json`, `runtime-parity-enforcer.json`, `dependency-research-gate.json`, `autofix-plan.json`, `pr-readiness.md`), Coding Execution sidecars (`coding-execution.json`, `executable-acceptance.json`, `guarded-autofix-runner.json`, `contract-drift-guard.json`, `review-patch-loop.json`, `test-gap-finder.json`, `regression-snapshots.json`, `runtime-compatibility-matrix.json`, `ownership-lock-plan.json`, `security-secrets-gate.json`, `pr-auto-packager.json`, `pr-auto-packager.md`), Verified Knowledgebase sidecars (`verified-knowledgebase.json`, `knowledgebase-index.json`, `evidence-ledger.json`, `hallucination-gate.json`, `contract-facts.json`, `source-to-patch-trace.json`, `stale-knowledge-report.json`, `dependency-research-cache.json`, `behavior-oracle.json`, `test-authoring-plan.json`, `verified-knowledgebase.md`), Semantic Repo Brain sidecars (`semantic-repo-brain.json`, `ast-knowledgebase.json`, `knowledge-confidence-score.json`, `failure-fix-memory.json`, `auto-skill-builder.json`, `semantic-repo-brain.md`), Temporal Memory sidecars (`temporal-memory.json`, `patch-outcome-ledger.json`, `repo-history-signals.json`, `temporal-memory.md`), Intelligent Coding Team OS sidecars (`intelligent-coding-team.json`, `requirement-compiler.json`, `expert-team-blackboard.json`, `change-impact-simulator.json`, `project-skill-pack-builder.json`, `intelligent-coding-team.md`), Verified Coding Delivery OS sidecars (`verified-delivery-os.json`, `acceptance-compiler.json`, `evidence-first-gate.json`, `patch-provenance-ledger.json`, `runtime-cycle-matrix.json`, `auto-eval-generator.json`, `agent-debate-gate.json`, `release-readiness-dashboard.json`, `verified-delivery-os.md`), Product Architect Intelligence sidecars (`product-architect-review.json`, `architecture-next-steps.json`, `roadmap-signals.json`, `capability-gap-map.json`, `product-risk-register.json`, `user-value-matrix.json`, `strategic-refactor-radar.json`, `architecture-decision-suggestions.json`, `strategic-next-actions.md`), Runtime Reliability + Evidence Replay OS sidecars (`runtime-reliability-os.json`, `command-failure-index.json`, `timeout-policy.json`, `claim-ledger.json`, `runtime-doctor-report.json`, `autonomous-recovery-plan.json`, `flaky-command-memory.json`, `evidence-replay.md`), Deep Coding Collaboration OS sidecars (`deep-coding-collaboration-os.json`, `deep-thinking-review.json`, `idea-to-build-brief.json`, `smarter-code-plan.json`, `collaboration-board.json`, `decision-tradeoff-matrix.json`, `build-better-roadmap.md`), Self-Improving Coding Team OS sidecars (`self-improving-coding-team-os.json`, `coding-team-metrics.json`, `delivery-retrospective.json`, `learning-feedback-loop.json`, `improvement-backlog.json`, `skill-evolution-candidates.json`, `self-improvement-roadmap.md`), Predictive Engineering OS sidecars (`predictive-engineering-os.json`, `intent-architecture-compiler.json`, `change-simulation-engine.json`, `risk-forecast-score.json`, `implementation-path-ranking.json`, `test-intelligence-planner.json`, `proof-contract.json`, `architecture-drift-detector.json`, `context-freshness-gate.json`, `predictive-timeout-guard.json`, `predictive-engineering-roadmap.md`), and `summary.json`. In v8, runtimes append progress to `events.ndjson`; they do not rewrite `quest.json`. Quest v9/v10/v11/v12/v13/v14/v15/v16/v17/v18/v19/v20/v21 coding, product-architect, runtime-reliability, evidence-replay, deep-collaboration, self-improvement, and predictive-engineering intelligence is active by default for coding work and captures intent, impact, patch capsules, smart tests, runtime parity, review signals, symbol context, pre-edit boundaries, patch ledger, automatic review, failure replay, dependency research gates, bounded autofix, PR readiness, executable acceptance, guarded autofix, contract drift, review-to-patch loops, test gaps, regression snapshots, runtime compatibility, ownership locks, security/secrets gating, PR packaging, evidence ledgers, hallucination gates, source-to-patch traceability, stale knowledge checks, behavior oracles, test-authoring plans, AST-level repo facts, confidence labels, failure-fix memory, approval-gated skill candidates, chronic cross-quest failure escalation, patch-outcome history, git-history co-change/churn/bug-density/ownership signals, requirement readiness, expert ownership, file locks, impact simulation, project skill-pack candidates, team gate status, acceptance criteria, evidence-first claims, patch provenance, runtime three-cycle requirements, eval candidates, agent debate findings, release readiness, product-architect recommendations, runtime reliability, command-failure fingerprints, timeout policy, claim-ledger proof, runtime doctor checks, autonomous recovery, flaky-command memory, evidence replay, capability gaps, roadmap signals, product risks, user value, strategic refactor radar, deep-thinking review, idea-to-build slices, smarter code moves, collaboration decisions, tradeoffs, build-better roadmap, delivery metrics, delivery retrospective, learning feedback loop, improvement backlog, approval-gated skill evolution candidates, self-improvement roadmap, predictive intent architecture, change simulation, risk forecasting, implementation path ranking, test intelligence planning, proof contracts, architecture drift detection, context freshness checks, predictive timeout guards, and ADR suggestions. Each event line should include `timestamp`, `type`, and `data`; the CLI refreshes `interaction-memory.json`, `memory-graph.json`, and v9/v10/v11/v12/v13/v14/v15/v16/v17/v18/v19/v20/v21 coding, product-architect, runtime-reliability, evidence-replay, deep-collaboration, self-improvement, and predictive-engineering sidecars from those events so future work can reuse the user request/action/directory/file/context journal plus graph, coding review, strategic next actions, and replayable proof. The CLI also refreshes `.oac/repo-wiki/` for the current project directory when Quests are created, when file/context changes are recorded, and near verification/reflection/completion; run `oac repo-wiki` or `oac repo-wiki --watch` when files change outside Quest write-back. Repeated learnings become scored promotion candidates in `.oac/memory/promotions.json`; approve them with `oac memory-promote --approve <candidate-id>` before they become durable `.oac/team-memory.json` lessons or skill inputs. Adaptive v8/v9 events include `review.started`, `review.approved`, `review.rejected`, `task.injected`, `priority.changed`, `request.received`, `action.summary`, `cwd.observed`, `knowledge.captured`, `research.assessed`, `research.performed`, `next_steps.suggested`, `context.loaded`, `context.changed`, `coding.intent`, `impact.analyzed`, `patch.capsule`, `tests.selected`, and `review.signals`. Resume with:

```bash
oac quest-status
oac quest-resume <quest-id>
oac repo-wiki
oac quest-v9 <quest-id>
oac quest-replay <quest-id>
oac runtime-doctor --runtime kimi
oac memory-promote
```

The resume prompt works in Kimi, OpenCode, or Claude while keeping the selected runtime model.

## Installed Location

```bash
~/.kimi/agents/openagents-control/openagent.yaml
```

## Run

```bash
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml --max-steps-per-turn 160
```

For the cleanest Quest-style screen, hide Kimi's thinking stream:

```bash
kimi --no-thinking --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

For deep QuestMode coding sessions, pass a larger native Kimi step budget while
OpenAgent's Step Budget Guard keeps the turn bounded:

```bash
kimi --work-dir . \
  --agent-file ~/.kimi/agents/openagents-control/openagent.yaml \
  --max-steps-per-turn 160
```

## Command Timeouts

Kimi shell/background commands may be killed by a native timeout, commonly shown
as `Killed by timeout (30s)`. OpenAgent-on-Kimi now instructs Kimi to request an
explicit shell/task timeout before long installs, builds, full test suites, live
Quest validation, Docker commands, or network operations. Use about
`timeout_s: 300` for normal validation and `timeout_s: 900` for deep/live
runtime validation.

If a command times out, OpenAgent should not rerun the same command with the same
timeout. It should record `runtime_command_timeout`, capture the failed command
fingerprint, and either retry once with a larger timeout and narrower scope or
block with next-step choices.

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

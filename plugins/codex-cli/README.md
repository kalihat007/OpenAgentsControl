# OpenAgentsControl for Codex CLI

Direct Codex CLI adapter for OpenAgent Quest + Experts behavior, mirroring the
Kimi Code and Claude Code integrations.

Codex discovers custom agents from standalone TOML files under `~/.codex/agents/`.
This adapter installs `openagent.toml` plus `openagent-system.md` so OpenAgent
can run as a named custom agent (for subagent workflows) and as the documented
primary-session contract.

## Installed location

```text
~/.codex/agents/openagents-control/openagent.toml
~/.codex/agents/openagents-control/openagent-system.md
```

Codex discovers agents recursively under `~/.codex/agents/`. Do **not** add a
top-level `~/.codex/agents/openagent.toml` symlink — it duplicates the role and
Codex warns: `duplicate agent role name openagent`.

## Install

From the OpenAgentsControl repository:

```bash
./install.sh advanced --with-codex
# or refresh later
./update.sh --with-codex
```

## Run

### Why Codex does not auto-enter Quest mode (important)

Installing `openagent.toml` registers a **custom subagent** named `openagent`.
Codex’s **main interactive session** stays the default agent unless you also set
session instructions.

`install.sh --with-codex` / `update.sh --with-codex` append
`developer_instructions` to `~/.codex/config.toml` so **every** `codex -C .`
session follows Quest v8 plus Quest v9 coding intelligence, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, Temporal Memory, Intelligent Coding Team OS, Verified Coding Delivery OS, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, and Deep Coding Collaboration OS in the main thread
(visible `OpenAgent Quest Spec` on substantial work). Codex only spawns the
`openagent` **subagent** when you
explicitly ask it to.

Before task execution, Quest v8 runs a Pre-Execution Discovery Gate: inspect the
required local files/context, decide whether external/current/web research is
needed, append `research.assessed`, and append `research.performed` only when
current external sources actually informed the work.

For coding work, Quest v9 sidecars (`coding-intelligence.json`,
`patch-capsules.json`, `coding-review.md`) plus Coding Autopilot sidecars
(`coding-autopilot.json`, `symbol-graph.json`, `smart-test-matrix.json`,
`patch-ledger.json`, `pre-edit-contract.json`, `automatic-code-review.json`,
`failure-memory.json`, `runtime-parity-enforcer.json`,
`dependency-research-gate.json`, `autofix-plan.json`, `pr-readiness.md`) and
Coding Execution sidecars (`coding-execution.json`,
`executable-acceptance.json`, `guarded-autofix-runner.json`,
`contract-drift-guard.json`, `review-patch-loop.json`, `test-gap-finder.json`,
`regression-snapshots.json`, `runtime-compatibility-matrix.json`,
`ownership-lock-plan.json`, `security-secrets-gate.json`,
`pr-auto-packager.json`, `pr-auto-packager.md`) plus Verified Knowledgebase
sidecars (`verified-knowledgebase.json`, `knowledgebase-index.json`,
`evidence-ledger.json`, `hallucination-gate.json`, `contract-facts.json`,
`source-to-patch-trace.json`, `stale-knowledge-report.json`,
`dependency-research-cache.json`, `behavior-oracle.json`,
`test-authoring-plan.json`, `verified-knowledgebase.md`) plus Semantic Repo Brain
sidecars (`semantic-repo-brain.json`, `ast-knowledgebase.json`,
`knowledge-confidence-score.json`, `failure-fix-memory.json`,
`auto-skill-builder.json`, `semantic-repo-brain.md`) plus Temporal Memory
sidecars (`temporal-memory.json`, `patch-outcome-ledger.json`,
`repo-history-signals.json`, `temporal-memory.md`) plus Intelligent Coding Team
OS sidecars (`intelligent-coding-team.json`, `requirement-compiler.json`,
`expert-team-blackboard.json`, `change-impact-simulator.json`,
`project-skill-pack-builder.json`, `intelligent-coding-team.md`) plus Verified
Coding Delivery OS sidecars (`verified-delivery-os.json`,
`acceptance-compiler.json`, `evidence-first-gate.json`,
`patch-provenance-ledger.json`, `runtime-cycle-matrix.json`,
`auto-eval-generator.json`, `agent-debate-gate.json`,
`release-readiness-dashboard.json`, `verified-delivery-os.md`) plus Product
Architect Intelligence sidecars (`product-architect-review.json`,
`architecture-next-steps.json`, `roadmap-signals.json`,
`capability-gap-map.json`, `product-risk-register.json`,
`user-value-matrix.json`, `strategic-refactor-radar.json`,
`architecture-decision-suggestions.json`, `strategic-next-actions.md`) plus
Runtime Reliability + Evidence Replay OS sidecars
(`runtime-reliability-os.json`, `command-failure-index.json`,
`timeout-policy.json`, `claim-ledger.json`, `runtime-doctor-report.json`,
`autonomous-recovery-plan.json`, `flaky-command-memory.json`,
`evidence-replay.md`) plus Deep Coding Collaboration OS sidecars
(`deep-coding-collaboration-os.json`, `deep-thinking-review.json`,
`idea-to-build-brief.json`, `smarter-code-plan.json`,
`collaboration-board.json`, `decision-tradeoff-matrix.json`,
`build-better-roadmap.md`) plus Self-Improving Coding Team OS sidecars
(`self-improving-coding-team-os.json`, `coding-team-metrics.json`,
`delivery-retrospective.json`, `learning-feedback-loop.json`,
`improvement-backlog.json`, `skill-evolution-candidates.json`,
`self-improvement-roadmap.md`) are
used by default to carry intent, impact, patch capsules, smart tests, runtime
parity, review signals, symbol context, pre-edit boundaries, patch ledger,
failure replay, bounded autofix, PR readiness, executable acceptance, contract
drift, test gaps, runtime compatibility, security/secrets gating, PR packaging,
evidence ledgers, hallucination gates, source-to-patch traceability, stale
knowledge checks, behavior oracles, test-authoring plans, AST-level repo facts,
confidence labels, failed-command fingerprints, approval-gated skill candidates,
chronic cross-quest failure escalation, patch-outcome history, and git-history
co-change/churn/bug-density/ownership signals, requirement readiness, expert
ownership, file locks, impact simulation, project skill-pack candidates, team
gate status, acceptance criteria, evidence-first claims, patch provenance,
runtime three-cycle requirements, eval candidates, agent debate findings,
release readiness, product-architect recommendations, runtime reliability,
command-failure fingerprints, timeout policy, claim-ledger proof, runtime doctor
checks, autonomous recovery, flaky-command memory, evidence replay, delivery
metrics, delivery retrospectives, learning feedback loops, improvement backlog,
approval-gated skill evolution candidates, self-improvement roadmap, capability
gaps, roadmap signals, product risks, user value, strategic refactor radar, and
ADR suggestions. Refresh them with
`oac quest-v9` or `oac quest-v9 <quest-id>`.

Repeated learnings become scored promotion candidates in
`.oac/memory/promotions.json`; approve them with
`oac memory-promote --approve <candidate-id>` before they become durable
`.oac/team-memory.json` lessons or future skill inputs.

If Quest mode still does not appear, check:

```bash
grep -A2 'OpenAgents Control — Codex Quest v8 default' ~/.codex/config.toml
```

If you already had `developer_instructions` set, merge
`plugins/codex-cli/codex-quest-default.toml.example` manually (do not copy into
`~/.codex/agents/` — Codex treats every `.toml` there as an agent role).

Per-project override: copy the marker block into `.codex/config.toml` in your
repo, or run:

```bash
bash plugins/codex-cli/configure-codex-quest-default.sh
# then source and call configure_codex_project_quest_default /path/to/project
```

### Interactive (recommended)

```bash
cd /path/to/your/project
codex -C .
```

After install, substantial work should start with an **OpenAgent Quest Spec**
block automatically. You do not need a separate “operate as openagent” message
unless you disabled `developer_instructions`.

Optional explicit subagent delegation:

### Subagent delegation

After install, Codex can spawn the custom agent by name:

```text
Spawn the openagent agent to implement <objective>. Load .oac/runs/<quest-id>/
artifacts when resuming.
```

Built-in `explorer` and `worker` agents remain available for bounded read-only or
implementation tasks.

### Non-interactive

```bash
codex exec -C . "Operate as OpenAgent per ~/.codex/agents/openagents-control/openagent-system.md. <your objective>"
```

## Model policy

OpenAgent-on-Codex uses the Codex model configured in `~/.codex/config.toml` or
overridden with `codex -m <model>`. There is no LLM routing or hidden model
selector in this adapter.

## Resume durable Quests

```bash
oac quest-status
oac quest-resume <quest-id>
oac quest-resume <quest-id> --runtime codex
```

The CLI prints a Codex one-liner (`codex exec -C . ...`) plus the Quest resume
prompt. Paste into Codex after loading run artifacts from `.oac/runs/<quest-id>/`.

For headless bridge runs from the CLI:

```bash
oac experts --run --runtime codex "<objective>"
oac quest-run --runtime codex "<objective>"
```

Fast install refresh (Codex adapter only):

```bash
OAC_CODEX_ONLY=1 ./update.sh --with-codex
```

## Background daemon write-back

`codex exec` is one-shot: it often answers in stdout without appending `events.ndjson`.
OAC compensates in `packages/cli/src/lib/runtime-bridge.ts`:

1. The spawn prompt tells Codex to **write** `events.ndjson` (not only chat output).
2. On successful exit, **`ensureRuntimeWriteBack`** appends missing `task_update`, `runtime.completed`, and daemon-style `task.injected` / `priority.changed` / `note` events parsed from the objective.
3. Discovery and research decisions use `research.assessed` / `research.performed`, so skipped or performed web/current research is visible in Quest memory.
4. The Quest event stream refreshes `interaction-memory.json` and `memory-graph.json`, keeping user requests, working directories, actions, file/context changes, self-knowledge, and graph links available for resume.
5. The repo wiki refreshes under `.oac/repo-wiki/` when Quests are created, file/context changes are recorded, and verification/reflection/completion runs; use `oac repo-wiki --watch` when files change outside Quest write-back.
6. Quest v9 coding, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, Temporal Memory, Intelligent Coding Team OS, Verified Coding Delivery OS, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, Deep Coding Collaboration OS, and Self-Improving Coding Team OS sidecars refresh from Quest creation, file/context/validation events, coding events, and review/verify/complete transitions.
7. Completion can append `next_steps.suggested` so Codex offers evidence-based follow-up recommendations from changed files, task state, verification, memory/context signals, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, Deep Coding Collaboration OS, Self-Improving Coding Team OS, and application understanding, including a product/architecture/build recommendation when useful, then waits for the user instead of starting another Quest automatically.

That keeps `oac quest-run --background --runtime codex` and quest-daemon aligned with Kimi.
For full agent-authored write-back (not synthesized), use interactive `codex -C .` with tools enabled.

## Quest v8 comprehensive test

```bash
# CLI + artifact path (no live Codex API calls)
bash scripts/tests/test-codex-quest-v8.sh
npm run test:quest-v8:codex

# Full live Codex exec + daemon write-back (requires Codex auth)
RUN_LIVE_CODEX=1 bash scripts/tests/test-codex-quest-v8.sh
```

## Codex plugins (optional, future)

Codex also supports marketplace plugins (`.codex-plugin/plugin.json` with
`skills/`, MCP, hooks). This adapter uses the **custom agent** path first because
it matches Kimi’s `--agent-file` model. A full Codex plugin with bundled skills
can be added later under the same directory.

## References

- [Codex subagents](https://developers.openai.com/codex/subagents)
- [Codex plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)

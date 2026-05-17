# OpenAgentsControl for Kimi Code

This directory contains the direct Kimi Code adapter for OpenAgent.

It installs a Kimi agent spec that inherits Kimi's built-in tools/subagents, uses an OpenAgent Quest-first system prompt, and makes OpenAgent Quest + Experts the default operating layer. It does not require OpenCode, and it does not define a model. Kimi uses the user's active/default Kimi model from `~/.kimi/config.toml`, or the model explicitly passed with `kimi --model`.

For substantial work, OpenAgent-on-Kimi must show a visible `OpenAgent Quest Spec` before edits, file moves, plan-mode handoff, or tool calls. Repo-wide reorganizations require a proposed target layout and user approval before moving or deleting files.

Quest v4 keeps same-session behavior explicit:

```text
NEW -> SPEC -> EXECUTE -> VERIFY -> COMPLETE -> WAITING
```

After a request reaches `COMPLETE` and Kimi returns to user input, the next substantial user message starts a fresh `OpenAgent Quest Spec` with `State: NEW` unless the user says it continues or amends the previous Quest. If the user changes requirements before completion, OpenAgent amends the active Quest instead.

Durable Quest runs use `.oac/runs/{quest-id}/quest.json` beside `spec.json`, `plan.json`, `events.ndjson`, `acceptance-report.md`, and `summary.json`. In v4, runtimes append progress to `events.ndjson`; they do not rewrite `quest.json`. Each line should include `timestamp`, `type`, and `data`. Resume with:

```bash
oac quest-status
oac quest-resume <quest-id>
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
```

The test runs two Kimi turns in the same resumed session and checks that both substantial inputs start with `OpenAgent Quest Spec`, include a scenario, and keep `Team Lead: active`.

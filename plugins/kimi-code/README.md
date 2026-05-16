# OpenAgentsControl for Kimi Code

This directory contains the direct Kimi Code adapter for OpenAgent.

It installs a Kimi agent spec that extends Kimi's built-in coding agent and makes OpenAgent Quest + Experts the default operating layer. It does not require OpenCode, and it does not define a model. Kimi uses the user's active/default Kimi model from `~/.kimi/config.toml`, or the model explicitly passed with `kimi --model`.

For substantial work, OpenAgent-on-Kimi must show a visible `OpenAgent Quest Spec` before edits, file moves, or plan-mode handoff. Repo-wide reorganizations require a proposed target layout and user approval before moving or deleting files.

## Installed Location

```bash
~/.kimi/agents/openagents-control/openagent.yaml
```

## Run

```bash
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
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

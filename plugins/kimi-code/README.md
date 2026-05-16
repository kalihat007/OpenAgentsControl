# OpenAgentsControl for Kimi Code

This directory contains the direct Kimi Code adapter for OpenAgent.

It installs a Kimi agent spec that extends Kimi's built-in coding agent and injects the OpenAgent Quest + Experts behavior. It does not require OpenCode, and it does not define a model. Kimi uses the user's active/default Kimi model from `~/.kimi/config.toml`, or the model explicitly passed with `kimi --model`.

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

OpenAgent-on-Kimi uses exactly the Kimi model selected by the user. There is no LLM routing, fallback model, or separate classifier model.

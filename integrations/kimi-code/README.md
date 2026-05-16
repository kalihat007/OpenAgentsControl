# Kimi Code Integration

OpenAgentsControl supports Kimi Code directly through Kimi's `--agent-file` mechanism.

The source adapter lives at:

```text
plugins/kimi-code/openagent.yaml
```

`install.sh --with-kimi` and `update.sh --with-kimi` copy it to:

```text
~/.kimi/agents/openagents-control/openagent.yaml
```

Then users can run OpenAgent without OpenCode:

```bash
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

The Kimi adapter extends Kimi's built-in default coding agent, so Kimi keeps its native tools, subagents, auth, context handling, and configured model. OpenAgent makes Quest + Experts the default operating contract.

For substantial work, Kimi should visibly start with an `OpenAgent Quest Spec`, including scenario, objective, Team Lead/expert posture, task statuses, acceptance checks, and risks/approval notes.

No LLM routing or extra model selector is introduced. Kimi uses the default model from `~/.kimi/config.toml` unless the user explicitly passes `--model`.

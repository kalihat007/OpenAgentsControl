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
~/.codex/agents/openagent.toml          # symlink for Codex discovery
```

## Install

From the OpenAgentsControl repository:

```bash
./install.sh advanced --with-codex
# or refresh later
./update.sh --with-codex
```

## Run

### Interactive (recommended)

```bash
cd /path/to/your/project
codex -C .
```

On the first turn, ask Codex to operate as OpenAgent and follow the installed
contract, for example:

```text
Operate as the openagent custom agent for this session. Read
~/.codex/agents/openagents-control/openagent-system.md and follow Quest v8 for
all substantial work.
```

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
2. On successful exit, **`ensureCodexWriteBack`** appends missing `task_update`, `runtime.completed`, and daemon-style `task.injected` / `priority.changed` / `note` events parsed from the objective.

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

# OpenAgents Control - IDE Plugins

This directory contains IDE-specific plugin implementations for OpenAgents Control.

## Structure

```
plugins/
├── claude-code/          # Claude Code plugin
├── kimi-code/            # Kimi Code direct agent adapter
└── codex-cli/            # Codex CLI direct agent adapter
    ├── openagent.toml    # Custom agent definition
    ├── openagent-system.md
    └── README.md
```

## Available Plugins

### Claude Code (`claude-code/`)

**Plugin Name**: `oac`

**Installation**:
```bash
# From GitHub marketplace
/plugin marketplace add kalihat007/OpenAgentsControl
/plugin install oac

# Local testing
claude --plugin-dir ./plugins/claude-code --append-system-prompt "$(cat ./plugins/claude-code/openagent-system.md)"
```

**Features**:
- Intelligent code review with security analysis
- TDD test generation
- Automated documentation
- Smart task breakdown
- Context-aware agents

**Documentation**: See `claude-code/README.md`

### Kimi Code (`kimi-code/`)

**Integration Name**: `openagents-control`

**Installation**:
```bash
./install.sh advanced --with-kimi
# or refresh later
./update.sh --with-kimi
```

**Usage**:
```bash
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

**Features**:
- Direct OpenAgent Quest + Experts behavior inside Kimi
- Visible `OpenAgent Quest Spec` for substantial work
- Extends Kimi's built-in coding agent and native tools
- Uses the user's configured Kimi model with no LLM routing or hidden model selector
- Works without OpenCode

**Documentation**: See `kimi-code/README.md`

### Codex CLI (`codex-cli/`)

**Integration Name**: `openagents-control`

**Installation**:
```bash
./install.sh advanced --with-codex
# or refresh later
./update.sh --with-codex
```

**Usage**:
```bash
codex -C .
oac quest-resume <quest-id> --runtime codex
# On first turn, ask Codex to operate as the openagent custom agent
# (see plugins/codex-cli/README.md)
```

**Features**:
- Direct OpenAgent Quest + Experts behavior inside Codex CLI
- Custom agent at `~/.codex/agents/openagent.toml`
- Quest v8 lifecycle and durable `.oac/runs/` sidecars
- Works without OpenCode

**Documentation**: See `codex-cli/README.md`

## Future Plugins

- **Cursor** - Planned
- **Windsurf** - Planned
- **VS Code** - Planned

## Development

Each plugin is self-contained and can be developed/tested independently.

### Adding a New Plugin

1. Create plugin directory: `plugins/your-ide/`
2. Add plugin manifest (IDE-specific format)
3. Symlink to shared context: `ln -s ../../.opencode/context context`
4. Add skills/agents/commands
5. Update `.claude-plugin/marketplace.json` if applicable
6. Document in plugin's README.md

---

**Last Updated**: 2026-05-19

# OpenAgents Control Installation Guide

Complete guide to installing OpenAgents Control components using the automated installer script.

---

## Quick Start

### Default Installation (Local Directory)

```bash
# Interactive mode - choose components
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh)

# Quick install with the default Advanced profile
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh) advanced
```

Installs to `.opencode/` in your current directory.

---

## Installation Methods

### 1. Interactive Installation (Recommended for First-Time Users)

Download the installer first for a fully interactive experience (profile menu defaults to **Advanced**, option 5):

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh -o install.sh
chmod +x install.sh
./install.sh
```

**Non-interactive pipe** (`curl … | bash` with no profile argument) installs the **Advanced** profile automatically.

**Interactive Flow:**
1. **Choose Installation Location**
   - Local (`.opencode/` in current directory)
   - Global (`~/.config/opencode/`)
   - Custom (enter any path)

2. **Choose Installation Mode**
   - Quick Install (profile menu; press Enter for **Advanced**, option 5)
   - Custom Install (pick individual components)
   - List Available Components

3. **Select Components** (if custom mode)
   - Choose from agents, subagents, commands, tools, contexts, config

4. **Review & Confirm**
   - See what will be installed
   - Confirm installation directory
   - Proceed or cancel

### 2. Profile-Based Installation (Quick Setup)

Install a pre-configured set of components. For HackersEra/OpenAgent usage, use **Advanced** by default.

```bash
# Advanced - Recommended default complete system with OpenAgent Quest + Experts Mode + swarm
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh) advanced

# Essential - Minimal setup with core agents
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh) essential

# Developer - Narrow code-focused development tools

# Business - Content and business-focused tools
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh) business

# Full - Everything except system-builder
bash <(curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh) full
```

### 3. Download & Run (For Offline or Repeated Use)

```bash
# Download the installer
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh -o install.sh

# Make it executable
chmod +x install.sh

# Run interactively
./install.sh

# Or with a profile
./install.sh advanced
```

---

## Installation Locations

### Local Installation (Default)

Installs to `.opencode/` in your current directory.

**Best for:**
- Project-specific agents
- Testing and development
- Multiple isolated installations

```bash
# Default behavior
./install.sh advanced

# Explicit local installation
./install.sh advanced --install-dir .opencode
```

**Result:**
```
your-project/
├── .opencode/
│   ├── agent/
│   ├── command/
│   ├── context/
│   └── tool/
└── your-project-files...
```

### Global Installation

Installs to `~/.config/opencode/` for user-wide access.

**Best for:**
- System-wide agent availability
- Single installation for all projects
- Consistent agent versions

```bash
# Using CLI argument
./install.sh advanced --install-dir ~/.config/opencode

# Using environment variable
export OPENCODE_INSTALL_DIR=~/.config/opencode
./install.sh advanced
```

**Result:**
```
~/.config/
└── opencode/
    ├── agent/
    ├── command/
    ├── context/
    └── tool/
```

### Custom Installation

Install to any directory you choose.

**Best for:**
- Custom organizational structures
- Shared team installations
- Non-standard setups

```bash
# Custom path
./install.sh advanced --install-dir ~/my-agents

# Path with spaces (use quotes)
./install.sh advanced --install-dir "~/My Agents/opencode"

# Absolute path
./install.sh advanced --install-dir /opt/opencode
```

---

## Installation Directory Options

### CLI Argument

Use `--install-dir` to specify installation directory:

```bash
# Format 1: --install-dir=PATH
./install.sh advanced --install-dir=~/.config/opencode

# Format 2: --install-dir PATH
./install.sh advanced --install-dir ~/.config/opencode
```

### Environment Variable

Set `OPENCODE_INSTALL_DIR` for persistent configuration:

```bash
# Set once, use multiple times
export OPENCODE_INSTALL_DIR=~/.config/opencode

# Now all installations use this directory
./install.sh advanced
./install.sh --list
```

**Add to your shell profile for persistence:**
```bash
# ~/.bashrc or ~/.zshrc
export OPENCODE_INSTALL_DIR=~/.config/opencode
```

### Interactive Selection

When running in interactive mode, you'll be prompted to choose:

```
Choose installation location:

  1) Local - Install to .opencode/ in current directory
     (Best for project-specific agents)
     
  2) Global - Install to ~/.config/opencode/
     (Best for user-wide agents available everywhere)
     
  3) Custom - Enter exact path
     Examples:
       Linux/Mac:  /home/user/my-agents or ~/my-agents
       Windows:    C:/Users/user/my-agents or ~/my-agents
     
Enter your choice [1-3]:
```

### Priority Order

Installation directory is determined by (highest to lowest priority):

1. `--install-dir` CLI argument
2. `OPENCODE_INSTALL_DIR` environment variable
3. Interactive selection (if in interactive mode)
4. Default: `.opencode`

---

## Platform-Specific Installation

### Linux

```bash
# Standard installation
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced

# Global installation
./install.sh advanced --install-dir ~/.config/opencode

# System-wide (requires sudo)
sudo ./install.sh advanced --install-dir /opt/opencode
```

### macOS

```bash
# Standard installation
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced

# Global installation (XDG standard)
./install.sh advanced --install-dir ~/.config/opencode

# macOS native location
./install.sh advanced --install-dir ~/Library/Application\ Support/opencode
```

### Windows (Git Bash)

```bash
# Standard installation
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced

# Global installation
./install.sh advanced --install-dir ~/.config/opencode

# Windows-style path
./install.sh advanced --install-dir C:/Users/username/opencode
```

### Windows (WSL)

```bash
# Same as Linux
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced

# Global installation
./install.sh advanced --install-dir ~/.config/opencode
```

---

## Available Profiles

### Essential
**Minimal setup with core agents**

Components:
- Core agents: openagent
- Essential contexts
- Basic configuration

```bash
./install.sh essential
```

### Developer
**Code-focused development tools**

Components:
- Development agents: openagent, openagent, task-manager
- Code subagents: reviewer, tester, coder-agent, build-agent
- Development commands: test, commit, context
- Development tools and contexts

```bash
# HackersEra/OpenAgent default remains Advanced.
./install.sh advanced
```

### Business
**Content and business-focused tools**

Components:
- Business agents
- Content creation tools
- Documentation agents
- Business contexts

```bash
./install.sh business
```

### Full
**Everything except system-builder**

Components:
- All agents and subagents
- All commands
- All tools
- All contexts
- All configuration

```bash
./install.sh full
```

### Advanced
**Complete system with all components**

Components:
- Everything in Full profile
- System-builder agents
- Advanced configuration
- Complete toolset

```bash
./install.sh advanced
```

---

## install.sh vs update.sh

| Script | When to use |
|--------|-------------|
| **`install.sh`** | First-time setup, new projects, adding profiles/components, or reinstall with collision handling |
| **`update.sh`** | Refresh an **existing** `.opencode/` tree in place (agents, contexts, quest/experts files) without re-running the full installer |

Run both from the project root (or pass `--install-dir` for global/custom paths). When cloning the repo, `install.sh` also installs the Claude bridge plugin automatically if `plugins/claude-code` is present.

---

## Post-Installation

### 1. Verify Installation

```bash
# Check installed files
ls -la .opencode/

# Or for global installation
ls -la ~/.config/opencode/
```

### 2. Configure Environment

```bash
# Copy example environment file
cp env.example .env

# Edit with your settings
nano .env
```

### 3. Recommended execution workflow

**Primary execution** (use these for day-to-day work):

```bash
# OpenCode TUI — OpenAgent default (Quest + Experts + swarm via .oac/config.json)
opencode --agent OpenAgent

# Claude Code — after install.sh from repo clone or --with-claude
claude --plugin-dir ~/.claude/plugins/openagents-control-bridge
```

**CLI orchestration (`oac`)** — expert routing, plans, and handoff artifacts:

```bash
oac experts "build a JWT auth API"              # roster / routing
oac experts --plan-only "build a JWT auth API"  # save structured plan for handoff
oac experts --run "build a JWT auth API"        # simulated pipeline (default for --run)
```

`oac experts --run --live` runs a headless OpenCode spawn for the first scheduled task only (MVP). It is **not** the primary path — prefer `install.sh` / `update.sh` plus OpenCode TUI or Claude Code for execution.

`.oac/config.json` is created on install with `expertMode`, `useAgentSwarm`, and `maxParallelAgents: 2` (overload-safe default).

---

## Collision Handling

When installing into an existing directory, the installer detects file collisions and offers 4 options:

### Option 1: Skip Existing (Safest)
- Only install new files
- Keep all existing files unchanged
- Your customizations are preserved

### Option 2: Overwrite All (Destructive)
- Replace all existing files with new versions
- Your customizations will be lost
- Requires confirmation

### Option 3: Backup & Overwrite (Recommended)
- Backs up existing files to `.opencode.backup.{timestamp}/`
- Then installs new versions
- You can restore from backup if needed

### Option 4: Cancel
- Exit without making changes

**See [Collision Handling Guide](collision-handling.md) for detailed information.**

---

## Updating Installations

Prefer **`update.sh`** to refresh files in an existing `.opencode/` directory. Use **`install.sh`** when you need a new profile, new components, or interactive collision handling.

### Refresh in place (`update.sh`)

From the project where `.opencode/` lives:

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/update.sh | bash
```

The updater refreshes existing `.md`/`.ts`/`.sh` files, ensures quest/experts contexts and commands exist, creates `.opencode/opencode.json` and `.oac/config.json` when missing, preserves the user's selected OpenCode model, and moves old default swarm parallelism from `4` to `2`. From a repo clone it also refreshes the Claude bridge plugin when `plugins/claude-code` is present.

### Add new components (`install.sh`)

```bash
# Run installer again with "Skip existing" option
./install.sh advanced

# When prompted for collision handling, choose:
# Option 1: Skip existing
```

Only new components will be installed; existing files remain unchanged.

For custom install locations:

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/update.sh | bash -s -- --install-dir ~/.config/opencode
```

For a full overwrite:

```bash
# Run installer with "Backup & overwrite" option
./install.sh advanced

# When prompted for collision handling, choose:
# Option 3: Backup & overwrite
```

All components updated, backup created for safety.

### Migrate to Different Location

```bash
# Option 1: Move existing installation
mv .opencode ~/.config/opencode

# Option 2: Fresh install to new location
./install.sh advanced --install-dir ~/.config/opencode
```

---

## Troubleshooting

### Dependencies Missing

**Error:** `curl: command not found` or `jq: command not found`

**Solution:**
```bash
# macOS
brew install curl jq

# Ubuntu/Debian
sudo apt-get install curl jq

# Fedora/RHEL
sudo dnf install curl jq

# Arch Linux
sudo pacman -S curl jq
```

### Permission Denied

**Error:** `Permission denied` when creating directories

**Solution:**
```bash
# Install to a directory you own
./install.sh advanced --install-dir ~/opencode

# Or create parent directory first
mkdir -p ~/.config
./install.sh advanced --install-dir ~/.config/opencode
```

### Path with Spaces

**Error:** Installation fails with paths containing spaces

**Solution:**
```bash
# Quote the path
./install.sh advanced --install-dir "~/My Agents/opencode"
```

### Parent Directory Doesn't Exist

**Error:** `Parent directory does not exist`

**Solution:**
```bash
# Create parent directory first
mkdir -p ~/.config

# Then install
./install.sh advanced --install-dir ~/.config/opencode
```

### Bash Version Too Old

**Error:** `This script requires Bash 3.2 or higher`

**Solution:**
```bash
# Check your bash version
bash --version

# macOS: Install newer bash via Homebrew
brew install bash

# Linux: Update bash via package manager
sudo apt-get update && sudo apt-get upgrade bash
```

---

## Advanced Usage

### View Available Components

```bash
# List all components without installing
./install.sh --list
```

### Get Help

```bash
# Show all options and examples
./install.sh --help
```

### Specify Git Branch

```bash
# Install from a different branch
export OPENCODE_BRANCH=develop
./install.sh advanced
```

### Non-Interactive Installation (CI/CD)

```bash
# Piped install — defaults to Advanced (profile 5) when no profile arg is passed
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash

# Set environment variables for automation
export OPENCODE_INSTALL_DIR=/opt/opencode
export OPENCODE_BRANCH=main
export OPENCODE_DEFAULT_PROFILE=advanced   # or OAC_PROFILE=5

# Run with explicit profile (no prompts)
./install.sh advanced
```

---

## Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `OPENCODE_INSTALL_DIR` | Installation directory | `.opencode` | `~/.config/opencode` |
| `OPENCODE_DEFAULT_PROFILE` | Profile when non-interactive with no profile arg | `advanced` | `developer`, `5` |
| `OAC_PROFILE` | Alias for `OPENCODE_DEFAULT_PROFILE` | `advanced` | `advanced`, `5` |
| `OPENCODE_BRANCH` | Git branch to install from | `main` | `develop` |

---

## Examples

### Example 1: First-Time Local Installation
```bash
# Download and run installer
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced

# Result: Installs to .opencode/ in current directory
```

### Example 2: Global Installation for All Projects
```bash
# Install to global config directory
./install.sh advanced --install-dir ~/.config/opencode

# Now available to all projects
```

### Example 3: Team Shared Installation
```bash
# Install to shared directory
sudo ./install.sh full --install-dir /opt/opencode

# Team members can access from /opt/opencode
```

### Example 4: Multiple Installations
```bash
# Project A - local installation
cd ~/projects/project-a
./install.sh advanced

# Project B - different local installation
cd ~/projects/project-b
./install.sh business

# Each project has its own .opencode/ directory
```

### Example 5: Update Existing Installation
```bash
# Run installer again
./install.sh advanced

# Choose "Skip existing" to add only new components
# Or "Backup & overwrite" to update everything
```

---

## Next Steps

After installation:

1. **Review Components**
   ```bash
   ls -la .opencode/
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   nano .env
   ```

3. **Read Documentation**
   - [Collision Handling](collision-handling.md)
   - [Platform Compatibility](platform-compatibility.md)
   - [Building with OpenCode](../guides/building-with-opencode.md)

4. **Start Using OpenCode**
   ```bash
   opencode
   ```

---

## Getting Help

- **View installer help:** `./install.sh --help`
- **List components:** `./install.sh --list`
- **Documentation:** [GitHub Repository](https://github.com/kalihat007/OpenAgentsControl)
- **Report issues:** [GitHub Issues](https://github.com/kalihat007/OpenAgentsControl/issues)

---

## Summary

The OpenAgents Control installer provides:

✅ **Flexible installation locations** - Local, global, or custom  
✅ **Multiple installation methods** - Interactive, profile-based, or custom  
✅ **Cross-platform support** - Linux, macOS, Windows  
✅ **Safe updates** - Collision detection and backup options  
✅ **Easy to use** - Simple commands, clear prompts  

Choose the installation method that fits your needs and get started with OpenAgents Control!

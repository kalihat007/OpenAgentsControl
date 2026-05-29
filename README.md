<div align="center">

![OpenAgents Control Hero](docs/images/hero-image.png)

# OpenAgents Control (OAC)

### Trusted fast OpenAgent with default Quest-style Experts Mode powered by agent swarm orchestration.

**AI agents that learn YOUR coding patterns and generate matching code every time.**

🎯 **Pattern Control** - Define your patterns once, AI uses them forever  
⚡ **Trusted Fast Mode** - Safe local work executes by default
🧭 **Quest-Style Default** - Describe the goal; OpenAgent plans, executes, verifies, and summarizes
🧠 **Scale-Out Swarms** - OpenAgent self-organizes specialist teams by default
🧑‍💻 **Experts Mode** - Team Lead plans, experts build/test/review in parallel
🔁 **Repeatable Results** - Same patterns = Same quality code  
📝 **Editable Agents** - Full control over AI behavior  
👥 **Team-Ready** - Everyone uses the same patterns

**Multi-language:** TypeScript • Python • Go • Rust  • C# • Any language*  
**Model Agnostic:** Claude • GPT • Gemini • MiniMax • Local models


[![GitHub stars](https://img.shields.io/github/stars/kalihat007/OpenAgentsControl?style=flat-square&logo=github&labelColor=black&color=ffcb47)](https://github.com/kalihat007/OpenAgentsControl/stargazers)
[![X Follow](https://img.shields.io/twitter/follow/DarrenBuildsAI?style=flat-square&logo=x&labelColor=black&color=1DA1F2)](https://x.com/DarrenBuildsAI)
[![License: MIT](https://img.shields.io/badge/License-MIT-3fb950?style=flat-square&labelColor=black)](https://opensource.org/licenses/MIT)
[![Last Commit](https://img.shields.io/github/last-commit/kalihat007/OpenAgentsControl?style=flat-square&labelColor=black&color=8957e5)](https://github.com/kalihat007/OpenAgentsControl/commits/main)

[🚀 Quick Start](#-quick-start) • [💻 Show Me Code](#-example-workflow) • [🗺️ Roadmap](https://github.com/kalihat007/OpenAgentsControl/projects) • [💬 Community](https://nextsystems.ai)

</div>

---

> **Built on [OpenCode](https://opencode.ai)** - An open-source AI coding framework. OAC extends OpenCode with specialized agents, context management, and team workflows.

---

## The Problem

Most AI agents are like hiring a developer who doesn't know your codebase. They write generic code. You spend hours rewriting, refactoring, and fixing inconsistencies. Tokens burned. Time wasted. No actual work done.

**Example:**
```typescript
// What AI gives you (generic)
export async function POST(request: Request) {
  const data = await request.json();
  return Response.json({ success: true });
}

// What you actually need (your patterns)
export async function POST(request: Request) {
  const body = await request.json();
  const validated = UserSchema.parse(body);  // Your Zod validation
  const result = await db.users.create(validated);  // Your Drizzle ORM
  return Response.json(result, { status: 201 });  // Your response format
}
```

## The Solution

**OpenAgentsControl teaches OpenAgent your patterns upfront.** It understands your coding standards, architecture, security requirements, and HackersEra cybersecurity-product defaults. It executes safe local work quickly, runs Quest-style Experts Mode for all work by default, uses agent swarm orchestration for larger work, distributes context across roles, and keeps high-risk actions behind approval gates.

**The result:** Production-ready code that ships without heavy rework.

### What Makes OAC Different

**🎯 Context-Aware (Your Secret Weapon)**  
Agents load YOUR patterns before generating code. Code matches your project from the start. No refactoring needed.

**📝 Editable Agents (Not Baked-In Plugins)**  
Full control over agent behavior. Edit markdown files directly—no compilation, no vendor lock-in. Change workflows, add constraints, customize for your team.

**⚡ Trusted Fast Mode (Fast by Default)**
OpenAgent executes safe local work directly. It asks approval only for destructive commands, secrets/credentials, production deploys, payment/legal actions, public external communication, or irreversible data operations.

**🧭 Quest-Style Goal Execution**
OpenAgent treats every request as a goal-to-result Quest. It auto-selects direct execution, code-with-spec, prototype/demo, tool-building, or research-plan flow, then carries the work through planning, execution, verification, and summary.

**🧠 Scale-Out Organizational AI**
OpenAgent acts like the CEO of a temporary expert organization. It dynamically assigns researchers, analysts, builders, reviewers, fact-checkers, and domain specialists, then reconciles disagreement instead of forcing one assistant to think through everything sequentially.

**🧑‍💻 Quest + Experts Mode + Agent Swarm by Default**
OpenAgent always starts in Quest-style Experts Mode and always applies agent swarm orchestration. For tiny work it uses TeamLeadAgent-only swarm-lite routing; for larger work it becomes the Team Lead, splits the objective into small ToDo chunks, creates a full swarm task graph, assigns frontend/backend/QA/review/research/DevOps/UX experts, syncs completed chunks back into the plan, runs safe work in parallel, validates the result, and records reusable lessons.

**⚡ Token Efficient (MVI Principle)**  
Minimal Viable Information design. Only load what's needed, when it's needed. Context files <200 lines, lazy loading, faster responses.

**👥 Team-Ready (Repeatable Patterns)**  
Store YOUR coding patterns once. Entire team uses same standards. Commit context to repo. New developers inherit team patterns automatically.

**🔄 Model Agnostic**  
Use any AI model (Claude, GPT, Gemini, local). No vendor lock-in.

**Full-stack development:** OAC handles both frontend and backend work. The agents coordinate to build complete features from UI to database.

### Controlled Agent Swarms

For bigger work, OAC now includes a controlled swarm layer:

- **Quest Mode + Experts Mode + Agent Swarm** is the default OpenAgent operating layer: scenario routing, Team Lead planning, dynamic expert assignment, swarm task graph, task progress, browser verification, code review, QA, research, DevOps, UX, and self-evolution.
- **HackersEra Master Swarm** is the default routing layer for cybersecurity product, technical R&D, revenue, investor, operations, compliance, support, and CEO work.
- **OpenAgent Swarm Mode** plans multi-agent work with dependencies, file ownership, and validation gates behind Experts Mode.
- **Chunked ToDo execution** keeps large work fast by splitting broad goals into small specialist-owned chunks, syncing after each batch, and scheduling the next chunk set from the latest checkpoint.
- **Overload-safe scale-out** defaults to two parallel agents, uses small sequential chunks for large work, and expands only when the user raises the limit and the selected model is healthy.
- **Dynamic role assignment** lets OpenAgent auto-hire the needed specialists instead of making the user manually choose every role.
- **Lossless context management** preserves task graphs, module claims, contracts, incidents, checkpoints, artifacts, and evidence reports rather than relying only on compressed chat summaries.
- **Self-organizing engineering teams** map work to PM, Architect, Tech Lead, frontend/backend/devops, QA, Security, Review, Docs, Integration, and Debug agents.
- **Task graphs** make every worker's reads, writes, dependencies, and acceptance criteria explicit.
- **Safe parallel batches** run independent work together while blocking same-file write conflicts.
- **Adversarial review** lets QA, Security, and Code Review critique independently, with Tech Lead arbitration when they disagree.
- **Revenue Growth Swarms** coordinate CGO, market intelligence, customer research, brand, lead gen, conversion, pricing, content, PR, trust, analytics, and sales coaching agents for cybersecurity GTM.
- **Investor Magnet Swarms** coordinate investor narrative, funding simulations, PR/media, LinkedIn thought leadership, analyst relations, events, social proof, crisis-to-opportunity, and investor metrics.
- **Business Operating Swarms** coordinate CEO synthesis, customer support, product strategy, compliance, talent, finance, supply chain, R&D, crisis response, partnerships, and knowledge management.
- **Technical R&D Swarms** coordinate hardware/software co-design, embedded firmware, FPGA/ASIC, automotive protocols, HIL/SIL, VAPT, compliance, EMC, SBOM, signing, and OTA release workflows.
- **Runtime primitives** in `@nextsystems/oac-swarm-runtime` provide typed scheduling, lock checks, sessions, and events.

Use:

```bash
opencode --agent OpenAgent
> "Build this feature as a controlled swarm"
```

Or invoke the commands:

```text
/swarm-plan Build the feature
/swarm-team Design the engineering swarm
/swarm-run approved plan
/swarm-status
/swarm-debug failed CI incident
/experts Build this full-stack feature with expert planning, implementation, testing, review, and browser verification
/hackersera-swarm Build a cross-functional cybersecurity product/company swarm
/revenue-swarm Launch this cybersecurity product
/campaign-genesis Enter a new automotive security segment
/sales-coach Improve this enterprise deal pitch
/investor-magnet Build investor narrative, PR, LinkedIn, analyst, and proof momentum
/funding-round Simulate VC objections and prepare fundraising assets
/pr-engine Orchestrate investor-relevant media coverage
/linkedin-thought-leadership Create founder and CTO category leadership calendars
/analyst-relations Plan Gartner, Forrester, IDC, and award motions
/operating-swarm Analyze support and compliance risks
/ceo-brief Summarize cross-swarm priorities
/compliance-swarm Map UN R155 readiness
/support-swarm Triage customer technical issues
/technical-swarm Design a cybersecurity hardware/software R&D swarm
/hardware-codesign Plan a GMSL2, CAN, EV charging, or secure gateway product
/vapt-campaign Plan parallel cybersecurity testing across attack vectors
/living-tara Maintain continuous ISO/SAE 21434 and UN R155 evidence
```

Read the full design: [Controlled Agent Swarm System](./docs/features/agent-swarm-system.md)

---

## 🏗️ Architecture Overview

OpenAgentsControl is a TypeScript monorepo built with Bun and npm workspaces. The core framework lives in four packages that can be used independently or together:

```
┌──────────────────────────────────────────────────────────────────┐
│                         oac CLI                                  │
│  (packages/cli — install, manage, doctor, apply, experts)        │
├──────────────┬──────────────────┬────────────────────────────────┤
│              │                  │                                 │
│  swarm-runtime         compatibility-layer        plugin-abilities│
│  (scheduler,           (Cursor / Claude /         (abilities,     │
│   sessions,             Windsurf adapter           workflows,     │
│   resilience,           registry, mappers)         permissions,   │
│   team roles)                                      plugin hooks)  │
│              │                  │                                 │
├──────────────┴──────────────────┴────────────────────────────────┤
│                     .opencode/                                    │
│  (agent definitions, context files, commands, skills, tools)      │
└──────────────────────────────────────────────────────────────────┘
```

### Package Details

| Package | npm Name | Description |
|---------|----------|-------------|
| **`packages/cli`** | `@nextsystems/oac-cli` | The `oac` command-line tool. Commands: `init` (scaffold a project), `add`/`remove` (manage components from the registry), `update` (pull latest), `doctor` (health checks), `apply` (generate IDE-specific files), `list` (browse registry), `status` (show install state), `experts` (inspect swarm routing). Built with Commander, Chalk, and Ora. |
| **`packages/swarm-runtime`** | `@nextsystems/oac-swarm-runtime` | Typed primitives that power agent swarm orchestration. Includes the **scheduler** (dependency-aware batch planning with write-lock conflict detection), **sessions** (immutable swarm session state with event streams), **team definitions** (development, revenue, business-ops, technical R&D, and investor-magnet role rosters), and **resilience** utilities (retry with exponential backoff, circuit breaker, timeout wrapper, dead-letter queue). |
| **`packages/compatibility-layer`** | `@openagents-control/compatibility-layer` | Translates OAC agent definitions to and from other AI coding tools. Ships adapters for **Cursor**, **Claude Code**, and **Windsurf**, plus mappers for tools, permissions, models, and context paths. Includes a `TranslationEngine` for full agent conversion and a `CapabilityMatrix` for feature-gap analysis. |
| **`packages/plugin-abilities`** | `@openagents/plugin-abilities` | The plugin system for OpenCode. Defines **abilities** (multi-step validated workflows with script, agent, skill, approval, and workflow steps), an **execution manager** with strict/normal/loose enforcement, a **permission validator**, **context discovery**, and a plugin hook interface (`chat.message`, `tool.execute.before/after`, `session.idle`, `event`). |

### Additional Directories

- **`evals/`** — Agent evaluation framework and test suites (YAML-defined scenarios, SDK-driven runner)
- **`.opencode/`** — Agent definitions, context files, commands, skills, tools, and configs (the content OAC installs into your projects)
- **`plugins/claude-code/`** — Claude Code plugin (session hooks, subagent registration)
- **`scripts/`** — Versioning, registry validation, prompt management, and testing utilities
- **`docs/`** — Extended documentation, feature designs, and contributor guides

---

## 🛠️ Development

### Prerequisites

- **Bun** >= 1.0.0 (primary runtime and test runner for `cli`, `swarm-runtime`, `plugin-abilities`)
- **Node.js** >= 18.0.0 (required for `compatibility-layer` which uses vitest/eslint)
- **npm** (workspace orchestration at the root level)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/kalihat007/OpenAgentsControl.git
cd OpenAgentsControl

# Install root dependencies (also links workspaces)
npm install

# Install per-package dependencies
cd packages/cli && bun install && cd ../..
cd packages/swarm-runtime && bun install && cd ../..
cd packages/compatibility-layer && npm ci && cd ../..
cd packages/plugin-abilities && bun install && cd ../..
```

### Building

```bash
# CLI (Bun bundler)
cd packages/cli && bun run build

# Swarm runtime (TypeScript compiler)
cd packages/swarm-runtime && bun run build

# Compatibility layer (TypeScript compiler)
cd packages/compatibility-layer && npm run build

# Plugin abilities (TypeScript compiler)
cd packages/plugin-abilities && bun run build
```

### Testing

```bash
# Run ALL package unit tests (matches CI)
cd packages/cli && bun test
cd packages/swarm-runtime && bun test
cd packages/compatibility-layer && npx vitest run
cd packages/plugin-abilities && bun test

# Type-checking only (no emit)
cd packages/cli && bun run typecheck
cd packages/swarm-runtime && bun run typecheck

# Agent eval tests (requires API keys)
npm run test:ci              # smoke tests
npm run test:openagent       # full OpenAgent suite
```

### Linting & Validation

```bash
# Lint compatibility-layer
cd packages/compatibility-layer && npm run lint

# Validate the component registry
bun run validate:registry

# Validate context file links
bun run validate:context-links
```

> **Full contributor guide:** See [CONTRIBUTING.md](./CONTRIBUTING.md) for code style, conventions, how to add CLI commands and plugins, and PR guidelines.

---

## 🆚 Quick Comparison

| Feature | OpenAgentsControl | Cursor/Copilot | Aider | Oh My OpenCode |
|---------|-------------------|----------------|-------|----------------|
| **Learn Your Patterns** | ✅ Built-in context system | ❌ No pattern learning | ❌ No pattern learning | ⚠️ Manual setup |
| **Approval Gates** | ✅ High-risk actions only | ⚠️ Optional (default off) | ❌ Auto-executes | ❌ Fully autonomous |
| **Token Efficiency** | ✅ MVI principle (80% reduction) | ❌ Full context loaded | ❌ Full context loaded | ❌ High token usage |
| **Team Standards** | ✅ Shared context files | ❌ Per-user settings | ❌ No team support | ⚠️ Manual config per user |
| **Edit Agent Behavior** | ✅ Markdown files you edit | ❌ Proprietary/baked-in | ⚠️ Limited prompts | ✅ Config files |
| **Model Choice** | ✅ Any model, any provider | ⚠️ Limited options | ⚠️ OpenAI/Claude only | ✅ Multiple models |
| **Scale-Out Organization** | ✅ Dynamic roles, distributed context, adversarial reconciliation | ❌ No | ❌ No | ⚠️ Broad autonomy |
| **Experts Mode + Swarm** | ✅ Default Team Lead, expert task list, swarm execution | ❌ No | ❌ No | ⚠️ Manual agent setup |
| **Execution Speed** | ✅ Trusted fast mode + controlled swarms | Fast | Fast | ✅ Parallel agents |
| **Error Recovery** | ✅ Human-guided validation | ⚠️ Auto-retry (can loop) | ⚠️ Auto-retry | ✅ Self-correcting |
| **Best For** | Production code, teams | Quick prototypes | Solo developers | Power users, complex projects |

**Use OAC when:**
- ✅ You have established coding patterns
- ✅ You want code that ships without refactoring
- ✅ You want fast trusted execution with approval gates only for high-risk actions
- ✅ You care about token efficiency and costs
- ✅ You want OpenAgent to self-organize researchers, analysts, builders, reviewers, and domain specialists without micromanagement
- ✅ You want Quest-style Experts Mode by default with scenario routing, Team Lead planning, frontend/backend/QA/review/research/DevOps/UX experts, progress tracking, and swarm execution
- ✅ You want an engineering-team swarm with PM, architecture, implementation, QA, security, review, integration, and debug roles
- ✅ You want long-horizon work with distributed context, adversarial disagreement, and forced reconciliation

**Use others when:**
- **Cursor/Copilot:** Quick prototypes, don't care about patterns
- **Aider:** Simple file edits, no team coordination
- **Oh My OpenCode:** Need autonomous execution with parallel agents (speed over control)

> **Full comparison:** [Read detailed analysis →](https://github.com/kalihat007/OpenAgentsControl/discussions/116)

---

## 🚀 Quick Start

**Prerequisites:** [OpenCode CLI](https://opencode.ai/docs) (free, open-source) • Bash 3.2+ • Git

### Step 1: Install

**One command:**

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh | bash -s advanced
```

<sub>The installer will set up OpenCode CLI if you don't have it yet.</sub>

**Or interactive:**
```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/install.sh -o install.sh
bash install.sh
```

### Keep Updated

For existing installations, run the updater from the project where `.opencode/` is installed:

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/update.sh | bash
```

The updater refreshes existing OpenAgent files, creates `.opencode/opencode.json` when missing, preserves the user's selected OpenCode model, and keeps conservative swarm defaults current.

Use `--install-dir PATH` if you installed to a custom location:

```bash
curl -fsSL https://raw.githubusercontent.com/kalihat007/OpenAgentsControl/main/update.sh | bash -s -- --install-dir ~/.config/opencode
```

For a full reinstall or overwrite of every component, download `install.sh` and choose `Backup & overwrite` when prompted.

### Step 2: Start Building

**Primary execution:**

```bash
opencode --agent OpenAgent
> "Create a user authentication system"
```

```bash
# Claude Code (after install from repo clone, or install.sh --with-claude)
claude --plugin-dir ~/.claude/plugins/openagents-control-bridge --append-system-prompt "$(cat ~/.claude/plugins/openagents-control-bridge/openagent-system.md)"
```

**CLI orchestration (`oac`)** — expert routing and handoff plans:

```bash
oac experts "Create a user authentication system"
oac experts --plan-only "Create a user authentication system"
oac quest-status
oac quest-resume <quest-id>
```

Use `update.sh` (not ad-hoc file copies) to refresh an existing install. `oac experts --run --runtime kimi|opencode|claude` runs a strict headless bridge that requires runtime task write-back before completion is trusted. `oac experts --run --live` writes `.oac/runs/{id}/quest.json` and `handoff.json` with one-liners for OpenCode TUI (`opencode --agent OpenAgent`), Kimi Code (`kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml`), and Claude Code (`claude --plugin-dir ~/.claude/plugins/openagents-control-bridge --append-system-prompt "$(cat ~/.claude/plugins/openagents-control-bridge/openagent-system.md)"`).

### Step 3: Approve & Ship

**What happens:**
1. Agent analyzes your request
2. Proposes a plan (you approve)
3. Executes step-by-step with validation
4. Delegates to specialists when needed
5. Ships production-ready code

**That's it.** Works immediately with your default model. No configuration required.

---

### Alternative: Claude Code Plugin (BETA)

**Prefer Claude Code?** OpenAgents Control is also available as a Claude Code plugin!

**Installation:**

1. Register the marketplace:
```bash
/plugin marketplace add kalihat007/OpenAgentsControl
```

2. Install the plugin:
```bash
/plugin install oac
```

3. Download context files:
```bash
/oac:setup --core
```

4. Start building:
```
Add a login endpoint
```

**Features:**
- ✅ Trusted Fast Mode with high-risk approval gates
- ✅ Scale-out organizational AI with dynamic role assignment
- ✅ Quest-style Experts Mode + agent swarm by default
- ✅ Chunked ToDo execution for fast large-work delivery
- ✅ Context-aware code generation
- ✅ 7 specialized subagents (task-manager, context-scout, context-manager, coder-agent, test-engineer, code-reviewer, external-scout)
- ✅ 9 workflow skills + 6 user commands
- ✅ Flexible context discovery (.oac config, .claude/context, context, .opencode/context)
- ✅ Add context from GitHub, worktrees, local files, or URLs
- ✅ Easy feature planning with `/oac:plan`

**Documentation:**
- [Plugin README](./plugins/claude-code/README.md) - Complete plugin documentation
- [First-Time Setup](./plugins/claude-code/FIRST-TIME-SETUP.md) - Step-by-step guide
- [Quick Start](./plugins/claude-code/QUICK-START.md) - Quick reference

**Status:** BETA - Actively tested and ready for early adopters

---

## 💡 The Context System: Your Secret Weapon

**The problem with AI code:** It doesn't match your patterns. You spend hours refactoring.

**The OAC solution:** Teach your patterns once. Agents load them automatically. Code matches from the start.

### How It Works

```
Your Request
    ↓
ContextScout discovers relevant patterns
    ↓
Agent loads YOUR standards
    ↓
Code generated using YOUR patterns
    ↓
Ships without refactoring ✅
```

### Add Your Patterns (10-15 Minutes)

```bash
/add-context
```

**Answer 6 simple questions:**
1. What's your tech stack? (Next.js + TypeScript + PostgreSQL + Tailwind)
2. Show an API endpoint example (paste your code)
3. Show a component example (paste your code)
4. What naming conventions? (kebab-case, PascalCase, camelCase)
5. Any code standards? (TypeScript strict, Zod validation, etc.)
6. Any security requirements? (validate input, parameterized queries, etc.)

**Result:** Agents now generate code matching your exact patterns. No refactoring needed.

### The MVI Advantage: Token Efficiency

**MVI (Minimal Viable Information)** = Only load what's needed, when it's needed.

**Traditional approach:**
- Loads entire codebase context
- Large token overhead per request
- Slow responses, high costs

**OAC approach:**
- Loads only relevant patterns
- Context files <200 lines (quick to load)
- Lazy loading (agents load what they need)
- 80% of tasks use isolation context (minimal overhead)

**Real benefits:**
- **Efficiency:** Lower token usage vs loading entire codebase
- **Speed:** Faster responses with smaller context
- **Quality:** Code matches your patterns (no refactoring)

### For Teams: Repeatable Patterns

**The team problem:** Every developer writes code differently. Inconsistent patterns. Hard to maintain.

**The OAC solution:** Store team patterns in `.opencode/context/project/`. Commit to repo. Everyone uses same standards.

**Example workflow:**
```bash
# Team lead adds patterns once
/add-context
# Answers questions with team standards

# Commit to repo
git add .opencode/context/
git commit -m "Add team coding standards"
git push

# All team members now use same patterns automatically
# New developers inherit standards on day 1
```

**Result:** Consistent code across entire team. No style debates. No refactoring PRs.

---

## 📖 How It Works

### The Core Idea

**Most AI tools:** Generic code → You refactor  
**OpenAgentsControl:** Your patterns → AI generates matching code  

### The Workflow

```
1. Add Your Context (one time)
   ↓
2. ContextScout discovers relevant patterns
   ↓
3. Agent loads YOUR standards
   ↓
4. Agent proposes plan (using your patterns)
   ↓
5. You approve
   ↓
6. Agent implements (matches your project)
   ↓
7. Code ships (no refactoring needed)
```

### Key Benefits

**🎯 Context-Aware**  
ContextScout discovers relevant patterns. Agents load YOUR standards before generating code. Code matches your project from the start.

**🔁 Repeatable**  
Same patterns → Same results. Configure once, use forever. Perfect for teams.

**⚡ Token Efficient (80% Reduction)**  
MVI principle: Only load what's needed. 8,000 tokens → 750 tokens. Massive cost savings.

**✋ Human-Guided**  
Agents propose plans, you approve before execution. Quality gates prevent mistakes. No auto-execution surprises.

**📝 Transparent & Editable**  
Agents are markdown files you can edit. Change workflows, add constraints, customize behavior. No vendor lock-in.

### What Makes This Special

**1. ContextScout - Smart Pattern Discovery**  
Before generating code, ContextScout discovers relevant patterns from your context files. Ranks by priority (Critical → High → Medium). Prevents wasted work.

**2. Editable Agents - Full Control**  
Unlike Cursor/Copilot where behavior is baked into plugins, OAC agents are markdown files. Edit them directly:
```bash
nano .opencode/agent/core/openagent.md  # local project install
# Or: nano ~/.config/opencode/agent/core/openagent.md  # global install
# Add project rules, change workflows, customize behavior
```

**3. ExternalScout - Live Documentation** 🆕  
Working with external libraries? ExternalScout fetches current documentation:
- Gets live docs from official sources (npm, GitHub, docs sites)
- No outdated training data - always current
- Automatically triggered when agents detect external dependencies
- Supports frameworks, APIs, libraries, and more

**4. Trusted Fast Mode - Fast Without Surprises**
OpenAgent executes safe local work immediately and asks approval before:
- destructive deletes or irreversible data operations
- secrets, credentials, keys, tokens, or production config changes
- production deploys, paid cloud actions, payment/legal actions, or public external communication
- hardware actions that can damage a device or violate authorization

You stay in control. Review plans before execution.

**5. MVI Principle - Token Efficiency**  
Files designed for quick loading:
- Concepts: <100 lines
- Guides: <150 lines
- Examples: <80 lines

Result: Lower token usage vs loading entire codebase.

**6. Team Patterns - Repeatable Results**  
Store patterns in `.opencode/context/project/`. Commit to repo. Entire team uses same standards. New developers inherit patterns automatically.

---

## 🎯 Which Agent Should I Use?

### OpenAgent (Always Start Here)

**Best for:** Everything: questions, coding, docs, technical swarms, revenue swarms, investor swarms, business operations, and custom AI-system design.

```bash
opencode --agent OpenAgent
> "Create a user authentication system"            # Building features
> "How do I implement authentication in Next.js?"  # Questions
> "Create a README for this project"               # Documentation
> "Explain the architecture of this codebase"      # Analysis
> "Build this as a controlled technical swarm"      # Multi-agent swarm work
> "Create a custom AI system for support"           # System-builder workflow
```

**What it does:**
- Loads your patterns via ContextScout
- Proposes plan (you approve)
- Executes with validation
- Delegates internally to specialists when needed
- Routes complex requests into development, technical, revenue, investor, operations, or system-builder workflows

**Perfect for:** First-time users, production code, complex swarms, team development, and custom systems. You do not need to switch agents.

---

## 🛠️ What's Included

### 🤖 Main Agents
- **OpenAgent** - The single user-facing entrypoint for general tasks, production development, swarms, and system-builder workflows

### 🔧 Specialized Subagents (Auto-delegated)
- **ContextScout** - Smart pattern discovery (your secret weapon)
- **TaskManager** - Breaks complex features into atomic subtasks
- **CoderAgent** - Focused code implementations
- **TestEngineer** - Test authoring and TDD
- **CodeReviewer** - Code review and security analysis
- **BuildAgent** - Type checking and build validation
- **DocWriter** - Documentation generation
- **ExternalScout** - Fetches live docs for external libraries (no outdated training data) **NEW!**
- Plus category specialists: frontend, devops, copywriter, technical-writer, data-analyst

### ⚡ Productivity Commands
- `/add-context` - Interactive wizard to add your patterns
- `/commit` - Smart git commits with conventional format
- `/test` - Testing workflows
- `/optimize` - Code optimization
- `/context` - Context management
- And 7+ more productivity commands

### 📚 Context System (MVI Principle)
Your coding standards automatically loaded by agents:
- **Code quality** - Your patterns, security, standards
- **UI/design** - Design system, component patterns
- **Task management** - Workflow definitions
- **External libraries** - Integration guides (18+ libraries supported)
- **Project-specific** - Your team's patterns

**Key features:**
- 80% token reduction via MVI
- Smart discovery via ContextScout
- Lazy loading (only what's needed)
- Team-ready (commit to repo)
- Version controlled (track changes)

### How Context Resolution Works

ContextScout discovers context files using a **local-first** approach:

```
1. Check local: .opencode/context/core/navigation.md
   ↓ Found? → Use local for everything. Done.
   ↓ Not found?
2. Check global: ~/.config/opencode/context/core/navigation.md
   ↓ Found? → Use global for core/ files only.
   ↓ Not found? → Proceed without core context.
```

**Key rules:**
- **Local always wins** — if you installed locally, global is never checked
- **Global fallback is only for `core/`** (standards, workflows, guides) — universal files that are the same across projects
- **Project intelligence is always local** — your tech stack, patterns, and naming conventions live in `.opencode/context/project-intelligence/` and are never loaded from global
- **One-time check** — ContextScout resolves the core location once at startup (max 2 glob checks), not per-file

**Common setups:**

| Setup | Core files from | Project intelligence from |
|-------|----------------|--------------------------|
| Local install (`bash install.sh advanced`) | `.opencode/context/core/` | `.opencode/context/project-intelligence/` |
| Global install + `/add-context` | `~/.config/opencode/context/core/` | `.opencode/context/project-intelligence/` |
| Both local and global | `.opencode/context/core/` (local wins) | `.opencode/context/project-intelligence/` |

---



## 💻 Example Workflow

```bash
opencode --agent OpenAgent
> "Create a user dashboard with authentication and profile settings"
```

**What happens:**

**1. Discover (~1-2 min)** - ContextScout finds relevant patterns
- Your tech stack (Next.js + TypeScript + PostgreSQL)
- Your API pattern (Zod validation, error handling)
- Your component pattern (functional, TypeScript, Tailwind)
- Your naming conventions (kebab-case files, PascalCase components)

**2. Propose (~2-3 min)** - Agent creates detailed implementation plan
```
## Proposed Implementation

**Components:**
- user-dashboard.tsx (main page)
- profile-settings.tsx (settings component)
- auth-guard.tsx (authentication wrapper)

**API Endpoints:**
- /api/user/profile (GET, POST)
- /api/auth/session (GET)

**Database:**
- users table (Drizzle schema)
- sessions table (Drizzle schema)

All code will follow YOUR patterns from context.

Approve? [y/n]
```

**3. Approve** - You review and approve the plan (human-guided)

**4. Execute (~10-15 min)** - Incremental implementation with validation
- Implements one component at a time
- Uses YOUR patterns for every file
- Validates after each step (type check, lint)
- *This is the longest step - generating quality code takes time*

**5. Validate (~2-3 min)** - Tests, type checking, code review
- Delegates to TestEngineer for tests
- Delegates to CodeReviewer for security check
- Ensures production quality

**6. Ship** - Production-ready code
- Code matches your project exactly
- No refactoring needed
- Ready to commit and deploy

**Total time: faster for safe local work, with approval only for high-risk actions**

### 💡 Pro Tips

**After finishing a feature:**
- Run `/add-context --update` to add new patterns you discovered
- Update your context with new libraries, conventions, or standards
- Keep your patterns fresh as your project evolves

**Working with external libraries?**
- **ExternalScout** automatically fetches current documentation
- No more outdated training data - gets live docs from official sources
- Works with npm packages, APIs, frameworks, and more

---

## ⚙️ Advanced Configuration

### Model Configuration (Optional)

OAC installs `.opencode/opencode.json` with `OpenAgent` as the default agent and leaves model choice to the user-selected OpenCode model:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "OpenAgent"
}
```

OpenAgent should not silently switch from Kimi, Claude, OpenAI, or any other model to a different provider. If you want to pin a model for a project, choose it explicitly in OpenCode:

```bash
opencode --agent OpenAgent --model provider/model-id
```

Or persist that explicit choice:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "OpenAgent",
  "model": "provider/model-id",
  "small_model": "provider/model-id"
}
```

When `small_model` is present, keep it identical to `model` so OpenCode does not
silently fall back to a different provider for smaller internal work.

**Provider overload recovery:** `429 rate_limit_error` / `engine is currently overloaded` means the selected provider/model is at capacity before OpenAgent can respond. OpenAgent keeps the selected model, retries with backoff, reduces parallel work, and splits large coding tasks into smaller sequential expert steps. To change providers, pass a different model explicitly:

```bash
opencode --agent OpenAgent --model provider/model-id
```

**Install-time explicit model pin:**

```bash
OPENAGENT_MODEL=provider/model-id bash install.sh advanced
```

### Direct Kimi Code Usage

OpenAgent can also run directly inside Kimi Code without OpenCode:

```bash
./install.sh advanced --with-kimi
kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

For a cleaner Quest-style screen without Kimi's visible thinking stream:

```bash
kimi --no-thinking --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml
```

The Kimi adapter inherits Kimi's native tools/subagents, uses an OpenAgent Quest-first system prompt, and does not set a model. Kimi uses the default model in `~/.kimi/config.toml`, or the model the user explicitly passes:

```bash
kimi --work-dir . \
  --agent-file ~/.kimi/agents/openagents-control/openagent.yaml \
  --model kimi-code/kimi-for-coding
```

No LLM routing or hidden model selector is added for Kimi. OpenAgent-on-Kimi uses the selected Kimi model throughout.

For substantial work, OpenAgent-on-Kimi visibly starts with an `OpenAgent Quest Spec` before edits, file moves, plan-mode handoff, or tool calls. Repo-wide reorganizations must show the proposed target layout and wait for approval before moving or deleting files.

Quest v8 (evolved from v5-v7) adds a small lifecycle, durable run identity, append-only event reconciliation, runtime execution handoff, and adaptive capabilities so long sessions stay predictable. Quest v9 adds coding intelligence, Quest v10 adds Coding Autopilot, and Quest v11 adds Coding Execution for intent, impact analysis, patch capsules, smart tests, runtime parity, review signals, symbol context, pre-edit boundaries, patch ledger, failure replay, dependency research gates, bounded autofix, PR readiness, executable acceptance, contract drift, test gaps, regression snapshots, runtime compatibility, ownership locks, security/secrets gates, and PR packaging:

```text
NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING
```

**v8 adaptive features:**
- **REVIEW gate** — Pause between EXECUTE and VERIFY for diff inspection. Approve with `oac quest-review <id> --approve` or reject to return to EXECUTE.
- **Dynamic replanning** — Inject new tasks into an active Quest without restarting via `oac quest-amend <id> "also do X"`.
- **Priority queue** — Tasks have priorities (1–5). Urgent tasks are scheduled first.
- **Self-improvement** — Completed Quest patterns are stored in a corpus that improves future expert routing decisions.

After one substantial request completes and Kimi returns to the input box, the next substantial input in that same session starts a fresh `OpenAgent Quest Spec` with `State: NEW` unless you explicitly say it is a continuation. The visible spec also carries `Intensity` (`lite`, `standard`, `deep`) and an honest `Trust Label` (`planned_only`, `inspected_only`, `changed`, `tested`, `pushed`).

Durable Quest runs are stored under `.oac/runs/{quest-id}/`:

```text
quest.json
spec.json
plan.json
events.ndjson
review-bundle.md     # v8: generated when a Quest enters REVIEW
acceptance-report.md
summary.json
handoff.json
interaction-memory.json
memory-graph.json
coding-intelligence.json   # v9: coding intent, impact, tests, parity, review signals
patch-capsules.json        # v9: small patch units, validation, rollback notes
coding-review.md           # v9: readable coding review brief
coding-autopilot.json      # v10: rollup of coding autopilot signals
symbol-graph.json          # v10: touched symbols/imports
smart-test-matrix.json     # v10: tiered validation and escalation
patch-ledger.json          # v10: patch accountability and diff stats
pre-edit-contract.json     # v10: allowed files, non-goals, acceptance checks
automatic-code-review.json # v10: deterministic review verdict/checklist
failure-memory.json        # v10: failed validation replay fingerprints
runtime-parity-enforcer.json # v10: OpenCode/Kimi/Codex/Claude parity checks
dependency-research-gate.json # v10: current-doc research decision
autofix-plan.json          # v10: bounded autofix loop
pr-readiness.md            # v10: PR grouping, focus, blockers
coding-execution.json      # v11: execution-grade acceptance and gates rollup
executable-acceptance.json # v11: runnable done definition and evidence checks
guarded-autofix-runner.json # v11: bounded failure replay/autofix queue
contract-drift-guard.json  # v11: watched API/CLI/schema/runtime/docs contracts
review-patch-loop.json     # v11: review findings mapped to patch capsules
test-gap-finder.json       # v11: changed source files missing nearby tests
regression-snapshots.json  # v11: CLI/artifact/runtime/event expected signals
runtime-compatibility-matrix.json # v11: OpenCode/Kimi/Codex/Claude coverage
ownership-lock-plan.json   # v11: file ownership and write-lock plan
security-secrets-gate.json # v11: credential/destructive-command gate
pr-auto-packager.json      # v11: PR title, groups, validation, blockers
pr-auto-packager.md        # v11: human-readable PR summary package
.oac/repo-wiki/            # project-level living repo wiki
```

Runtimes append progress to `events.ndjson`; they do not rewrite `quest.json`. Use `oac quest-status` to list or inspect the reconciled run state, `oac quest-resume <quest-id>` to print OpenCode, Kimi, Claude, and Codex resume commands, and `oac quest-v9 <quest-id>` to refresh coding intelligence. Resume does not change models; OpenAgent continues with the selected runtime model.

You can verify the Kimi Quest cycle locally:

```bash
bash scripts/tests/test-kimi-quest-cycle.sh
```

And verify the OpenCode Quest cycle:

```bash
bash scripts/tests/test-opencode-quest-cycle.sh
```

OpenAgent does not add per-expert model routing by default. Expert perspectives,
Quest planning, resume, and verification all use the selected runtime model
unless the user explicitly edits their own runtime configuration.

### Update Context as You Go

Your project evolves. Your context should too.

```bash
/add-context --update
```

**What gets updated:**
- Tech stack, patterns, standards
- Version incremented (1.0 → 1.1)
- Updated date refreshed

**Example updates:**
- Add new library (Stripe, Twilio, etc.)
- Change patterns (new API format, component structure)
- Migrate tech stack (Prisma → Drizzle)
- Update security requirements

Agents automatically use updated patterns.

---



## 🎯 Is This For You?

### ✅ Use OAC if you:
- Build production code that ships without heavy rework
- Work in a team with established coding standards
- Want control over agent behavior (not black-box plugins)
- Care about token efficiency and cost savings
- Want fast local execution with approval gates for destructive, credential, production, or public actions
- Want repeatable, consistent results
- Use multiple AI models (no vendor lock-in)

### ⚠️ Skip OAC if you:
- Want fully unmanaged execution with no high-risk approval gates
- Prefer unstructured "just do anything" mode over trusted swarm workflows
- Don't have established coding patterns yet
- Need multi-agent parallelization (use Oh My OpenCode instead)
- Want plug-and-play with zero configuration

### 🤔 Not Sure?

**Try this test:**
1. Ask your current AI tool to generate an API endpoint
2. Count how many minutes you spend refactoring it to match your patterns
3. If you're spending time on refactoring, OAC will save you that time

**Or ask yourself:**
- Do you have coding standards your team follows?
- Do you spend time refactoring AI-generated code?
- Do you want AI to follow YOUR patterns, not generic ones?

If you answered "yes" to any of these, OAC is for you.

---

## 🚀 Advanced Features

### Frontend Design Workflow
The **OpenFrontendSpecialist** follows a structured 4-stage design workflow:
1. **Layout** - ASCII wireframe, responsive structure planning
2. **Theme** - Design system selection, OKLCH colors, typography
3. **Animation** - Micro-interactions, timing, accessibility
4. **Implementation** - Single HTML file, semantic markup

### Task Management & Breakdown
The **TaskManager** breaks complex features into atomic, verifiable subtasks with smart agent suggestions and parallel execution support.

### System Builder
Build complete custom AI systems tailored to your domain in minutes. Interactive wizard generates orchestrators, subagents, context files, workflows, and commands.

---

## ❓ FAQ

### Getting Started

**Q: Does this work on Windows?**  
A: Yes! Use Git Bash (recommended) or WSL.

**Q: What languages are supported?**  
A: Agents are language-agnostic and adapt based on your project files. Primarily tested with TypeScript/Node.js. C# / .NET is now supported with dedicated context files. Python, Go, Rust, and other languages are supported but less battle-tested. The context system works with any language.

**Q: Do I need to add context?**  
A: No, but it's highly recommended. Without context, agents write generic code. With context, they write YOUR code.

**Q: Can I use this without customization?**  
A: Yes, it works out of the box. But you'll get the most value after adding your patterns (10-15 minutes with `/add-context`).

**Q: What models are supported?**
A: Any model from any provider (Claude, GPT, Gemini, MiniMax, local models). No vendor lock-in.

### For Teams

**Q: How do I share context with my team?**  
A: Commit `.opencode/context/project/` to your repo. Team members automatically use same patterns.

**Q: How do we ensure everyone follows the same standards?**  
A: Add team patterns to context once. All agents load them automatically. Consistent code across entire team.

**Q: Can different projects have different patterns?**  
A: Yes! Use project-specific context (`.opencode/` in project root) to override global patterns.

### Technical

**Q: How does token efficiency work?**  
A: MVI principle: Only load what's needed, when it's needed. Context files <200 lines (scannable in 30s). ContextScout discovers relevant patterns. Lazy loading prevents context bloat. 80% of tasks use isolation context (minimal overhead).

**Q: What's ContextScout?**  
A: Smart pattern discovery agent. Finds relevant context files before code generation. Ranks by priority. Prevents wasted work.

**Q: Can I modify requirements during Experts Mode execution?**
A: Yes. Add information, correct direction, or change priorities at any time. TeamLeadAgent updates the plan, reallocates experts, revises the swarm task graph, and continues from validated work.

**Q: What does Quest-style default mean in OAC?**
A: `opencode` starts on OpenAgent by default. OpenAgent treats the request as a goal, chooses direct execution, code-with-spec, prototype/demo, tool-building, or research-plan flow, then uses Experts Mode and the swarm runtime when the task needs a team.

**Q: What about cost and time for Experts Mode?**
A: Experts Mode and agent swarm orchestration are always on, but they scale themselves. Tiny tasks use TeamLeadAgent-only swarm-lite routing with minimal overhead. Larger tasks are split into small ToDo chunks so experts can work quickly, sync after each batch, and avoid wasting context or tool calls.

**Q: How does terminal execution work in Experts Mode?**
A: Safe local terminal commands run automatically for routine reads, tests, builds, linting, and local validation. High-risk terminal actions require approval or a sandboxed/isolated execution plan before proceeding.

**Q: Can I edit agent behavior?**  
A: Yes! Agents are markdown files. Edit them directly: `nano .opencode/agent/core/openagent.md` (local) or `nano ~/.config/opencode/agent/core/openagent.md` (global)

**Q: How do approval gates work?**  
A: OpenAgent runs in Trusted Fast Mode. Safe local reads, edits, tests, builds, and subagent routing execute directly. It asks first for destructive, credential, production, payment/legal, public external, or irreversible actions.

**Q: How do I update my context?**  
A: Run `/add-context --update` anytime your patterns change. Agents automatically use updated patterns.

### Comparison

**Q: How is this different from Cursor/Copilot?**  
A: OAC has editable agents (not baked-in), Trusted Fast Mode with high-risk approval gates, context system (YOUR patterns), HackersEra master swarm routing, and MVI token efficiency.

**Q: How is this different from Aider?**  
A: OAC has team patterns, context system, swarm routing, high-risk approval workflow, and smart pattern discovery. Aider is file-based only.

**Q: How does this compare to Oh My OpenCode?**  
A: Both are built on OpenCode. OAC focuses on **trusted speed plus repeatability** (pattern control, team standards, high-risk approval gates, and swarms). Oh My OpenCode focuses on broad autonomy and speed. [Read detailed comparison →](https://github.com/kalihat007/OpenAgentsControl/discussions/116)

**Q: When should I NOT use OAC?**  
A: If you want a completely unmanaged agent with no high-risk approval gates, or if you do not want project-specific patterns and standards.

### Setup

**Q: What bash version do I need?**  
A: Bash 3.2+ (macOS default works). Run `bash scripts/tests/test-compatibility.sh` to check.

**Q: Do I need to install plugins/tools?**  
A: No, they're optional. Only install if you want Telegram notifications or Gemini AI features.

**Q: Where should I install - globally or per-project?**  
A: Local (`.opencode/` in your project) is recommended — patterns are committed to git and shared with your team. Global (`~/.config/opencode/`) is good for personal defaults across all projects. The installer asks you to choose. See [OpenCode Config Docs](https://opencode.ai/docs/config/) for how configs merge.

---

## 🗺️ Roadmap & What's Coming

**This is only the beginning!** We're actively developing new features and improvements every day.

### 🚀 See What's Coming Next

Check out our [**Project Board**](https://github.com/kalihat007/OpenAgentsControl/projects) to see:
- 🔨 **In Progress** - Features being built right now
- 📋 **Planned** - What's coming soon
- 💡 **Ideas** - Future enhancements under consideration
- ✅ **Recently Shipped** - Latest improvements

### 🎯 Current Focus Areas

- **Plugin System** - npm-based plugin architecture for easy distribution
- **Performance Improvements** - Faster agent execution and context loading
- **Enhanced Context Discovery** - Smarter pattern recognition
- **Multi-language Support** - Better Python, Go, Rust, C# / .NET support
- **Team Collaboration** - Shared context and team workflows
- **Documentation** - More examples, tutorials, and guides

### 💬 Have Ideas?

We'd love to hear from you! 
- 💡 [**Submit Feature Requests**](https://github.com/kalihat007/OpenAgentsControl/issues/new?labels=enhancement)
- 🐛 [**Report Bugs**](https://github.com/kalihat007/OpenAgentsControl/issues/new?labels=bug)
- 💬 [**Join Discussions**](https://github.com/kalihat007/OpenAgentsControl/discussions)

**Star the repo** ⭐ to stay updated with new releases!

---

## 🤝 Contributing

We welcome contributions! Start here:

1. Read the **[Contributing Guide](./CONTRIBUTING.md)** — prerequisites, setup, code style, PR guidelines
2. Follow the established naming conventions and coding standards
3. Write comprehensive tests for new features
4. Update documentation for any changes

See also: [Legacy Contributing Docs](docs/contributing/CONTRIBUTING.md) • [Code of Conduct](docs/contributing/CODE_OF_CONDUCT.md)

---

## 💬 Community & Support

<div align="center">

**Join the community and stay updated with the latest AI development workflows!**

[![YouTube](https://img.shields.io/badge/YouTube-Darren_Builds_AI-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/@DarrenBuildsAI)
[![Community](https://img.shields.io/badge/Community-NextSystems.ai-blue?style=for-the-badge&logo=discourse&logoColor=white)](https://nextsystems.ai)
[![X/Twitter](https://img.shields.io/badge/Follow-@DarrenBuildsAI-1DA1F2?style=for-the-badge&logo=x&logoColor=white)](https://x.com/DarrenBuildsAI)
[![Buy Me A Coffee](https://img.shields.io/badge/Support-Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/kalihat007)

**📺 Tutorials & Demos** • **💬 Join Waitlist** • **🐦 Latest Updates** • **☕ Support Development**

*Your support helps keep this project free and open-source!*

</div>

---

## License

This project is licensed under the MIT License.

---

**Made with ❤️ by developers, for developers. Star the repo if this saves you refactoring time!**

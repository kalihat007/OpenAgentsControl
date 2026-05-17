# OpenAgents Control (OAC)

> AI agent framework for plan-first development workflows with approval-based execution.
> Version: `0.7.1`
> Repository: https://github.com/kalihat007/OpenAgentsControl

---

## Project Overview

OpenAgents Control (OAC) is a TypeScript monorepo that extends the OpenCode AI coding framework with specialized agents, context management, and team workflows. It is designed to teach AI agents your coding patterns upfront so generated code matches project standards without heavy rework.

Key capabilities:
- **Context-aware pattern learning** — Agents load project-specific patterns before generating code.
- **Trusted Fast Mode** — Safe local work executes directly; approval is required only for destructive actions, secrets/credentials, production deploys, and irreversible operations.
- **Quest-style default execution** — Every request is treated as a goal-to-result Quest (plan → execute → verify → summarize).
- **Scale-out swarms** — Dynamic expert assignment with agent swarm orchestration for larger work.
- **Model agnostic** — Works with Claude, GPT, Gemini, MiniMax, and local models.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Module system | ESM (`"type": "module"` in all packages) |
| Primary runtime | Bun `>=1.0.0` (CLI, swarm-runtime, plugin-abilities) |
| Secondary runtime | Node.js `>=18.0.0` (compatibility-layer, eval framework) |
| Package manager | npm (workspaces) + Bun (per-package) |
| Bundler | `bun build` (CLI), `tsc` (other packages) |
| Test runners | Bun test (CLI, swarm-runtime, plugin-abilities), Vitest (compatibility-layer, eval framework) |
| Linting | ESLint with `@typescript-eslint/*` (compatibility-layer, plugin-abilities, eval framework) |
| Schema validation | Zod |
| CLI framework | Commander |
| YAML parsing | `yaml`, `js-yaml`, `gray-matter` |

---

## Directory Structure

```
OpenAgentsControl/
├── packages/
│   ├── cli/                          # @nextsystems/oac-cli — main CLI tool
│   ├── swarm-runtime/                # @nextsystems/oac-swarm-runtime — swarm primitives
│   ├── compatibility-layer/          # @openagents-control/compatibility-layer — IDE adapters
│   └── plugin-abilities/             # @openagents/plugin-abilities — enforced workflows plugin
├── evals/
│   └── framework/                    # @opencode-agents/eval-framework — SDK-driven test runner
├── plugins/
│   ├── claude-code/                  # Claude Code plugin (Markdown/YAML based)
│   └── kimi-code/                    # Kimi Code CLI adapter (YAML agent spec)
├── .opencode/                        # Agent definitions, context files, commands, skills, tools
├── scripts/                          # Registry, validation, testing, versioning utilities
├── docs/                             # Extended documentation and feature designs
├── .github/workflows/                # CI/CD pipelines
├── package.json                      # Root workspace manifest
├── registry.json                     # Auto-generated component registry
├── Makefile                          # GitHub project management and eval commands
├── install.sh / update.sh            # Shell-based installer and updater
└── VERSION                           # Current version (0.7.1)
```

### Workspaces (root `package.json`)

- `evals/framework`
- `packages/cli`
- `packages/compatibility-layer`
- `packages/swarm-runtime`

> **Note:** `packages/plugin-abilities` is **not** listed in root workspaces.

---

## Build and Test Commands

### Setup

```bash
# Install root dependencies
npm install

# Install per-package dependencies
cd packages/cli && bun install && cd ../..
cd packages/swarm-runtime && bun install && cd ../..
cd packages/compatibility-layer && npm ci && cd ../..
cd packages/plugin-abilities && bun install && cd ../..
cd evals/framework && npm install && cd ../..
```

### Build

```bash
# Swarm runtime
cd packages/swarm-runtime && bun run build && cd ../..

# CLI
cd packages/cli && bun run build && cd ../..

# Compatibility layer
cd packages/compatibility-layer && npm run build && cd ../..

# Plugin abilities
cd packages/plugin-abilities && bun run build && cd ../..

# Eval framework
cd evals/framework && npm run build && cd ../..
```

### Test

#### Per-package unit tests (what CI runs on every PR)

```bash
# CLI tests (Bun)
cd packages/cli && bun test

# Swarm runtime tests (Bun)
cd packages/swarm-runtime && bun test

# Compatibility layer tests (Vitest)
cd packages/compatibility-layer && npx vitest run

# Plugin abilities tests (Bun)
cd packages/plugin-abilities && bun test

# Eval framework tests (Vitest)
cd evals/framework && npm test
```

#### Watch mode (during development)

```bash
cd packages/cli && bun test --watch
cd packages/swarm-runtime && bun test --watch
cd packages/compatibility-layer && npx vitest
cd evals/framework && npm run test:watch
```

#### Agent evaluation framework (root-level scripts)

```bash
# Full SDK evaluation suite
npm run test:all

# Core smoke tests
npm run test:core

# Agent-specific evals
npm run test:openagent
npm run test:opencoder

# CI smoke tests (no evaluators)
npm run test:ci

# Quest lifecycle tests
npm run test:quest-v4:kimi
npm run test:quest-v4:opencode
npm run test:quest-v5:kimi
npm run test:quest-v5:opencode
npm run test:quest-v6:kimi
npm run test:quest-v7:kimi

# Debug mode
npm run test:debug
```

#### Makefile commands

```bash
make test-golden        # 8 golden tests (~3–5 min)
make test-smoke         # Single smoke test (~30s)
make test-agent AGENT=name
make test-model MODEL=provider/model
make test-variant VARIANT=name
make test-subagent SUBAGENT=name
make validate-evals     # Validate all test suites
make view-results       # Results dashboard
make build-evals        # Build the evaluation framework
```

#### Validation scripts

```bash
bun run validate:registry          # Validate registry.json
bun run validate:context-links     # Check markdown link integrity
bun run validate:registry:fix      # Auto-fix registry issues
```

---

## Code Style Guidelines

### TypeScript Conventions

- **Strict mode** is enabled in all packages (`"strict": true`).
- Avoid `any`; use explicit types everywhere.
- Prefer `type` imports for type-only usage.
- Use `.js` extensions in import paths (ESM resolution).
- File names: **kebab-case** (e.g., `task-router.ts`).
- Types/Interfaces: **PascalCase** (e.g., `SwarmTask`, `RouterConfig`).
- Functions/Variables: **camelCase** (e.g., `planSwarmBatches`).

### Error Handling

- **Throw errors — never call `process.exit()` in library or command code.**
- The CLI defines a custom error hierarchy in `packages/cli/src/lib/errors.ts`:
  - `CliError` (base)
  - `ComponentNotFoundError`
  - `NotProjectRootError`
  - `BundledFilesError`
  - `InstallError`
  - `CommandUsageError`
  - `SwarmExecutionError`
  - `QualityGateFailedError`
  - `SessionBudgetExceededError`
  - `ExitCodeError`
- A top-level handler catches errors and sets appropriate exit codes.

### Immutability and Pure Functions

- `swarm-runtime` uses an immutable-append pattern (functions return new session objects).
- Prefer pure functions for testability.
- Mark side-effect-only helpers with `/** Side-effect only. */`.

### Adding New Components

- **CLI Commands:** One file per command under `packages/cli/src/commands/`, registered in `packages/cli/src/index.ts`.
- **Plugin Abilities:** YAML files in `.opencode/abilities/` with step types: `script`, `agent`, `skill`, `approval`, `workflow`.
- **Compatibility Adapters:** Extend `BaseAdapter`, implement `toOAC()` and `fromOAC()`.

---

## Testing Instructions

### Unit Tests

Each package maintains its own unit tests:

| Package | Runner | Command |
|---------|--------|---------|
| `packages/cli` | Bun | `bun test` |
| `packages/swarm-runtime` | Bun | `bun test` |
| `packages/compatibility-layer` | Vitest | `npx vitest run` |
| `packages/plugin-abilities` | Bun | `bun test` |
| `evals/framework` | Vitest | `npm test` |

### Agent Evaluation Framework

The `evals/` directory contains an SDK-driven evaluation framework with YAML-defined test scenarios and behavior expectations.

- **Golden Tests:** 8 tests covering smoke, context loading, read-before-write, write-with-approval, multi-turn context, task breakdown, tool selection, and error handling.
- **Core Test Suite:** 7 tests providing ~85% coverage in 5–8 minutes.
- **Full Suite:** 71+ tests for comprehensive validation.
- **170+ YAML test files** organized under `evals/agents/` by agent, category, and severity.

### Evaluators (Behavior Validators)

| Evaluator | Purpose |
|-----------|---------|
| `approval-gate` | Approval before risky operations |
| `context-loading` | Context files loaded before acting |
| `execution-balance` | Read operations before writes |
| `tool-usage` | Dedicated tools used instead of bash |
| `behavior` | Expected tools used, forbidden avoided |
| `delegation` | Complex tasks delegated to subagents |
| `stop-on-failure` | Agent stops on errors |
| `report-first` | Correct report-before-execute workflow |
| `cleanup-confirmation` | Cleanup operations are confirmed |
| `error-handling` | Error handling behavior |
| `performance-metrics` | Duration, tool latencies, inference time (informational) |

---

## Security Considerations

### Approval Gates (Trusted Fast Mode)

OpenAgent asks for explicit approval before:
- Destructive deletes or irreversible data operations.
- Secrets, credentials, keys, tokens, or production configuration changes.
- Production deploys, paid cloud actions, payment/legal actions.
- Public external communication.
- Hardware actions that can damage a device.

### Swarm Safety Contract

A task can enter a parallel batch only if:
- All dependencies are complete.
- No task writes the same file (write-lock conflict detection).
- No module ownership claims are violated.
- Read/write overlap is accepted or absent.
- Clear acceptance criteria per worker.
- Validation gates are defined before execution.

### Environment Variables

Sensitive configuration is expected via environment variables (see `env.example`):
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_USERNAME`
- `GEMINI_API_KEY`, `MINIMAX_API_KEY`

Do not commit `.env` files. The repository ignores `.env*` patterns.

---

## CI/CD and Release Process

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `pr-checks.yml` | PR to `main`/`dev` | Conventional commit PR title validation, changed-file detection, package unit tests (bun/vitest), build and validate eval framework |
| `post-merge-pr.yml` | Push to `main` | Auto-detect version bump type from commit, create version-bump PR, update CHANGELOG |
| `create-release.yml` | Push to `main` or manual | Detect version-bump PR merges, create git tag and GitHub release from CHANGELOG |
| `installer-checks.yml` | PR/push affecting `install.sh`/`update.sh` | ShellCheck, bash syntax validation, non-interactive E2E tests, compatibility tests, profile smoke tests (Ubuntu and macOS) |
| `validate-registry.yml` | `pull_request_target` to `main`/`dev` | Auto-detect new components, validate prompt library structure, validate markdown context links, validate `registry.json`, auto-commit updates |
| `update-registry.yml` | Push to `main` affecting `.opencode/**` | Auto-detect and add new components to registry, validate, auto-commit |
| `sync-docs.yml` | Push to `main` affecting `registry.json` or `.opencode/**` | Create branch and issue for OpenCode bot to sync documentation counts |
| `validate-test-suites.yml` | Push/PR affecting eval configs/tests | Validate test suite JSON/YAML definitions |
| `opencode.yml` | Issue comment with `/oc` or `/opencode` | Trigger OpenCode bot for OWNER/MEMBER |

### Versioning Flow

1. PR merged with a Conventional Commits title.
2. `post-merge-pr.yml` detects the bump type from the commit message.
3. Creates a version-bump branch + PR with a `version-bump` label.
4. On merge, `create-release.yml` creates a git tag and GitHub release with notes extracted from `CHANGELOG.md`.
5. The `VERSION` file and `package.json` stay synchronized.

### Version Bump Types

| Commit Type | Bump |
|-------------|------|
| `feat` | minor |
| `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf` | patch |
| `feat!` / `fix!` / `BREAKING CHANGE:` | major |
| `[alpha]`, `[beta]`, `[rc]` | prerelease |

---

## Package Reference

### `packages/cli` — `@nextsystems/oac-cli`
- **Runtime:** Bun
- **Entry:** `./dist/index.js` (bin: `oac`)
- **Build:** `bun build src/index.ts --outdir dist --target bun --splitting`
- **Deps:** `commander`, `chalk`, `ora`, `semver`, `zod`, `@openagents-control/compatibility-layer`, `@nextsystems/oac-swarm-runtime`
- **Commands:** 27 commands including `init`, `add`, `remove`, `apply`, `doctor`, `list`, `status`, `experts`, `quest-run`, `quest-status`, `quest-resume`, `quest-verify`, `quest-complete`, `quest-amend`, `swarm-status`, `incident-list`, `incident-search`, `incident-resolve`, `incident-postmortem`, `project-intelligence`, `quality`, `pr`, `index-cmd`, `dialogue`, `quest-daemon`

### `packages/swarm-runtime` — `@nextsystems/oac-swarm-runtime`
- **Runtime:** Bun or Node.js
- **Entry:** `./dist/index.js`
- **Build:** `tsc -p tsconfig.json`
- **Deps:** None (dev-only: `@types/bun`, `typescript`)
- **Modules:** `types`, `session`, `scheduler`, `agent-protocol`, `collaboration`, `team`, `pev-loop`, `quality-signals`, `resilience`

### `packages/compatibility-layer` — `@openagents-control/compatibility-layer`
- **Runtime:** Node.js
- **Entry:** `dist/index.js` (lib), `dist/cli/index.js` (bin: `oac-compat`)
- **Build:** `tsc`
- **Deps:** `zod`, `js-yaml`, `gray-matter`, `commander`, `chalk`, `ora`
- **Adapters:** Cursor, Claude Code, Windsurf (bidirectional `toOAC` / `fromOAC`)

### `packages/plugin-abilities` — `@openagents/plugin-abilities`
- **Runtime:** Bun or Node.js
- **Entry:** `dist/index.js` (main), `dist/plugin.js`, `dist/opencode-plugin.js`, `dist/sdk.js`
- **Build:** `tsc`
- **Deps:** `@opencode-ai/plugin`, `glob`, `yaml`, `zod`
- **Step types:** `script`, `agent`, `skill`, `approval`, `workflow`

### `evals/framework` — `@opencode-agents/eval-framework`
- **Runtime:** Node.js
- **Build:** `tsc`
- **Deps:** `@opencode-ai/sdk`, `glob`, `yaml`, `zod`
- **CLI:** `npm run eval:sdk` (with `--agent`, `--model`, `--pattern`, `--core`, `--debug`, `--subagent`, `--delegate` flags)

---

## Project Conventions

### Registry Management

`registry.json` at the repo root is the single source of truth for components. It tracks 7 categories: `agents`, `subagents`, `commands`, `tools`, `plugins`, `contexts`, `config`, and `skills`.

- **Auto-detection:** `scripts/registry/auto-detect-components.sh` scans `.opencode/` for new/removed components and updates `registry.json`.
- **Validation:** `scripts/registry/validate-registry.ts` (recommended) or `validate-registry.sh` (legacy) validates paths, dependencies, and orphaned files.
- **Do not hand-edit `registry.json`** without running validation.

### `.opencode/` Directory

The `.opencode/` directory is the agent specification hub containing ~250+ markdown files plus TypeScript tools:

- **`agent/`** — Agent definitions (`core/openagent.md`, `core/opencoder.md`, 70+ subagents in `subagents/`)
- **`command/`** — 40+ slash command definitions
- **`context/`** — ~150 domain knowledge and standards files
- **`skill/`** — Declarative skills with YAML frontmatter
- **`skills/`** — Additional skill packs
- **`tool/`** — TypeScript tools (Gemini image tools, env utilities)
- **`prompts/`** — Model-specific prompt variants (Gemini, GPT, Grok, Llama, MiniMax, OpenRouter)
- **`profiles/`** — Installation profiles (`essential`, `developer`, `business`, `advanced`, `full`)
- **`config/agent-metadata.json`** — Centralized metadata for agents/subagents

### Context References

Agent and command files reference context using `@` syntax:
- `@.opencode/context/...` — Standard context references
- `@AGENTS.md` — Project agent instructions
- Positional args only: `@$1`, `@$2` (dynamic variables like `@$foo` or `@${bar}` are forbidden)

### Scripts Organization

The `scripts/` directory contains ~40 utility scripts organized into:
- `registry/` — Component auto-detection, validation, and fixing
- `validation/` — Markdown link integrity, context reference validation
- `testing/` — Eval test runners and live Quest cycle tests (v4–v7)
- `tests/` — Compatibility, E2E install, non-interactive, and quest cycle shell tests
- `versioning/` — Version bump scripts
- `development/` — Dashboard and demo launchers
- `docs/` — Documentation sync
- `hooks/` — Git pre-commit hook

---

## Notes for AI Agents

- This repository uses **English** for all documentation, comments, and commit messages.
- The project does not use Docker, Vite, Webpack, or Jest.
- `registry.json` is auto-generated; do not hand-edit it without running validation.
- The `bun.lock` file is gitignored; the project maintains both `bun.lock` and `package-lock.json` locally but only the npm lockfile is significant for CI.
- When modifying `.opencode/` contents, expect `update-registry.yml` to auto-commit registry updates on push to `main`.
- The CLI uses lazy-loaded command modules via dynamic `import()` to keep startup fast.
- `swarm-runtime` has zero runtime dependencies and uses an immutable-append state pattern.
- All eval framework test scenarios are defined in YAML under `evals/agents/`.

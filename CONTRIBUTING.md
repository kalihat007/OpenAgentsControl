# Contributing to OpenAgentsControl

Thank you for your interest in contributing! This guide covers everything you need to get started — from setting up the development environment to submitting a pull request.

## Prerequisites

| Tool | Minimum Version | Used For |
|------|----------------|----------|
| **Bun** | >= 1.0.0 | Runtime, bundler, and test runner for `cli`, `swarm-runtime`, `plugin-abilities` |
| **Node.js** | >= 18.0.0 | Required for `compatibility-layer` (vitest, eslint) and root npm scripts |
| **npm** | (bundled with Node) | Workspace orchestration, root-level scripts |
| **Git** | any recent | Version control |

Install Bun if you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/OpenAgentsControl.git
cd OpenAgentsControl

# 2. Install root dependencies (links npm workspaces)
npm install

# 3. Install per-package dependencies
cd packages/cli && bun install && cd ../..
cd packages/swarm-runtime && bun install && cd ../..
cd packages/compatibility-layer && npm ci && cd ../..
cd packages/plugin-abilities && bun install && cd ../..

# 4. Build all packages
cd packages/swarm-runtime && bun run build && cd ../..
cd packages/cli && bun run build && cd ../..
cd packages/compatibility-layer && npm run build && cd ../..
cd packages/plugin-abilities && bun run build && cd ../..

# 5. Verify everything works
cd packages/cli && bun test && cd ../..
cd packages/swarm-runtime && bun test && cd ../..
cd packages/compatibility-layer && npx vitest run && cd ../..
cd packages/plugin-abilities && bun test && cd ../..
```

## Project Structure

```
OpenAgentsControl/
├── packages/
│   ├── cli/                    # `oac` CLI tool (Commander-based)
│   │   └── src/
│   │       ├── commands/       # One file per command (init, add, doctor, …)
│   │       ├── lib/            # Shared logic (registry, installer, config, …)
│   │       └── ui/             # Logger, spinner helpers
│   ├── swarm-runtime/          # Typed swarm scheduling primitives
│   │   └── src/
│   │       ├── scheduler.ts    # Batch planner with write-lock detection
│   │       ├── session.ts      # Immutable swarm session + event stream
│   │       ├── team.ts         # Role definitions (dev, revenue, ops, …)
│   │       ├── resilience.ts   # Retry, circuit breaker, timeout, DLQ
│   │       └── types.ts        # Shared type definitions
│   ├── compatibility-layer/    # Agent format translation (Cursor ↔ Claude ↔ Windsurf)
│   │   └── src/
│   │       ├── adapters/       # Per-IDE adapters
│   │       ├── core/           # AgentLoader, AdapterRegistry, TranslationEngine
│   │       ├── mappers/        # Tool, permission, model, context mappers
│   │       └── cli/            # `oac-compat` sub-CLI
│   └── plugin-abilities/       # Plugin system (abilities, enforcement, hooks)
│       └── src/
│           ├── loader/         # YAML ability loader
│           ├── validator/      # Schema + permission validation
│           ├── executor/       # Step execution engine
│           └── context/        # Context discovery
├── .opencode/                  # Agent definitions, context, commands, skills, tools
├── evals/                      # Agent evaluation framework + test suites
├── plugins/claude-code/        # Claude Code plugin
├── scripts/                    # Versioning, registry, prompt management
├── docs/                       # Extended docs and feature designs
├── .github/workflows/          # CI — PR checks, registry validation
├── package.json                # Root workspace config
└── registry.json               # Component registry (auto-generated)
```

## How to Run Tests

### Per-package unit tests

These are what CI runs on every PR:

```bash
# CLI tests (Bun test runner)
cd packages/cli && bun test

# Swarm runtime tests (Bun test runner)
cd packages/swarm-runtime && bun test

# Compatibility layer tests (vitest)
cd packages/compatibility-layer && npx vitest run

# Plugin abilities tests (Bun test runner)
cd packages/plugin-abilities && bun test
```

### Watch mode (during development)

```bash
cd packages/cli && bun test --watch
cd packages/swarm-runtime && bun test --watch
cd packages/compatibility-layer && npx vitest
```

### Type-checking (no emit)

```bash
cd packages/cli && bun run typecheck
cd packages/swarm-runtime && bun run typecheck
```

### Agent evaluation tests (requires API keys)

```bash
npm run test:ci                # Smoke tests for OpenAgent + OpenCoder
npm run test:openagent         # Full OpenAgent test suite
npm run test:openagent:core    # Core-only subset
```

### Validation scripts

```bash
bun run validate:registry          # Validate registry.json
bun run validate:context-links     # Check markdown link integrity
```

## Code Style and Conventions

### TypeScript

- **Strict mode** is enabled in all packages (`"strict": true` in tsconfig)
- Use explicit types — avoid `any`
- Prefer `type` imports for type-only usage: `import type { Foo } from './types.js'`
- Use `.js` extensions in import paths (ESM resolution)
- File names: **kebab-case** (`task-router.ts`, not `TaskRouter.ts`)
- Types/interfaces: **PascalCase** (`SwarmTask`, `RouterConfig`)
- Functions/variables: **camelCase** (`planSwarmBatches`, `maxConcurrency`)

### Error Handling

**Throw errors — do not call `process.exit()` in library or command code.** The CLI entry point (`packages/cli/src/index.ts`) catches errors and sets exit codes.

The error class hierarchy in `packages/cli/src/lib/errors.ts`:

```
CliError (base — carries exitCode)
├── ComponentNotFoundError
├── NotProjectRootError
├── BundledFilesError
├── InstallError
├── CommandUsageError
├── SwarmExecutionError
└── ExitCodeError (silent exit with a code, e.g. doctor returning 1)
```

Throwing a `CliError` subclass lets the top-level handler print the message and set the correct exit code without scattered `process.exit()` calls.

### Immutability patterns

The swarm-runtime uses an immutable-append pattern — functions like `appendSwarmEvent` return a new session object rather than mutating in place. Follow this pattern when extending session or scheduler logic.

### Pure functions

Prefer pure functions for testability. The CLI commands separate pure helpers (counting, formatting, scoring) from side-effectful functions (file I/O, logging). Mark side-effect-only helpers with a comment like `/** Side-effect only. */`.

## How to Add a New CLI Command

Each command lives in its own file under `packages/cli/src/commands/`.

1. **Create `packages/cli/src/commands/my-command.ts`:**

```typescript
import { type Command } from 'commander';

export async function myCommand(options: { verbose: boolean }): Promise<void> {
  // Implementation — throw CliError subclasses on failure
}

export function registerMyCommand(program: Command): void {
  program
    .command('my-command')
    .description('Short description of what it does')
    .option('--verbose', 'Show extra output', false)
    .action(async (opts: { verbose: boolean }) => {
      await myCommand(opts);
    });
}
```

2. **Register it in `packages/cli/src/index.ts`:**

Add the import to the `Promise.all` block and call the register function:

```typescript
const [
  // ... existing imports
  { registerMyCommand },
] = await Promise.all([
  // ... existing imports
  import('./commands/my-command.js'),
]);

// ... existing registrations
registerMyCommand(program);
```

3. **Add tests** in `packages/cli/src/commands/my-command.test.ts` or `packages/cli/src/lib/` for shared logic.

4. **Build and verify:**

```bash
cd packages/cli && bun run build && bun test
```

## How to Add a New Plugin Ability

Abilities are YAML files loaded by `packages/plugin-abilities`. Each ability defines a multi-step workflow with typed steps.

1. **Create an ability YAML file** in `.opencode/abilities/`:

```yaml
name: my-ability
description: "What this ability does"
version: 1.0.0
triggers:
  keywords: ["deploy", "release"]
  patterns: ["deploy to \\w+"]
inputs:
  target:
    type: string
    description: "Deployment target"
    required: true
steps:
  - id: validate
    type: script
    description: "Validate deployment config"
    run: "bun run validate"
  - id: confirm
    type: approval
    prompt: "Deploy to {{target}}?"
    needs: [validate]
  - id: execute
    type: agent
    agent: OpenDevopsSpecialist
    prompt: "Deploy the application to {{target}}"
    needs: [confirm]
```

Step types: `script` (run a command), `agent` (invoke a subagent), `skill` (load a skill), `approval` (ask user), `workflow` (nest another ability).

2. **Validate it:**

```bash
cd packages/plugin-abilities && bun test
```

3. **Register in the component registry** if you want it installable via `oac add`.

## How to Add a Compatibility Adapter

To support a new AI coding tool (beyond Cursor, Claude, Windsurf):

1. Create `packages/compatibility-layer/src/adapters/MyToolAdapter.ts` extending `BaseAdapter`
2. Implement `toOAC()` (parse foreign format → OAC agent) and `fromOAC()` (OAC agent → foreign format)
3. Register the adapter in `packages/compatibility-layer/src/core/AdapterRegistry.ts`
4. Add tool/permission/model/context mapper entries if the tool has unique naming conventions
5. Add tests in `packages/compatibility-layer/src/cli/__tests__/`

## Pull Request Guidelines

### PR title format

CI enforces **conventional commits** on PR titles:

```
<type>(<scope>): <description>
```

| Type | Meaning | Version Bump |
|------|---------|-------------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `docs` | Documentation only | patch |
| `test` | Test additions/changes | patch |
| `refactor` | Code refactoring | patch |
| `chore` | Maintenance | patch |
| `ci` | CI/CD changes | patch |
| `perf` | Performance | patch |
| `feat!` / `fix!` | Breaking change | major |

Examples:
- `feat(cli): add export command`
- `fix(swarm-runtime): handle empty task list in scheduler`
- `docs(readme): add architecture diagram`
- `test(compatibility-layer): add WindsurfAdapter round-trip test`

### What CI checks

The `.github/workflows/pr-checks.yml` pipeline runs:

1. **PR title validation** — must be conventional commit format
2. **Unit tests** — `bun test` for cli, swarm-runtime, plugin-abilities; `vitest run` for compatibility-layer
3. **Build & validate** — TypeScript compilation and test suite validation (when evals are changed)

### PR description template

```markdown
## What
Brief description of the change.

## Why
Motivation — what problem does this solve?

## How
Implementation approach.

## Testing
- [ ] Added/updated unit tests
- [ ] Ran `bun test` / `vitest run` for affected packages
- [ ] Ran `bun run typecheck` for affected packages
- [ ] Tested manually (if applicable)
```

### Merge strategy

PRs are merged with **Squash and Merge**. The PR title becomes the commit message, which drives automatic versioning.

## Where to Find Help

- **GitHub Issues** — [Report bugs or request features](https://github.com/kalihat007/OpenAgentsControl/issues)
- **GitHub Discussions** — [Ask questions, share ideas](https://github.com/kalihat007/OpenAgentsControl/discussions)
- **Community** — [nextsystems.ai](https://nextsystems.ai)
- **Legacy contributor docs** — `docs/contributing/CONTRIBUTING.md` and `docs/contributing/DEVELOPMENT.md` have additional context on agent creation and prompt variants
- **Security issues** — Please report security vulnerabilities privately via GitHub's security advisories, not in public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

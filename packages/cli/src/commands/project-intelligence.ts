/**
 * oac project-intelligence — Generate living project documentation
 */

import type { Command } from 'commander'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { success, info, dim } from '../ui/logger.js'

const INTELLIGENCE_DIR = '.oac/project-intelligence'

interface IntelligenceDoc {
  filename: string
  title: string
  generator: () => Promise<string>
}

async function generateArchitectureDoc(projectRoot: string): Promise<string> {
  const lines: string[] = [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Architecture',
    '',
    '## Overview',
    '',
    'This project is a TypeScript monorepo using ESM modules.',
    '',
    '## Packages',
    '',
  ]

  try {
    const pkgRaw = await readFile(join(projectRoot, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw)
    if (pkg.workspaces) {
      for (const ws of pkg.workspaces) {
        lines.push(`- \`${ws}\``)
      }
    }
  } catch {
    lines.push('_Unable to read root package.json_')
  }

  lines.push(
    '',
    '## Entry Points',
    '',
    '| Package | Entry |',
    '|---------|-------|',
  )

  const packages = ['packages/cli', 'packages/swarm-runtime', 'packages/compatibility-layer', 'packages/plugin-abilities']
  for (const p of packages) {
    try {
      const pkgRaw = await readFile(join(projectRoot, p, 'package.json'), 'utf-8')
      const pkg = JSON.parse(pkgRaw)
      const entry = pkg.main ?? pkg.exports?.['.'] ?? 'index.js'
      lines.push(`| ${pkg.name ?? p} | ${entry} |`)
    } catch {
      // skip
    }
  }

  lines.push('', '## Key Abstractions', '', '- Quest lifecycle (NEW → SPEC → EXECUTE → VERIFY → COMPLETE)', '- Swarm sessions with immutable-append events', '- Runtime bridge for Kimi / OpenCode / Claude', '')
  return lines.join('\n')
}

async function generateTestStrategyDoc(): Promise<string> {
  const lines: string[] = [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Test Strategy',
    '',
    '## Test Runners',
    '',
    '| Package | Runner | Command |',
    '|---------|--------|---------|',
    '| packages/cli | Bun | `bun test` |',
    '| packages/swarm-runtime | Bun | `bun test` |',
    '| packages/compatibility-layer | Vitest | `npx vitest run` |',
    '| packages/plugin-abilities | Bun | `bun test` |',
    '',
    '## Golden Tests',
    '',
    '- `make test-golden` — 8 golden tests (~3–5 min)',
    '',
    '## CI',
    '',
    '- PR checks run per-package unit tests',
    '- Eval framework validated on test suite changes',
    '',
  ]
  return lines.join('\n')
}

async function generateInstallBehaviorDoc(): Promise<string> {
  return [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Install / Update Behavior',
    '',
    '## Requirements',
    '',
    '- Bun >= 1.0.0 (primary runtime)',
    '- Node.js >= 18.0.0 (compatibility layer, eval framework)',
    '- npm (workspaces)',
    '',
    '## Setup',
    '',
    '```bash',
    'npm install',
    'cd packages/cli && bun install',
    'cd packages/swarm-runtime && bun install',
    'cd packages/compatibility-layer && npm ci',
    'cd packages/plugin-abilities && bun install',
    '```',
    '',
    '## Known Quirks',
    '',
    '- `bun.lock` is gitignored; only `package-lock.json` is significant for CI',
    '- `packages/plugin-abilities` is not in root workspaces',
    '',
  ].join('\n')
}

async function generateRuntimeCompatibilityDoc(): Promise<string> {
  return [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Runtime Compatibility',
    '',
    '## Supported Runtimes',
    '',
    '| Runtime | CLI | Status | Notes |',
    '|---------|-----|--------|-------|',
    '| Kimi Code | `kimi` | Active | `--agent-file ~/.kimi/agents/openagents-control/openagent.yaml` |',
    '| OpenCode | `opencode` | Active | `--agent OpenAgent` |',
    '| Claude Code | `claude` | Active | `--plugin-dir ~/.claude/plugins/openagents-control-bridge` |',
    '',
    '## Cross-Runtime Contract',
    '',
    '- Append-only `events.ndjson` — never rewrite `quest.json`',
    '- Handoff events: `handoff.outgoing` / `handoff.incoming`',
    '- Runtime events: `runtime.assigned` / `runtime.spawned` / `runtime.completed`',
    '',
  ].join('\n')
}

async function generateKnownRisksDoc(): Promise<string> {
  return [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Known Risks',
    '',
    '## Platform-Specific',
    '',
    '- Runtime spawning tested on macOS and Ubuntu',
    '- Git worktrees require git >= 2.28',
    '',
    '## Scaling Risks',
    '',
    '- `events.ndjson` append races mitigated by file-append locks',
    '- Team memory capped at 500 lessons with auto-prune',
    '',
    '## Backward Compatibility',
    '',
    '- v5 quests continue to reconcile correctly',
    '- v6 features are opt-in via `.oac/config.json`',
    '',
  ].join('\n')
}

async function generateReleaseHistoryDoc(projectRoot: string): Promise<string> {
  const lines: string[] = [
    '---',
    `generatedAt: ${new Date().toISOString()}`,
    'generator: oac-project-intelligence',
    'refreshInterval: 7d',
    '---',
    '',
    '# Release History',
    '',
  ]

  try {
    const changelog = await readFile(join(projectRoot, 'CHANGELOG.md'), 'utf-8')
    const firstH2 = changelog.indexOf('## ')
    if (firstH2 >= 0) {
      lines.push(changelog.slice(firstH2, firstH2 + 2000))
    } else {
      lines.push('_See CHANGELOG.md for full history._')
    }
  } catch {
    lines.push('_CHANGELOG.md not found._')
  }

  return lines.join('\n')
}

export async function projectIntelligenceCommand(options: {
  refresh?: boolean
}): Promise<void> {
  const projectRoot = process.cwd()
  const dir = join(projectRoot, INTELLIGENCE_DIR)
  await mkdir(dir, { recursive: true })
  if (options.refresh === false) {
    dim('  Refresh disabled by option; command invocation will still ensure documents exist.')
  }

  const docs: IntelligenceDoc[] = [
    { filename: 'architecture.md', title: 'Architecture', generator: () => generateArchitectureDoc(projectRoot) },
    { filename: 'test-strategy.md', title: 'Test Strategy', generator: generateTestStrategyDoc },
    { filename: 'install-behavior.md', title: 'Install Behavior', generator: generateInstallBehaviorDoc },
    { filename: 'runtime-compatibility.md', title: 'Runtime Compatibility', generator: generateRuntimeCompatibilityDoc },
    { filename: 'known-risks.md', title: 'Known Risks', generator: generateKnownRisksDoc },
    { filename: 'release-history.md', title: 'Release History', generator: () => generateReleaseHistoryDoc(projectRoot) },
  ]

  for (const doc of docs) {
    const path = join(dir, doc.filename)
    const content = await doc.generator()
    await writeFile(path, content)
    info(`  ${doc.filename}`)
  }

  success(`Project intelligence updated in ${INTELLIGENCE_DIR}/`)
  dim('  Run this command weekly or after significant architectural changes.')
}

export function registerProjectIntelligenceCommand(program: Command): void {
  program
    .command('project-intelligence')
    .description('Generate or refresh living project documentation under .oac/project-intelligence/')
    .option('--refresh', 'Force refresh all documents', true)
    .action(async (opts: { refresh?: boolean }) => {
      await projectIntelligenceCommand(opts)
    })
}

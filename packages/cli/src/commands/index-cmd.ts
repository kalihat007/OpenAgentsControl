/**
 * oac index — Codebase indexing and exploration
 *
 * Builds a comprehensive index of the project: tech stack, file tree,
 * dependency graph, module classification, and coding conventions.
 *
 * Usage:
 *   oac index                         Run full codebase indexing
 *   oac index --refresh               Force re-index even if cache is fresh
 *   oac index --show-stack            Display detected tech stack
 *   oac index --show-deps <file>      Show dependency graph for a file
 *   oac index --show-tree             Display file tree
 *   oac index --show-conventions      Display detected project conventions
 */

import type { Command } from 'commander'
import { log, info, dim, warn, bold } from '../ui/logger.js'
import { createSpinner } from '../ui/spinner.js'
import { createLogger } from '../lib/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import {
  indexCodebase,
  loadIndex,
  saveIndex,
  isIndexStale,
  flattenFileTree,
  type CodebaseIndex,
  type FileNode,
  type TechStack,
  type ProjectConventions,
} from '../lib/codebase-indexer.js'

const cmdLog = createLogger('cmd:index')

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const

// ── Command logic ─────────────────────────────────────────────────────────────

export async function indexCommand(options: {
  refresh: boolean
  showStack: boolean
  showDeps?: string
  showTree: boolean
  showConventions: boolean
}): Promise<void> {
  const projectRoot = process.cwd()
  const hasShowFlag =
    options.showStack || options.showDeps !== undefined || options.showTree || options.showConventions

  cmdLog.debug('Running index command', {
    projectRoot,
    refresh: options.refresh,
    showStack: options.showStack,
    showDeps: options.showDeps,
    showTree: options.showTree,
    showConventions: options.showConventions,
  })

  const index = await resolveIndex(projectRoot, options.refresh)

  if (hasShowFlag) {
    if (options.showStack) printTechStack(index.techStack)
    if (options.showDeps !== undefined) printDependencyGraph(index, options.showDeps)
    if (options.showTree) printFileTree(index.fileTree)
    if (options.showConventions) printConventions(index.conventions)
    return
  }

  printIndexSummary(index)
}

// ── Index resolution (cache-aware) ────────────────────────────────────────────

async function resolveIndex(projectRoot: string, forceRefresh: boolean): Promise<CodebaseIndex> {
  if (!forceRefresh) {
    const cached = await loadIndex(projectRoot)
    if (cached && !isIndexStale(cached, projectRoot)) {
      cmdLog.debug('Using cached index', { indexedAt: cached.indexedAt.toISOString() })
      dim(`  Using cached index (indexed ${formatRelativeTime(cached.indexedAt)})`)
      return cached
    }
  }

  const spinner = createSpinner('Indexing codebase…')
  spinner.start()

  const startMs = Date.now()
  const index = await indexCodebase(projectRoot)
  const elapsedMs = Date.now() - startMs

  await saveIndex(projectRoot, index)

  spinner.succeed(`Codebase indexed in ${elapsedMs}ms`)

  return index
}

// ── Display: Index summary ────────────────────────────────────────────────────

function printIndexSummary(index: CodebaseIndex): void {
  const allFiles = flattenFileTree(index.fileTree)
  const depCount = Object.keys(index.dependencies).length

  log('')
  bold('  Codebase Index Summary')
  log('')

  const rows: [string, string][] = [
    ['Root', index.root],
    ['Files', String(allFiles.length)],
    ['Modules', String(index.modules.length)],
    ['Dependencies tracked', String(depCount)],
    ['Languages', index.techStack.languages.join(', ') || 'none detected'],
    ['Frameworks', index.techStack.frameworks.join(', ') || 'none detected'],
    ['Package manager', index.techStack.packageManager],
    ['Indexed at', index.indexedAt.toLocaleString()],
  ]

  const maxLabel = Math.max(...rows.map(([label]) => label.length))
  for (const [label, value] of rows) {
    log(`  ${ANSI.cyan}${label.padEnd(maxLabel)}${ANSI.reset}  ${value}`)
  }

  log('')

  const byType = new Map<string, number>()
  for (const mod of index.modules) {
    byType.set(mod.type, (byType.get(mod.type) ?? 0) + 1)
  }

  if (byType.size > 0) {
    info('Module breakdown:')
    const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1])
    for (const [type, count] of sorted) {
      const bar = '█'.repeat(Math.min(count, 40))
      log(`    ${ANSI.cyan}${type.padEnd(12)}${ANSI.reset} ${ANSI.green}${bar}${ANSI.reset} ${count}`)
    }
    log('')
  }

  const complexityBreakdown = { low: 0, medium: 0, high: 0 }
  for (const mod of index.modules) {
    complexityBreakdown[mod.complexity]++
  }

  info('Complexity distribution:')
  log(`    ${ANSI.green}low${ANSI.reset}    ${complexityBreakdown.low}`)
  log(`    ${ANSI.yellow}medium${ANSI.reset} ${complexityBreakdown.medium}`)
  log(`    ${ANSI.magenta}high${ANSI.reset}   ${complexityBreakdown.high}`)
  log('')

  dim('  Run with --show-stack, --show-tree, --show-deps <file>, or --show-conventions for details.')
}

// ── Display: Tech stack ───────────────────────────────────────────────────────

function printTechStack(stack: TechStack): void {
  log('')
  bold('  Detected Tech Stack')
  log('')

  const sections: [string, string[]][] = [
    ['Languages', stack.languages],
    ['Frameworks', stack.frameworks],
    ['Build Tools', stack.buildTools],
    ['Test Frameworks', stack.testFrameworks],
  ]

  for (const [title, items] of sections) {
    if (items.length > 0) {
      info(`${title}:`)
      for (const item of items) {
        log(`    • ${item}`)
      }
      log('')
    }
  }

  info(`Package Manager: ${stack.packageManager}`)
  log('')
}

// ── Display: Dependency graph ─────────────────────────────────────────────────

function printDependencyGraph(index: CodebaseIndex, targetFile: string): void {
  const deps = index.dependencies[targetFile]

  if (!deps) {
    const allFiles = Object.keys(index.dependencies)
    const partial = allFiles.filter((f) => f.includes(targetFile))

    if (partial.length === 1) {
      return printDependencyGraph(index, partial[0]!)
    }
    if (partial.length > 1) {
      warn(`Ambiguous file '${targetFile}'. Matches:`)
      for (const f of partial.slice(0, 10)) {
        log(`    ${f}`)
      }
      return
    }

    throw new CommandUsageError(
      `File '${targetFile}' not found in dependency index. Run 'oac index' first.`,
    )
  }

  log('')
  bold(`  Dependencies for ${targetFile}`)
  log('')

  if (deps.imports.length > 0) {
    info(`Imports (${deps.imports.length}):`)
    for (const imp of deps.imports) {
      log(`    ${ANSI.cyan}→${ANSI.reset} ${imp}`)
    }
    log('')
  } else {
    dim('  No imports.')
    log('')
  }

  if (deps.importedBy.length > 0) {
    info(`Imported by (${deps.importedBy.length}):`)
    for (const dep of deps.importedBy) {
      log(`    ${ANSI.green}←${ANSI.reset} ${dep}`)
    }
    log('')
  } else {
    dim('  Not imported by any tracked file.')
    log('')
  }
}

// ── Display: File tree ────────────────────────────────────────────────────────

function printFileTree(tree: FileNode[], prefix = '', _isLast = true, isRoot = true): void {
  if (isRoot) {
    log('')
    bold('  File Tree')
    log('')
  }

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]!
    const last = i === tree.length - 1
    const connector = isRoot ? '' : last ? '└── ' : '├── '
    const color = node.type === 'directory' ? ANSI.blue : ANSI.reset
    const langTag = node.language ? ` ${ANSI.gray}(${node.language})${ANSI.reset}` : ''

    log(`  ${prefix}${connector}${color}${node.name}${ANSI.reset}${langTag}`)

    if (node.children && node.children.length > 0) {
      const childPrefix = isRoot ? '' : prefix + (last ? '    ' : '│   ')
      printFileTree(node.children, childPrefix, last, false)
    }
  }

  if (isRoot) log('')
}

// ── Display: Conventions ──────────────────────────────────────────────────────

function printConventions(conventions: ProjectConventions): void {
  log('')
  bold('  Detected Project Conventions')
  log('')

  const rows: [string, string][] = [
    ['File naming', conventions.fileNaming],
    ['Test pattern', conventions.testPattern],
    ['Component pattern', conventions.componentPattern],
    ['State management', conventions.stateManagement],
    ['Error handling', conventions.errorHandling],
    ['Import style', conventions.importStyle],
  ]

  const maxLabel = Math.max(...rows.map(([label]) => label.length))
  for (const [label, value] of rows) {
    const color =
      value === 'unknown' || value === 'none' ? ANSI.gray : ANSI.green
    log(`  ${ANSI.cyan}${label.padEnd(maxLabel)}${ANSI.reset}  ${color}${value}${ANSI.reset}`)
  }

  log('')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ${diffMin % 60}m ago`
}

// ── Commander registration ────────────────────────────────────────────────────

export function registerIndexCommand(program: Command): void {
  program
    .command('index')
    .description('Index the codebase — detect stack, modules, dependencies, and conventions')
    .option('--refresh', 'Force re-index even if cache is fresh', false)
    .option('--show-stack', 'Display detected tech stack', false)
    .option('--show-deps <file>', 'Show dependency graph for a specific file')
    .option('--show-tree', 'Display file tree', false)
    .option('--show-conventions', 'Display detected project conventions', false)
    .addHelpText(
      'after',
      `
Examples:
  oac index                           Run full codebase indexing
  oac index --refresh                 Force re-index (ignore cache)
  oac index --show-stack              Show languages, frameworks, tools
  oac index --show-deps src/index.ts  Show imports/importedBy for a file
  oac index --show-tree               Display the project file tree
  oac index --show-conventions        Show detected naming & style conventions
`,
    )
    .action(async (opts: Record<string, unknown>) => {
      await indexCommand({
        refresh: Boolean(opts['refresh']),
        showStack: Boolean(opts['showStack']),
        showDeps: typeof opts['showDeps'] === 'string' ? opts['showDeps'] : undefined,
        showTree: Boolean(opts['showTree']),
        showConventions: Boolean(opts['showConventions']),
      })
    })
}

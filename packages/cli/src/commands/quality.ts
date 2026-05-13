/**
 * oac quality — Quality analysis and automated code review
 *
 * Runs quality signal analysis on changed files, produces scored reports,
 * and performs automated code review.
 *
 * Usage:
 *   oac quality                       Analyze uncommitted changes
 *   oac quality --branch <name>       Analyze a branch vs main
 *   oac quality --report              Generate a detailed quality report
 *   oac quality --review              Run automated code review
 *   oac quality --threshold <n>       Set minimum quality score (fail below)
 */

import type { Command } from 'commander'
import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log, info, success, dim, warn, error as logError, bold } from '../ui/logger.js'
import { createSpinner } from '../ui/spinner.js'
import { createLogger } from '../lib/logger.js'
import { ExitCodeError } from '../lib/errors.js'
import {
  analyzeDiff,
  analyzeConsistency,
  analyzeCoverage,
  autoReview,
  generateQualityReport,
  type DiffAnalysis,
  type FileChange,
  type QualityReport,
  type QualitySignal,
  type ReviewResult,
  type Grade,
  type ReviewIssue,
  type ProjectConventions,
} from '@nextsystems/oac-swarm-runtime'

const cmdLog = createLogger('cmd:quality')

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

const GRADE_COLORS: Record<Grade, string> = {
  A: ANSI.green,
  B: ANSI.blue,
  C: ANSI.yellow,
  D: ANSI.red,
  F: ANSI.red,
}

// ── Command logic ─────────────────────────────────────────────────────────────

export async function qualityCommand(options: {
  branch?: string
  report: boolean
  review: boolean
  threshold?: number
}): Promise<void> {
  const projectRoot = process.cwd()

  cmdLog.debug('Running quality command', {
    projectRoot,
    branch: options.branch,
    report: options.report,
    review: options.review,
    threshold: options.threshold,
  })

  const spinner = createSpinner('Analyzing changes…')
  spinner.start()

  const changedFiles = getChangedFiles(projectRoot, options.branch)

  if (changedFiles.length === 0) {
    spinner.stop()
    warn('No changed files found.')
    dim(
      options.branch
        ? `  No differences between '${options.branch}' and main.`
        : '  No uncommitted changes detected. Try --branch <name> to compare a branch.',
    )
    return
  }

  const fileChanges = await loadFileChanges(projectRoot, changedFiles)
  const diff = computeDiffAnalysis(projectRoot, changedFiles, options.branch)

  const signals: QualitySignal[] = [
    ...analyzeDiff(diff),
    ...analyzeConsistency(fileChanges, detectSimpleConventions(fileChanges)),
    ...analyzeCoverage(fileChanges, findTestFiles(projectRoot)),
  ]

  const report = generateQualityReport('cli-analysis', 'cli-user', signals)

  spinner.succeed(`Analyzed ${changedFiles.length} file(s)`)

  if (options.review) {
    const reviewResult = autoReview(fileChanges)
    printReviewResult(reviewResult)
  }

  if (options.report) {
    printDetailedReport(report, diff)
  } else {
    printSummary(report, diff)
  }

  if (options.threshold !== undefined) {
    if (report.overallScore < options.threshold) {
      log('')
      logError(
        `Quality score ${report.overallScore} is below threshold ${options.threshold}`,
      )
      throw new ExitCodeError(1, false)
    }
    success(`Quality score ${report.overallScore} meets threshold ${options.threshold}`)
  }
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function getChangedFiles(projectRoot: string, branch?: string): string[] {
  try {
    let cmd: string
    if (branch) {
      const base = getDefaultBranch(projectRoot)
      cmd = `git diff --name-only ${base}...${branch}`
    } else {
      cmd = 'git diff --name-only HEAD'
    }

    const output = execSync(cmd, { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (!output) return []
    return output.split('\n').filter(Boolean)
  } catch {
    cmdLog.debug('git diff failed, trying unstaged changes')
    try {
      const output = execSync('git diff --name-only', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      const staged = execSync('git diff --cached --name-only', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      const combined = new Set([
        ...(output ? output.split('\n') : []),
        ...(staged ? staged.split('\n') : []),
      ])
      return [...combined].filter(Boolean)
    } catch {
      return []
    }
  }
}

function getDefaultBranch(projectRoot: string): string {
  try {
    execSync('git rev-parse --verify main', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return 'main'
  } catch {
    try {
      execSync('git rev-parse --verify master', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return 'master'
    } catch {
      return 'HEAD~1'
    }
  }
}

function computeDiffAnalysis(projectRoot: string, changedFiles: string[], branch?: string): DiffAnalysis {
  let linesAdded = 0
  let linesRemoved = 0

  try {
    let cmd: string
    if (branch) {
      const base = getDefaultBranch(projectRoot)
      cmd = `git diff --numstat ${base}...${branch}`
    } else {
      cmd = 'git diff --numstat HEAD'
    }

    const output = execSync(cmd, { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    for (const line of output.split('\n')) {
      if (!line) continue
      const [added, removed] = line.split('\t')
      if (added && removed && added !== '-') {
        linesAdded += parseInt(added, 10) || 0
        linesRemoved += parseInt(removed, 10) || 0
      }
    }
  } catch {
    cmdLog.debug('numstat failed, estimating from file content')
  }

  const totalLines = linesAdded + linesRemoved
  const churnRatio = totalLines > 0 ? Math.min(linesRemoved, linesAdded) / totalLines : 0

  return {
    filesChanged: changedFiles.length,
    linesAdded,
    linesRemoved,
    churnRatio: Math.round(churnRatio * 100) / 100,
    complexityDelta: estimateComplexityDelta(linesAdded, linesRemoved),
    newDependencies: [],
    affectedModules: changedFiles.map((f) => f.split('/')[0] ?? f),
  }
}

function estimateComplexityDelta(added: number, removed: number): number {
  return Math.max(0, Math.floor((added - removed) / 20))
}

// ── File loading ──────────────────────────────────────────────────────────────

async function loadFileChanges(projectRoot: string, changedFiles: string[]): Promise<FileChange[]> {
  const changes: FileChange[] = []

  for (const file of changedFiles) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8')
      changes.push({ path: file, content })
    } catch {
      cmdLog.debug('Could not read changed file', { file })
    }
  }

  return changes
}

function findTestFiles(projectRoot: string): string[] {
  try {
    const output = execSync(
      'git ls-files -- "*.test.*" "*.spec.*" "**/__tests__/**"',
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

function detectSimpleConventions(changes: readonly FileChange[]): ProjectConventions {
  let namedImports = 0
  let defaultImports = 0

  for (const change of changes) {
    namedImports += (change.content.match(/import\s*\{[^}]+\}\s*from/g) ?? []).length
    defaultImports += (change.content.match(/import\s+\w+\s+from/g) ?? []).length
  }

  const total = namedImports + defaultImports
  let importStyle: 'named' | 'default' | 'mixed' = 'mixed'
  if (total > 0) {
    if (namedImports / total > 0.8) importStyle = 'named'
    else if (defaultImports / total > 0.8) importStyle = 'default'
  }

  return { importStyle }
}

// ── Display: Summary ──────────────────────────────────────────────────────────

function printSummary(report: QualityReport, diff: DiffAnalysis): void {
  log('')
  bold('  Quality Analysis')
  log('')

  const gradeColor = GRADE_COLORS[report.grade]
  log(`  Score: ${ANSI.bold}${report.overallScore}${ANSI.reset} / 100  Grade: ${gradeColor}${ANSI.bold}${report.grade}${ANSI.reset}`)
  log('')

  log(`  ${ANSI.cyan}Files changed${ANSI.reset}   ${diff.filesChanged}`)
  log(`  ${ANSI.green}Lines added${ANSI.reset}     +${diff.linesAdded}`)
  log(`  ${ANSI.red}Lines removed${ANSI.reset}   -${diff.linesRemoved}`)
  log(`  ${ANSI.yellow}Churn ratio${ANSI.reset}    ${(diff.churnRatio * 100).toFixed(0)}%`)
  log('')

  if (report.signals.length > 0) {
    info('Signals:')
    for (const signal of report.signals) {
      const icon = signal.score >= 80 ? `${ANSI.green}✓${ANSI.reset}` : signal.score >= 60 ? `${ANSI.yellow}~${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`
      log(`    ${icon} ${signal.name.padEnd(22)} ${formatScoreBar(signal.score)} ${signal.score}`)
    }
    log('')
  }

  if (report.recommendations.length > 0) {
    info('Recommendations:')
    for (const rec of report.recommendations) {
      log(`    • ${rec}`)
    }
    log('')
  }
}

// ── Display: Detailed report ──────────────────────────────────────────────────

function printDetailedReport(report: QualityReport, diff: DiffAnalysis): void {
  log('')
  bold('  Detailed Quality Report')
  log('')

  const gradeColor = GRADE_COLORS[report.grade]
  log(`  ${ANSI.bold}Overall Score: ${report.overallScore} / 100${ANSI.reset}  Grade: ${gradeColor}${ANSI.bold}${report.grade}${ANSI.reset}`)
  log(`  ${ANSI.dim}Generated: ${report.timestamp}${ANSI.reset}`)
  log('')

  // Diff statistics
  info('Change Statistics:')
  const statRows: [string, string][] = [
    ['Files changed', String(diff.filesChanged)],
    ['Lines added', `+${diff.linesAdded}`],
    ['Lines removed', `-${diff.linesRemoved}`],
    ['Net change', `${diff.linesAdded - diff.linesRemoved > 0 ? '+' : ''}${diff.linesAdded - diff.linesRemoved}`],
    ['Churn ratio', `${(diff.churnRatio * 100).toFixed(1)}%`],
    ['Complexity delta', `${diff.complexityDelta >= 0 ? '+' : ''}${diff.complexityDelta}`],
  ]

  const maxStatLabel = Math.max(...statRows.map(([l]) => l.length))
  for (const [label, value] of statRows) {
    log(`    ${label.padEnd(maxStatLabel)}  ${value}`)
  }
  log('')

  if (diff.affectedModules.length > 0) {
    info('Affected modules:')
    const uniqueModules = [...new Set(diff.affectedModules)]
    for (const mod of uniqueModules) {
      log(`    • ${mod}`)
    }
    log('')
  }

  // Signal breakdown by category
  const byCategory = new Map<string, QualitySignal[]>()
  for (const signal of report.signals) {
    if (!byCategory.has(signal.category)) byCategory.set(signal.category, [])
    byCategory.get(signal.category)!.push(signal)
  }

  info('Signal Breakdown:')
  log('')
  for (const [category, signals] of byCategory) {
    const avg = Math.round(signals.reduce((s, sig) => s + sig.score, 0) / signals.length)
    const categoryGrade = scoreToGrade(avg)
    const catColor = GRADE_COLORS[categoryGrade]

    log(`    ${ANSI.bold}${category.toUpperCase()}${ANSI.reset} — ${catColor}${avg}${ANSI.reset}/100`)
    for (const signal of signals) {
      const icon = signal.score >= 80 ? `${ANSI.green}✓${ANSI.reset}` : signal.score >= 60 ? `${ANSI.yellow}~${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`
      log(`      ${icon} ${signal.name.padEnd(22)} ${formatScoreBar(signal.score)} ${signal.score}  ${ANSI.dim}${signal.details}${ANSI.reset}`)
    }
    log('')
  }

  if (report.recommendations.length > 0) {
    info('Recommendations:')
    for (const rec of report.recommendations) {
      log(`    → ${rec}`)
    }
    log('')
  }
}

// ── Display: Review result ────────────────────────────────────────────────────

function printReviewResult(result: ReviewResult): void {
  log('')
  bold('  Automated Code Review')
  log('')

  if (result.approved) {
    success('Review: APPROVED')
  } else {
    logError('Review: CHANGES REQUESTED')
  }
  log('')

  if (result.issues.length > 0) {
    const errors = result.issues.filter((i) => i.severity === 'error')
    const warnings = result.issues.filter((i) => i.severity === 'warning')
    const infos = result.issues.filter((i) => i.severity === 'info')

    if (errors.length > 0) {
      info(`Errors (${errors.length}):`)
      for (const issue of errors) {
        printIssue(issue)
      }
      log('')
    }

    if (warnings.length > 0) {
      info(`Warnings (${warnings.length}):`)
      for (const issue of warnings) {
        printIssue(issue)
      }
      log('')
    }

    if (infos.length > 0) {
      info(`Info (${infos.length}):`)
      for (const issue of infos) {
        printIssue(issue)
      }
      log('')
    }
  } else {
    dim('  No issues found.')
    log('')
  }

  if (result.suggestions.length > 0) {
    info('Suggestions:')
    for (const suggestion of result.suggestions) {
      log(`    → ${suggestion}`)
    }
    log('')
  }
}

function printIssue(issue: ReviewIssue): void {
  const severityColor =
    issue.severity === 'error' ? ANSI.red : issue.severity === 'warning' ? ANSI.yellow : ANSI.blue
  const icon =
    issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ'

  log(`    ${severityColor}${icon}${ANSI.reset} ${ANSI.dim}${issue.file}${ANSI.reset}`)
  log(`      ${issue.description}`)
  if (issue.suggestion) {
    dim(`      Fix: ${issue.suggestion}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScoreBar(score: number): string {
  const width = 20
  const filled = Math.round((score / 100) * width)
  const empty = width - filled
  const color = score >= 80 ? ANSI.green : score >= 60 ? ANSI.yellow : ANSI.red
  return `${color}${'█'.repeat(filled)}${ANSI.gray}${'░'.repeat(empty)}${ANSI.reset}`
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

// ── Commander registration ────────────────────────────────────────────────────

export function registerQualityCommand(program: Command): void {
  program
    .command('quality')
    .description('Run quality analysis and automated code review on changes')
    .option('--branch <name>', 'Analyze changes on a branch vs main')
    .option('--report', 'Generate a detailed quality report', false)
    .option('--review', 'Run automated code review', false)
    .option('--threshold <number>', 'Minimum quality score (exit 1 if below)', (v) => parseInt(v, 10))
    .addHelpText(
      'after',
      `
Examples:
  oac quality                       Analyze uncommitted changes
  oac quality --branch feature/auth Analyze branch vs main
  oac quality --report              Detailed signal breakdown
  oac quality --review              Automated code review
  oac quality --threshold 70        Fail CI if score < 70
  oac quality --report --review     Both report and review
`,
    )
    .action(async (opts: Record<string, unknown>) => {
      await qualityCommand({
        branch: typeof opts['branch'] === 'string' ? opts['branch'] : undefined,
        report: Boolean(opts['report']),
        review: Boolean(opts['review']),
        threshold: typeof opts['threshold'] === 'number' && Number.isFinite(opts['threshold']) ? opts['threshold'] : undefined,
      })
    })
}

/**
 * Swarm quality gate — runs real quality signals on changed files after execution.
 *
 * Uses the same @nextsystems/oac-swarm-runtime analyzers as `oac quality`.
 */

import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLogger } from './logger.js'
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
} from '@nextsystems/oac-swarm-runtime'

const log = createLogger('swarm-quality-gate')

export interface SwarmQualityGateResult {
  passed: boolean
  overallScore: number
  grade: QualityReport['grade']
  report: QualityReport
  review: ReviewResult | null
  changedFileCount: number
  signals: QualitySignal[]
  summary: string
}

export interface SwarmQualityGateOptions {
  /** Minimum score (0–100) required to pass. Default: 0 (always pass if files exist). */
  threshold?: number
  /** Run automated code review in addition to signal analysis. */
  review?: boolean
}

export async function runSwarmQualityGate(
  projectRoot: string,
  options: SwarmQualityGateOptions = {},
): Promise<SwarmQualityGateResult> {
  const changedFiles = getChangedFiles(projectRoot)

  if (changedFiles.length === 0) {
    log.debug('No changed files — quality gate skipped')
    return {
      passed: true,
      overallScore: 100,
      grade: 'A',
      report: generateQualityReport('swarm-gate', 'swarm', []),
      review: null,
      changedFileCount: 0,
      signals: [],
      summary: 'No changed files detected — quality gate skipped (nothing to analyze).',
    }
  }

  const fileChanges = await loadFileChanges(projectRoot, changedFiles)
  const diff = computeDiffAnalysis(projectRoot, changedFiles)

  const signals: QualitySignal[] = [
    ...analyzeDiff(diff),
    ...analyzeConsistency(fileChanges, detectSimpleConventions(fileChanges)),
    ...analyzeCoverage(fileChanges, findTestFiles(projectRoot)),
  ]

  const report = generateQualityReport('swarm-gate', 'swarm-session', signals)
  const review = options.review ? autoReview(fileChanges) : null

  const threshold = options.threshold ?? 0
  const reviewPassed = review ? review.approved : true
  const passed = report.overallScore >= threshold && reviewPassed

  const summary = [
    `Quality gate: score ${report.overallScore}/100 (grade ${report.grade})`,
    `Files analyzed: ${changedFiles.length}`,
    review ? `Review: ${review.approved ? 'approved' : 'changes requested'} (${review.issues.length} issue(s))` : null,
    passed ? 'Gate: PASSED' : 'Gate: FAILED',
  ]
    .filter(Boolean)
    .join(' · ')

  log.debug('Quality gate complete', { passed, overallScore: report.overallScore, threshold })

  return {
    passed,
    overallScore: report.overallScore,
    grade: report.grade,
    report,
    review,
    changedFileCount: changedFiles.length,
    signals,
    summary,
  }
}

function getChangedFiles(projectRoot: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', {
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

function computeDiffAnalysis(projectRoot: string, changedFiles: string[]): DiffAnalysis {
  let linesAdded = 0
  let linesRemoved = 0

  try {
    const output = execSync('git diff --numstat HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    for (const line of output.split('\n')) {
      if (!line) continue
      const [added, removed] = line.split('\t')
      if (added && removed && added !== '-') {
        linesAdded += parseInt(added, 10) || 0
        linesRemoved += parseInt(removed, 10) || 0
      }
    }
  } catch {
    // estimate unavailable
  }

  const totalLines = linesAdded + linesRemoved
  const churnRatio = totalLines > 0 ? Math.min(linesRemoved, linesAdded) / totalLines : 0

  return {
    filesChanged: changedFiles.length,
    linesAdded,
    linesRemoved,
    churnRatio: Math.round(churnRatio * 100) / 100,
    complexityDelta: Math.max(0, Math.floor((linesAdded - linesRemoved) / 20)),
    newDependencies: [],
    affectedModules: changedFiles.map((f) => f.split('/')[0] ?? f),
  }
}

async function loadFileChanges(projectRoot: string, changedFiles: string[]): Promise<FileChange[]> {
  const changes: FileChange[] = []
  for (const file of changedFiles) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8')
      changes.push({ path: file, content })
    } catch {
      // unreadable file — skip
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

function detectSimpleConventions(changes: readonly FileChange[]): {
  importStyle: 'named' | 'default' | 'mixed'
} {
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

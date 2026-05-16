/**
 * PR Workflow — generates pull request descriptions, review summaries,
 * and commit organization from expert pipeline results.
 *
 * Turns completed expert work into well-documented, reviewable PRs with
 * conventional commit messages, categorized changes, and quality-aware
 * review summaries.
 */

import type { PipelineResult, QualityReport } from './expert-pipeline.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeCategory = 'feature' | 'fix' | 'refactor' | 'test' | 'docs' | 'chore'

export interface ChangeDescription {
  category: ChangeCategory
  description: string
  filesAffected: string[]
  expertId?: string
}

export interface PRDescription {
  title: string
  summary: string
  changes: ChangeDescription[]
  testPlan: string[]
  reviewNotes: string[]
  labels: string[]
  relatedIssues: string[]
}

export interface PRTemplate {
  format: 'default' | 'conventional' | 'detailed'
  sections: string[]
  includeQuality: boolean
  includeExpertLog: boolean
}

export interface ReviewSummary {
  qualityGrade: string
  testCoverage: string
  riskyChanges: string[]
  suggestions: string[]
  approvalRecommendation: 'approve' | 'request_changes' | 'needs_discussion'
}

export interface PRWorkflowConfig {
  branchNaming: 'conventional' | 'descriptive' | 'task_id'
  autoLabel: boolean
  template: PRTemplate
  draftByDefault: boolean
}

export interface CommitInfo {
  hash?: string
  message: string
  files: string[]
  expertId?: string
}

export interface PRPlan {
  branch: string
  baseBranch: string
  commits: CommitInfo[]
  description: PRDescription
  reviewSummary?: ReviewSummary
}

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: { category: ChangeCategory; filePatterns: RegExp[]; keywordPatterns: RegExp[] }[] = [
  {
    category: 'test',
    filePatterns: [/\.(test|spec)\.\w+$/, /\/__tests__\//],
    keywordPatterns: [/\btest\b/i, /\bspec\b/i],
  },
  {
    category: 'docs',
    filePatterns: [/\.md$/i, /\/docs\//, /\.txt$/i, /CHANGELOG/i, /README/i, /LICENSE/i],
    keywordPatterns: [/\bdocument/i, /\breadme\b/i, /\bchangelog\b/i],
  },
  {
    category: 'fix',
    filePatterns: [],
    keywordPatterns: [/\bfix\b/i, /\bbug\b/i, /\bpatch\b/i, /\bhotfix\b/i, /\bresolve\b/i],
  },
  {
    category: 'refactor',
    filePatterns: [],
    keywordPatterns: [/\brefactor\b/i, /\brestructure\b/i, /\brename\b/i, /\bmove\b/i, /\bcleanup\b/i],
  },
  {
    category: 'chore',
    filePatterns: [/\.config\.\w+$/, /tsconfig/, /\.eslint/, /\.prettier/, /Dockerfile/i, /\.ya?ml$/],
    keywordPatterns: [/\bchore\b/i, /\bci\b/i, /\bbuild\b/i, /\bdeps?\b/i, /\bconfig/i],
  },
  {
    category: 'feature',
    filePatterns: [],
    keywordPatterns: [/\badd\b/i, /\bfeat/i, /\bimplement/i, /\bcreate\b/i, /\bnew\b/i, /\bintroduce\b/i],
  },
]

function detectCategory(file: string, objective: string): ChangeCategory {
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.filePatterns.some(p => p.test(file))) {
      return entry.category
    }
  }
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.keywordPatterns.some(p => p.test(objective))) {
      return entry.category
    }
  }
  return 'feature'
}

function extractScope(files: string[]): string {
  if (files.length === 0) return ''

  const dirs = files.map(f => {
    const parts = f.split('/')
    return parts.length > 1 ? parts[parts.length - 2]! : parts[0]!
  })

  const counts = new Map<string, number>()
  for (const dir of dirs) {
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }

  let topDir = ''
  let topCount = 0
  for (const [dir, count] of counts) {
    if (count > topCount) {
      topDir = dir
      topCount = count
    }
  }

  return topDir
}

// ── PR description generation ─────────────────────────────────────────────────

export function categorizeChanges(files: string[], objective: string): ChangeDescription[] {
  const grouped = new Map<ChangeCategory, string[]>()

  for (const file of files) {
    const cat = detectCategory(file, objective)
    const existing = grouped.get(cat) ?? []
    existing.push(file)
    grouped.set(cat, existing)
  }

  const changes: ChangeDescription[] = []
  for (const [category, filesAffected] of grouped) {
    changes.push({
      category,
      description: describeChangeGroup(category, filesAffected, objective),
      filesAffected,
    })
  }

  return changes
}

function describeChangeGroup(category: ChangeCategory, files: string[], objective: string): string {
  const scope = extractScope(files)
  const prefix = scope ? `${scope}: ` : ''

  switch (category) {
    case 'feature':
      return `${prefix}${objective}`
    case 'fix':
      return `${prefix}Fix: ${objective}`
    case 'refactor':
      return `${prefix}Refactor ${files.length} file(s)`
    case 'test':
      return `${prefix}Add/update tests (${files.length} file(s))`
    case 'docs':
      return `${prefix}Update documentation (${files.length} file(s))`
    case 'chore':
      return `${prefix}Chore: update configuration (${files.length} file(s))`
  }
}

export function generateTitle(objective: string, changes: ChangeDescription[]): string {
  const primaryCategory = changes.length > 0
    ? changes.reduce((best, c) =>
        c.filesAffected.length > best.filesAffected.length ? c : best,
      ).category
    : 'feature'

  const scope = extractScope(changes.flatMap(c => c.filesAffected))
  const scopePart = scope ? `(${scope})` : ''

  const short = objective.length > 60
    ? objective.slice(0, 57) + '...'
    : objective

  const prefix = primaryCategory === 'feature' ? 'feat' : primaryCategory
  return `${prefix}${scopePart}: ${short}`
}

export function generateSummary(
  objective: string,
  changes: ChangeDescription[],
  expertIds: string[],
): string {
  const totalFiles = changes.reduce((sum, c) => sum + c.filesAffected.length, 0)
  const categories = [...new Set(changes.map(c => c.category))]

  const parts: string[] = []
  parts.push(`This PR addresses: **${objective}**.`)
  parts.push('')
  parts.push(`It includes ${totalFiles} file(s) across ${categories.length} change category(ies): ${categories.join(', ')}.`)

  if (expertIds.length > 0) {
    parts.push('')
    parts.push(`Experts involved: ${expertIds.join(', ')}.`)
  }

  return parts.join('\n')
}

export function generateTestPlan(changes: ChangeDescription[]): string[] {
  const plan: string[] = []

  const hasFeature = changes.some(c => c.category === 'feature')
  const hasFix = changes.some(c => c.category === 'fix')
  const hasRefactor = changes.some(c => c.category === 'refactor')
  const hasTest = changes.some(c => c.category === 'test')

  if (hasFeature) {
    plan.push('Verify new feature works as expected')
    plan.push('Check edge cases and error handling')
  }
  if (hasFix) {
    plan.push('Confirm the reported bug is fixed')
    plan.push('Verify no regressions introduced')
  }
  if (hasRefactor) {
    plan.push('Verify existing behavior is preserved after refactoring')
  }
  if (hasTest) {
    plan.push('Run the test suite and confirm all tests pass')
  }

  plan.push('Run linter and type checks')
  plan.push('Review changes for security implications')

  return plan
}

export function suggestLabels(changes: ChangeDescription[]): string[] {
  const labels = new Set<string>()

  for (const change of changes) {
    switch (change.category) {
      case 'feature':
        labels.add('enhancement')
        break
      case 'fix':
        labels.add('bug')
        break
      case 'refactor':
        labels.add('refactor')
        break
      case 'test':
        labels.add('testing')
        break
      case 'docs':
        labels.add('documentation')
        break
      case 'chore':
        labels.add('chore')
        break
    }
  }

  const totalFiles = changes.reduce((sum, c) => sum + c.filesAffected.length, 0)
  if (totalFiles <= 3) labels.add('small')
  else if (totalFiles >= 15) labels.add('large')

  return [...labels]
}

export function suggestReviewers(changes: ChangeDescription[]): string[] {
  const reviewers: string[] = []

  const areas = new Set<string>()
  for (const change of changes) {
    for (const file of change.filesAffected) {
      const topLevel = file.split('/')[0]
      if (topLevel) areas.add(topLevel)
    }
  }

  if (areas.has('src') || areas.has('lib') || areas.has('packages')) {
    reviewers.push('code-owner')
  }
  if (changes.some(c => c.category === 'test')) {
    reviewers.push('qa-team')
  }
  if (changes.some(c => c.category === 'docs')) {
    reviewers.push('docs-team')
  }
  if (changes.some(c => c.filesAffected.some(f => /security|auth|crypto/i.test(f)))) {
    reviewers.push('security-team')
  }

  return reviewers.length > 0 ? reviewers : ['code-owner']
}

export function generatePRDescription(
  objective: string,
  pipelineResult: PipelineResult,
  _config?: PRTemplate,
): PRDescription {
  const allFiles = collectFilesFromPipeline(pipelineResult)
  const expertIds = collectExpertIds(pipelineResult)
  const changes = categorizeChanges(allFiles, objective)

  for (const change of changes) {
    const matchedExpert = expertIds.find(id =>
      change.filesAffected.some(f => f.includes(id.replace(/-/g, ''))),
    )
    if (matchedExpert) change.expertId = matchedExpert
  }

  return {
    title: generateTitle(objective, changes),
    summary: generateSummary(objective, changes, expertIds),
    changes,
    testPlan: generateTestPlan(changes),
    reviewNotes: generateReviewNotes(changes, pipelineResult),
    labels: suggestLabels(changes),
    relatedIssues: [],
  }
}

function generateReviewNotes(changes: ChangeDescription[], pipeline: PipelineResult): string[] {
  const notes: string[] = []

  const riskyFiles = changes
    .flatMap(c => c.filesAffected)
    .filter(f => /security|auth|crypto|password|secret|config/i.test(f))

  if (riskyFiles.length > 0) {
    notes.push(`Security-sensitive files changed: ${riskyFiles.join(', ')}`)
  }

  if (pipeline.qualityReports.length > 0) {
    const avgScore = pipeline.qualityReports.reduce((sum, r) => sum + r.score, 0) / pipeline.qualityReports.length
    notes.push(`Average quality score: ${Math.round(avgScore * 100)}%`)
  }

  if (pipeline.decomposed && pipeline.subTasks.length > 1) {
    notes.push(`Task was decomposed into ${pipeline.subTasks.length} sub-tasks`)
  }

  return notes
}

// ── Review summary generation ─────────────────────────────────────────────────

export function generateReviewSummary(
  qualityReports: QualityReport[],
  changes: ChangeDescription[],
): ReviewSummary {
  const grade = computeOverallGrade(qualityReports)
  const coverage = computeTestCoverage(changes)
  const riskyChanges = identifyRiskyChanges(changes)
  const suggestions = generateSuggestions(qualityReports, changes)

  const summary: ReviewSummary = {
    qualityGrade: grade,
    testCoverage: coverage,
    riskyChanges,
    suggestions,
    approvalRecommendation: 'approve',
  }

  summary.approvalRecommendation = generateApprovalRecommendation(summary)

  return summary
}

function computeOverallGrade(reports: QualityReport[]): string {
  if (reports.length === 0) return 'N/A'

  const avgScore = reports.reduce((sum, r) => sum + r.score, 0) / reports.length

  if (avgScore >= 0.9) return 'A'
  if (avgScore >= 0.75) return 'B'
  if (avgScore >= 0.6) return 'C'
  if (avgScore >= 0.4) return 'D'
  return 'F'
}

function computeTestCoverage(changes: ChangeDescription[]): string {
  const hasTests = changes.some(c => c.category === 'test')
  const hasSource = changes.some(c => c.category === 'feature' || c.category === 'fix')

  if (!hasSource) return 'N/A (no source changes)'
  if (hasTests) return 'Tests included'
  return 'No test changes detected'
}

export function identifyRiskyChanges(changes: ChangeDescription[]): string[] {
  const risks: string[] = []

  for (const change of changes) {
    for (const file of change.filesAffected) {
      if (/security|auth|crypto|password|token|secret/i.test(file)) {
        risks.push(`Security-sensitive file: ${file}`)
      }
      if (/migration|schema|database|db\//i.test(file)) {
        risks.push(`Database change: ${file}`)
      }
      if (/config|\.env|deploy/i.test(file)) {
        risks.push(`Configuration change: ${file}`)
      }
    }

    if (change.filesAffected.length > 10) {
      risks.push(`Large change set in ${change.category}: ${change.filesAffected.length} files`)
    }
  }

  return [...new Set(risks)]
}

function generateSuggestions(
  reports: QualityReport[],
  changes: ChangeDescription[],
): string[] {
  const suggestions: string[] = []

  const hasSource = changes.some(c => c.category === 'feature' || c.category === 'fix')
  const hasTests = changes.some(c => c.category === 'test')

  if (hasSource && !hasTests) {
    suggestions.push('Consider adding tests for the changed functionality')
  }

  const hasDocs = changes.some(c => c.category === 'docs')
  if (hasSource && !hasDocs) {
    suggestions.push('Consider updating documentation for new/changed features')
  }

  if (reports.length > 0) {
    const lowReports = reports.filter(r => r.score < 0.6)
    if (lowReports.length > 0) {
      suggestions.push(`${lowReports.length} quality report(s) scored below 60% — review flagged issues`)
    }
  }

  const totalFiles = changes.reduce((sum, c) => sum + c.filesAffected.length, 0)
  if (totalFiles > 20) {
    suggestions.push('Large PR — consider splitting into smaller, focused PRs')
  }

  return suggestions
}

export function generateApprovalRecommendation(
  summary: ReviewSummary,
): 'approve' | 'request_changes' | 'needs_discussion' {
  if (summary.qualityGrade === 'F' || summary.qualityGrade === 'D') {
    return 'request_changes'
  }

  if (summary.riskyChanges.length > 3) {
    return 'needs_discussion'
  }

  if (summary.testCoverage === 'No test changes detected') {
    return 'needs_discussion'
  }

  return 'approve'
}

// ── PR workflow orchestration ─────────────────────────────────────────────────

export async function createPRPlan(
  objective: string,
  taskId: string,
  pipelineResult: PipelineResult,
  config?: PRWorkflowConfig,
): Promise<PRPlan> {
  const effectiveConfig = config ?? getDefaultWorkflowConfig()
  const template = effectiveConfig.template

  const description = generatePRDescription(objective, pipelineResult, template)
  const changes = description.changes
  const commits = organizeCommits(changes)

  const branch = generateBranchName(objective, taskId, effectiveConfig)
  const baseBranch = 'main'

  let reviewSummary: ReviewSummary | undefined
  if (template.includeQuality && pipelineResult.qualityReports.length > 0) {
    reviewSummary = generateReviewSummary(pipelineResult.qualityReports, changes)
  }

  return {
    branch,
    baseBranch,
    commits,
    description,
    reviewSummary,
  }
}

export function formatPRBody(description: PRDescription, template?: PRTemplate): string {
  const t = template ?? getDefaultTemplate()
  return renderTemplate(t, description)
}

export function formatReviewComment(summary: ReviewSummary): string {
  const lines: string[] = []

  lines.push('## 🔍 Review Summary')
  lines.push('')
  lines.push(`**Quality Grade:** ${summary.qualityGrade}`)
  lines.push(`**Test Coverage:** ${summary.testCoverage}`)
  lines.push(`**Recommendation:** ${formatRecommendation(summary.approvalRecommendation)}`)
  lines.push('')

  if (summary.riskyChanges.length > 0) {
    lines.push('### ⚠️ Risky Changes')
    for (const risk of summary.riskyChanges) {
      lines.push(`- ${risk}`)
    }
    lines.push('')
  }

  if (summary.suggestions.length > 0) {
    lines.push('### 💡 Suggestions')
    for (const suggestion of summary.suggestions) {
      lines.push(`- ${suggestion}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatRecommendation(rec: ReviewSummary['approvalRecommendation']): string {
  switch (rec) {
    case 'approve': return '✅ Approve'
    case 'request_changes': return '❌ Request Changes'
    case 'needs_discussion': return '💬 Needs Discussion'
  }
}

export function generateBranchName(
  objective: string,
  taskId: string,
  config?: PRWorkflowConfig,
): string {
  const naming = config?.branchNaming ?? 'conventional'
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '-')

  switch (naming) {
    case 'task_id':
      return `openagent/${safeTaskId}`

    case 'descriptive': {
      const slug = objective
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 50)
        .replace(/-$/, '')
      return `openagent/${safeTaskId}/${slug}`
    }

    case 'conventional':
    default: {
      const slug = objective
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40)
        .replace(/-$/, '')
      return `feat/${slug}`
    }
  }
}

// ── Commit organization ───────────────────────────────────────────────────────

export function organizeCommits(changes: ChangeDescription[]): CommitInfo[] {
  const commits: CommitInfo[] = []

  for (const change of changes) {
    commits.push({
      message: generateSingleCommitMessage(change),
      files: [...change.filesAffected],
      expertId: change.expertId,
    })
  }

  return commits
}

function generateSingleCommitMessage(change: ChangeDescription): string {
  const scope = extractScope(change.filesAffected)
  const scopePart = scope ? `(${scope})` : ''

  const prefix = change.category === 'feature' ? 'feat' : change.category

  const shortDesc = change.description.length > 60
    ? change.description.slice(0, 57) + '...'
    : change.description

  return `${prefix}${scopePart}: ${shortDesc}`
}

export function generateCommitMessages(commits: CommitInfo[]): string[] {
  return commits.map(c => c.message)
}

export function shouldSquash(commits: CommitInfo[]): boolean {
  if (commits.length <= 3) return false
  if (commits.length > 10) return true

  const smallCommits = commits.filter(c => c.files.length <= 1)
  return smallCommits.length > commits.length * 0.7
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function getDefaultTemplate(): PRTemplate {
  return {
    format: 'default',
    sections: ['summary', 'changes', 'test_plan'],
    includeQuality: false,
    includeExpertLog: false,
  }
}

export function getConventionalTemplate(): PRTemplate {
  return {
    format: 'conventional',
    sections: ['summary', 'changes'],
    includeQuality: false,
    includeExpertLog: false,
  }
}

export function getDetailedTemplate(): PRTemplate {
  return {
    format: 'detailed',
    sections: ['summary', 'changes', 'test_plan', 'review_notes', 'labels', 'quality', 'expert_log'],
    includeQuality: true,
    includeExpertLog: true,
  }
}

export function renderTemplate(
  template: PRTemplate,
  description: PRDescription,
  reviewSummary?: ReviewSummary,
): string {
  const lines: string[] = []

  for (const section of template.sections) {
    switch (section) {
      case 'summary':
        lines.push('## Summary')
        lines.push('')
        lines.push(description.summary)
        lines.push('')
        break

      case 'changes':
        lines.push('## Changes')
        lines.push('')
        for (const change of description.changes) {
          lines.push(`### ${formatCategoryHeader(change.category)}`)
          lines.push('')
          lines.push(change.description)
          lines.push('')
          if (change.filesAffected.length > 0) {
            lines.push('**Files:**')
            for (const file of change.filesAffected) {
              lines.push(`- \`${file}\``)
            }
            lines.push('')
          }
        }
        break

      case 'test_plan':
        if (description.testPlan.length > 0) {
          lines.push('## Test Plan')
          lines.push('')
          for (const step of description.testPlan) {
            lines.push(`- [ ] ${step}`)
          }
          lines.push('')
        }
        break

      case 'review_notes':
        if (description.reviewNotes.length > 0) {
          lines.push('## Review Notes')
          lines.push('')
          for (const note of description.reviewNotes) {
            lines.push(`- ${note}`)
          }
          lines.push('')
        }
        break

      case 'labels':
        if (description.labels.length > 0) {
          lines.push('## Labels')
          lines.push('')
          lines.push(description.labels.map(l => `\`${l}\``).join(', '))
          lines.push('')
        }
        break

      case 'quality':
        if (template.includeQuality && reviewSummary) {
          lines.push(formatReviewComment(reviewSummary))
        }
        break

      case 'expert_log':
        if (template.includeExpertLog) {
          lines.push('## Expert Log')
          lines.push('')
          const experts = description.changes
            .filter(c => c.expertId)
            .map(c => `- **${c.expertId}**: ${c.description}`)
          if (experts.length > 0) {
            lines.push(...experts)
          } else {
            lines.push('_No expert assignments recorded._')
          }
          lines.push('')
        }
        break
    }
  }

  return lines.join('\n').trim()
}

function formatCategoryHeader(category: ChangeCategory): string {
  switch (category) {
    case 'feature': return '✨ Features'
    case 'fix': return '🐛 Bug Fixes'
    case 'refactor': return '♻️ Refactoring'
    case 'test': return '🧪 Tests'
    case 'docs': return '📝 Documentation'
    case 'chore': return '🔧 Chores'
  }
}

// ── Config defaults ───────────────────────────────────────────────────────────

export function getDefaultWorkflowConfig(): PRWorkflowConfig {
  return {
    branchNaming: 'conventional',
    autoLabel: true,
    template: getDefaultTemplate(),
    draftByDefault: false,
  }
}

// ── Pipeline data extraction helpers ──────────────────────────────────────────

function collectFilesFromPipeline(result: PipelineResult): string[] {
  const files = new Set<string>()

  if (result.executionResults?.completedTasks) {
    for (const taskId of result.executionResults.completedTasks) {
      files.add(taskId)
    }
  }

  if (result.plan?.session?.tasks) {
    for (const task of result.plan.session.tasks) {
      if (task.title) files.add(task.title)
    }
  }

  for (const r of result.routing) {
    for (const expert of r.primaryExperts) {
      if (expert.name) files.add(expert.name)
    }
  }

  return [...files]
}

function collectExpertIds(result: PipelineResult): string[] {
  const ids = new Set<string>()

  for (const r of result.routing) {
    for (const expert of r.primaryExperts) {
      ids.add(expert.name)
    }
    for (const expert of r.secondaryExperts) {
      ids.add(expert.name)
    }
  }

  if (result.plan?.session?.tasks) {
    for (const task of result.plan.session.tasks) {
      if (task.agent) ids.add(task.agent)
    }
  }

  return [...ids]
}

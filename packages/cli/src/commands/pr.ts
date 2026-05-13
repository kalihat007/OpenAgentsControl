/**
 * oac pr — PR workflow automation for expert-driven development
 *
 * Generates pull request plans with descriptions, review summaries,
 * commit organization, and formatted output from expert pipeline results.
 *
 * Usage:
 *   oac pr                                 Preview PR plan from current work
 *   oac pr --create                        Output the formatted PR body (ready for `gh pr create`)
 *   oac pr --template default|conventional|detailed
 *   oac pr --draft                         Mark as draft PR
 *   oac pr --review                        Include quality review summary
 */

import type { Command } from 'commander'
import { log, info, success, dim, warn, bold } from '../ui/logger.js'
import { createSpinner } from '../ui/spinner.js'
import { createLogger } from '../lib/logger.js'
import {
  createPRPlan,
  formatPRBody,
  formatReviewComment,
  generateBranchName,
  getDefaultTemplate,
  getConventionalTemplate,
  getDetailedTemplate,
  getDefaultWorkflowConfig,
  type PRPlan,
  type PRTemplate,
  type PRWorkflowConfig,
} from '../lib/pr-workflow.js'
import type { PipelineResult } from '../lib/expert-pipeline.js'

const cmdLog = createLogger('cmd:pr')

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

// ── Command logic ─────────────────────────────────────────────────────────────

export interface PRCommandOptions {
  create: boolean
  template: 'default' | 'conventional' | 'detailed'
  draft: boolean
  review: boolean
  objective?: string
  taskId?: string
}

export async function prCommand(options: PRCommandOptions): Promise<void> {
  cmdLog.debug('Running pr command', options)

  const spinner = createSpinner('Generating PR plan…')
  spinner.start()

  const template = resolveTemplate(options.template)
  if (options.review) {
    template.includeQuality = true
  }

  const pipelineResult = buildMockPipelineResult(options.objective)
  const objective = options.objective ?? pipelineResult.objective
  const taskId = options.taskId ?? `task-${Date.now()}`

  const workflowConfig: PRWorkflowConfig = {
    ...getDefaultWorkflowConfig(),
    template,
    draftByDefault: options.draft,
  }

  const plan = await createPRPlan(objective, taskId, pipelineResult, workflowConfig)

  spinner.succeed('PR plan generated')

  if (options.create) {
    printCreateOutput(plan, template, options.draft)
  } else {
    printPreview(plan, options.draft)
  }
}

// ── Template resolution ───────────────────────────────────────────────────────

function resolveTemplate(name: string): PRTemplate {
  switch (name) {
    case 'conventional':
      return getConventionalTemplate()
    case 'detailed':
      return getDetailedTemplate()
    case 'default':
    default:
      return getDefaultTemplate()
  }
}

// ── Output: Preview mode ──────────────────────────────────────────────────────

function printPreview(plan: PRPlan, isDraft: boolean): void {
  log('')
  bold('  PR Plan Preview')
  log('')

  info('Branch:')
  log(`    ${ANSI.cyan}${plan.branch}${ANSI.reset} → ${plan.baseBranch}`)
  log('')

  if (isDraft) {
    dim('    (draft PR)')
    log('')
  }

  info('Title:')
  log(`    ${ANSI.bold}${plan.description.title}${ANSI.reset}`)
  log('')

  info('Changes:')
  for (const change of plan.description.changes) {
    const icon = categoryIcon(change.category)
    log(`    ${icon} ${ANSI.bold}${change.category}${ANSI.reset}: ${change.description}`)
    for (const file of change.filesAffected) {
      dim(`       ${file}`)
    }
  }
  log('')

  if (plan.commits.length > 0) {
    info(`Commits (${plan.commits.length}):`)
    for (const commit of plan.commits) {
      log(`    • ${commit.message}`)
    }
    log('')
  }

  if (plan.description.testPlan.length > 0) {
    info('Test Plan:')
    for (const step of plan.description.testPlan) {
      log(`    ☐ ${step}`)
    }
    log('')
  }

  if (plan.description.labels.length > 0) {
    info('Labels:')
    log(`    ${plan.description.labels.map(l => `${ANSI.gray}${l}${ANSI.reset}`).join('  ')}`)
    log('')
  }

  if (plan.reviewSummary) {
    info('Review Summary:')
    log(`    Grade: ${plan.reviewSummary.qualityGrade}`)
    log(`    Coverage: ${plan.reviewSummary.testCoverage}`)
    log(`    Recommendation: ${plan.reviewSummary.approvalRecommendation}`)
    log('')
  }

  dim('  Run with --create to output the formatted PR body.')
  log('')
}

// ── Output: Create mode ───────────────────────────────────────────────────────

function printCreateOutput(plan: PRPlan, template: PRTemplate, isDraft: boolean): void {
  log('')
  bold('  PR Ready')
  log('')

  info('Branch:')
  log(`    ${plan.branch} → ${plan.baseBranch}`)
  log('')

  info('Title:')
  log(`    ${plan.description.title}`)
  log('')

  if (isDraft) {
    info('Mode: Draft')
    log('')
  }

  log('─'.repeat(60))
  log('')

  const body = formatPRBody(plan.description, template)
  log(body)

  if (plan.reviewSummary) {
    log('')
    log('─'.repeat(60))
    log('')
    info('Review Comment:')
    log('')
    log(formatReviewComment(plan.reviewSummary))
  }

  log('')
  log('─'.repeat(60))
  log('')
  success('PR body generated. Use with `gh pr create` to create the PR.')
  log('')

  dim(`  Example:`)
  const draftFlag = isDraft ? ' --draft' : ''
  dim(`    gh pr create --title "${plan.description.title}" --body-file <body.md>${draftFlag}`)
  log('')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryIcon(category: string): string {
  switch (category) {
    case 'feature': return '✨'
    case 'fix': return '🐛'
    case 'refactor': return '♻️'
    case 'test': return '🧪'
    case 'docs': return '📝'
    case 'chore': return '🔧'
    default: return '•'
  }
}

function buildMockPipelineResult(objective?: string): PipelineResult {
  return {
    objective: objective ?? 'Expert pipeline work',
    decomposed: false,
    subTasks: [],
    routing: [],
    executionResults: null,
    qualityReports: [],
    memoryUpdated: false,
    duration: 0,
    stages: ['complete'],
    plan: null,
    interactiveSession: null,
    codebaseIndex: null,
  }
}

// ── Commander registration ────────────────────────────────────────────────────

export function registerPRCommand(program: Command): void {
  program
    .command('pr')
    .description('Generate a PR plan from expert work with description and review summary')
    .option('--create', 'Output the formatted PR body (for use with `gh pr create`)', false)
    .option('--template <format>', 'PR template format: default, conventional, detailed', 'default')
    .option('--draft', 'Mark as draft PR', false)
    .option('--review', 'Include quality review summary', false)
    .option('--objective <text>', 'Override the PR objective/description')
    .option('--task-id <id>', 'Task ID for branch naming')
    .addHelpText(
      'after',
      `
Examples:
  oac pr                                 Preview PR plan
  oac pr --create                        Output formatted PR body
  oac pr --template detailed --review    Detailed template with review
  oac pr --draft                         Generate as draft PR
  oac pr --create --template conventional
  oac pr --objective "Add JWT auth"      Specify objective
`,
    )
    .action(async (opts: Record<string, unknown>) => {
      await prCommand({
        create: Boolean(opts['create']),
        template: validateTemplate(opts['template']),
        draft: Boolean(opts['draft']),
        review: Boolean(opts['review']),
        objective: typeof opts['objective'] === 'string' ? opts['objective'] : undefined,
        taskId: typeof opts['taskId'] === 'string' ? opts['taskId'] : undefined,
      })
    })
}

function validateTemplate(value: unknown): 'default' | 'conventional' | 'detailed' {
  if (value === 'conventional' || value === 'detailed') return value
  return 'default'
}

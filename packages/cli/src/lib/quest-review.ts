/**
 * Quest Review Gate — generates review bundles and handles approve/reject logic.
 *
 * When a Quest enters REVIEW state, the daemon pauses and generates a
 * review-bundle.md summarizing changes, risks, and outcomes. The user
 * (or an automated gate) can approve to proceed to VERIFY, or reject
 * to return to EXECUTE for fixes.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { ReconciledQuestRun } from './quest-reconciler.js'

const execAsync = promisify(exec)

export interface ReviewBundle {
  objective: string
  state: string
  tasks: Array<{
    id: string
    title: string
    status: string
    expert: string
  }>
  diff?: {
    stats: string
    files: string[]
  }
  risks: string[]
  changedFiles: string[]
  generatedAt: string
}

export interface ReviewDecision {
  approved: boolean
  reason?: string
  resetFailed: boolean
}

/**
 * Generate a review bundle for the given reconciled quest.
 */
export async function generateReviewBundle(
  projectRoot: string,
  quest: ReconciledQuestRun,
): Promise<ReviewBundle> {
  const changedFiles = quest.changedFiles ?? []

  // Try git diff for rich stats; fallback to file list
  let diffStats: string | undefined
  let diffFiles: string[] = changedFiles

  if (changedFiles.length > 0) {
    try {
      const { stdout } = await execAsync('git diff --stat', {
        cwd: projectRoot,
        timeout: 10000,
      })
      diffStats = stdout.trim()
      // Extract filenames from git diff --stat output
      diffFiles = stdout
        .split('\n')
        .map((line) => line.split('|')[0].trim())
        .filter((f) => f && !f.includes('files changed') && !f.includes('insertion') && !f.includes('deletion'))
    } catch {
      // Not a git repo or git failed — use changedFiles from events
    }
  }

  const risks = assessRisks(quest, diffFiles)

  return {
    objective: quest.objective,
    state: quest.state,
    tasks: quest.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      expert: t.expert,
    })),
    diff: diffStats
      ? {
          stats: diffStats,
          files: diffFiles,
        }
      : undefined,
    risks,
    changedFiles,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Write review-bundle.md to the quest run directory.
 */
export async function persistReviewBundle(
  projectRoot: string,
  questId: string,
  bundle: ReviewBundle,
): Promise<string> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  const path = join(runDir, 'review-bundle.md')

  const lines: string[] = [
    '# Quest Review Bundle',
    '',
    `**Quest:** ${questId}`,
    `**Objective:** ${bundle.objective}`,
    `**State:** ${bundle.state}`,
    `**Generated:** ${bundle.generatedAt}`,
    '',
    '## Tasks',
    '',
    '| ID | Title | Status | Expert |',
    '|----|-------|--------|--------|',
  ]

  for (const task of bundle.tasks) {
    lines.push(`| ${task.id} | ${task.title} | ${task.status} | ${task.expert} |`)
  }

  lines.push('')

  if (bundle.diff) {
    lines.push('## Diff Stats', '', '```', bundle.diff.stats, '```', '')
    lines.push('## Changed Files', '')
    for (const file of bundle.diff.files) {
      lines.push(`- ${file}`)
    }
    lines.push('')
  } else if (bundle.changedFiles.length > 0) {
    lines.push('## Changed Files', '')
    for (const file of bundle.changedFiles) {
      lines.push(`- ${file}`)
    }
    lines.push('')
  } else {
    lines.push('## Changed Files', '', '_No file changes recorded._', '')
  }

  if (bundle.risks.length > 0) {
    lines.push('## Risk Assessment', '')
    for (const risk of bundle.risks) {
      lines.push(`- ⚠️ ${risk}`)
    }
    lines.push('')
  } else {
    lines.push('## Risk Assessment', '', '_No significant risks detected._', '')
  }

  lines.push(
    '## Decision',
    '',
    '```bash',
    `# Approve and proceed to VERIFY`,
    `oac quest-review ${questId} --approve`,
    '',
    `# Reject and return to EXECUTE for fixes`,
    `oac quest-review ${questId} --reject "reason for rejection"`,
    '',
    `# Skip review (requires yolo mode or explicit config)`,
    `oac quest-review ${questId} --skip`,
    '```',
    '',
  )

  await writeFile(path, lines.join('\n'))
  return path
}

/**
 * Assess risks based on changed files and task outcomes.
 */
function assessRisks(quest: ReconciledQuestRun, changedFiles: string[]): string[] {
  const risks: string[] = []

  // Destructive operations
  const hasDeletes = changedFiles.some((f) => f.includes('deleted') || f.includes('removed'))
  if (hasDeletes) {
    risks.push('Files were deleted or removed during this quest.')
  }

  // Secrets / credentials
  const secretPatterns = ['.env', 'secret', 'key', 'token', 'password', 'credential', 'private']
  const touchedSecrets = changedFiles.some((f) => secretPatterns.some((p) => f.toLowerCase().includes(p)))
  if (touchedSecrets) {
    risks.push('Sensitive files (secrets, keys, credentials) were modified.')
  }

  // Configuration changes
  const configPatterns = ['config', 'yaml', 'yml', 'json', 'toml']
  const touchedConfig = changedFiles.some((f) => configPatterns.some((p) => f.toLowerCase().includes(p)))
  if (touchedConfig) {
    risks.push('Configuration files were modified.')
  }

  // Failed tasks
  const failedTasks = quest.tasks.filter((t) => t.status === 'failed')
  if (failedTasks.length > 0) {
    risks.push(`${failedTasks.length} task(s) failed during execution.`)
  }

  // Critical incidents
  const criticalIncidents = quest.incidents.filter((i) => i.severity === 'critical' && i.status === 'open')
  if (criticalIncidents.length > 0) {
    risks.push(`${criticalIncidents.length} critical incident(s) remain open.`)
  }

  return risks
}

/**
 * Determine if review should be auto-approved based on config and quest state.
 */
export function shouldAutoApprove(
  quest: ReconciledQuestRun,
  options: {
    autoApproveOnNoChanges?: boolean
    excludedFor?: string[]
    skipReview?: boolean
    yoloMode?: boolean
  },
): boolean {
  if (options.skipReview || options.yoloMode) return true
  if (options.excludedFor?.includes(quest.intensity)) return true
  if (options.autoApproveOnNoChanges && (quest.changedFiles?.length ?? 0) === 0) return true
  return false
}

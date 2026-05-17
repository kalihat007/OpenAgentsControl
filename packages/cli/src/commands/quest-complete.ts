/**
 * oac quest-complete — Finalize a Quest, generate summary artifacts.
 */

import { type Command } from 'commander'
import { log, info, success, warn, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildStateChangeEvent } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists, writeTaskGraph } from '../lib/quest-run.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestCompleteOptions = {
  force?: boolean
}

// ── Command Handler ───────────────────────────────────────────────────────────

export async function questCompleteCommand(
  questId: string,
  options: QuestCompleteOptions,
): Promise<void> {
  const projectRoot = process.cwd()

  if (!(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  const quest = await loadReconciledQuest(projectRoot, questId)
  if (!quest) {
    throw new CommandUsageError(`Quest '${questId}' has no quest.json.`)
  }

  log('')
  bold(`Quest Complete — ${questId}`)
  log('')
  info(`Objective: ${quest.objective}`)
  info(`State: ${quest.state}`)
  info(`Trust: ${quest.trustLabel}`)
  log('')

  // Gate: verification should have passed
  const verification = quest.verification
  const hasRealVerification =
    verification?.overallPassed === true &&
    verification.forced !== true &&
    verification.noChecks !== true

  if (!hasRealVerification) {
    warn('Quest has not been verified.')
    warn(`Current trust label: ${quest.trustLabel}`)
    if (verification?.forced) {
      warn(`Last verification was forced: ${verification.summary}`)
    }
    if (!options.force) {
      throw new CommandUsageError(
        `Run 'oac quest-verify ${questId}' first, or use --force to complete anyway.`,
      )
    }
    info('--force: completing without verification')
  } else {
    success(`Verification passed: ${verification.summary}`)
  }

  // Count tasks
  const completed = quest.tasks.filter((t) => t.status === 'completed').length
  const failed = quest.tasks.filter((t) => t.status === 'failed').length
  const blocked = quest.tasks.filter((t) => t.status === 'blocked').length
  const pending = quest.tasks.filter((t) => t.status === 'pending').length

  log('')
  info('Task Summary:')
  log(`  Completed: ${completed}`)
  log(`  Failed:    ${failed}`)
  log(`  Blocked:   ${blocked}`)
  log(`  Pending:   ${pending}`)
  log('')

  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })

  // Append completion event
  const event = buildStateChangeEvent(quest.state, 'COMPLETE')
  await appendQuestEvent(projectRoot, questId, event)

  const completedQuest = await loadReconciledQuest(projectRoot, questId)
  const summarySource = completedQuest ?? { ...quest, state: 'COMPLETE' as const }
  const summaryMd = formatFinalSummary(summarySource, completed, failed, blocked, pending)
  const summaryJson = formatFinalSummaryJson(summarySource, completed, failed, blocked, pending)

  await writeFile(join(runDir, 'summary.md'), summaryMd)
  await writeFile(join(runDir, 'summary.json'), JSON.stringify(summaryJson, null, 2) + '\n')

  // Update task-graph with final state
  await writeTaskGraph(
    projectRoot,
    questId,
    quest.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  )

  success('Quest marked COMPLETE')
  dim(`Summary: ${join(runDir, 'summary.md')}`)
  dim(`Summary JSON: ${join(runDir, 'summary.json')}`)
  log('')
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatFinalSummary(
  quest: Awaited<ReturnType<typeof loadReconciledQuest>>,
  completed: number,
  failed: number,
  blocked: number,
  pending: number,
): string {
  if (!quest) return ''

  const lines: string[] = [
    `# Quest Completion Report — ${quest.questId}`,
    '',
    `- **Objective:** ${quest.objective}`,
    `- **Final State:** COMPLETE`,
    `- **Trust Label:** ${quest.trustLabel}`,
    `- **Completed At:** ${new Date().toISOString()}`,
    '',
    '## Task Summary',
    '',
    `- **Completed:** ${completed}`,
    `- **Failed:** ${failed}`,
    `- **Blocked:** ${blocked}`,
    `- **Pending:** ${pending}`,
    '',
    '## Acceptance Criteria',
    '',
  ]

  for (const criterion of quest.acceptanceCriteria) {
    lines.push(`- ${criterion}`)
  }

  if (quest.verification) {
    lines.push('')
    lines.push('## Verification')
    lines.push('')
    lines.push(`- **Result:** ${quest.verification.overallPassed ? 'PASSED' : 'FAILED'}`)
    lines.push(`- **Summary:** ${quest.verification.summary}`)
    lines.push('')
    lines.push('| Check | Status | Command |')
    lines.push('|-------|--------|---------|')
    for (const check of quest.verification.checks) {
      lines.push(`| ${check.name} | ${check.passed ? '✓ PASS' : '✗ FAIL'} | \`${check.command}\` |`)
    }
  }

  lines.push('')
  lines.push('## Changed Files')
  lines.push('')
  if (quest.changedFiles.length === 0) {
    lines.push('_No files recorded as changed._')
  } else {
    for (const f of quest.changedFiles) {
      lines.push(`- \`${f}\``)
    }
  }

  lines.push('')
  lines.push('## Remaining Risks')
  lines.push('')
  if (failed === 0 && blocked === 0) {
    lines.push('_No blocked or failed tasks._')
  } else {
    for (const t of quest.tasks) {
      if (t.status === 'failed' || t.status === 'blocked') {
        lines.push(`- **${t.title}** — \`${t.status}\``)
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}

function formatFinalSummaryJson(
  quest: Awaited<ReturnType<typeof loadReconciledQuest>>,
  completed: number,
  failed: number,
  blocked: number,
  pending: number,
): Record<string, unknown> {
  if (!quest) return {}
  return {
    questId: quest.questId,
    objective: quest.objective,
    finalState: 'COMPLETE',
    trustLabel: quest.trustLabel,
    completedAt: new Date().toISOString(),
    taskSummary: { completed, failed, blocked, pending, total: quest.tasks.length },
    acceptanceCriteria: quest.acceptanceCriteria,
    verification: quest.verification,
    changedFiles: quest.changedFiles,
    remainingRisks:
      failed === 0 && blocked === 0
        ? []
        : quest.tasks
            .filter((t) => t.status === 'failed' || t.status === 'blocked')
            .map((t) => ({ id: t.id, title: t.title, status: t.status })),
  }
}

// ── Commander Registration ────────────────────────────────────────────────────

export function registerQuestCompleteCommand(program: Command): void {
  program
    .command('quest-complete <quest-id>')
    .description('Finalize a Quest, generate summary artifacts, and mark COMPLETE')
    .option('--force', 'Complete even if verification has not passed', false)
    .action(async (questId: string, opts: { force?: boolean }) => {
      await questCompleteCommand(questId, { force: opts.force ?? false })
    })
}

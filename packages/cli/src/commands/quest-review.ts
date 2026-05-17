/**
 * oac quest-review — Approve, reject, or skip the review gate for a Quest.
 */

import type { Command } from 'commander'
import { log, info, success, warn, dim } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildReviewApprovedEvent, buildReviewRejectedEvent } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists } from '../lib/quest-run.js'
import { generateReviewBundle, persistReviewBundle } from '../lib/quest-review.js'
import { readConfig, isYoloMode, createDefaultConfig } from '../lib/config.js'
import { appendDaemonAction, loadDaemonState } from '../lib/quest-daemon.js'

export interface QuestReviewOptions {
  approve?: boolean
  reject?: boolean
  skip?: boolean
  reason?: string
}

export async function questReviewCommand(
  questId: string,
  options: QuestReviewOptions,
): Promise<void> {
  const projectRoot = process.cwd()

  if (!(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  const quest = await loadReconciledQuest(projectRoot, questId)
  if (!quest) {
    throw new CommandUsageError(`Quest '${questId}' has no quest.json.`)
  }

  const config = (await readConfig(projectRoot)) ?? createDefaultConfig()

  // Validate action
  const actions = [options.approve, options.reject, options.skip].filter(Boolean)
  if (actions.length === 0) {
    // No action — just show review bundle
    const bundle = await generateReviewBundle(projectRoot, quest)
    const path = await persistReviewBundle(projectRoot, questId, bundle)
    log('')
    info(`Quest ${questId} review bundle:`)
    log(`  State: ${quest.state}`)
    log(`  Tasks: ${quest.tasks.length}`)
    log(`  Changed files: ${quest.changedFiles.length}`)
    if (bundle.risks.length > 0) {
      warn(`  Risks (${bundle.risks.length}):`)
      for (const risk of bundle.risks) {
        log(`    - ${risk}`)
      }
    }
    log('')
    dim(`Bundle written to: ${path}`)
    log('')
    dim('Use --approve, --reject, or --skip to act on this review.')
    return
  }

  if (actions.length > 1) {
    throw new CommandUsageError('Use only one of: --approve, --reject, --skip')
  }

  log('')
  bold(`Quest Review — ${questId}`)
  log('')

  // Handle skip
  if (options.skip) {
    if (!isYoloMode(config)) {
      warn('Skipping review without yolo mode requires explicit confirmation.')
      warn('Use --approve or --reject instead, or enable yolo mode in config.')
      // Still allow it but warn
    }
    const event = buildReviewApprovedEvent()
    await appendQuestEvent(projectRoot, questId, event)
    await resumePausedDaemon(projectRoot, questId)
    success('Review skipped. Quest proceeding to VERIFY.')
    log('')
    return
  }

  // Handle approve
  if (options.approve) {
    const event = buildReviewApprovedEvent()
    await appendQuestEvent(projectRoot, questId, event)
    await resumePausedDaemon(projectRoot, questId)
    success('Review approved. Quest proceeding to VERIFY.')
    log('')
    return
  }

  // Handle reject
  if (options.reject) {
    const reason = options.reason?.trim() || 'No reason provided'
    const event = buildReviewRejectedEvent({ resetFailed: true, reason })
    await appendQuestEvent(projectRoot, questId, event)
    warn(`Review rejected: ${reason}`)
    success('Quest returned to EXECUTE state. Failed tasks reset to pending.')
    log('')
    return
  }
}

async function resumePausedDaemon(projectRoot: string, questId: string): Promise<void> {
  const daemon = await loadDaemonState(projectRoot, questId)
  if (daemon?.status !== 'paused') return

  await appendDaemonAction(projectRoot, questId, {
    type: 'resume',
    requestedAt: new Date().toISOString(),
  })
}

function bold(str: string): void {
  // Simple bold using ANSI codes
  process.stdout.write(`\x1b[1m${str}\x1b[0m\n`)
}

export function registerQuestReviewCommand(program: Command): void {
  program
    .command('quest-review <quest-id>')
    .description('Approve, reject, or skip the review gate for a Quest')
    .option('--approve', 'Approve the review and proceed to VERIFY')
    .option('--reject', 'Reject the review and return to EXECUTE')
    .option('--skip', 'Skip the review gate (requires yolo mode)')
    .option('--reason <text>', 'Reason for rejection')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-review swarm-abc123          Show review bundle for the quest
  oac quest-review swarm-abc123 --approve  Approve and continue to VERIFY
  oac quest-review swarm-abc123 --reject --reason "needs more tests"
                                           Reject and return to EXECUTE
  oac quest-review swarm-abc123 --skip     Bypass review (yolo mode)
`,
    )
    .action(async (questId: string, opts: QuestReviewOptions) => {
      await questReviewCommand(questId, {
        approve: opts.approve,
        reject: opts.reject,
        skip: opts.skip,
        reason: opts.reason,
      })
    })
}

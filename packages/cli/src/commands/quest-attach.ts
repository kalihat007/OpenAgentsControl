/**
 * oac quest-attach — Attach to a background Quest run and monitor progress.
 */

import type { Command } from 'commander'
import { log, info, success, warn, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { listQuestRunIds, readRunPid, isRunPidAlive } from '../lib/quest-run.js'
import { loadReconciledQuest } from '../lib/quest-reconciler.js'

export async function questAttachCommand(questId: string | undefined): Promise<void> {
  const projectRoot = process.cwd()
  const runIds = await listQuestRunIds(projectRoot)

  if (!questId) {
    throw new CommandUsageError('Provide a Quest id. Example: oac quest-attach quest-20260101-001')
  }

  if (!runIds.includes(questId)) {
    throw new CommandUsageError(
      `Quest '${questId}' not found. Available: ${runIds.slice(0, 5).join(', ')}${runIds.length > 5 ? '…' : ''}`,
    )
  }

  log('')
  bold(`Quest Attach — ${questId}`)
  log('')

  const pid = await readRunPid(projectRoot, questId)

  if (pid && isRunPidAlive(pid)) {
    info(`Background runtime is running (pid ${pid})`)
    info('Polling for completion (Ctrl+C to detach without stopping)...')
    log('')

    // Poll until process exits
    while (isRunPidAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    success('Background runtime finished')
    log('')
  } else if (pid) {
    dim('Background runtime has already finished.')
    log('')
  } else {
    dim('No background runtime PID recorded for this quest.')
    log('')
  }

  // Show final reconciled state
  const quest = await loadReconciledQuest(projectRoot, questId)
  if (quest) {
    info(`State: ${quest.state}`)
    info(`Trust: ${quest.trustLabel}`)
    const completed = quest.tasks.filter((t) => t.status === 'completed').length
    const failed = quest.tasks.filter((t) => t.status === 'failed').length
    const blocked = quest.tasks.filter((t) => t.status === 'blocked').length
    info(`Tasks: ${completed}/${quest.tasks.length} completed`)
    if (failed > 0) warn(`Failed: ${failed}`)
    if (blocked > 0) warn(`Blocked: ${blocked}`)
    log('')
    info('Next action:')
    log(`  ${quest.nextSuggestedAction}`)
  } else {
    warn('Could not load reconciled quest state.')
  }

  log('')
}

export function registerQuestAttachCommand(program: Command): void {
  program
    .command('quest-attach <quest-id>')
    .description('Attach to a background Quest run and monitor until completion')
    .action(async (questId: string) => {
      await questAttachCommand(questId)
    })
}

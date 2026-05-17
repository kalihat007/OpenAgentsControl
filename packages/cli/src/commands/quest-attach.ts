/**
 * oac quest-attach — Attach to a background Quest daemon and monitor progress.
 *
 * Interactive controls (when daemon is running):
 *   p = pause daemon
 *   r = resume daemon
 *   c = cancel active task
 *   R = retry failed/blocked task (interactive selection)
 *   q = quit attach (detach without stopping daemon)
 */

import type { Command } from 'commander'
import { log, info, success, warn, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { listQuestRunIds } from '../lib/quest-run.js'
import { loadReconciledQuest } from '../lib/quest-reconciler.js'
import { loadDaemonState, appendDaemonAction, type QuestDaemonState } from '../lib/quest-daemon.js'

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

  // Try daemon first; fall back to legacy PID check
  let daemon = await loadDaemonState(projectRoot, questId)

  if (daemon) {
    if (daemon.status === 'running' || daemon.status === 'paused') {
      info(`Daemon is ${daemon.status} (pid ${daemon.pid})`)
      info('Polling for completion...')
      printControls()
      log('')

      await pollDaemonInteractive(projectRoot, questId, daemon)
    } else if (daemon.status === 'crashed' || daemon.status === 'recovering' || daemon.status === 'blocked') {
      warn(`Daemon state: ${daemon.status}`)
      if (daemon.lastError) warn(`Last error: ${daemon.lastError}`)
      log('')
    } else if (daemon.status === 'complete') {
      success('Daemon completed')
      log('')
    } else if (daemon.status === 'cancelled') {
      warn('Daemon was cancelled')
      log('')
    } else if (daemon.status === 'spawned') {
      dim('Daemon is spawning...')
      log('')
    }
  } else {
    dim('No daemon state found for this quest.')
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

function printControls(): void {
  dim('Controls: [p]ause  [r]esume  [c]ancel task  [R]etry task  [q]uit attach')
}

async function pollDaemonInteractive(
  projectRoot: string,
  questId: string,
  initial: QuestDaemonState,
): Promise<void> {
  let lastStatus = initial.status
  let lastActiveTask = initial.activeTask
  let lastProgress = initial.progress
  let quitting = false

  // Set up raw keyboard input
  const stdin = process.stdin
  const isTty = stdin.isTTY

  if (isTty) {
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
  }

  const keyHandler = async (key: string): Promise<void> => {
    if (key === '\u0003') {
      // Ctrl+C
      quitting = true
      return
    }

    switch (key) {
      case 'q':
      case 'Q':
        quitting = true
        info('Detaching...')
        break

      case 'p':
      case 'P':
        try {
          await appendDaemonAction(projectRoot, questId, {
            type: 'pause',
            requestedAt: new Date().toISOString(),
          })
          dim('→ pause queued')
        } catch (err) {
          warn(`Failed to queue pause: ${err instanceof Error ? err.message : String(err)}`)
        }
        break

      case 'r':
        try {
          await appendDaemonAction(projectRoot, questId, {
            type: 'resume',
            requestedAt: new Date().toISOString(),
          })
          dim('→ resume queued')
        } catch (err) {
          warn(`Failed to queue resume: ${err instanceof Error ? err.message : String(err)}`)
        }
        break

      case 'c':
      case 'C': {
        const daemon = await loadDaemonState(projectRoot, questId)
        const activeTask = daemon?.activeTask
        if (activeTask) {
          try {
            await appendDaemonAction(projectRoot, questId, {
              type: 'cancel_task',
              taskId: activeTask,
              requestedAt: new Date().toISOString(),
            })
            dim(`→ cancel queued for ${activeTask}`)
          } catch (err) {
            warn(`Failed to queue cancel: ${err instanceof Error ? err.message : String(err)}`)
          }
        } else {
          dim('No active task to cancel')
        }
        break
      }

      case 'R': {
        const quest = await loadReconciledQuest(projectRoot, questId)
        const retryable = quest?.tasks.filter(
          (t) => t.status === 'failed' || t.status === 'blocked' || t.status === 'cancelled',
        )
        if (!retryable || retryable.length === 0) {
          dim('No failed/blocked/cancelled tasks to retry')
          break
        }
        // Interactive selection not available in raw mode — pick first
        const target = retryable[0]
        try {
          await appendDaemonAction(projectRoot, questId, {
            type: 'rerun_task',
            taskId: target.id,
            requestedAt: new Date().toISOString(),
          })
          dim(`→ retry queued for ${target.id} (+ dependents)`)
        } catch (err) {
          warn(`Failed to queue retry: ${err instanceof Error ? err.message : String(err)}`)
        }
        break
      }
    }
  }

  const dataHandler = (chunk: string): void => {
      for (const char of chunk) {
        keyHandler(char).catch(() => {})
      }
      if (quitting) {
        stdin.setRawMode(false)
        stdin.pause()
      }
  }

  if (isTty) {
    stdin.on('data', dataHandler)
  }

  // Polling loop
  while (!quitting) {
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const daemon = await loadDaemonState(projectRoot, questId)
    if (!daemon) {
      dim('Daemon state disappeared — detached.')
      log('')
      break
    }

    // Detect state changes
    if (daemon.status !== lastStatus) {
      if (daemon.status === 'crashed') {
        warn(`Daemon crashed: ${daemon.lastError ?? 'unknown error'}`)
      } else if (daemon.status === 'recovering') {
        info('Daemon is recovering...')
      } else if (daemon.status === 'blocked') {
        warn(`Daemon blocked: ${daemon.lastError ?? 'quality gate or runtime intervention required'}`)
        break
      } else if (daemon.status === 'complete') {
        success('Daemon completed')
        break
      } else if (daemon.status === 'cancelled') {
        warn('Daemon was cancelled')
        break
      } else if (daemon.status === 'paused') {
        info('Daemon paused')
        printControls()
      } else if (daemon.status === 'running' && lastStatus === 'paused') {
        info('Daemon resumed')
        printControls()
      }
      lastStatus = daemon.status
    }

    // Show progress deltas
    if (daemon.activeTask !== lastActiveTask || daemon.progress !== lastProgress) {
      info(`Active: ${daemon.activeTask ?? 'none'} — ${Math.round((daemon.progress ?? 0) * 100)}%`)
      lastActiveTask = daemon.activeTask
      lastProgress = daemon.progress
    }

    // Poll completion
    if (daemon.status === 'complete' || daemon.status === 'cancelled') {
      break
    }

    // Check if process is actually dead without state update (unclean exit)
    if (daemon.pid) {
      try {
        process.kill(daemon.pid, 0)
      } catch {
        if (daemon.status === 'running' || daemon.status === 'spawned') {
          warn('Daemon process terminated unexpectedly (unclean exit)')
          break
        }
      }
    }
  }

  // Cleanup
  if (isTty) {
    stdin.setRawMode(false)
    stdin.pause()
    stdin.off('data', dataHandler)
  }
}

export function registerQuestAttachCommand(program: Command): void {
  program
    .command('quest-attach <quest-id>')
    .description('Attach to a background Quest daemon and monitor until completion')
    .action(async (questId: string) => {
      await questAttachCommand(questId)
    })
}

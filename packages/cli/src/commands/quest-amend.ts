/**
 * oac quest-amend — Amend an active or completed Quest with new requirements.
 */

import { type Command } from 'commander'
import { log, info, success, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildAmendmentEvent, buildStateChangeEvent, buildTaskUpdateEvent, buildTaskInjectedEvent, buildPriorityChangedEvent } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists } from '../lib/quest-run.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestAmendOptions = {
  objective?: string
  addTask?: string
  dependsOn?: string[]
  priority?: number
}

// ── Command Handler ───────────────────────────────────────────────────────────

export async function questAmendCommand(
  questId: string,
  amendmentText: string,
  options: QuestAmendOptions,
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
  bold(`Quest Amend — ${questId}`)
  log('')
  info(`Current objective: ${quest.objective}`)
  info(`Current state: ${quest.state}`)
  log('')
  info('Amendment:')
  log(`  ${amendmentText}`)
  log('')

  // Build amendment event
  const event = buildAmendmentEvent(options.objective || quest.objective, amendmentText)
  await appendQuestEvent(projectRoot, questId, event)
  success('Amendment recorded in events.ndjson')

  // Update objective if provided
  if (options.objective && options.objective !== quest.objective) {
    info(`Objective updated: ${quest.objective} → ${options.objective}`)
  }

  // Add new task if requested
  if (options.addTask) {
    const taskId = `amend-${Date.now()}`

    // v8: use task.injected for richer metadata; v7 fallback to task_update
    if (quest.version === '8') {
      const injectedEvent = buildTaskInjectedEvent(taskId, options.addTask, {
        expert: 'auto',
        dependsOn: options.dependsOn,
        priority: options.priority ?? 3,
        status: 'pending',
        injectedBy: 'user',
        reason: amendmentText,
      })
      await appendQuestEvent(projectRoot, questId, injectedEvent)
    } else {
      const taskEvent = buildTaskUpdateEvent(taskId, 'pending', {
        title: options.addTask,
      })
      await appendQuestEvent(projectRoot, questId, taskEvent)

      if (options.dependsOn && options.dependsOn.length > 0) {
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'task_update',
          data: {
            taskId,
            dependsOn: options.dependsOn,
          },
        })
      }
    }

    success(`Added pending task: ${options.addTask} (${taskId})`)
    if (options.dependsOn && options.dependsOn.length > 0) {
      dim(`  Dependencies: ${options.dependsOn.join(', ')}`)
    }
    if (options.priority !== undefined) {
      dim(`  Priority: ${options.priority}`)
    }
  }

  // Change priority of existing task if specified without add-task
  if (options.priority !== undefined && !options.addTask) {
    // Find most recently added pending task and change its priority
    const pendingTasks = quest.tasks.filter((t) => t.status === 'pending')
    if (pendingTasks.length > 0) {
      const target = pendingTasks[pendingTasks.length - 1]
      const priorityEvent = buildPriorityChangedEvent(target.id, options.priority)
      await appendQuestEvent(projectRoot, questId, priorityEvent)
      success(`Priority changed for task ${target.id}: ${target.priority ?? 3} → ${options.priority}`)
    }
  }

  // If quest was COMPLETE or WAITING, bump back to EXECUTE
  if (quest.state === 'COMPLETE' || quest.state === 'WAITING') {
    const stateEvent = buildStateChangeEvent(quest.state, 'EXECUTE')
    await appendQuestEvent(projectRoot, questId, stateEvent)
    success(`State changed: ${quest.state} → EXECUTE`)
  }

  log('')
  dim(`Run 'oac quest-status ${questId}' to see updated state.`)
  log('')
}

// ── Commander Registration ────────────────────────────────────────────────────

export function registerQuestAmendCommand(program: Command): void {
  program
    .command('quest-amend <quest-id> <amendment-text>')
    .description('Amend a Quest with new requirements (updates events, adds tasks)')
    .option('--objective <text>', 'Update the quest objective')
    .option('--add-task <title>', 'Add a new pending task')
    .option('--depends-on <ids>', 'Comma-separated task IDs this new task depends on', (val: string) => val.split(',').map((s) => s.trim()).filter(Boolean))
    .option('--priority <n>', 'Set task priority (1=highest, 5=lowest)', (val: string) => parseInt(val, 10))
    .action(
      async (
        questId: string,
        amendmentText: string,
        opts: { objective?: string; addTask?: string; dependsOn?: string[]; priority?: number },
      ) => {
        await questAmendCommand(questId, amendmentText, {
          objective: opts.objective,
          addTask: opts.addTask,
          dependsOn: opts.dependsOn,
          priority: opts.priority,
        })
      },
    )
}

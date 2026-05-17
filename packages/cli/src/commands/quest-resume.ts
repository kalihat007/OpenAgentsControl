/**
 * oac quest-resume — Print runtime commands and prompt for a durable Quest.
 */

import type { Command } from 'commander'
import { log, info, success, dim } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { listQuestRunIds, loadQuestRun } from '../lib/quest-run.js'

export async function questResumeCommand(questId: string | undefined): Promise<void> {
  const projectRoot = process.cwd()
  const runIds = await listQuestRunIds(projectRoot)

  if (!questId) {
    throw new CommandUsageError('Provide a Quest id. Example: oac quest-resume swarm-m123abc')
  }

  if (!runIds.includes(questId)) {
    throw new CommandUsageError(
      `Quest '${questId}' not found. Available: ${runIds.slice(0, 5).join(', ')}${runIds.length > 5 ? '…' : ''}`,
    )
  }

  const quest = await loadQuestRun(projectRoot, questId)
  if (!quest) {
    throw new CommandUsageError(
      `Quest '${questId}' is a legacy run without quest.json. Use oac swarm-status ${questId} for details.`,
    )
  }

  log('')
  success(`Resume OpenAgent Quest ${quest.questId}`)
  log('')
  info('Start one runtime:')
  log(`  OpenCode: ${quest.runtimes.opencode.command}`)
  log(`  Kimi:     ${quest.runtimes.kimi.command}`)
  log(`  Claude:   ${quest.runtimes.claude.command}`)
  log('')
  info('Paste this prompt:')
  log(`  ${quest.runtimes.opencode.resumePrompt}`)
  log('')
  dim(`Artifacts: ${quest.artifacts.runDir}/quest.json`)
  dim('The selected runtime/model stays in control; no LLM routing or hidden fallback is used.')
}

export function registerQuestResumeCommand(program: Command): void {
  program
    .command('quest-resume <quest-id>')
    .description('Print OpenCode, Kimi, and Claude resume commands for a durable OpenAgent Quest')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-resume swarm-m123abc
`,
    )
    .action(async (questId: string | undefined) => {
      await questResumeCommand(questId)
    })
}

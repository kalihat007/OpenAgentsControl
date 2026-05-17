/**
 * oac quest-resume — Print runtime commands and prompt for a durable Quest.
 */

import type { Command } from 'commander'
import { log, info, success, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { listQuestRunIds, loadQuestRun, formatRuntimeHandoff } from '../lib/quest-run.js'
import { formatAllAgentMemoryForPrompt, loadAgentMemory } from '../lib/agent-memory.js'

export type QuestResumeOptions = {
  runtime?: 'opencode' | 'kimi' | 'claude'
}

export async function questResumeCommand(
  questId: string | undefined,
  options: QuestResumeOptions = {},
): Promise<void> {
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

  if (options.runtime) {
    const memory = await loadAgentMemory(projectRoot, questId)
    log('')
    bold(`Resume ${options.runtime.toUpperCase()}`)
    log('')
    log(formatRuntimeHandoff(quest, options.runtime))
    const memoryPrompt = formatAllAgentMemoryForPrompt(memory)
    if (memoryPrompt) {
      log('')
      log(memoryPrompt)
    }
    log('')
    return
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
  const memory = await loadAgentMemory(projectRoot, quest.questId)
  const memoryPrompt = formatAllAgentMemoryForPrompt(memory)
  if (memoryPrompt) {
    log('')
    info('Memory context:')
    for (const line of memoryPrompt.split('\n').slice(0, 12)) {
      log(`  ${line}`)
    }
  }
  log('')
  dim(`Artifacts: ${quest.artifacts.runDir}/quest.json`)
  dim('The selected runtime/model stays in control; no LLM routing or hidden fallback is used.')
}

export function registerQuestResumeCommand(program: Command): void {
  program
    .command('quest-resume <quest-id>')
    .description('Print OpenCode, Kimi, and Claude resume commands for a durable OpenAgent Quest')
    .option('--runtime <name>', 'Show handoff for a single runtime (opencode, kimi, claude)')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-resume swarm-m123abc
  oac quest-resume swarm-m123abc --runtime kimi
`,
    )
    .action(async (questId: string | undefined, opts: { runtime?: string }) => {
      const runtime = opts.runtime
        ? (opts.runtime as 'opencode' | 'kimi' | 'claude')
        : undefined
      if (runtime && !['opencode', 'kimi', 'claude'].includes(runtime)) {
        throw new CommandUsageError(
          `Invalid runtime '${runtime}'. Choose: opencode, kimi, claude`,
        )
      }
      await questResumeCommand(questId, { runtime })
    })
}

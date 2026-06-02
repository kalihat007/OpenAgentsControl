/**
 * oac quest-replay - show replayable Quest v18 evidence.
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CommandUsageError } from '../lib/errors.js'
import { questExists } from '../lib/quest-run.js'
import { refreshQuestCodingIntelligence } from '../lib/quest-coding-intelligence.js'
import { info, log, success } from '../ui/logger.js'

export interface QuestReplayOptions {
  json?: boolean
  refresh?: boolean
}

export async function questReplayCommand(
  questId: string,
  options: QuestReplayOptions = {},
): Promise<void> {
  const projectRoot = process.cwd()
  if (!(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  if (options.refresh) {
    await refreshQuestCodingIntelligence(projectRoot, {
      questId,
      reason: 'quest-replay.command',
    })
  }

  const runDir = join(projectRoot, '.oac', 'runs', questId)
  const reliabilityPath = join(runDir, 'runtime-reliability-os.json')
  const replayPath = join(runDir, 'evidence-replay.md')

  if (options.json) {
    const raw = await readFile(reliabilityPath, 'utf-8').catch(() => '')
    if (!raw) {
      throw new CommandUsageError(`Quest '${questId}' does not have runtime-reliability-os.json yet. Run: oac quest-replay ${questId} --refresh`)
    }
    log(raw.trim())
    return
  }

  const markdown = await readFile(replayPath, 'utf-8').catch(() => '')
  if (!markdown) {
    throw new CommandUsageError(`Quest '${questId}' does not have evidence-replay.md yet. Run: oac quest-replay ${questId} --refresh`)
  }

  success(`Quest replay evidence: ${questId}`)
  info(`Artifact: ${replayPath}`)
  log('')
  log(markdown.trim())
  log('')
}

export function registerQuestReplayCommand(program: Command): void {
  program
    .command('quest-replay <quest-id>')
    .description('Show Quest v18 replayable evidence, claim ledger, and recovery guidance')
    .option('--json', 'Print runtime-reliability-os.json', false)
    .option('--refresh', 'Refresh v9-v19 sidecars before printing replay evidence', false)
    .addHelpText(
      'after',
      `
Examples:
  oac quest-replay swarm-abc123
  oac quest-replay swarm-abc123 --refresh
  oac quest-replay swarm-abc123 --json
`,
    )
    .action(async (questId: string, opts: QuestReplayOptions) => {
      await questReplayCommand(questId, opts)
    })
}

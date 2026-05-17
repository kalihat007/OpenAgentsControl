/**
 * oac quest-status — List and inspect durable OpenAgent Quest v3 runs.
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log, info, success, dim, warn } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { createLogger } from '../lib/logger.js'
import { listQuestRunIds, loadQuestRun, type QuestRun } from '../lib/quest-run.js'

const cmdLog = createLogger('cmd:quest-status')

interface RunSummary {
  objective?: string
  executionMode?: string | null
  acceptance?: { passed: number; failed: number; unverified: number }
  qualityGate?: { passed: boolean; overallScore: number; grade: string } | null
}

interface SwarmEvent {
  type: string
  message: string
}

export async function questStatusCommand(questId?: string): Promise<void> {
  const projectRoot = process.cwd()
  const runIds = await listQuestRunIds(projectRoot)

  cmdLog.debug('quest-status', { questId, runCount: runIds.length })

  if (runIds.length === 0) {
    warn('No Quest runs found.')
    dim('  Run `oac experts --plan-only "<objective>"` or `oac experts --run --live "<objective>"` first.')
    return
  }

  if (!questId) {
    log('')
    info(`OpenAgent Quest runs (${runIds.length}):`)
    log('')
    for (const id of runIds.slice(0, 20)) {
      const quest = await loadQuestRun(projectRoot, id)
      const summary = quest ? null : await loadSummary(projectRoot, id)
      log(`  ${id}`)
      if (quest) {
        dim(`    ${truncate(quest.objective, 72)}`)
        dim(`    ${quest.state} · ${quest.scenario} · ${quest.intensity} · ${quest.trustLabel}`)
      } else if (summary) {
        dim(`    ${truncate(summary.objective ?? '(legacy run)', 72)}`)
        dim(`    legacy · ${summary.executionMode ?? 'plan-only'}${formatAcceptance(summary)}`)
      } else {
        dim('    legacy · no quest.json')
      }
    }
    if (runIds.length > 20) {
      dim(`  ... ${runIds.length - 20} more — use oac quest-status <quest-id>`)
    }
    log('')
    dim('Pass a Quest id for full details: oac quest-status <quest-id>')
    return
  }

  if (!runIds.includes(questId)) {
    throw new CommandUsageError(
      `Quest '${questId}' not found. Available: ${runIds.slice(0, 5).join(', ')}${runIds.length > 5 ? '…' : ''}`,
    )
  }

  const quest = await loadQuestRun(projectRoot, questId)
  const summary = await loadSummary(projectRoot, questId)
  const events = await loadEvents(projectRoot, questId)

  log('')
  success(`Quest: ${questId}`)
  log('')

  if (quest) {
    printQuest(quest)
  } else {
    warn('This is a legacy run without quest.json.')
  }

  if (summary) {
    info('Run Summary:')
    if (summary.executionMode) log(`  Mode: ${summary.executionMode}`)
    if (summary.acceptance) {
      log(`  Acceptance: ${summary.acceptance.passed} passed, ${summary.acceptance.failed} failed, ${summary.acceptance.unverified} unverified`)
    }
    if (summary.qualityGate) {
      const gate = summary.qualityGate
      log(`  Quality gate: ${gate.passed ? 'PASSED' : 'FAILED'} (${gate.overallScore}/100, grade ${gate.grade})`)
    }
    log('')
  }

  if (events.length > 0) {
    info(`Recent events (last ${Math.min(events.length, 10)} of ${events.length}):`)
    for (const event of events.slice(-10)) {
      dim(`  [${event.type}] ${event.message}`)
    }
    log('')
  }

  dim(`Artifacts: ${join(process.cwd(), '.oac', 'runs', questId)}`)
}

function printQuest(quest: QuestRun): void {
  info('Quest v3:')
  log(`  Objective: ${quest.objective}`)
  log(`  State: ${quest.state}`)
  log(`  Scenario: ${quest.scenario}`)
  log(`  Intensity: ${quest.intensity}`)
  log(`  Trust Label: ${quest.trustLabel}`)
  log(`  Updated: ${quest.updatedAt}`)
  log('')

  if (quest.experts.length > 0) {
    info(`Experts (${quest.experts.length}):`)
    log(`  ${quest.experts.map((expert) => `${expert.name}(${expert.role})`).join(', ')}`)
    log('')
  }

  if (quest.tasks.length > 0) {
    info(`Tasks (${quest.tasks.length}):`)
    for (const task of quest.tasks.slice(0, 10)) {
      log(`  ${task.status}: ${task.id} · ${task.expert} · ${truncate(task.title, 80)}`)
    }
    if (quest.tasks.length > 10) dim(`  ... ${quest.tasks.length - 10} more task(s)`)
    log('')
  }

  info('Resume:')
  log(`  OpenCode: ${quest.runtimes.opencode.command}`)
  log(`  Kimi:     ${quest.runtimes.kimi.command}`)
  log(`  Claude:   ${quest.runtimes.claude.command}`)
  dim(`  Prompt: ${quest.runtimes.opencode.resumePrompt}`)
  log('')
}

async function loadSummary(projectRoot: string, runId: string): Promise<RunSummary | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', runId, 'summary.json'), 'utf-8')
    return JSON.parse(raw) as RunSummary
  } catch {
    return null
  }
}

async function loadEvents(projectRoot: string, runId: string): Promise<SwarmEvent[]> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', runId, 'events.ndjson'), 'utf-8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SwarmEvent)
  } catch {
    return []
  }
}

function formatAcceptance(summary: RunSummary): string {
  if (!summary.acceptance) return ''
  return ` · ${summary.acceptance.passed}p/${summary.acceptance.failed}f/${summary.acceptance.unverified}u`
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

export function registerQuestStatusCommand(program: Command): void {
  program
    .command('quest-status [quest-id]')
    .description('List or inspect durable OpenAgent Quest v3 runs under .oac/runs/')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-status                      List recent Quest runs
  oac quest-status swarm-m123abc        Show Quest state, tasks, artifacts, and resume commands
`,
    )
    .action(async (questId: string | undefined) => {
      await questStatusCommand(questId)
    })
}

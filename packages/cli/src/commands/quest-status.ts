/**
 * oac quest-status — List and inspect durable OpenAgent Quest v4 runs.
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log, info, success, dim, warn, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { createLogger } from '../lib/logger.js'
import { listQuestRunIds } from '../lib/quest-run.js'
import { loadReconciledQuest, type ReconciledQuestRun } from '../lib/quest-reconciler.js'

const cmdLog = createLogger('cmd:quest-status')

interface RunSummary {
  objective?: string
  executionMode?: string | null
  acceptance?: { passed: number; failed: number; unverified: number }
  qualityGate?: { passed: boolean; overallScore: number; grade: string } | null
}

export type QuestStatusOptions = {
  verbose?: boolean
}

function trustIcon(label: string): string {
  switch (label) {
    case 'tested':
    case 'pushed':
      return '✓'
    case 'changed':
      return '⟳'
    case 'inspected_only':
      return '👁'
    case 'planned_only':
      return '◎'
    case 'blocked':
      return '⊘'
    case 'failed':
      return '✗'
    default:
      return '?'
  }
}

export async function questStatusCommand(
  questId: string | undefined,
  _options: QuestStatusOptions = {},
): Promise<void> {
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
    bold(`OpenAgent Quest runs (${runIds.length})`)
    log('')
    dim('  ID                        Date       State    Trust label        Progress')
    for (const id of runIds.slice(0, 20)) {
      const quest = await loadReconciledQuest(projectRoot, id)
      const summary = quest ? null : await loadSummary(projectRoot, id)
      if (quest) {
        const date = quest.updatedAt.slice(0, 10)
        const state = quest.state.padEnd(8)
        const trust = `${trustIcon(quest.trustLabel)} ${quest.trustLabel}`.padEnd(18)
        const done = quest.tasks.filter((t) => t.status === 'completed').length
        const total = quest.tasks.length
        log(`  ${id}  ${date}  ${state}  ${trust}  ${done}/${total} tasks`)
        dim(`    ${truncate(quest.objective, 72)}`)
      } else if (summary) {
        log(`  ${id}  legacy`)
        dim(`    ${truncate(summary.objective ?? '(legacy run)', 72)}`)
        dim(`    ${summary.executionMode ?? 'plan-only'}${formatAcceptance(summary)}`)
      } else {
        log(`  ${id}  legacy · no quest.json`)
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

  const quest = await loadReconciledQuest(projectRoot, questId)
  const summary = await loadSummary(projectRoot, questId)

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

  if (quest && quest.verification) {
    info('Verification:')
    const v = quest.verification
    log(`  ${v.overallPassed ? '✓ PASSED' : '✗ FAILED'} — ${v.summary}`)
    for (const check of v.checks) {
      log(`    ${check.passed ? '✓' : '✗'} ${check.name}`)
    }
    log('')
  }

  dim(`Artifacts: ${join(process.cwd(), '.oac', 'runs', questId)}`)
}

function printQuest(quest: ReconciledQuestRun): void {
  info('Quest v4:')
  log(`  Objective:   ${quest.objective}`)
  log(`  State:       ${quest.state}`)
  log(`  Scenario:    ${quest.scenario}`)
  log(`  Intensity:   ${quest.intensity}`)
  log(`  Trust:       ${trustIcon(quest.trustLabel)} ${quest.trustLabel}`)
  log(`  Updated:     ${quest.updatedAt}`)
  if (quest.changedFiles && quest.changedFiles.length > 0) {
    log(`  Changed:     ${quest.changedFiles.length} file(s)`)
  }
  log('')

  if (quest.experts.length > 0) {
    info(`Experts (${quest.experts.length}):`)
    log(`  ${quest.experts.map((expert) => `${expert.name}(${expert.role})`).join(', ')}`)
    log('')
  }

  if (quest.tasks.length > 0) {
    info(`Tasks (${quest.tasks.length}):`)
    for (const task of quest.tasks.slice(0, 10)) {
      const icon =
        task.status === 'completed'
          ? '✓'
          : task.status === 'in_progress'
            ? '→'
            : task.status === 'blocked'
              ? '⊘'
              : task.status === 'failed'
                ? '✗'
                : '○'
      log(`  ${icon} ${task.status.padEnd(11)} ${task.title}`)
    }
    if (quest.tasks.length > 10) dim(`  ... ${quest.tasks.length - 10} more task(s)`)
    log('')
  }

  info('Checkpoint:')
  log(`  Next action: ${quest.nextSuggestedAction}`)
  if (quest.changedFiles && quest.changedFiles.length > 0) {
    dim(`  Changed files: ${quest.changedFiles.join(', ')}`)
  }
  log('')

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
    .description('List or inspect durable OpenAgent Quest v4 runs under .oac/runs/')
    .option('--verbose', 'Show extra detail', false)
    .addHelpText(
      'after',
      `
Examples:
  oac quest-status                      List recent Quest runs
  oac quest-status swarm-m123abc        Show Quest state, tasks, artifacts, and resume commands
`,
    )
    .action(async (questId: string | undefined, opts: { verbose?: boolean }) => {
      await questStatusCommand(questId, { verbose: opts.verbose ?? false })
    })
}

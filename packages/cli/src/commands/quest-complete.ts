/**
 * oac quest-complete — Finalize a Quest, generate summary artifacts.
 */

import { type Command } from 'commander'
import { log, info, success, warn, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildNextStepsSuggestedEvent, buildStateChangeEvent, buildValidationEvent } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists, writeTaskGraph } from '../lib/quest-run.js'
import { runQuestVerification } from '../lib/quest-verification.js'
import { extractQuestMemory } from '../lib/memory-extraction.js'
import { analyzeQuestForReflection, saveReflection } from '../lib/reflection-engine.js'
import { buildQuestNextStepSuggestions } from '../lib/quest-next-steps.js'
import { refreshMemoryPromotionStore } from '../lib/quest-memory-promotion.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestCompleteOptions = {
  skipGates?: boolean
  extractMemory?: boolean
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

  let quest = await loadReconciledQuest(projectRoot, questId)
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

  // Gate: verification must have passed with real checks. v7 runs verification
  // automatically before COMPLETE unless the user explicitly skips gates.
  if (!quest.verification && !options.skipGates) {
    info('Running verification before COMPLETE...')
    const autoVerification = await runQuestVerification(projectRoot)
    await appendQuestEvent(projectRoot, questId, buildValidationEvent(autoVerification))
    quest = await loadReconciledQuest(projectRoot, questId)
    if (!quest) {
      throw new CommandUsageError(`Quest '${questId}' could not be reconciled after verification.`)
    }
  }

  const verification = quest.verification
  const requiredChecks = ['test', 'build', 'lint']
  const hasRunChecks =
    verification &&
    verification.checks.length > 0 &&
    !verification.forced &&
    !verification.noChecks

  const requiredChecksPassed =
    hasRunChecks &&
    requiredChecks.every((name) => {
      const check = verification.checks.find((c) => c.name === name)
      return check ? check.passed : true // non-existent required checks are tolerated if others pass
    })

  const gatesPassed =
    verification?.overallPassed === true && hasRunChecks && requiredChecksPassed

  if (!gatesPassed) {
    warn('Quest completion gates not satisfied.')
    warn(`Current trust label: ${quest.trustLabel}`)
    if (!hasRunChecks) {
      warn('Required checks (test, build, lint) have not been run.')
    } else if (!requiredChecksPassed) {
      const failedRequired = requiredChecks
        .filter((name) => {
          const check = verification.checks.find((c) => c.name === name)
          return check && !check.passed
        })
      warn(`Failed required gates: ${failedRequired.join(', ')}`)
    }
    if (!options.skipGates) {
      throw new CommandUsageError(
        `Run 'oac quest-verify ${questId}' first, or use --skip-gates to override.`,
      )
    }
    info('--skip-gates: completing without passing verification gates')
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

  // Append validation + completion events
  if (verification) {
    const validationEvent = {
      timestamp: new Date().toISOString(),
      type: 'validation' as const,
      data: {
        result: {
          ...verification,
          completionAttempted: true,
          gatesSkipped: options.skipGates ?? false,
        },
      },
    }
    await appendQuestEvent(projectRoot, questId, validationEvent)
  }

  if (quest.version === '8' && quest.intensity !== 'lite') {
    if (quest.state !== 'REFLECT') {
      await appendQuestEvent(projectRoot, questId, buildStateChangeEvent(quest.state, 'REFLECT'))
    }
    const reflectedQuest = await loadReconciledQuest(projectRoot, questId)
    if (reflectedQuest) {
      const reflection = analyzeQuestForReflection(reflectedQuest)
      await saveReflection(projectRoot, questId, reflection)
      quest = reflectedQuest
      dim(`Reflection: ${join(runDir, 'reflection.json')}`)
    }
  }

  const event = buildStateChangeEvent(quest.state, 'COMPLETE')
  await appendQuestEvent(projectRoot, questId, event)

  const completedQuestForSuggestions = await loadReconciledQuest(projectRoot, questId)
  if (completedQuestForSuggestions) {
    const suggestions = buildQuestNextStepSuggestions(completedQuestForSuggestions)
    await appendQuestEvent(projectRoot, questId, buildNextStepsSuggestedEvent(suggestions))
  }

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
  if (summarySource.nextStepSuggestions && summarySource.nextStepSuggestions.length > 0) {
    log('')
    info('Suggested next steps (choose one):')
    for (const suggestion of summarySource.nextStepSuggestions) {
      log(`  - ${suggestion.title}`)
      dim(`    ${suggestion.reason}`)
      if (suggestion.command) dim(`    ${suggestion.command}`)
    }
  }

  if (options.extractMemory !== false) {
    const finalQuest = await loadReconciledQuest(projectRoot, questId)
    if (finalQuest?.state === 'COMPLETE') {
      const extraction = await extractQuestMemory(projectRoot, finalQuest)
      dim(`Memory extraction: ${extraction.promotedLessons} lesson(s), ${extraction.promotedCommands} command(s), ${extraction.candidates} candidate(s)`)
      const promotionStore = await refreshMemoryPromotionStore(projectRoot)
      const pendingPromotions = promotionStore.candidates.filter((candidate) => candidate.status === 'pending').length
      dim(`Memory promotion: ${pendingPromotions} pending candidate(s). Review with: oac memory-promote`)
    }
  }

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
  lines.push('## Suggested Next Steps')
  lines.push('')
  if (quest.nextStepSuggestions && quest.nextStepSuggestions.length > 0) {
    for (const suggestion of quest.nextStepSuggestions) {
      lines.push(`- **${suggestion.title}** — ${suggestion.reason}`)
      if (suggestion.command) {
        lines.push(`  - Command: \`${suggestion.command}\``)
      }
    }
  } else {
    lines.push('_No follow-up suggestions recorded._')
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
    nextStepSuggestions: quest.nextStepSuggestions ?? [],
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
    .option('--skip-gates', 'Complete even if verification gates have not passed', false)
    .option('--force', 'Alias for --skip-gates', false)
    .option('--no-extract-memory', 'Skip deterministic v7 team-memory extraction')
    .action(async (questId: string, opts: { skipGates?: boolean; force?: boolean; extractMemory?: boolean }) => {
      await questCompleteCommand(questId, {
        skipGates: opts.skipGates ?? opts.force ?? false,
        extractMemory: opts.extractMemory !== false,
      })
    })
}

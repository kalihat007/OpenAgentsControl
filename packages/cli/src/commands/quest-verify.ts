/**
 * oac quest-verify — Run repo-native checks and update quest trust label.
 *
 * v5: integrates auto-fix loop that routes back to the owning runtime
 * when validation fails.
 */

import { type Command } from 'commander'
import { log, info, success, warn, error, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildValidationEvent } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists } from '../lib/quest-run.js'
import { runQuestVerification } from '../lib/quest-verification.js'
import { runAutoFixLoop } from '../lib/auto-fix-loop.js'
import type { RuntimeType } from '../lib/runtime-bridge.js'
import { createIncident } from '../lib/incident-tracker.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestVerifyOptions = {
  force?: boolean
  autoFix?: boolean
  maxRetries?: number
  runtime?: RuntimeType
}

// ── Command Handler ───────────────────────────────────────────────────────────

export async function questVerifyCommand(
  questId: string,
  options: QuestVerifyOptions,
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
  bold(`Quest Verify — ${questId}`)
  log('')
  info(`Objective: ${quest.objective}`)
  info(`Current trust: ${quest.trustLabel}`)
  log('')

  // Detect and run checks
  let verification = await runQuestVerification(projectRoot, { force: options.force })

  // Print results
  if (verification.noChecks && options.force) {
    warn('No recognizable test/build/lint setup found.')
    warn('Checked for: package.json scripts, go.mod, Cargo.toml, pyproject.toml, Makefile')
    info('--force: recording a forced verification note without promoting trust to tested')
  } else if (verification.checks.length > 0) {
    info(`Detected ${verification.checks.length} check(s):`)
    for (const c of verification.checks) {
      dim(`  • ${c.name}: ${c.command}`)
    }
    log('')
    for (const check of verification.checks) {
      if (check.passed) {
        success(`  ✓ ${check.name} passed (${check.durationMs}ms)`)
      } else {
        error(`  ✗ ${check.name} failed (${check.durationMs}ms)`)
        if (check.output) {
          dim(`    ${check.output.split('\n')[0]?.slice(0, 120) || ''}`)
        }
      }
    }
  }

  log('')
  if (verification.noChecks && options.force) {
    warn(`Verification FORCED — ${verification.summary}`)
  } else if (verification.overallPassed) {
    success(`Verification PASSED — ${verification.summary}`)
  } else {
    error(`Verification FAILED — ${verification.summary}`)
  }
  log('')

  // Auto-fix loop (v5)
  if (!verification.overallPassed && options.autoFix && options.runtime) {
    info('Starting auto-fix loop...')
    const fixResult = await runAutoFixLoop({
      questId,
      projectRoot,
      runtime: options.runtime,
      maxRetries: options.maxRetries,
    })

    if (fixResult.passed) {
      success(`Auto-fix succeeded after ${fixResult.attempts} attempt(s)`)
      verification = fixResult.finalVerification
    } else if (fixResult.blocked) {
      warn(`Auto-fix loop exhausted after ${fixResult.attempts} attempt(s). Quest marked BLOCKED.`)
    }
  }

  // Persist validation event
  const event = buildValidationEvent(verification)
  await appendQuestEvent(projectRoot, questId, event)

  if (!verification.overallPassed && !(verification.noChecks && options.force)) {
    const failedChecks = verification.checks.filter((check) => !check.passed)
    const incidentId = await createIncident(projectRoot, {
      questId,
      category: 'verification_failure',
      summary: `Quest verification failed: ${verification.summary}`,
      evidence: failedChecks.map((check) => `${check.name}: ${check.command}`),
      severity: 'high',
    })
    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'incident.created',
      data: {
        incidentId,
        questId,
        category: 'verification_failure',
        summary: `Quest verification failed: ${verification.summary}`,
        evidence: failedChecks.map((check) => `${check.name}: ${check.command}`),
        severity: 'high',
      },
    })
  }

  dim(`Event appended to .oac/runs/${questId}/events.ndjson`)
  dim(`Trust label updated: ${quest.trustLabel} → ${verification.overallPassed ? 'tested' : verification.noChecks ? 'inspected_only' : 'failed'}`)
  log('')
}

// ── Commander Registration ────────────────────────────────────────────────────

export function registerQuestVerifyCommand(program: Command): void {
  program
    .command('quest-verify <quest-id>')
    .description('Run repo-native checks (test, build, lint) and update quest trust label')
    .option('--force', 'Record verification even if no checks are detected, without marking tested', false)
    .option('--no-auto-fix', 'Disable the auto-fix retry loop on failure', false)
    .option('--max-retries <n>', 'Max auto-fix retries (default 1)', (v) => parseInt(v, 10), 1)
    .option('--runtime <name>', 'Runtime to use for auto-fix: opencode, kimi, or claude')
    .action(async (questId: string, opts: { force?: boolean; autoFix?: boolean; maxRetries?: number; runtime?: string }) => {
      const runtime = opts.runtime as RuntimeType | undefined
      await questVerifyCommand(questId, {
        force: opts.force ?? false,
        autoFix: opts.autoFix !== false,
        maxRetries: opts.maxRetries ?? 1,
        runtime,
      })
    })
}

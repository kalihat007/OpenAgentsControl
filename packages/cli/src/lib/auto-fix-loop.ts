/**
 * Auto-Fix Gate v7 — retry failed validation checks by routing back
 * to the same selected runtime once by default.
 */

import { createLogger } from './logger.js'
import { loadReconciledQuest } from './quest-reconciler.js'
import { appendQuestEvent } from './quest-run.js'
import { spawnRuntime, type RuntimeType } from './runtime-bridge.js'
import { runQuestVerification } from './quest-verification.js'
import type { QuestVerificationResult } from './quest-run.js'

const log = createLogger('auto-fix-loop')

export interface AutoFixLoopOptions {
  questId: string
  projectRoot: string
  runtime: RuntimeType
  maxRetries?: number
  timeoutMs?: number
}

export interface AutoFixLoopResult {
  passed: boolean
  finalVerification: QuestVerificationResult
  attempts: number
  blocked: boolean
}

export async function runAutoFixLoop(options: AutoFixLoopOptions): Promise<AutoFixLoopResult> {
  const maxRetries = options.maxRetries ?? 1
  let attempts = 0

  log.info('Auto-fix loop starting', { questId: options.questId, maxRetries })

  while (attempts < maxRetries) {
    attempts++

    // Re-run verification to see current state
    const verification = await runQuestVerification(options.projectRoot)
    if (verification.overallPassed) {
      log.info('Auto-fix loop: verification passed', { attempts })
      return { passed: true, finalVerification: verification, attempts, blocked: false }
    }

    const failedChecks = verification.checks.filter((c) => !c.passed)
    log.info('Auto-fix loop: attempt failed, spawning fix', {
      attempt: attempts,
      failed: failedChecks.map((c) => c.name),
    })

    // Build fix prompt
    const fixPrompt = buildFixPrompt(options.questId, failedChecks)

    // Identify owning expert from reconciled quest (first failed task's agent, or fallback)
    const quest = await loadReconciledQuest(options.projectRoot, options.questId)
    const owningExpert = quest?.tasks.find((t) => t.status === 'failed')?.expert ?? 'TechLeadAgent'

    // Spawn runtime with fix objective
    const fixResult = await spawnRuntime({
      questId: options.questId,
      objective: fixPrompt,
      projectRoot: options.projectRoot,
      runDir: `.oac/runs/${options.questId}`,
      runtime: options.runtime,
      timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
    })

    if (!fixResult.ok) {
      log.warn('Auto-fix loop: runtime spawn failed', {
        attempt: attempts,
        error: fixResult.errorMessage,
      })
      await appendQuestEvent(options.projectRoot, options.questId, {
        timestamp: new Date().toISOString(),
        type: 'error',
        data: {
          message: `Auto-fix attempt ${attempts} failed: ${fixResult.errorMessage ?? 'runtime error'}`,
          critical: false,
        },
      })
      // Continue to next retry if any remain
      continue
    }

    // Record fix attempt as a task update for the owning expert
    await appendQuestEvent(options.projectRoot, options.questId, {
      timestamp: new Date().toISOString(),
      type: 'task_update',
      data: {
        taskId: `fix-attempt-${attempts}`,
        status: 'completed',
        expert: owningExpert,
        title: `Auto-fix attempt ${attempts} for ${failedChecks.map((c) => c.name).join(', ')}`,
      },
    })
  }

  // Max retries exceeded — final verification
  const finalVerification = await runQuestVerification(options.projectRoot)
  if (finalVerification.overallPassed) {
    log.info('Auto-fix loop: verification passed after final attempt', { attempts })
    return { passed: true, finalVerification, attempts, blocked: false }
  }

  log.warn('Auto-fix loop: max retries exceeded', { attempts })

  // Mark blocked
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'error',
    data: {
      message: `Auto-fix loop exhausted after ${attempts} attempts. Manual intervention required.`,
      critical: true,
    },
  })

  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'state_change',
    data: { from: 'VERIFY', to: 'BLOCKED' },
  })

  return { passed: false, finalVerification, attempts, blocked: true }
}

function buildFixPrompt(
  questId: string,
  failedChecks: Array<{ name: string; command: string }>,
): string {
  return [
    `Auto-fix attempt for Quest ${questId}.`,
    ``,
    `The following validation checks failed:`,
    ...failedChecks.map((c) => `  - ${c.name}: run \`${c.command}\``),
    ``,
    `Fix the underlying issues and re-run the failing commands until they pass.`,
    `Append a validation event to events.ndjson when done.`,
  ].join('\n')
}

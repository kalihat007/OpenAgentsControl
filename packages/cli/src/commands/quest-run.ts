/**
 * oac quest-run — Plan and execute a Quest, optionally in background daemon mode.
 */

import type { Command } from 'commander'
import { log, info, success, dim } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { buildQuestRun, persistQuestRun } from '../lib/quest-run.js'
import { routeTask } from '../lib/task-router.js'
import { planExecution, executeSwarm, loadSessionBudgetLimits, type ExecutionMode } from '../lib/swarm-executor.js'
import { readConfig, createDefaultConfig } from '../lib/config.js'
import { buildRunHandoff, persistRunHandoff } from '../lib/run-handoff.js'
import { persistRunArtifacts } from '../lib/swarm-executor.js'
import { spawn } from 'node:child_process'

export interface QuestRunOptions {
  background?: boolean
  runtime?: string
  distributed?: boolean
  mode?: ExecutionMode
  skipReview?: boolean
}

export async function questRunCommand(objective: string, options: QuestRunOptions): Promise<void> {
  const projectRoot = process.cwd()

  if (!objective) {
    throw new CommandUsageError('Provide an objective. Example: oac quest-run "implement auth API"')
  }

  // Route and plan
  const config = (await readConfig(projectRoot)) ?? createDefaultConfig()
  const routerResult = routeTask(objective, projectRoot)

  const limits = await loadSessionBudgetLimits(projectRoot)
  const plan = planExecution(routerResult, {
    maxConcurrency: limits.maxParallelAgents,
    maxParallelAgents: limits.maxParallelAgents,
  })
  const questId = plan.session.id

  // Build and persist quest
  const quest = buildQuestRun(routerResult, plan, { state: options.background ? 'EXECUTE' : 'WAITING', skipReview: options.skipReview })
  await persistQuestRun(projectRoot, quest)

  // Persist artifacts
  await persistRunArtifacts(projectRoot, plan, undefined, { routerResult })
  const handoff = buildRunHandoff({ projectRoot, routerResult, plan })
  await persistRunHandoff(projectRoot, handoff)

  log('')
  success(`Quest ${questId} planned`)
  info(`Objective: ${objective}`)
  info(`Tasks: ${plan.session.tasks.length}`)
  info(`Batches: ${plan.schedulerResult.batches.length}`)
  log('')

  if (options.background) {
    const runtime = normalizeRuntime(options.runtime ?? config.v6?.distributedSwarm.defaultRuntime ?? 'kimi')
    // Spawn daemon process
    const cliEntry = process.argv[1]
    if (!cliEntry) {
      throw new CommandUsageError('Cannot locate the current oac CLI entrypoint for daemon startup.')
    }
    const args = ['quest-daemon', questId]

    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        OAC_QUEST_RUNTIME: runtime,
      },
    })

    child.unref()

    log('')
    success(`Daemon started for ${questId}`)
    info(`Runtime: ${runtime}`)
    info(`Attach with: oac quest-attach ${questId}`)
    info(`Status with: oac quest-status ${questId}`)
    dim(`Artifacts: ${quest.artifacts.runDir}`)
    log('')
    return
  }

  // Inline execution
  const mode: ExecutionMode = options.distributed
    ? 'distributed'
    : options.mode ?? 'handoff'

  if (mode === 'handoff') {
    info('Run deferred to IDE runtime. Handoff ready:')
    log(`  OpenCode: ${handoff.runtimes.opencode.command}`)
    log(`  Kimi:     ${handoff.runtimes.kimi.command}`)
    log(`  Claude:   ${handoff.runtimes.claude.command}`)
    log(`  Codex:    ${handoff.runtimes.codex.command}`)
    log('')
    return
  }

  const result = await executeSwarm(plan, {
    mode,
    projectRoot,
    runtime: options.runtime ? normalizeRuntime(options.runtime) : undefined,
    routerResult,
  })

  log('')
  if (result.failedTasks.length === 0) {
    success('Quest execution complete')
  } else {
    info(`Quest execution finished with ${result.failedTasks.length} failed task(s)`)
  }
  info(`Completed: ${result.completedTasks.length}/${plan.session.tasks.length}`)
  log('')
}

export function registerQuestRunCommand(program: Command): void {
  program
    .command('quest-run <objective>')
    .description('Plan and execute a Quest. Use --background for daemon mode.')
    .option('--background', 'Run as a background daemon process', false)
    .option('--runtime <name>', 'Runtime for inline execution: opencode, kimi, claude, or codex')
    .option('--distributed', 'Use distributed multi-runtime mode', false)
    .option('--skip-review', 'Skip the review gate for this Quest (v8)', false)
    .action(async (objective: string, opts: QuestRunOptions) => {
      await questRunCommand(objective, opts)
    })
}

function normalizeRuntime(value: string): 'opencode' | 'kimi' | 'claude' | 'codex' {
  if (value === 'opencode' || value === 'kimi' || value === 'claude' || value === 'codex') return value
  throw new CommandUsageError(`Invalid runtime '${value}'. Use one of: opencode, kimi, claude, codex`)
}

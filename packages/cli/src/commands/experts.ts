/**
 * oac experts — Dynamic expert swarm assembly
 *
 * Automatically selects the right experts for a task.
 * No manual picking needed — the router analyzes the objective
 * and assembles the optimal swarm.
 *
 * Usage:
 *   oac experts "build a login API with JWT auth"          # Auto-detect + show roster
 *   oac experts --plan-only "build a login API"           # Save structured plan
 *   oac experts --run "build a login API with JWT auth"    # Execute via swarm-runtime
 *   oac experts --dry-run "create a React landing page"    # Preview execution plan
 *   oac experts --list                                     # Show all available experts
 */

import type { Command } from 'commander'
import type { SwarmBatch, SwarmTask } from '@nextsystems/oac-swarm-runtime'
import { log, info, success, dim, warn } from '../ui/logger.js'
import { createSpinner } from '../ui/spinner.js'
import { routeTask, discoverAgents } from '../lib/task-router.js'
import {
  planExecution,
  executeSwarm,
  persistRunArtifacts,
  plannedAcceptanceChecks,
  type AcceptanceCheck,
  type ExecutionPlan,
} from '../lib/swarm-executor.js'
import { CommandUsageError } from '../lib/errors.js'
import { createLogger } from '../lib/logger.js'

const cmdLog = createLogger('cmd:experts')

// ── Command logic ─────────────────────────────────────────────────────────────

export async function expertsCommand(
  objective: string | undefined,
  options: {
    dryRun: boolean
    planOnly: boolean
    run: boolean
    list: boolean
    save: boolean
    verbose: boolean
    concurrency: number
  }
): Promise<void> {
  const projectRoot = process.cwd()

  // List mode: show all available agents
  if (options.list || (!objective && !options.dryRun && !options.planOnly && !options.run)) {
    const agents = discoverAgents(projectRoot)
    log('')
    info(`Available experts (${agents.length}):`)
    log('')

    const byCategory = groupBy(agents, (a) => a.category)
    for (const [category, list] of Object.entries(byCategory)) {
      dim(`  ${category}/`)
      for (const agent of list) {
        const desc = agent.description ? ` — ${truncate(agent.description, 50)}` : ''
        log(`    • ${agent.name}${desc}`)
      }
      log('')
    }
    return
  }

  if (!objective) {
    throw new CommandUsageError('Provide an objective, or use --list to see available experts.')
  }

  cmdLog.debug('Running experts command', {
    objective: objective.slice(0, 120),
    dryRun: options.dryRun,
    run: options.run,
    concurrency: options.concurrency,
  })

  const spinner = createSpinner('Analyzing objective and routing to experts…')
  spinner.start()

  const result = routeTask(objective, projectRoot)

  spinner.stop()
  log('')

  // Print routing result
  success(`Objective: ${result.objective}`)
  log('')

  if (result.primaryExperts.length > 0) {
    info(`Primary experts (${result.primaryExperts.length}):`)
    for (const expert of result.primaryExperts) {
      const tags = expert.keywords.slice(0, 3).map((k) => `#${k}`).join(' ')
      log(`  ▶ ${expert.name} ${tags}`)
      if (options.verbose && expert.description) {
        dim(`    ${expert.description}`)
      }
    }
    log('')
  }

  if (result.secondaryExperts.length > 0) {
    info(`Secondary experts (${result.secondaryExperts.length}):`)
    for (const expert of result.secondaryExperts) {
      log(`  ○ ${expert.name}`)
    }
    log('')
  }

  dim(`Estimated chunks: ~${result.estimatedChunks}`)
  log('')

  // ── Plan-only / dry-run: show the execution plan without running ─────────

  if (options.dryRun || options.planOnly) {
    const plan = planExecution(result, { maxConcurrency: options.concurrency })
    const { schedulerResult } = plan

    info(options.planOnly ? '[plan-only] Execution plan:' : '[dry-run] Execution plan:')
    log('')
    printPlanSummary(plan)
    printBatchPlan(schedulerResult.batches, schedulerResult.blocked)
    printAcceptanceChecks(plannedAcceptanceChecks(plan))
    info(`Session: ${plan.session.id}`)
    info(`Total events so far: ${plan.session.events.length}`)
    if (options.save) {
      const artifacts = await persistRunArtifacts(projectRoot, plan)
      info(`Saved plan: ${artifacts.planPath}`)
      info(`Saved report: ${artifacts.acceptanceReportPath}`)
    }
    log('')
    dim('Pass --run to execute this plan.')
    return
  }

  // ── Run: actually execute the swarm ──────────────────────────────────────

  if (options.run) {
    const plan = planExecution(result, { maxConcurrency: options.concurrency })
    const { schedulerResult } = plan

    info('Execution plan:')
    log('')
    printPlanSummary(plan)
    printBatchPlan(schedulerResult.batches, schedulerResult.blocked)

    const execSpinner = createSpinner('Executing swarm…')
    execSpinner.start()

    const execResult = await executeSwarm(plan, {
      onBatchStart: (batch, idx, total) => {
        execSpinner.update(`Batch ${idx + 1}/${total}: ${batch.tasks.length} task(s)…`)
      },
      onTaskStart: (task) => {
        execSpinner.update(`Running: ${task.agent}…`)
      },
    })

    execSpinner.succeed('Swarm execution complete')
    log('')

    // Summary
    info('Results:')
    success(`  Completed: ${execResult.completedTasks.length} task(s)`)
    if (execResult.failedTasks.length > 0) {
      warn(`  Blocked/Failed: ${execResult.failedTasks.length} task(s)`)
    }
    dim(`  Session: ${execResult.session.id}`)
    dim(`  Elapsed: ${execResult.elapsedMs}ms`)
    dim(`  Events: ${execResult.session.events.length}`)
    printAcceptanceChecks(execResult.acceptanceChecks)
    if (options.save) {
      const artifacts = await persistRunArtifacts(projectRoot, plan, execResult)
      info(`Saved run: ${artifacts.runDir}`)
      info(`Saved report: ${artifacts.acceptanceReportPath}`)
    }
    log('')

    if (options.verbose) {
      info('Event log:')
      for (const event of execResult.session.events) {
        dim(`  [${event.type}] ${event.message}`)
      }
      log('')
    }

    return
  }

  // ── Default (no --run, no --dry-run): show roster only ───────────────────

  const expertNames = [...result.primaryExperts, ...result.secondaryExperts]
    .map((e) => e.name)
    .join(', ')

  success(`Swarm assembled: ${expertNames}`)
  log('')
  dim('Pass --plan-only to persist a shareable plan, --dry-run to preview batches, or --run to execute it.')
}

// ── Display helpers ───────────────────────────────────────────────────────────

function printPlanSummary(plan: ExecutionPlan): void {
  info(`Stages: ${plan.stages.length}`)
  info(`Tasks: ${plan.session.tasks.length}`)
  info(`Max parallel: ${plan.session.maxConcurrency}`)
  log('')
}

function printBatchPlan(batches: SwarmBatch[], blocked: SwarmTask[]): void {
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!
    info(`Batch ${i + 1} (${batch.id}):`)
    for (const task of batch.tasks) {
      const role = task.role ? ` [${task.role}]` : ''
      const pri = (task.metadata?.['isPrimary'] as boolean) ? '▶' : '○'
      log(`    ${pri} ${task.agent}${role}`)
    }
    if (batch.writeLocks.length > 0) {
      dim(`    write-locks: ${batch.writeLocks.join(', ')}`)
    }
    log('')
  }

  if (blocked.length > 0) {
    warn(`Blocked tasks (${blocked.length}):`)
    for (const task of blocked) {
      log(`    ⊘ ${task.agent} — depends on: ${(task.dependsOn ?? []).join(', ') || 'n/a'}`)
    }
    log('')
  }
}

function printAcceptanceChecks(checks: AcceptanceCheck[]): void {
  const totals = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { passed: 0, failed: 0, unverified: 0 },
  )

  info(`Acceptance: ${totals.passed} passed, ${totals.failed} failed, ${totals.unverified} unverified`)
  if (checks.length > 0) {
    for (const check of checks.slice(0, 8)) {
      const marker = check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : '○'
      log(`    ${marker} ${check.criterion}`)
    }
    if (checks.length > 8) {
      dim(`    ... ${checks.length - 8} more check(s) in the saved acceptance report`)
    }
    log('')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>
  for (const item of items) {
    const key = keyFn(item)
    result[key] = result[key] ?? []
    result[key].push(item)
  }
  return result
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '…' : str
}

// ── Commander registration ────────────────────────────────────────────────────

export function registerExpertsCommand(program: Command): void {
  program
    .command('experts [objective]')
    .description('Dynamically assemble an expert swarm for a task')
    .option('--run', 'Execute the swarm through the runtime', false)
    .option('--plan-only', 'Create and save the structured expert plan without execution', false)
    .option('--dry-run', 'Show the execution plan without running', false)
    .option('--list', 'List all available experts', false)
    .option('--no-save', 'Do not persist plan/run artifacts under .oac/runs')
    .option('--verbose', 'Show expert descriptions, keywords, and event logs', false)
    .option('--concurrency <n>', 'Max parallel tasks per batch', (v) => parseInt(v, 10), 4)
    .addHelpText(
      'after',
      `
Examples:
  oac experts "build a JWT auth API"                  Auto-detect experts (roster only)
  oac experts --plan-only "build a JWT auth API"      Save structured plan artifacts
  oac experts --run "build a JWT auth API"            Execute via swarm-runtime
  oac experts --dry-run "create a React landing page" Preview execution plan
  oac experts --list                                  Show all available experts
`
    )
    .action(async (objective: string | undefined, opts: Record<string, unknown>) => {
      await expertsCommand(objective, {
        dryRun: Boolean(opts['dryRun']),
        planOnly: Boolean(opts['planOnly']),
        run: Boolean(opts['run']),
        list: Boolean(opts['list']),
        save: opts['save'] !== false,
        verbose: Boolean(opts['verbose']),
        concurrency: typeof opts['concurrency'] === 'number' && Number.isFinite(opts['concurrency']) ? opts['concurrency'] : 4,
      })
    })
}

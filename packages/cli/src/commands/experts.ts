/**
 * oac experts — Quest-style dynamic expert swarm assembly
 *
 * Automatically selects the right Quest scenario and experts for a task.
 * No manual picking needed — the router analyzes the objective
 * and assembles the optimal swarm.
 *
 * Usage:
 *   oac experts "build a login API with JWT auth"          # Auto-detect + show roster
 *   oac experts --plan-only "build a login API"           # Save structured plan
 *   oac experts --run "build a login API with JWT auth"    # Execute via swarm-runtime
 *   oac experts --run --full "build a login API"           # Full pipeline (index+memory+decompose+quality)
 *   oac experts --run --quick "fix the typo"               # Minimal pipeline, fast execution
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
  persistRunArtifacts,
  persistRunSpec,
  plannedAcceptanceChecks,
  estimateExecution,
  loadSessionBudgetLimits,
  type AcceptanceCheck,
  type ExecutionPlan,
  type ExecutionMode,
} from '../lib/swarm-executor.js'
import {
  runExpertPipeline,
  getQuickConfig,
  getFullConfig,
  type PipelineConfig,
  type PipelineResult,
} from '../lib/expert-pipeline.js'
import { CommandUsageError, QualityGateFailedError } from '../lib/errors.js'
import {
  buildRunHandoff,
  persistRunHandoff,
  formatHandoffCliLines,
} from '../lib/run-handoff.js'
import { buildRunSpec } from '../lib/run-spec.js'
import { createLogger } from '../lib/logger.js'
import type { InteractiveMode } from '../lib/interactive-mode.js'
import { DEFAULT_MAX_PARALLEL_AGENTS } from '../lib/config.js'

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
    decompose: boolean
    mode: InteractiveMode
    full: boolean
    quick: boolean
    noIndex: boolean
    noMemory: boolean
    quality: boolean
    simulate: boolean
    live: boolean
    noQualityGate: boolean
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
    full: options.full,
    quick: options.quick,
    mode: options.mode,
    concurrency: options.concurrency,
    decompose: options.decompose,
  })

  const spinner = createSpinner('Analyzing objective and routing to experts…')
  spinner.start()

  const result = routeTask(objective, projectRoot)

  spinner.stop()
  log('')

  // Print routing result
  success(`Objective: ${result.objective}`)
  info(`Quest scenario: ${result.scenario}`)
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

  // ── Plan-only / dry-run (no pipeline flags): show the execution plan ─────

  if (options.dryRun || options.planOnly) {
    const budgetLimits = await loadSessionBudgetLimits(projectRoot)
    const plan = planExecution(result, {
      maxConcurrency: options.concurrency,
      maxParallelAgents: budgetLimits.maxParallelAgents,
      autoDecompose: options.decompose,
    })
    const { schedulerResult } = plan

    info(options.planOnly ? '[plan-only] Execution plan:' : '[dry-run] Execution plan:')
    log('')
    printPlanSummary(plan)
    printBatchPlan(schedulerResult.batches, schedulerResult.blocked)
    printAcceptanceChecks(plannedAcceptanceChecks(plan))
    info(`Session: ${plan.session.id}`)
    info(`Total events so far: ${plan.session.events.length}`)

    const specPath = await persistRunSpec(projectRoot, plan, result)
    info(`Saved spec: ${specPath}`)

    if (options.save) {
      const artifacts = await persistRunArtifacts(projectRoot, plan, undefined, { routerResult: result })
      info(`Saved plan: ${artifacts.planPath}`)
      info(`Saved report: ${artifacts.acceptanceReportPath}`)
    }

    if (options.live) {
      await writeAndPrintHandoff(projectRoot, result, plan)
    } else {
      log('')
      dim('Pass --run to simulate scheduling, or --run --live to write an IDE handoff manifest.')
    }
    return
  }

  // ── Run: use the unified expert pipeline ─────────────────────────────────

  if (options.run) {
    const executionMode = resolveExecutionMode(options)
    const limits = await loadSessionBudgetLimits(projectRoot)
    const plan = planExecution(result, {
      maxConcurrency: options.concurrency,
      maxParallelAgents: limits.maxParallelAgents,
      autoDecompose: options.decompose,
    })
    const estimate = estimateExecution(plan, limits, executionMode)
    printExecutionEstimate(estimate)
    return runPipelineMode(objective, projectRoot, { ...options, executionMode, budgetLimits: limits }, result)
  }

  // ── Default (no --run, no --dry-run): show roster only ───────────────────

  const expertNames = [...result.primaryExperts, ...result.secondaryExperts]
    .map((e) => e.name)
    .join(', ')

  success(`Swarm assembled: ${expertNames}`)
  log('')
  dim('Pass --plan-only to persist a plan, --run to simulate scheduling, or --run --live for an IDE handoff manifest.')
}

// ── Pipeline-based execution ──────────────────────────────────────────────────

function resolveExecutionMode(options: { simulate: boolean; live: boolean }): ExecutionMode {
  if (options.live && options.simulate) {
    throw new CommandUsageError('Use either --live or --simulate, not both.')
  }
  if (options.live) return 'handoff'
  return 'simulate'
}

async function writeAndPrintHandoff(
  projectRoot: string,
  routerResult: ReturnType<typeof routeTask>,
  plan: ExecutionPlan,
): Promise<void> {
  const spec = buildRunSpec(routerResult, plan)
  const handoff = buildRunHandoff({ projectRoot, routerResult, plan, spec })
  const handoffPath = await persistRunHandoff(projectRoot, handoff)
  log('')
  for (const line of formatHandoffCliLines(handoff, handoffPath)) {
    if (line.startsWith('  OpenCode') || line.startsWith('  Claude')) {
      success(line.trim())
    } else if (line.length > 0) {
      info(line)
    } else {
      log('')
    }
  }
}

async function runPipelineMode(
  objective: string,
  projectRoot: string,
  options: {
    dryRun: boolean
    save: boolean
    verbose: boolean
    concurrency: number
    decompose: boolean
    mode: InteractiveMode
    full: boolean
    quick: boolean
    noIndex: boolean
    noMemory: boolean
    quality: boolean
    executionMode: ExecutionMode
    noQualityGate: boolean
    budgetLimits: Awaited<ReturnType<typeof loadSessionBudgetLimits>>
  },
  routerResult?: ReturnType<typeof routeTask>,
): Promise<void> {
  let pipelineConfig: Partial<PipelineConfig>

  if (options.quick) {
    pipelineConfig = { ...getQuickConfig() }
  } else if (options.full) {
    pipelineConfig = { ...getFullConfig() }
  } else {
    pipelineConfig = {
      mode: options.mode,
      useIndex: !options.noIndex,
      useMemory: !options.noMemory,
      useDecomposition: options.decompose,
      qualityChecks: options.quality,
      dryRun: options.dryRun,
      verbose: options.verbose,
    }
  }

  pipelineConfig.mode = options.mode
  pipelineConfig.maxConcurrency = Math.min(
    options.concurrency,
    options.budgetLimits.maxParallelAgents,
  )
  pipelineConfig.dryRun = options.dryRun
  pipelineConfig.verbose = options.verbose
  pipelineConfig.executionMode = options.executionMode
  pipelineConfig.runQualityGate = !options.noQualityGate
  pipelineConfig.maxParallelAgents = options.budgetLimits.maxParallelAgents

  const modeLabel = options.executionMode === 'handoff' ? 'handoff' : 'simulated'
  const spinner = createSpinner(`Running expert pipeline (${modeLabel})…`)
  spinner.start()

  const pipelineResult = await runExpertPipeline(objective, projectRoot, pipelineConfig, {
    onStageChange: (stage, message) => {
      spinner.update(`[${stage}] ${message}`)
    },
    onProgress: (_pct, message) => {
      spinner.update(message)
    },
    onQualityReport: (report) => {
      if (options.verbose) {
        cmdLog.debug('Quality report', {
          taskId: report.taskId,
          agent: report.agent,
          score: report.score,
        })
      }
    },
  })

  const simulated = options.executionMode === 'simulate'
  const handoff = options.executionMode === 'handoff'
  spinner.succeed(
    handoff ? 'Expert pipeline complete (handoff)' : simulated ? 'Expert pipeline complete (simulated)' : 'Expert pipeline complete',
  )
  log('')

  printPipelineResult(pipelineResult, options.verbose, simulated, handoff)

  assertQualityGatePassed(pipelineResult)

  const routing = routerResult ?? pipelineResult.routing[0]
  if (pipelineResult.plan && routing) {
    if (options.save) {
      const artifacts = await persistRunArtifacts(
        projectRoot,
        pipelineResult.plan,
        pipelineResult.executionResults ?? undefined,
        { routerResult: routing },
      )
      info(`Saved run: ${artifacts.runDir}`)
      info(`Saved report: ${artifacts.acceptanceReportPath}`)
    } else {
      const specPath = await persistRunSpec(projectRoot, pipelineResult.plan, routing)
      dim(`Saved spec: ${specPath}`)
    }

    if (handoff) {
      await writeAndPrintHandoff(projectRoot, routing, pipelineResult.plan)
    }
  }

  log('')
}

/** Throws QualityGateFailedError when --run completed but the quality gate failed. */
export function assertQualityGatePassed(result: PipelineResult): void {
  const gate = result.executionResults?.qualityGate
  if (gate && !gate.passed) {
    throw new QualityGateFailedError(gate.summary, gate.overallScore)
  }
}

// ── Pipeline result display ───────────────────────────────────────────────────

function printExecutionEstimate(estimate: ReturnType<typeof estimateExecution>): void {
  info('Pre-run estimate (heuristic, no LLM):')
  log(`  Batches: ${estimate.batches}`)
  log(`  Tasks: ${estimate.tasks}`)
  log(`  Mode: ${estimate.mode}`)
  log(`  Max parallel agents: ${estimate.maxParallelAgents}`)
  log(`  Max API calls/session: ${estimate.maxApiCallsPerSession}`)
  log(`  Estimated API calls (proxy): ${estimate.estimatedApiCalls}`)
  if (estimate.decomposition.active) {
    dim(`  Decomposition: ${estimate.decomposition.subTaskCount} subtask(s), ${estimate.decomposition.estimatedComplexity ?? 'unknown'} complexity`)
  }
  log('')
}

function printPipelineResult(
  result: PipelineResult,
  verbose: boolean,
  simulated: boolean,
  handoff = false,
): void {
  success(`Objective: ${result.objective}`)
  info(`Quest scenario: ${result.routing[0]?.scenario ?? 'direct'}`)
  if (handoff) {
    warn('Execution mode: HANDOFF — run Quest/Experts in OpenCode TUI or Claude plugin (see handoff.json).')
  } else if (simulated) {
    warn('Execution mode: SIMULATED — agents did not run; task completions are scheduling placeholders only.')
  }
  log('')

  info(`Pipeline stages: ${result.stages.join(' → ')}`)
  dim(`Duration: ${result.duration}ms`)
  log('')

  if (result.decomposed && result.subTasks.length > 0) {
    info(`Decomposed into ${result.subTasks.length} sub-task(s):`)
    for (const st of result.subTasks) {
      log(`  ○ [${st.expertId}] ${truncate(st.objective, 80)}`)
    }
    log('')
  }

  for (const rr of result.routing) {
    if (rr.primaryExperts.length > 0) {
      info(`Primary experts (${rr.primaryExperts.length}):`)
      for (const expert of rr.primaryExperts) {
        const tags = expert.keywords.slice(0, 3).map((k) => `#${k}`).join(' ')
        log(`  ▶ ${expert.name} ${tags}`)
      }
    }
    if (rr.secondaryExperts.length > 0) {
      info(`Secondary experts (${rr.secondaryExperts.length}):`)
      for (const expert of rr.secondaryExperts) {
        log(`  ○ ${expert.name}`)
      }
    }
  }
  log('')

  if (result.executionResults) {
    const exec = result.executionResults
    info(simulated ? 'Simulated execution results:' : 'Execution results:')
    if (simulated) {
      dim(`  Scheduled tasks simulated: ${exec.completedTasks.length}`)
    } else {
      success(`  Completed: ${exec.completedTasks.length} task(s)`)
    }
    if (exec.failedTasks.length > 0) {
      warn(`  Blocked/Failed: ${exec.failedTasks.length} task(s)`)
    }
    dim(`  Session: ${exec.session.id}`)
    dim(`  Mode: ${exec.executionMode}`)
    dim(`  API calls (proxy): ${exec.budgetUsage.apiCalls}`)
    dim(`  Elapsed: ${exec.elapsedMs}ms`)
    dim(`  Events: ${exec.session.events.length}`)
    printAcceptanceChecks(exec.acceptanceChecks, simulated)

    if (exec.qualityGate) {
      log('')
      const gate = exec.qualityGate
      if (gate.passed) {
        success(`Quality gate: PASSED (score ${gate.overallScore}/100, grade ${gate.grade})`)
      } else {
        warn(`Quality gate: FAILED (score ${gate.overallScore}/100, grade ${gate.grade})`)
      }
      dim(`  ${gate.summary}`)
    }
  }

  if (result.qualityReports.length > 0) {
    info('Quality reports:')
    for (const report of result.qualityReports) {
      const total = report.passed + report.failed + report.unverified
      const pct = total > 0 ? Math.round(report.score * 100) : 0
      log(`  ${report.agent}: ${pct}% (${report.passed}/${total})`)
    }
    log('')
  }

  if (result.memoryUpdated) {
    dim('Expert memory updated with session outcomes.')
    log('')
  }

  if (verbose && result.executionResults) {
    info('Event log:')
    for (const event of result.executionResults.session.events) {
      dim(`  [${event.type}] ${event.message}`)
    }
    log('')
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

function printPlanSummary(plan: ExecutionPlan): void {
  info(`Stages: ${plan.stages.length}`)
  info(`Tasks: ${plan.session.tasks.length}`)
  info(`Max parallel: ${plan.session.maxConcurrency}`)
  if (plan.decomposition.active) {
    info(`Decomposition: ${plan.decomposition.subTaskCount} sequential subtask(s), ${plan.decomposition.estimatedComplexity} complexity`)
  } else {
    info('Decomposition: single objective')
  }
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

function printAcceptanceChecks(checks: AcceptanceCheck[], simulated = false): void {
  const totals = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { passed: 0, failed: 0, unverified: 0 },
  )

  const label = simulated
    ? `Acceptance (simulated — ${totals.unverified} unverified until IDE run + quality gate)`
    : `Acceptance: ${totals.passed} passed, ${totals.failed} failed, ${totals.unverified} unverified`
  info(label)
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
    .description('Dynamically assemble a Quest-style expert swarm for a task')
    .option('--run', 'Execute the swarm through the runtime (simulated by default)', false)
    .option('--simulate', 'Simulate execution — no real agents (default for --run)', true)
    .option('--live', 'Write IDE handoff manifest (.oac/runs/{id}/handoff.json) for OpenCode TUI or Claude plugin — does not spawn agents', false)
    .option('--plan-only', 'Create and save the structured expert plan without execution', false)
    .option('--dry-run', 'Show the execution plan without running', false)
    .option('--list', 'List all available experts', false)
    .option('--mode <mode>', 'Interactive mode: autonomous | supervised | collaborative', 'supervised')
    .option('--full', 'Enable all pipeline features (index, memory, decomposition, quality)', false)
    .option('--quick', 'Minimal pipeline — fast execution, no index/memory', false)
    .option('--no-index', 'Skip codebase indexing')
    .option('--no-memory', 'Skip memory loading/saving')
    .option('--no-decompose', 'Disable automatic large-task decomposition')
    .option('--quality', 'Enable quality checks on results', false)
    .option(
      '--no-quality-gate',
      'Skip post-run quality gate (default exits 1 when the gate fails after --run)',
      false,
    )
    .option('--no-save', 'Do not persist plan/run artifacts under .oac/runs')
    .option('--verbose', 'Show expert descriptions, keywords, and event logs', false)
    .option('--concurrency <n>', 'Max parallel tasks per batch', (v) => parseInt(v, 10), DEFAULT_MAX_PARALLEL_AGENTS)
    .addHelpText(
      'after',
      `
Examples:
  oac experts "build a JWT auth API"                  Auto-detect experts (roster only)
  oac experts --plan-only "build a JWT auth API"      Save structured plan artifacts
  oac experts --run "build a JWT auth API"            Execute via swarm-runtime (simulated)
  oac experts --run --live "build a JWT auth API"     Plan + handoff for OpenCode TUI / Claude plugin
  oac experts --plan-only --live "build a JWT auth API"  Plan artifacts + handoff only
  oac experts --run --full "build a JWT auth API"     Full pipeline with all features
  oac experts --run --quick "fix a typo"              Minimal fast pipeline
  oac experts --run --mode autonomous "build it"      Autonomous mode (no approval gates)
  oac experts --run --quality "refactor auth module"  Execute with quality checks
  oac experts --run --no-quality-gate "quick sim"       Skip gate (no exit 1 on failure)
  oac experts --dry-run "create a React landing page" Preview execution plan
  oac experts --no-decompose "fix a simple bug"       Bypass automatic subtask splitting
  oac experts --list                                  Show all available experts
`
    )
    .action(async (objective: string | undefined, opts: Record<string, unknown>) => {
      const modeRaw = String(opts['mode'] ?? 'supervised')
      const validModes = ['autonomous', 'supervised', 'collaborative']
      const mode: InteractiveMode = validModes.includes(modeRaw)
        ? (modeRaw as InteractiveMode)
        : 'supervised'

      await expertsCommand(objective, {
        dryRun: Boolean(opts['dryRun']),
        planOnly: Boolean(opts['planOnly']),
        run: Boolean(opts['run']),
        list: Boolean(opts['list']),
        save: opts['save'] !== false,
        verbose: Boolean(opts['verbose']),
        concurrency: typeof opts['concurrency'] === 'number' && Number.isFinite(opts['concurrency']) ? opts['concurrency'] : DEFAULT_MAX_PARALLEL_AGENTS,
        decompose: opts['decompose'] !== false,
        mode,
        full: Boolean(opts['full']),
        quick: Boolean(opts['quick']),
        noIndex: opts['index'] === false,
        noMemory: opts['memory'] === false,
        quality: Boolean(opts['quality']),
        simulate: opts['simulate'] !== false,
        live: Boolean(opts['live']),
        noQualityGate: Boolean(opts['noQualityGate']),
      })
    })
}

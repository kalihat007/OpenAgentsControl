/**
 * oac quest-status — List and inspect durable OpenAgent Quest runs.
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { log, info, success, dim, warn, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { createLogger } from '../lib/logger.js'
import { listQuestRunIds, readRunPid, isRunPidAlive } from '../lib/quest-run.js'
import { loadDaemonState, type QuestDaemonState } from '../lib/quest-daemon.js'
import { renderDagFlow } from '../lib/dag-render.js'
import {
  loadEvents,
  loadReconciledQuest,
  type ReconciledQuestRun,
  type ReconcilerEvent,
} from '../lib/quest-reconciler.js'

const cmdLog = createLogger('cmd:quest-status')

interface RunSummary {
  objective?: string
  executionMode?: string | null
  acceptance?: { passed: number; failed: number; unverified: number }
  qualityGate?: { passed: boolean; overallScore: number; grade: string } | null
}

export type QuestStatusOptions = {
  verbose?: boolean
  json?: boolean
  watch?: boolean
}

interface QuestStatusJson {
  questId: string
  version?: string
  state: string
  trustLabel: string
  objective: string
  scenario: string
  intensity: string
  progress: ReturnType<typeof progressForQuest>
  runtimes: ReconciledQuestRun['runtimeProgress']
  tasks: Array<{
    id: string
    title: string
    status: string
    expert: string
    runtime?: string
    dependsOn: string[]
    priority?: number
  }>
  recentEvents: ReconcilerEvent[]
  handoffs: ReconciledQuestRun['handoffs']
  incidents: ReconciledQuestRun['incidents']
  changedFiles: string[]
  nextAction: string
  backgroundRun?: { pid: number; alive: boolean }
  daemon?: QuestDaemonState
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
  options: QuestStatusOptions = {},
): Promise<void> {
  const projectRoot = process.cwd()
  const runIds = await listQuestRunIds(projectRoot)

  cmdLog.debug('quest-status', { questId, runCount: runIds.length })

  if (options.watch && questId) {
    await watchQuestStatus(projectRoot, questId, options.json ?? false)
    return
  }

  if (runIds.length === 0) {
    if (options.json) {
      console.log('[]')
      return
    }
    warn('No Quest runs found.')
    dim('  Run `oac experts --plan-only "<objective>"` or `oac experts --run --live "<objective>"` first.')
    return
  }

  if (!questId) {
    if (options.json) {
      const summaries = await Promise.all(runIds.map((id) => buildQuestListJson(projectRoot, id)))
      console.log(JSON.stringify(summaries, null, 2))
      return
    }

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
  const events = quest ? await loadEvents(projectRoot, questId) : []
  const pid = await readRunPid(projectRoot, questId)
  const daemon = await loadDaemonState(projectRoot, questId)

  if (options.json) {
    if (quest) {
      console.log(JSON.stringify(await buildQuestStatusJson(projectRoot, quest, events, pid, daemon), null, 2))
    } else {
      console.log(JSON.stringify({ questId, legacy: true, summary }, null, 2))
    }
    return
  }

  log('')
  success(`Quest: ${questId}`)
  log('')

  if (quest) {
    printQuest(quest)
  } else {
    warn('This is a legacy run without quest.json.')
  }

  // Background run status
  if (questId) {
    if (daemon) {
      info(`Daemon: ${daemon.status} (pid ${daemon.pid}, progress ${Math.round((daemon.progress ?? 0) * 100)}%)`)
      if (daemon.lastError) warn(`Daemon error: ${daemon.lastError}`)
      log('')
    }
    if (pid) {
      const alive = isRunPidAlive(pid)
      info(`Background run: ${alive ? `running (pid ${pid})` : 'finished'}`)
      log('')
    }
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

async function watchQuestStatus(
  projectRoot: string,
  questId: string,
  json: boolean,
): Promise<void> {
  if (!await loadReconciledQuest(projectRoot, questId)) {
    warn(`Quest '${questId}' not found.`)
    return
  }

  const eventsPath = join(projectRoot, '.oac', 'runs', questId, 'events.ndjson')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null
  let needsRender = true

  const render = async (): Promise<void> => {
    if (!needsRender) return
    needsRender = false

    const quest = await loadReconciledQuest(projectRoot, questId)
    if (!quest) return
    const events = await loadEvents(projectRoot, questId)
    const pid = await readRunPid(projectRoot, questId)
    const daemon = await loadDaemonState(projectRoot, questId)

    // Clear screen and move cursor to top-left
    process.stdout.write('\x1B[2J\x1B[H')

    if (json) {
      console.log(JSON.stringify(await buildQuestStatusJson(projectRoot, quest, events, pid, daemon), null, 2))
      return
    }

    const progress = progressForQuest(quest)
    const weightedPct = weightedProgressForQuest(quest)
    const pct = progress.total > 0 ? Math.round(weightedPct) : 0
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5))

    const reviewIndicator = quest.state === 'REVIEW' ? ' 👁 REVIEW' : ''
    log(`┌─ OpenAgent Quest v${quest.version} ───────────────────────────────────────────┐`)
    log(`│ ${quest.questId} │ State: ${(quest.state + reviewIndicator).padEnd(8)} │ Trust: ${quest.trustLabel.padEnd(12)} │`)
    log(`│ Progress: ${progress.completed}/${progress.total} tasks ${bar} ${pct}% │`)

    const rtNames = Object.keys(quest.runtimeProgress)
    if (rtNames.length > 0) {
      const rtSummary = rtNames.map((name) => {
        const p = quest.runtimeProgress[name]!
        return `${name}(${p.completed}/${p.assigned})`
      }).join(' ')
      log(`│ Runtimes: ${rtSummary.padEnd(56)} │`)
    }
    if (daemon) {
      const daemonLine = `Daemon: ${daemon.status} pid=${daemon.pid} ${Math.round((daemon.progress ?? 0) * 100)}%`
      log(`│ ${daemonLine.slice(0, 60).padEnd(60)} │`)
    }
    const dagLine = renderDagFlow(quest.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      runtime: runtimeForTask(task),
      dependsOn: task.dependsOn,
    })))
    if (dagLine) {
      log(`│ DAG: ${dagLine.slice(0, 55).padEnd(55)} │`)
    }
    log('├─ Tasks ────────────────────────────────────────────────────────┤')

    const tasksByRuntime = new Map<string, typeof quest.tasks>()
    for (const task of quest.tasks) {
      const rt = runtimeForTask(task) ?? 'unassigned'
      const list = tasksByRuntime.get(rt) ?? []
      list.push(task)
      tasksByRuntime.set(rt, list)
    }
    for (const [rt, tasks] of tasksByRuntime) {
      const taskLine = tasks.map((t) => {
        const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : t.status === 'blocked' ? '⊘' : t.status === 'failed' ? '✗' : '○'
        const pri = t.priority ? `P${t.priority}` : ''
        const progress = (quest as ReconciledQuestRun).taskProgress?.[t.id]
        const pct = progress && t.status === 'in_progress' ? ` ${progress.percent}%` : ''
        return `${icon}${pri} ${t.id}${pct}`
      }).join('  ')
      log(`│ ${rt.padEnd(10)} ${taskLine.slice(0, 50).padEnd(50)} │`)
    }

    log('├─ Recent Events ────────────────────────────────────────────────┤')
    for (const event of events.slice(-5)) {
      const time = event.timestamp.slice(11, 19)
      log(`│ ${time}  ${event.type.padEnd(22)} ${String(event.data?.taskId ?? event.data?.runtime ?? '').slice(0, 24).padEnd(24)} │`)
    }

    const blocked = quest.tasks.filter((t) => t.status === 'blocked' || t.status === 'failed')
    if (blocked.length > 0) {
      log('├─ Blocked / Failing ────────────────────────────────────────────┤')
      for (const t of blocked.slice(0, 3)) {
        log(`│ ⊘ ${t.id} ${t.status} — ${t.title.slice(0, 48).padEnd(48)} │`)
      }
    }

    log('└─ Press Ctrl+C to exit ─────────────────────────────────────────┘')
  }

  const scheduleRender = (): void => {
    needsRender = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void render()
    }, 150)
  }

  try {
    watcher = watch(eventsPath, (eventType) => {
      if (eventType === 'change') {
        scheduleRender()
      }
    })
  } catch {
    cmdLog.warn('File watcher failed; falling back to polling', { path: eventsPath })
  }

  // Fallback heartbeat for daemon/pid state not driven by file changes
  const FALLBACK_MS = 10000
  const timer = setInterval(() => {
    needsRender = true
    void render()
  }, FALLBACK_MS)

  await render()

  return new Promise((resolve) => {
    const cleanup = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(timer)
      if (watcher) {
        watcher.close()
        watcher = null
      }
      process.stdout.write('\x1B[2J\x1B[H')
      log('Watch stopped.')
      resolve()
      process.exit(0)
    }
    process.on('SIGINT', cleanup)
  })
}

async function buildQuestListJson(projectRoot: string, questId: string): Promise<Record<string, unknown>> {
  const quest = await loadReconciledQuest(projectRoot, questId)
  if (quest) {
    return {
      questId,
      state: quest.state,
      trustLabel: quest.trustLabel,
      objective: quest.objective,
      updatedAt: quest.updatedAt,
      progress: progressForQuest(quest),
    }
  }

  const summary = await loadSummary(projectRoot, questId)
  return {
    questId,
    legacy: true,
    objective: summary?.objective,
    executionMode: summary?.executionMode ?? null,
    acceptance: summary?.acceptance ?? null,
  }
}

async function buildQuestStatusJson(
  _projectRoot: string,
  quest: ReconciledQuestRun,
  events: ReconcilerEvent[],
  pid: number | null,
  daemon?: QuestDaemonState | null,
): Promise<QuestStatusJson> {
  return {
    questId: quest.questId,
    version: quest.version,
    state: quest.state,
    trustLabel: quest.trustLabel,
    objective: quest.objective,
    scenario: quest.scenario,
    intensity: quest.intensity,
    progress: progressForQuest(quest),
    runtimes: quest.runtimeProgress,
    tasks: quest.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      expert: task.expert,
      runtime: runtimeForTask(task),
      dependsOn: task.dependsOn,
      priority: task.priority,
    })),
    recentEvents: events.slice(-20),
    handoffs: quest.handoffs,
    incidents: quest.incidents,
    changedFiles: quest.changedFiles,
    nextAction: quest.nextSuggestedAction,
    backgroundRun: pid ? { pid, alive: isRunPidAlive(pid) } : undefined,
    daemon: daemon ?? undefined,
  }
}

function progressForQuest(quest: ReconciledQuestRun): {
  completed: number
  inProgress: number
  pending: number
  blocked: number
  failed: number
  cancelled: number
  total: number
} {
  return {
    completed: quest.tasks.filter((task) => task.status === 'completed').length,
    inProgress: quest.tasks.filter((task) => task.status === 'in_progress').length,
    pending: quest.tasks.filter((task) => task.status === 'pending').length,
    blocked: quest.tasks.filter((task) => task.status === 'blocked').length,
    failed: quest.tasks.filter((task) => task.status === 'failed').length,
    cancelled: quest.tasks.filter((task) => task.status === 'cancelled').length,
    total: quest.tasks.length,
  }
}

/**
 * Compute a weighted progress percentage that accounts for per-task progress
 * events. Completed tasks count as 100%, in-progress tasks count as their
 * reported percent (default 10%), and all other tasks count as 0%.
 */
function weightedProgressForQuest(quest: ReconciledQuestRun): number {
  if (quest.tasks.length === 0) return 0
  let total = 0
  for (const task of quest.tasks) {
    if (task.status === 'completed') {
      total += 100
    } else if (task.status === 'in_progress') {
      const progress = quest.taskProgress?.[task.id]
      total += progress?.percent ?? 10
    }
  }
  return total / quest.tasks.length
}

function runtimeForTask(task: ReconciledQuestRun['tasks'][number]): string | undefined {
  const runtime = (task as unknown as { runtime?: unknown }).runtime
  return typeof runtime === 'string' ? runtime : undefined
}

function printQuest(quest: ReconciledQuestRun): void {
  info(`Quest v${quest.version}:`)
  log(`  Objective:   ${quest.objective}`)
  log(`  State:       ${quest.state}`)
  log(`  Scenario:    ${quest.scenario}`)
  log(`  Intensity:   ${quest.intensity}`)
  log(`  Trust:       ${trustIcon(quest.trustLabel)} ${quest.trustLabel}`)
  log(`  Updated:     ${quest.updatedAt}`)
  if (quest.version === '8' && quest.skipReview) {
    log(`  Review:      skipped`)
  }
  if (quest.changedFiles && quest.changedFiles.length > 0) {
    log(`  Changed:     ${quest.changedFiles.length} file(s)`)
  }
  const runtimeNames = Object.keys(quest.runtimeProgress)
  if (runtimeNames.length > 0) {
    log(`  Runtimes:    ${runtimeNames.map((name) => {
      const progress = quest.runtimeProgress[name]!
      return `${name}(${progress.completed}/${progress.assigned})`
    }).join(', ')}`)
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
      const priorityBadge = task.priority ? `[P${task.priority}] ` : ''
      const progress = quest.taskProgress?.[task.id]
      const pct = progress && task.status === 'in_progress' ? ` ${progress.percent}%` : ''
      log(`  ${icon} ${task.status.padEnd(11)} ${priorityBadge}${task.title}${pct}`)
    }
    if (quest.tasks.length > 10) dim(`  ... ${quest.tasks.length - 10} more task(s)`)
    log('')
  }

  info('Checkpoint:')
  log(`  Next action: ${quest.nextSuggestedAction}`)
  if (quest.handoffs.length > 0) {
    dim(`  Handoffs: ${quest.handoffs.length} recorded`)
  }
  if (quest.incidents.length > 0) {
    dim(`  Incidents: ${quest.incidents.filter((incident) => incident.status === 'open').length} open / ${quest.incidents.length} total`)
  }
  if (quest.changedFiles && quest.changedFiles.length > 0) {
    dim(`  Changed files: ${quest.changedFiles.join(', ')}`)
  }
  log('')

  info('Resume:')
  log(`  OpenCode: ${quest.runtimes.opencode.command}`)
  log(`  Kimi:     ${quest.runtimes.kimi.command}`)
  log(`  Claude:   ${quest.runtimes.claude.command}`)
  log(`  Codex:    ${quest.runtimes.codex.command}`)
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
    .description('List or inspect durable OpenAgent Quest runs under .oac/runs/')
    .option('--verbose', 'Show extra detail', false)
    .option('--json', 'Print machine-readable Quest status JSON', false)
    .option('--watch', 'Poll and refresh Quest status every 2 seconds', false)
    .addHelpText(
      'after',
      `
Examples:
  oac quest-status                      List recent Quest runs
  oac quest-status swarm-m123abc        Show Quest state, tasks, artifacts, and resume commands
  oac quest-status swarm-m123abc --json Print reconciled machine-readable status
  oac quest-status swarm-m123abc --watch Live updating dashboard
`,
    )
    .action(async (questId: string | undefined, opts: { verbose?: boolean; json?: boolean; watch?: boolean }) => {
      await questStatusCommand(questId, {
        verbose: opts.verbose ?? false,
        json: opts.json ?? false,
        watch: opts.watch ?? false,
      })
    })
}

/**
 * Quest Daemon v7 — background process that manages runtime lifecycle,
 * crash recovery, and live control actions for a Quest.
 *
 * The daemon writes its state to `.oac/runs/{id}/daemon.json`
 * and polls `events.ndjson` to track progress.
 */

import { mkdir, readFile, writeFile, appendFile, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createLogger } from './logger.js'
import { appendQuestEvent } from './quest-run.js'
import { loadEvents, loadReconciledQuest } from './quest-reconciler.js'
import { createIncident } from './incident-tracker.js'
import type { RuntimeType } from './runtime-bridge.js'
import { findTasksToResetOnRetry } from './task-dag.js'
import { runQuestVerification } from './quest-verification.js'
import { runSwarmQualityGate } from './swarm-quality-gate.js'
import { extractQuestMemory } from './memory-extraction.js'
import { generateReviewBundle, persistReviewBundle, shouldAutoApprove } from './quest-review.js'
import { buildReviewStartedEvent, buildReviewApprovedEvent } from './quest-reconciler.js'
import { readConfig } from './config.js'

const log = createLogger('quest-daemon')

const HEARTBEAT_INTERVAL_MS = 5000
const ACTION_POLL_INTERVAL_MS = 2000
const RUNTIME_TIMEOUT_MS = 10 * 60 * 1000
const GRACEFUL_SHUTDOWN_MS = 10000
const TERMINAL_RUNTIME_EXIT_GRACE_MS = 5000
const TERMINAL_RUNTIME_KILL_GRACE_MS = 2000

// ── Types ─────────────────────────────────────────────────────────────────────

export type DaemonStatus =
  | 'spawned'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'crashed'
  | 'recovering'
  | 'complete'
  | 'cancelled'

export interface DaemonRuntimeEntry {
  runtime: RuntimeType
  pid: number
  taskIds: string[]
  status: 'running' | 'exited' | 'crashed' | 'restarting'
  lastSeenAt: string
  restartCount: number
}

interface DaemonActionBase {
  id?: string
  requestedAt: string
}

export type DaemonAction =
  | (DaemonActionBase & { type: 'pause' })
  | (DaemonActionBase & { type: 'resume' })
  | (DaemonActionBase & { type: 'cancel_task'; taskId: string })
  | (DaemonActionBase & { type: 'rerun_task'; taskId: string })
  | (DaemonActionBase & { type: 'amend'; text: string })

export interface QuestDaemonState {
  version: '1'
  questId: string
  status: DaemonStatus
  startedAt: string
  lastHeartbeatAt: string
  pid: number
  runtimes: DaemonRuntimeEntry[]
  actionCursor: number
  activeTask?: string
  progress?: number
  lastError?: string
  pendingActions?: DaemonAction[]
}

export interface DaemonOptions {
  projectRoot: string
  questId: string
  plan: QuestDaemonPlan
  runtimeAssignments?: Record<string, RuntimeType>
}

export interface QuestDaemonTask {
  id: string
  title: string
  agent: string
  runtime?: RuntimeType
  status?: string
  dependsOn?: string[]
}

export interface QuestDaemonPlan {
  objective: string
  tasks: QuestDaemonTask[]
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function loadDaemonState(
  projectRoot: string,
  questId: string,
): Promise<QuestDaemonState | null> {
  try {
    const raw = await readFile(daemonPath(projectRoot, questId), 'utf-8')
    return JSON.parse(raw) as QuestDaemonState
  } catch {
    return null
  }
}

export async function saveDaemonState(
  projectRoot: string,
  state: QuestDaemonState,
): Promise<void> {
  const path = daemonPath(projectRoot, state.questId)
  await mkdir(join(projectRoot, '.oac', 'runs', state.questId), { recursive: true })
  await withDaemonLock(path, async () => {
    await writeFile(path, JSON.stringify({ ...state, lastHeartbeatAt: new Date().toISOString() }, null, 2) + '\n')
  })
}

export async function appendDaemonAction(
  projectRoot: string,
  questId: string,
  action: DaemonAction,
): Promise<void> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  const actionWithId: DaemonAction = {
    ...action,
    id: action.id ?? `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  } as DaemonAction
  const path = actionsPath(projectRoot, questId)
  await withDaemonLock(path, async () => {
    await appendFile(path, JSON.stringify(actionWithId) + '\n')
  })
}

export async function loadDaemonActions(
  projectRoot: string,
  questId: string,
): Promise<DaemonAction[]> {
  try {
    const raw = await readFile(actionsPath(projectRoot, questId), 'utf-8')
    const actions: DaemonAction[] = []
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        actions.push(JSON.parse(line) as DaemonAction)
      } catch {
        // Keep processing valid action history if a line is partial/corrupt.
      }
    }
    return actions
  } catch {
    return []
  }
}

function daemonPath(projectRoot: string, questId: string): string {
  return join(projectRoot, '.oac', 'runs', questId, 'daemon.json')
}

function actionsPath(projectRoot: string, questId: string): string {
  return join(projectRoot, '.oac', 'runs', questId, 'daemon-actions.ndjson')
}

async function withDaemonLock<T>(daemonPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = daemonPath + '.lock'
  const startedAt = Date.now()
  const timeoutMs = 5000
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined

  while (!lockHandle) {
    try {
      lockHandle = await open(lockPath, 'wx')
      await lockHandle.writeFile(`${process.pid}:${new Date().toISOString()}\n`)
    } catch (err) {
      if (!isFileExistsError(err)) throw err
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for daemon lock: ${lockPath}`)
      }
      await sleep(25)
    }
  }

  try {
    return await fn()
  } finally {
    await lockHandle.close()
    await rm(lockPath, { force: true })
  }
}

function isFileExistsError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EEXIST'
  )
}

// ── Daemon main loop ──────────────────────────────────────────────────────────

export async function runDaemonLoop(options: DaemonOptions): Promise<void> {
  const { projectRoot, questId, plan, runtimeAssignments } = options

  log.info('Daemon starting', { questId, pid: process.pid })

  let state: QuestDaemonState = {
    version: '1',
    questId,
    status: 'spawned',
    startedAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    pid: process.pid,
    runtimes: [],
    actionCursor: 0,
  }

  await saveDaemonState(projectRoot, state)

  // Group tasks by runtime, sorted by priority
  const runtimeMap = new Map<RuntimeType, Array<{ id: string; title: string; agent: string; priority?: number }>>()
  for (const task of plan.tasks) {
    if (isTerminalStatus(task.status)) continue
    const rt = (runtimeAssignments?.[task.id] ?? task.runtime ?? 'kimi') as RuntimeType
    const list = runtimeMap.get(rt) ?? []
    list.push({ id: task.id, title: task.title, agent: task.agent, priority: (task as unknown as { priority?: number }).priority })
    runtimeMap.set(rt, list)
  }
  // Sort each runtime's task list by priority (1 = highest)
  for (const [rt, list] of runtimeMap) {
    list.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))
    runtimeMap.set(rt, list)
  }

  if (runtimeMap.size === 0) {
    state.status = 'complete'
    state.progress = 1
    await saveDaemonState(projectRoot, state)
    log.info('Daemon found no pending tasks; marked complete', { questId })
    return
  }

  // Spawn initial runtimes
  for (const [runtime, tasks] of runtimeMap) {
    const pid = await spawnRuntimeDetached(projectRoot, questId, runtime, plan.objective, tasks)
    state.runtimes.push({
      runtime,
      pid,
      taskIds: tasks.map((task) => task.id),
      status: 'running',
      lastSeenAt: new Date().toISOString(),
      restartCount: 0,
    })
  }

  state.status = 'running'
  await saveDaemonState(projectRoot, state)

  // Setup graceful shutdown
  let shuttingDown = false
  const shutdownHandler = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('Daemon received shutdown signal, graceful shutdown...', { questId })

    // Give runtimes a chance to finish current work
    await sleep(GRACEFUL_SHUTDOWN_MS)

    for (const entry of state.runtimes) {
      if (entry.status === 'running') {
        try {
          process.kill(entry.pid, 'SIGTERM')
        } catch {
          // already dead
        }
      }
    }

    state.status = state.status === 'running' ? 'cancelled' : state.status
    await saveDaemonState(projectRoot, state)
    process.exit(0)
  }

  process.on('SIGTERM', shutdownHandler)
  process.on('SIGINT', shutdownHandler)

  // Main loop
  let lastHeartbeat = Date.now()
  let lastActionPoll = Date.now()

  while (!shuttingDown) {
    const now = Date.now()

    // Heartbeat: check runtime PIDs
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeat = now
      await heartbeat(projectRoot, questId, state, plan)
      state = await loadDaemonState(projectRoot, questId) ?? state
    }

    // Action poll: process pending actions
    if (now - lastActionPoll >= ACTION_POLL_INTERVAL_MS) {
      lastActionPoll = now
      const allActions = await loadDaemonActions(projectRoot, questId)
      const actions = allActions.slice(state.actionCursor)
      if (actions.length > 0) {
        const reconciled = await loadReconciledQuest(projectRoot, questId)
        const taskGraph = reconciled?.tasks ?? plan.tasks
        await processActions(projectRoot, questId, state, actions, taskGraph)
        state.actionCursor += actions.length
        await saveDaemonState(projectRoot, state)
        state = await loadDaemonState(projectRoot, questId) ?? state
      }
    }

    // Check if quest is complete — quality gates must pass first
    const reconciled = await loadReconciledQuest(projectRoot, questId)
    if (reconciled) {
      updateProgressFromTasks(state, reconciled.tasks)
      const allDone = reconciled.tasks.every(
        (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'blocked' || t.status === 'cancelled',
      )
      if (allDone && state.status === 'running') {
        await settleTerminalRuntimeProcesses(projectRoot, questId, state, reconciled.tasks)
        await finalizeTerminalRuntimes(projectRoot, questId, state)

        const blockedOrFailed = reconciled.tasks.filter(
          (task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'cancelled',
        )
        if (blockedOrFailed.length > 0) {
          const summary = `Quest has ${blockedOrFailed.length} blocked/failed/cancelled terminal task(s): ${blockedOrFailed.map((task) => task.id).join(', ')}`
          log.warn('Quest reached terminal tasks with blockers', { questId, summary })
          await appendQuestEvent(projectRoot, questId, {
            timestamp: new Date().toISOString(),
            type: 'state_change',
            data: { from: reconciled.state, to: 'BLOCKED', reason: 'terminal_task_blocked' },
          })
          state.status = 'blocked'
          state.lastError = summary
          await saveDaemonState(projectRoot, state)
          break
        }

        // v8 Review Gate
        if (reconciled.version === '8' && !reconciled.skipReview) {
          const config = await readConfig(projectRoot)
          const v8Prefs = config?.v8
          const reviewPrefs = v8Prefs?.reviewGate
          const reviewEnabled =
            v8Prefs?.enabled !== false &&
            reviewPrefs?.enabled !== false &&
            (reviewPrefs?.requiredFor ?? ['standard', 'deep']).includes(reconciled.intensity)
          const autoApprove = shouldAutoApprove(reconciled, {
            autoApproveOnNoChanges: reviewPrefs?.autoApproveOnNoChanges,
            excludedFor: reviewPrefs?.excludedFor,
            yoloMode: config ? (config.preferences.yoloMode || process.env['CI'] === 'true') : false,
          })

          if (reviewEnabled && !autoApprove && reconciled.state !== 'REVIEW' && reconciled.state !== 'VERIFY' && reconciled.state !== 'COMPLETE') {
            log.info('All tasks complete — entering REVIEW gate', { questId })
            const bundle = await generateReviewBundle(projectRoot, reconciled)
            await persistReviewBundle(projectRoot, questId, bundle)
            await appendQuestEvent(projectRoot, questId, buildReviewStartedEvent())
            state.status = 'paused'
            await saveDaemonState(projectRoot, state)
            // Pause loop — user must run quest-review --approve to continue
            await sleep(5000)
            continue
          }

          if (reviewEnabled && autoApprove && reconciled.state !== 'REVIEW' && reconciled.state !== 'VERIFY' && reconciled.state !== 'COMPLETE') {
            log.info('Auto-approving review gate', { questId })
            await appendQuestEvent(projectRoot, questId, buildReviewApprovedEvent())
          }
        }

        const gateResult = await runDaemonQualityGates(projectRoot, questId)
        if (gateResult.passed) {
          log.info('All tasks complete and quality gates passed, daemon finishing', { questId })

          // Deterministic memory extraction on successful completion
          try {
            const extraction = await extractQuestMemory(projectRoot, reconciled)
            log.info('Memory extracted and merged into team-memory', {
              questId,
              commands: extraction.promotedCommands,
              lessons: extraction.promotedLessons,
              candidates: extraction.candidates,
            })
          } catch (memErr) {
            log.warn('Memory extraction failed (non-critical)', {
              questId,
              error: memErr instanceof Error ? memErr.message : String(memErr),
            })
          }

          state.status = 'complete'
          state.progress = 1
          await saveDaemonState(projectRoot, state)
          break
        } else {
          log.warn('Quality gates failed — quest blocked before completion', { questId, summary: gateResult.summary })
          state.status = 'blocked'
          state.lastError = gateResult.summary
          await appendQuestEvent(projectRoot, questId, {
            timestamp: new Date().toISOString(),
            type: 'state_change',
            data: { from: reconciled.state, to: 'VERIFY' },
          })
          await saveDaemonState(projectRoot, state)
          break
        }
      }
    }

    await sleep(1000)
  }

  log.info('Daemon loop exited', { questId, status: state.status })
}

async function finalizeTerminalRuntimes(
  projectRoot: string,
  questId: string,
  state: QuestDaemonState,
): Promise<void> {
  const events = await loadEvents(projectRoot, questId)
  const completedRuntimes = new Set(
    events
      .filter((event) => event.type === 'runtime.completed')
      .map((event) => event.data.runtime as string)
      .filter(Boolean),
  )
  const statusByTask = taskStatusById(events)

  for (const entry of state.runtimes) {
    if (completedRuntimes.has(entry.runtime) || entry.taskIds.length === 0) {
      continue
    }

    const statuses = entry.taskIds.map((taskId) => statusByTask.get(taskId))
    const allTerminal = statuses.every(
      (status) => status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled',
    )

    if (!allTerminal) {
      continue
    }

    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'runtime.completed',
      data: {
        runtime: entry.runtime,
        ok: statuses.every((status) => status === 'completed'),
        taskIds: entry.taskIds,
      },
    })
    entry.status = 'exited'
  }
}

async function settleTerminalRuntimeProcesses(
  projectRoot: string,
  questId: string,
  state: QuestDaemonState,
  tasks: Array<{ id: string; status: string }>,
): Promise<void> {
  const statusByTask = new Map(tasks.map((task) => [task.id, task.status]))

  for (const entry of state.runtimes) {
    if (entry.status !== 'running') continue
    if (entry.taskIds.length === 0) {
      entry.status = 'exited'
      continue
    }

    const allAssignedTasksTerminal = entry.taskIds.every((taskId) => {
      const status = statusByTask.get(taskId)
      return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled'
    })
    if (!allAssignedTasksTerminal) continue

    if (await waitForPidExit(entry.pid, TERMINAL_RUNTIME_EXIT_GRACE_MS)) {
      entry.status = 'exited'
      continue
    }

    log.warn('Runtime still alive after terminal task write-back; stopping before daemon completion', {
      questId,
      runtime: entry.runtime,
      pid: entry.pid,
    })
    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'note',
      data: {
        message: `Runtime ${entry.runtime} was still alive after terminal task write-back; stopping it before daemon completion.`,
        runtime: entry.runtime,
        pid: entry.pid,
      },
    })

    try {
      process.kill(entry.pid, 'SIGTERM')
    } catch {
      entry.status = 'exited'
      continue
    }

    if (!(await waitForPidExit(entry.pid, TERMINAL_RUNTIME_KILL_GRACE_MS))) {
      try {
        process.kill(entry.pid, 'SIGKILL')
      } catch {
        // already gone
      }
      await waitForPidExit(entry.pid, 1000)
    }

    entry.status = 'exited'
  }
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true
    await sleep(100)
  }
  return !isPidAlive(pid)
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

async function heartbeat(
  projectRoot: string,
  questId: string,
  state: QuestDaemonState,
  plan: QuestDaemonPlan,
): Promise<void> {
  for (const entry of state.runtimes) {
    const isAlive = isPidAlive(entry.pid)

    if (isAlive) {
      entry.lastSeenAt = new Date().toISOString()
      if (entry.status !== 'running') {
        entry.status = 'running'
      }
      continue
    }

    const events = await loadEvents(projectRoot, questId)
    const completedEvent = events.some(
      (e) => e.type === 'runtime.completed' && (e.data.runtime as string) === entry.runtime,
    )
    const statusByTask = taskStatusById(events)
    const allAssignedTasksTerminal = entry.taskIds.length > 0 && entry.taskIds.every((taskId) => {
      const status = statusByTask.get(taskId)
      return status === 'completed' || status === 'failed' || status === 'blocked' || status === 'cancelled'
    })

    if (completedEvent || allAssignedTasksTerminal) {
      entry.status = 'exited'
      log.info('Runtime exited cleanly', { questId, runtime: entry.runtime })
      if (!completedEvent) {
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'runtime.completed',
          data: {
            runtime: entry.runtime,
            ok: true,
            taskIds: entry.taskIds,
          },
        })
      }
      continue
    }

    // Crash detected
    entry.status = 'crashed'
    log.warn('Runtime crashed without write-back', {
      questId,
      runtime: entry.runtime,
      pid: entry.pid,
      restartCount: entry.restartCount,
    })

    // Create incident
    const incidentId = await createIncident(projectRoot, {
      questId,
      category: 'runtime_crash',
      summary: `Runtime ${entry.runtime} exited without write-back for quest ${questId}`,
      evidence: [`pid: ${entry.pid}`, `restartCount: ${entry.restartCount}`],
      severity: 'high',
    })

    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'error',
      data: {
        message: `Runtime ${entry.runtime} crashed. Incident: ${incidentId}`,
        critical: true,
        runtime: entry.runtime,
      },
    })
    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'incident.created',
      data: {
        incidentId,
        questId,
        category: 'runtime_crash',
        summary: `Runtime ${entry.runtime} exited without write-back for quest ${questId}`,
        evidence: [`pid: ${entry.pid}`, `restartCount: ${entry.restartCount}`],
        severity: 'high',
      },
    })

    // Retry policy: once
    if (entry.restartCount < 1) {
      entry.restartCount += 1
      entry.status = 'restarting'
      state.status = 'recovering'

      const tasks = plan.tasks
        .filter((task) => entry.taskIds.includes(task.id))
        .filter((task) => {
          const status = statusByTask.get(task.id)
          return status !== 'completed'
        })
        .map((t) => ({ id: t.id, title: t.title, agent: t.agent }))

      if (tasks.length === 0) {
        entry.status = 'exited'
        continue
      }

      const newPid = await spawnRuntimeDetached(projectRoot, questId, entry.runtime, plan.objective, tasks)
      entry.pid = newPid
      entry.taskIds = tasks.map((task) => task.id)
      entry.status = 'running'
      entry.lastSeenAt = new Date().toISOString()
      state.status = 'running'

      await appendQuestEvent(projectRoot, questId, {
        timestamp: new Date().toISOString(),
        type: 'runtime.spawned',
        data: {
          runtime: entry.runtime,
          pid: newPid,
          restart: true,
          taskIds: entry.taskIds,
        },
      })

      log.info('Runtime restarted', { questId, runtime: entry.runtime, pid: newPid })
    } else {
      // Escalate
      state.status = 'crashed'
      state.lastError = `Runtime ${entry.runtime} crashed twice. Manual intervention required.`
      await appendQuestEvent(projectRoot, questId, {
        timestamp: new Date().toISOString(),
        type: 'error',
        data: {
          message: `Runtime ${entry.runtime} crashed twice. Manual intervention required.`,
          critical: true,
          runtime: entry.runtime,
        },
      })
    }
  }

  await saveDaemonState(projectRoot, state)
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function processActions(
  projectRoot: string,
  questId: string,
  state: QuestDaemonState,
  actions: DaemonAction[],
  tasks: Array<{ id: string; dependsOn?: string[] }>,
): Promise<void> {
  for (const action of actions) {
    log.info('Processing daemon action', { questId, action: action.type })

    switch (action.type) {
      case 'pause':
        state.status = 'paused'
        for (const entry of state.runtimes) {
          if (entry.status === 'running') {
            try {
              process.kill(entry.pid, 'SIGSTOP')
            } catch {
              // ignore
            }
          }
        }
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'note',
          data: { message: 'Daemon paused by user' },
        })
        break

      case 'resume':
        state.status = 'running'
        for (const entry of state.runtimes) {
          if (entry.status === 'running') {
            try {
              process.kill(entry.pid, 'SIGCONT')
            } catch {
              // ignore
            }
          }
        }
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'note',
          data: { message: 'Daemon resumed by user' },
        })
        break

      case 'cancel_task':
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'task_update',
          data: { taskId: action.taskId, status: 'cancelled' },
        })
        break

      case 'rerun_task': {
        const toReset = findTasksToResetOnRetry(
          tasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn ?? [] })),
          action.taskId,
        )
        for (const taskId of toReset) {
          await appendQuestEvent(projectRoot, questId, {
            timestamp: new Date().toISOString(),
            type: 'task_update',
            data: { taskId, status: 'pending' },
          })
        }
        log.info('DAG retry queued', { questId, rootTask: action.taskId, resetCount: toReset.length })
        break
      }

      case 'amend':
        await appendQuestEvent(projectRoot, questId, {
          timestamp: new Date().toISOString(),
          type: 'amendment',
          data: { amendmentText: action.text },
        })
        break
    }
  }

  await saveDaemonState(projectRoot, state)
}

// ── Quality Gates ─────────────────────────────────────────────────────────────

interface QualityGateResult {
  passed: boolean
  summary: string
  verificationPassed: boolean
  swarmGatePassed: boolean
}

async function runDaemonQualityGates(
  projectRoot: string,
  questId: string,
): Promise<QualityGateResult> {
  log.info('Running completion quality gates', { questId })

  // 1. Repo-native verification (test/build/lint)
  const verification = await runQuestVerification(projectRoot)
  const verificationPassed = verification.overallPassed || verification.noChecks === true

  // 2. Swarm quality gate (diff analysis, coverage, consistency)
  const swarmGate = await runSwarmQualityGate(projectRoot, { threshold: 0 })
  const swarmGatePassed = swarmGate.passed

  const passed = verificationPassed && swarmGatePassed

  const summary = [
    `Verification: ${verificationPassed ? 'passed' : 'failed'} (${verification.summary})`,
    `Quality gate: ${swarmGatePassed ? 'passed' : 'failed'} (${swarmGate.summary})`,
    `Overall: ${passed ? 'PASSED' : 'FAILED'}`,
  ].join(' · ')

  log.info('Quality gates complete', { questId, passed, summary })

  // Persist validation event
  await appendQuestEvent(projectRoot, questId, {
    timestamp: new Date().toISOString(),
    type: 'validation',
    data: {
      result: verification,
      swarmGate: {
        passed: swarmGatePassed,
        summary: swarmGate.summary,
        score: swarmGate.overallScore,
      },
    },
  })

  if (!passed) {
    const incidentId = await createIncident(projectRoot, {
      questId,
      category: 'verification_failure',
      summary: `Quest completion blocked by quality gate failure: ${summary}`,
      evidence: [
        `verification: ${verificationPassed ? 'OK' : 'FAIL'}`,
        `swarmGate: ${swarmGatePassed ? 'OK' : 'FAIL'}`,
      ],
      severity: 'high',
    })

    await appendQuestEvent(projectRoot, questId, {
      timestamp: new Date().toISOString(),
      type: 'incident.created',
      data: {
        incidentId,
        questId,
        category: 'verification_failure',
        summary: `Completion blocked: ${summary}`,
        severity: 'high',
      },
    })

    log.warn('Quality gate incident created', { questId, incidentId })
  }

  return { passed, summary, verificationPassed, swarmGatePassed }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isTerminalStatus(status: string | undefined): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'blocked' ||
    status === 'cancelled'
  )
}

function taskStatusById(events: Awaited<ReturnType<typeof loadEvents>>): Map<string, string> {
  const statuses = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'task_update') continue
    const taskId = event.data.taskId ?? event.data.task_id
    const status = event.data.status
    if (typeof taskId === 'string' && typeof status === 'string') {
      statuses.set(taskId, status)
    }
  }
  return statuses
}

function updateProgressFromTasks(
  state: QuestDaemonState,
  tasks: Array<{ id: string; status: string }>,
): void {
  const total = tasks.length
  if (total === 0) {
    state.progress = 0
    state.activeTask = undefined
    return
  }

  const terminal = tasks.filter((task) =>
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'blocked' ||
    task.status === 'cancelled',
  ).length
  const active = tasks.find((task) => task.status === 'in_progress')

  state.progress = terminal / total
  state.activeTask = active?.id
}

async function spawnRuntimeDetached(
  projectRoot: string,
  questId: string,
  runtime: RuntimeType,
  objective: string,
  tasks: Array<{ id: string; title: string; agent: string }>,
): Promise<number> {
  const { spawnRuntime } = await import('./runtime-bridge.js')
  const result = await spawnRuntime({
    questId,
    objective,
    projectRoot,
    runDir: join(projectRoot, '.oac', 'runs', questId),
    runtime,
    tasks,
    background: true,
    timeoutMs: RUNTIME_TIMEOUT_MS,
  })

  if (!result.ok) {
    throw new Error(`Failed to spawn ${runtime}: ${result.errorMessage ?? 'unknown error'}`)
  }

  // For background spawns, the PID was written by runtime-bridge
  // We need to read it back
  try {
    const pidRaw = await readFile(join(projectRoot, '.oac', 'runs', questId, `${runtime}.pid`), 'utf-8')
    const pid = parseInt(pidRaw.trim(), 10)
    if (!Number.isNaN(pid)) return pid
  } catch {
    // fallback
  }

  // If we can't read the PID file, we can't track this runtime
  throw new Error(`Spawned ${runtime} but could not determine PID`)
}

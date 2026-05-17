/**
 * oac quest-daemon — Internal command to run the Quest daemon loop.
 *
 * Users should not call this directly. Use `oac quest-run --background` instead.
 */

import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  runDaemonLoop,
  loadDaemonState,
  type QuestDaemonPlan,
  type QuestDaemonTask,
} from '../lib/quest-daemon.js'
import { loadQuestRun, type QuestRun } from '../lib/quest-run.js'
import { loadReconciledQuest } from '../lib/quest-reconciler.js'
import { readConfig } from '../lib/config.js'
import type { RuntimeType } from '../lib/runtime-bridge.js'

export async function questDaemonCommand(questId: string): Promise<void> {
  const projectRoot = process.cwd()

  // Verify quest exists
  const quest = await loadQuestRun(projectRoot, questId)
  if (!quest) {
    console.error(`Quest '${questId}' not found.`)
    process.exitCode = 1
    return
  }

  // Check if daemon is already running
  const existing = await loadDaemonState(projectRoot, questId)
  if (existing && existing.pid !== process.pid && existing.status === 'running') {
    try {
      process.kill(existing.pid, 0)
      console.error(`Daemon already running for ${questId} (pid ${existing.pid})`)
      process.exitCode = 1
      return
    } catch {
      // stale PID, continue
    }
  }

  // Load the saved plan from artifacts. Do not re-route here: that would create
  // new task IDs and break the user's durable Quest state.
  const config = await readConfig(projectRoot)
  const plan = await loadDaemonPlanFromArtifacts(projectRoot, quest)

  // Apply any existing task statuses from reconciled quest
  const reconciled = await loadReconciledQuest(projectRoot, questId)
  if (reconciled) {
    for (const task of plan.tasks) {
      const rt = reconciled.tasks.find((t) => t.id === task.id)
      if (rt?.status && rt.status !== 'pending') {
        task.status = rt.status
      }
    }
  }

  const selectedRuntime = normalizeRuntime(
    process.env.OAC_QUEST_RUNTIME ?? config?.v6?.distributedSwarm.defaultRuntime ?? 'kimi',
  ) ?? 'kimi'
  const runtimeAssignments = Object.fromEntries(
    plan.tasks.map((task) => [task.id, task.runtime ?? selectedRuntime]),
  ) as Record<string, RuntimeType>

  await runDaemonLoop({
    projectRoot,
    questId,
    plan,
    runtimeAssignments,
  })
}

export function registerQuestDaemonCommand(program: Command): void {
  program
    .command('quest-daemon <quest-id>')
    .description('Run the Quest daemon loop (internal — use quest-run --background instead)')
    .action(async (questId: string) => {
      await questDaemonCommand(questId)
    })
}

async function loadDaemonPlanFromArtifacts(
  projectRoot: string,
  quest: QuestRun,
): Promise<QuestDaemonPlan> {
  const planPath = join(projectRoot, '.oac', 'runs', quest.questId, 'plan.json')
  try {
    const raw = await readFile(planPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      objective?: unknown
      tasks?: unknown
    }
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map(normalizeTask).filter((task): task is QuestDaemonTask => Boolean(task))
      : []
    if (tasks.length > 0) {
      return {
        objective: typeof parsed.objective === 'string' ? parsed.objective : quest.objective,
        tasks,
      }
    }
  } catch {
    // Fall back to quest.json below.
  }

  return {
    objective: quest.objective,
    tasks: quest.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      agent: task.expert,
      dependsOn: task.dependsOn,
      status: task.status,
    })),
  }
}

function normalizeTask(value: unknown): QuestDaemonTask | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') return null
  return {
    id: record.id,
    title: typeof record.title === 'string' ? record.title : record.id,
    agent: typeof record.agent === 'string'
      ? record.agent
      : typeof record.expert === 'string'
        ? record.expert
        : 'OpenAgent',
    runtime: normalizeRuntime(record.runtime),
    dependsOn: Array.isArray(record.dependsOn)
      ? record.dependsOn.filter((item): item is string => typeof item === 'string')
      : [],
    status: typeof record.status === 'string' ? record.status : undefined,
  }
}

function normalizeRuntime(value: unknown): RuntimeType | undefined {
  if (value === 'opencode' || value === 'kimi' || value === 'claude') return value
  return undefined
}

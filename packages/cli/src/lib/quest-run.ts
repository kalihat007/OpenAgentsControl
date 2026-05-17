/**
 * Quest run — durable v3 status document for Quest + Experts sessions.
 *
 * `spec.json` remains the compatibility SSOT. `quest.json` is the user-facing
 * lifecycle/status sidecar used by quest-status and quest-resume.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuestScenario, RouterResult } from './task-router.js'
import type { ExecutionPlan, ExecutionResult, RunArtifacts } from './swarm-executor.js'
import type { RunSpecExpert } from './run-spec.js'
import {
  CLAUDE_BRIDGE_COMMAND,
  KIMI_CODE_COMMAND,
  OPENCODE_TUI_COMMAND,
} from './run-handoff.js'

export const QUEST_RUN_VERSION = '3' as const

export type QuestRunState =
  | 'NEW'
  | 'SPEC'
  | 'EXECUTE'
  | 'VERIFY'
  | 'COMPLETE'
  | 'WAITING'
  | 'BLOCKED'
  | 'FAILED'

export type QuestIntensity = 'lite' | 'standard' | 'deep'

export type QuestTrustLabel =
  | 'planned_only'
  | 'inspected_only'
  | 'changed'
  | 'tested'
  | 'pushed'
  | 'blocked'
  | 'failed'

export interface QuestRunTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed' | 'cancelled'
  expert: string
  role?: string
  stage?: string
  dependsOn: string[]
  acceptanceCriteria: string[]
}

export interface QuestRunArtifacts {
  runDir: string
  quest: string
  spec: string
  plan?: string
  events?: string
  acceptanceReport?: string
  summary?: string
  handoff?: string
}

export interface QuestRunRuntime {
  command: string
  resumePrompt: string
}

export interface QuestRun {
  version: typeof QUEST_RUN_VERSION
  questId: string
  runId: string
  objective: string
  scenario: QuestScenario
  state: QuestRunState
  intensity: QuestIntensity
  trustLabel: QuestTrustLabel
  createdAt: string
  updatedAt: string
  experts: RunSpecExpert[]
  tasks: QuestRunTask[]
  acceptanceCriteria: string[]
  artifacts: QuestRunArtifacts
  nextSuggestedAction: string
  runtimes: {
    opencode: QuestRunRuntime
    kimi: QuestRunRuntime
    claude: QuestRunRuntime
  }
}

export interface BuildQuestRunOptions {
  state?: QuestRunState
  trustLabel?: QuestTrustLabel
  artifacts?: Partial<QuestRunArtifacts>
  result?: ExecutionResult
}

export function buildQuestRun(
  routerResult: RouterResult,
  plan: ExecutionPlan,
  options: BuildQuestRunOptions = {},
): QuestRun {
  const state = options.state ?? inferQuestState(options.result)
  const trustLabel = options.trustLabel ?? inferTrustLabel(options.result)
  const runDir = `.oac/runs/${plan.session.id}`
  const artifacts: QuestRunArtifacts = {
    runDir,
    quest: 'quest.json',
    spec: 'spec.json',
    ...options.artifacts,
  }

  return {
    version: QUEST_RUN_VERSION,
    questId: plan.session.id,
    runId: plan.session.id,
    objective: routerResult.objective,
    scenario: routerResult.scenario,
    state,
    intensity: inferQuestIntensity(routerResult, plan),
    trustLabel,
    createdAt: plan.createdAt,
    updatedAt: new Date().toISOString(),
    experts: toRunSpecExperts(routerResult),
    tasks: plan.session.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: normalizeTaskStatus(task.status),
      expert: task.agent,
      role: task.role,
      stage: task.stage,
      dependsOn: task.dependsOn ?? [],
      acceptanceCriteria: task.acceptanceCriteria ?? [],
    })),
    acceptanceCriteria: plan.acceptanceCriteria,
    artifacts,
    nextSuggestedAction: nextActionFor(state, plan.session.id),
    runtimes: buildRuntimeHints(plan.session.id, routerResult.objective, runDir),
  }
}

export async function persistQuestRun(
  projectRoot: string,
  quest: QuestRun,
): Promise<string> {
  const runDir = join(projectRoot, quest.artifacts.runDir)
  await mkdir(runDir, { recursive: true })
  const questPath = join(runDir, quest.artifacts.quest)
  await writeFile(questPath, JSON.stringify(quest, null, 2) + '\n')
  return questPath
}

export async function loadQuestRun(
  projectRoot: string,
  questId: string,
): Promise<QuestRun | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'quest.json'), 'utf-8')
    return JSON.parse(raw) as QuestRun
  } catch {
    return null
  }
}

export async function listQuestRunIds(projectRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(join(projectRoot, '.oac', 'runs'))
    return entries.filter((entry) => !entry.startsWith('.')).sort().reverse()
  } catch {
    return []
  }
}

export function inferQuestIntensity(
  routerResult: RouterResult,
  plan: ExecutionPlan,
): QuestIntensity {
  const taskCount = plan.session.tasks.length
  if (routerResult.scenario === 'direct' && taskCount <= 2) return 'lite'
  if (
    routerResult.scenario === 'research_plan' ||
    plan.decomposition.active ||
    taskCount >= 6 ||
    routerResult.estimatedChunks >= 5
  ) {
    return 'deep'
  }
  return 'standard'
}

export function questArtifactsFromRunArtifacts(artifacts: RunArtifacts): Partial<QuestRunArtifacts> {
  return {
    plan: basename(artifacts.planPath),
    spec: basename(artifacts.specPath),
    events: basename(artifacts.eventsPath),
    acceptanceReport: basename(artifacts.acceptanceReportPath),
    summary: basename(artifacts.summaryPath),
  }
}

function inferQuestState(result?: ExecutionResult): QuestRunState {
  if (!result) return 'SPEC'
  if (result.failedTasks.length > 0) return 'BLOCKED'
  if (result.qualityGate && !result.qualityGate.passed) return 'FAILED'
  if (result.executionMode === 'handoff') return 'WAITING'
  return 'COMPLETE'
}

function inferTrustLabel(result?: ExecutionResult): QuestTrustLabel {
  if (!result) return 'planned_only'
  if (result.failedTasks.length > 0) return 'blocked'
  if (result.qualityGate && !result.qualityGate.passed) return 'failed'
  if (result.qualityGate?.passed) return 'tested'
  return 'planned_only'
}

function toRunSpecExperts(routerResult: RouterResult): RunSpecExpert[] {
  return [
    ...routerResult.primaryExperts.map((expert) => ({
      id: expert.id,
      name: expert.name,
      category: expert.category,
      role: 'primary' as const,
      score: expert.score,
    })),
    ...routerResult.secondaryExperts.map((expert) => ({
      id: expert.id,
      name: expert.name,
      category: expert.category,
      role: 'secondary' as const,
      score: expert.score,
    })),
  ]
}

function normalizeTaskStatus(status: string | undefined): QuestRunTask['status'] {
  if (
    status === 'pending' ||
    status === 'completed' ||
    status === 'blocked' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status
  }
  if (status === 'ready' || status === 'running') return 'in_progress'
  return 'pending'
}

function buildRuntimeHints(
  questId: string,
  objective: string,
  runDir: string,
): QuestRun['runtimes'] {
  const resumePrompt = buildResumePrompt(questId, objective, runDir)
  return {
    opencode: {
      command: OPENCODE_TUI_COMMAND,
      resumePrompt,
    },
    kimi: {
      command: KIMI_CODE_COMMAND,
      resumePrompt,
    },
    claude: {
      command: CLAUDE_BRIDGE_COMMAND,
      resumePrompt,
    },
  }
}

function buildResumePrompt(questId: string, objective: string, runDir: string): string {
  return [
    `Resume OpenAgent Quest ${questId}: ${objective}`,
    `Load ${runDir}/quest.json plus spec.json, plan.json, events.ndjson, and acceptance-report.md when present.`,
    'Continue in Quest Mode + Experts Mode using the same user-selected runtime model.',
  ].join(' ')
}

function nextActionFor(state: QuestRunState, questId: string): string {
  if (state === 'WAITING') return `Start an IDE runtime and paste the resume prompt for Quest ${questId}.`
  if (state === 'COMPLETE') return `Inspect final artifacts with oac quest-status ${questId}.`
  if (state === 'BLOCKED' || state === 'FAILED') return `Resume or debug with oac quest-resume ${questId}.`
  return `Continue planning or run with oac experts --run --live, then resume Quest ${questId}.`
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

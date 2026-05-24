/**
 * Quest run — durable v7 status document with v5/v6 compatibility.
 *
 * `spec.json` remains the compatibility SSOT. `quest.json` is the user-facing
 * lifecycle/status sidecar used by quest-status and quest-resume.
 */

import { mkdir, readdir, readFile, writeFile, appendFile, stat, open, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import type { QuestScenario, RouterResult } from './task-router.js'
import type { ExecutionPlan, ExecutionResult, RunArtifacts } from './swarm-executor.js'
import type { RunSpecExpert } from './run-spec.js'
import {
  CLAUDE_BRIDGE_COMMAND,
  CODEX_COMMAND,
  KIMI_CODE_COMMAND,
  OPENCODE_TUI_COMMAND,
} from './run-handoff.js'

export const QUEST_RUN_VERSION = '8' as const

export type QuestRuntimeName = 'opencode' | 'kimi' | 'claude' | 'codex'

export type QuestRunState =
  | 'NEW'
  | 'SPEC'
  | 'EXECUTE'
  | 'REVIEW'
  | 'VERIFY'
  | 'REFLECT'
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
  priority?: number
  dependsOn: string[]
  acceptanceCriteria: string[]
}

export interface QuestRunArtifacts {
  runDir: string
  quest: string
  spec: string
  agentMemory?: string
  plan?: string
  events?: string
  taskGraph?: string
  acceptanceReport?: string
  reflection?: string
  summary?: string
  handoff?: string
}

export interface QuestRunRuntime {
  command: string
  resumePrompt: string
}

export interface QuestEvent {
  timestamp: string
  type:
    | 'state_change'
    | 'task_update'
    | 'validation'
    | 'file_change'
    | 'error'
    | 'note'
    | 'amendment'
    | 'runtime.assigned'
    | 'runtime.spawned'
    | 'runtime.completed'
    | 'handoff.outgoing'
    | 'handoff.incoming'
    | 'incident.created'
    | 'incident.resolved'
    | 'review.started'
    | 'review.approved'
    | 'review.rejected'
    | 'task.injected'
    | 'task.progress'
    | 'priority.changed'
  data: Record<string, unknown>
}

export interface TaskGraph {
  tasks: Array<{
    id: string
    title: string
    status: QuestRunTask['status']
    dependsOn?: string[]
  }>
}

export interface QuestVerificationResult {
  timestamp: string
  checks: Array<{
    name: string
    command: string
    passed: boolean
    output?: string
    durationMs?: number
  }>
  overallPassed: boolean
  summary: string
  forced?: boolean
  noChecks?: boolean
}

export interface QuestRun {
  version: '5' | '6' | '7' | '8'
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
    codex: QuestRunRuntime
  }
  /** Accumulated changed files (also tracked via events). */
  changedFiles?: string[]
  /** Latest verification result. */
  verification?: QuestVerificationResult
  /** v8: whether the review gate should be skipped for this quest. */
  skipReview?: boolean
}

export interface BuildQuestRunOptions {
  state?: QuestRunState
  trustLabel?: QuestTrustLabel
  artifacts?: Partial<QuestRunArtifacts>
  result?: ExecutionResult
  skipReview?: boolean
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
    agentMemory: 'agent-memory.json',
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
    skipReview: options.skipReview,
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

/** Backfill runtime hints for quests saved before Codex support. */
export function normalizeQuestRun(quest: QuestRun): QuestRun {
  const runDir = quest.artifacts?.runDir ?? `.oac/runs/${quest.questId}`
  const hints = buildRuntimeHints(quest.questId, quest.objective, runDir)
  return {
    ...quest,
    runtimes: {
      opencode: quest.runtimes?.opencode ?? hints.opencode,
      kimi: quest.runtimes?.kimi ?? hints.kimi,
      claude: quest.runtimes?.claude ?? hints.claude,
      codex: quest.runtimes?.codex ?? hints.codex,
    },
  }
}

export async function loadQuestRun(
  projectRoot: string,
  questId: string,
): Promise<QuestRun | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'quest.json'), 'utf-8')
    return normalizeQuestRun(JSON.parse(raw) as QuestRun)
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

// ── Standalone durable-quest helpers (Quest v5) ───────────────────────────────

/**
 * Generate the next Quest ID in the form quest-YYYYMMDD-NNN.
 * Scans .oac/runs/ for existing IDs and increments the daily sequence.
 */
export async function generateQuestId(projectRoot: string): Promise<string> {
  const runsDir = join(projectRoot, '.oac', 'runs')
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `quest-${today}-`

  let maxSeq = 0
  try {
    const entries = await readdir(runsDir)
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const seq = parseInt(entry.slice(prefix.length), 10)
        if (!Number.isNaN(seq) && seq > maxSeq) {
          maxSeq = seq
        }
      }
    }
  } catch {
    // runs dir doesn't exist yet — start at 0
  }

  const nextSeq = String(maxSeq + 1).padStart(3, '0')
  return `${prefix}${nextSeq}`
}

/** Check whether a Quest artifact exists on disk. */
export async function questExists(
  projectRoot: string,
  questId: string,
): Promise<boolean> {
  try {
    const s = await stat(join(projectRoot, '.oac', 'runs', questId, 'quest.json'))
    return s.isFile()
  } catch {
    return false
  }
}

/** Append a single event to events.ndjson. */
export async function appendQuestEvent(
  projectRoot: string,
  questId: string,
  event: QuestEvent,
): Promise<void> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  const path = join(runDir, 'events.ndjson')
  const line = JSON.stringify(event) + '\n'
  await withEventAppendLock(join(runDir, 'events.ndjson.lock'), async () => {
    await appendFile(path, line)
  })
}

async function withEventAppendLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  timeoutMs = 5000,
): Promise<T> {
  const startedAt = Date.now()
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined

  while (!lockHandle) {
    try {
      lockHandle = await open(lockPath, 'wx')
      await lockHandle.writeFile(`${process.pid}:${new Date().toISOString()}\n`)
    } catch (err) {
      if (!isFileExistsError(err)) throw err

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for Quest event lock: ${lockPath}`)
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

/** Write task-graph.json for a quest. */
export async function writeTaskGraph(
  projectRoot: string,
  questId: string,
  tasks: TaskGraph['tasks'],
): Promise<void> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  const graph: TaskGraph = { tasks }
  await writeFile(join(runDir, 'task-graph.json'), JSON.stringify(graph, null, 2) + '\n')
}

// ── Background run PID helpers ────────────────────────────────────────────────

export async function writeRunPid(
  projectRoot: string,
  questId: string,
  pid: number,
): Promise<void> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  await writeFile(join(runDir, 'run.pid'), String(pid))
}

export async function writeRuntimePid(
  projectRoot: string,
  questId: string,
  runtime: string,
  pid: number,
): Promise<void> {
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  await writeFile(join(runDir, `${runtime}.pid`), String(pid))
}

export async function readRunPid(
  projectRoot: string,
  questId: string,
): Promise<number | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'run.pid'), 'utf-8')
    const pid = parseInt(raw.trim(), 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

export function isRunPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Format a runtime-specific handoff block for copy-pasting into an IDE. */
export function formatRuntimeHandoff(
  quest: QuestRun,
  runtime: QuestRuntimeName,
): string {
  const rt = quest.runtimes[runtime]
  const lines: string[] = [
    `OpenAgent Quest v${quest.version} — ${runtime.toUpperCase()} Resume`,
    `Quest ID:    ${quest.questId}`,
    `State:       ${quest.state}`,
    `Trust:       ${quest.trustLabel}`,
    ``,
    `Objective:   ${quest.objective}`,
    `Scenario:    ${quest.scenario}`,
    `Intensity:   ${quest.intensity}`,
    ``,
    'Tasks:',
  ]

  for (const task of quest.tasks) {
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
    lines.push(`  ${icon} ${task.status}: ${task.title}`)
  }

  lines.push('')
  lines.push('Checkpoint:')
  lines.push(`  Next action: ${quest.nextSuggestedAction}`)

  lines.push('')
  lines.push('Runtime command:')
  lines.push(`  ${rt.command}`)
  lines.push(`  (Load quest from ${quest.artifacts.runDir}/quest.json)`)
  lines.push('')
  lines.push('Resume prompt:')
  lines.push(`  ${rt.resumePrompt}`)
  lines.push('')
  lines.push(`v${quest.version} Runtime Write-Back Contract:`)
  lines.push('  DO NOT rewrite quest.json. Append events to events.ndjson only.')
  lines.push('  Stay inside the selected runtime/model. Do not route work to a hidden LLM.')
  lines.push('  Event format: {"timestamp":"ISO","type":"...","data":{}}')
  lines.push('')
  lines.push('  task_update  → {"type":"task_update","data":{"taskId":"1","status":"in_progress"}}')
  lines.push('  state_change → {"type":"state_change","data":{"from":"EXECUTE","to":"VERIFY"}}')
  lines.push('  file_change  → {"type":"file_change","data":{"added":"src/index.ts"}}')
  lines.push('  validation   → {"type":"validation","data":{"result":{"overallPassed":true,...}}}')
  lines.push('  error        → {"type":"error","data":{"taskId":"1","critical":false}}')
  lines.push('  note         → {"type":"note","data":{"message":"Reasoning..."}}')
  lines.push('  runtime.*    → record assignment/spawn/completion metadata when runtime ownership changes')
  lines.push('  handoff.*    → record outgoing/incoming continuity between allowed runtimes')
  if (quest.version === '8') {
    lines.push('  review.*     → record review gate start/approval/rejection')
    lines.push('  task.injected → add dynamic replanning tasks without rewriting quest.json')
    lines.push('  priority.changed → update task priority for the daemon queue')
  }
  lines.push('')
  lines.push('  The CLI reconciler reads base quest.json + events.ndjson to produce live state.')
  lines.push('  Run "oac quest-status <id>" to see reconciled state.')

  return lines.join('\n')
}

/** Generate summary.md content. */
export function formatQuestSummary(quest: QuestRun): string {
  const lines: string[] = [
    `# Quest Summary — ${quest.questId}`,
    '',
    `- **Objective:** ${quest.objective}`,
    `- **Scenario:** ${quest.scenario}`,
    `- **Intensity:** ${quest.intensity}`,
    `- **State:** ${quest.state}`,
    `- **Trust Label:** ${quest.trustLabel}`,
    `- **Created:** ${quest.createdAt}`,
    `- **Updated:** ${quest.updatedAt}`,
    '',
    '## Tasks',
    '',
  ]

  for (const task of quest.tasks) {
    lines.push(`- [${task.status === 'completed' ? 'x' : ' '}] ${task.title} \`(${task.status})\``)
  }

  lines.push('')
  lines.push('## Next Action')
  lines.push(quest.nextSuggestedAction)
  lines.push('')
  return lines.join('\n')
}

/** Generate acceptance-report.md content. */
export function formatAcceptanceReport(quest: QuestRun): string {
  const lines: string[] = [
    `# Acceptance Report — ${quest.questId}`,
    '',
    `- **Objective:** ${quest.objective}`,
    `- **Final State:** ${quest.state}`,
    `- **Trust Label:** ${quest.trustLabel}`,
    `- **Completed At:** ${quest.updatedAt}`,
    '',
    '## Acceptance Criteria',
    '',
  ]

  for (const criterion of quest.acceptanceCriteria) {
    lines.push(`- ${criterion}`)
  }

  const completed = quest.tasks.filter((t) => t.status === 'completed').length
  const total = quest.tasks.length
  lines.push(`- ${completed} of ${total} tasks completed`)

  lines.push('')
  lines.push('## Remaining Risks')
  lines.push('')
  const blocked = quest.tasks.filter((t) => t.status === 'blocked')
  const failed = quest.tasks.filter((t) => t.status === 'failed')
  if (blocked.length === 0 && failed.length === 0) {
    lines.push('_No blocked or failed tasks._')
  } else {
    for (const t of [...blocked, ...failed]) {
      lines.push(`- **${t.title}** — \`${t.status}\``)
    }
  }

  lines.push('')
  return lines.join('\n')
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
    taskGraph: basename(artifacts.taskGraphPath),
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
    codex: {
      command: CODEX_COMMAND,
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

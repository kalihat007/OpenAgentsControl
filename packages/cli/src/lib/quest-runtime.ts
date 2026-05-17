/**
 * Quest Runtime v3 — durable, resumable, inspectable, auditable Quest runs.
 *
 * Core capabilities:
 * - Generate deterministic Quest IDs (quest-YYYYMMDD-NNN)
 * - Read/write Quest artifacts under .oac/runs/{quest-id}/
 * - Append events to events.ndjson
 * - Format runtime handoff text for OpenCode, Kimi, and Claude
 * - Produce summary.md and acceptance-report.md content
 */

import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  appendFile,
  rm,
  stat,
} from 'node:fs/promises'
import { join } from 'node:path'
import {
  OPENCODE_TUI_COMMAND,
  KIMI_CODE_COMMAND,
  CLAUDE_BRIDGE_COMMAND,
} from './run-handoff.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestTrustLabel =
  | 'planned_only'
  | 'inspected_only'
  | 'changed'
  | 'tested'
  | 'pushed'
  | 'blocked'
  | 'failed'

export type QuestState =
  | 'NEW'
  | 'SPEC'
  | 'EXECUTE'
  | 'VERIFY'
  | 'COMPLETE'
  | 'WAITING'

export type QuestTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'failed'

export interface QuestTask {
  id: string
  title: string
  status: QuestTaskStatus
  dependsOn?: string[]
}

export interface QuestCheckpoint {
  currentState: QuestState
  completedTasks: string[]
  pendingTasks: string[]
  blockedTasks: string[]
  lastValidation?: string
  changedFiles: string[]
  nextSuggestedAction?: string
}

export interface QuestEvent {
  timestamp: string
  type: 'state_change' | 'task_update' | 'validation' | 'file_change' | 'error' | 'note'
  data: Record<string, unknown>
}

export interface QuestRuntimeInfo {
  command: string
  promptHint: string
}

export interface QuestArtifact {
  version: '3'
  questId: string
  createdAt: string
  updatedAt: string
  objective: string
  scenario: string
  intensity: string
  state: QuestState
  trustLabel: QuestTrustLabel
  teamLead: string
  experts: string[]
  tasks: QuestTask[]
  checkpoint: QuestCheckpoint
  runtimes: {
    opencode: QuestRuntimeInfo
    kimi: QuestRuntimeInfo
    claude: QuestRuntimeInfo
  }
}

export interface InitQuestOptions {
  projectRoot: string
  objective: string
  scenario: string
  intensity: string
  teamLead?: string
  experts?: string[]
  tasks?: QuestTask[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const QUEST_RUNTIME_VERSION = '3' as const
export const RUNS_DIR_NAME = '.oac' as const
export const RUNS_SUBDIR = 'runs' as const

// ── ID Generation ─────────────────────────────────────────────────────────────

/**
 * Generate the next Quest ID in the form quest-YYYYMMDD-NNN.
 * Scans .oac/runs/ for existing IDs and increments the daily sequence.
 */
export async function generateQuestId(projectRoot: string): Promise<string> {
  const runsDir = getRunsDir(projectRoot)
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

// ── Paths ─────────────────────────────────────────────────────────────────────

export function getRunsDir(projectRoot: string): string {
  return join(projectRoot, RUNS_DIR_NAME, RUNS_SUBDIR)
}

export function getQuestDir(projectRoot: string, questId: string): string {
  return join(getRunsDir(projectRoot), questId)
}

export function getQuestJsonPath(projectRoot: string, questId: string): string {
  return join(getQuestDir(projectRoot, questId), 'quest.json')
}

export function getEventsPath(projectRoot: string, questId: string): string {
  return join(getQuestDir(projectRoot, questId), 'events.ndjson')
}

export function getTaskGraphPath(projectRoot: string, questId: string): string {
  return join(getQuestDir(projectRoot, questId), 'task-graph.json')
}

export function getSummaryPath(projectRoot: string, questId: string): string {
  return join(getQuestDir(projectRoot, questId), 'summary.md')
}

export function getAcceptanceReportPath(
  projectRoot: string,
  questId: string,
): string {
  return join(getQuestDir(projectRoot, questId), 'acceptance-report.md')
}

// ── Artifact I/O ──────────────────────────────────────────────────────────────

/**
 * Create a new Quest artifact with sensible defaults.
 */
export async function initQuestArtifact(
  options: InitQuestOptions,
): Promise<QuestArtifact> {
  const {
    projectRoot,
    objective,
    scenario,
    intensity,
    teamLead = 'active',
    experts = [],
    tasks = [],
  } = options

  const questId = await generateQuestId(projectRoot)
  const now = new Date().toISOString()

  const pendingTasks = tasks.filter((t) => t.status === 'pending').map((t) => t.id)
  const completedTasks = tasks.filter((t) => t.status === 'completed').map((t) => t.id)
  const blockedTasks = tasks.filter((t) => t.status === 'blocked').map((t) => t.id)

  const artifact: QuestArtifact = {
    version: QUEST_RUNTIME_VERSION,
    questId,
    createdAt: now,
    updatedAt: now,
    objective,
    scenario,
    intensity,
    state: 'NEW',
    trustLabel: 'planned_only',
    teamLead,
    experts,
    tasks,
    checkpoint: {
      currentState: 'NEW',
      completedTasks,
      pendingTasks,
      blockedTasks,
      changedFiles: [],
    },
    runtimes: {
      opencode: {
        command: OPENCODE_TUI_COMMAND,
        promptHint: buildResumePrompt(questId, objective, 'NEW', pendingTasks, completedTasks),
      },
      kimi: {
        command: KIMI_CODE_COMMAND,
        promptHint: buildResumePrompt(questId, objective, 'NEW', pendingTasks, completedTasks),
      },
      claude: {
        command: CLAUDE_BRIDGE_COMMAND,
        promptHint: buildResumePrompt(questId, objective, 'NEW', pendingTasks, completedTasks),
      },
    },
  }

  await writeQuestArtifact(projectRoot, artifact)
  await writeTaskGraph(projectRoot, questId, tasks)

  // Seed events.ndjson with creation event
  await appendQuestEvent(projectRoot, questId, {
    timestamp: now,
    type: 'state_change',
    data: { from: null, to: 'NEW', reason: 'quest_created' },
  })

  return artifact
}

/**
 * Write quest.json and derived markdown files.
 */
export async function writeQuestArtifact(
  projectRoot: string,
  artifact: QuestArtifact,
): Promise<void> {
  const questDir = getQuestDir(projectRoot, artifact.questId)
  await mkdir(questDir, { recursive: true })

  artifact.updatedAt = new Date().toISOString()

  await writeFile(
    getQuestJsonPath(projectRoot, artifact.questId),
    JSON.stringify(artifact, null, 2) + '\n',
  )

  // Re-generate derived markdown on every write
  await writeFile(
    getSummaryPath(projectRoot, artifact.questId),
    formatQuestSummary(artifact),
  )

  await writeFile(
    getAcceptanceReportPath(projectRoot, artifact.questId),
    formatAcceptanceReport(artifact),
  )
}

/**
 * Read quest.json for a given Quest ID.
 */
export async function readQuestArtifact(
  projectRoot: string,
  questId: string,
): Promise<QuestArtifact> {
  const path = getQuestJsonPath(projectRoot, questId)
  const raw = await readFile(path, 'utf-8')
  return JSON.parse(raw) as QuestArtifact
}

/**
 * Check whether a Quest artifact exists on disk.
 */
export async function questExists(
  projectRoot: string,
  questId: string,
): Promise<boolean> {
  try {
    const s = await stat(getQuestJsonPath(projectRoot, questId))
    return s.isFile()
  } catch {
    return false
  }
}

// ── Events NDJSON ─────────────────────────────────────────────────────────────

/**
 * Append a single event to events.ndjson.
 */
export async function appendQuestEvent(
  projectRoot: string,
  questId: string,
  event: QuestEvent,
): Promise<void> {
  const questDir = getQuestDir(projectRoot, questId)
  await mkdir(questDir, { recursive: true })
  const path = getEventsPath(projectRoot, questId)
  const line = JSON.stringify(event) + '\n'
  await appendFile(path, line)
}

// ── Task Graph ────────────────────────────────────────────────────────────────

export interface TaskGraph {
  tasks: QuestTask[]
}

export async function writeTaskGraph(
  projectRoot: string,
  questId: string,
  tasks: QuestTask[],
): Promise<void> {
  const questDir = getQuestDir(projectRoot, questId)
  await mkdir(questDir, { recursive: true })
  const graph: TaskGraph = { tasks }
  await writeFile(
    getTaskGraphPath(projectRoot, questId),
    JSON.stringify(graph, null, 2) + '\n',
  )
}

export async function readTaskGraph(
  projectRoot: string,
  questId: string,
): Promise<TaskGraph> {
  const raw = await readFile(getTaskGraphPath(projectRoot, questId), 'utf-8')
  return JSON.parse(raw) as TaskGraph
}

// ── Listing ───────────────────────────────────────────────────────────────────

/**
 * List all Quest artifacts in .oac/runs/, sorted by updatedAt descending.
 */
export async function listQuests(projectRoot: string): Promise<QuestArtifact[]> {
  const runsDir = getRunsDir(projectRoot)
  let entries: string[] = []
  try {
    entries = await readdir(runsDir)
  } catch {
    return []
  }

  const results: QuestArtifact[] = []
  for (const entry of entries) {
    try {
      const artifact = await readQuestArtifact(projectRoot, entry)
      results.push(artifact)
    } catch {
      // Skip directories that aren't valid quest artifacts
    }
  }

  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return results
}

// ── Formatting ────────────────────────────────────────────────────────────────

function buildResumePrompt(
  questId: string,
  objective: string,
  state: QuestState,
  pendingTasks: string[],
  completedTasks: string[],
): string {
  const parts = [
    `Resume Quest ${questId} — ${objective}`,
    `Current state: ${state}.`,
  ]
  if (completedTasks.length > 0) {
    parts.push(`Completed tasks: ${completedTasks.join(', ')}.`)
  }
  if (pendingTasks.length > 0) {
    parts.push(`Pending tasks: ${pendingTasks.join(', ')}.`)
  }
  parts.push('Load full state from quest.json and continue execution.')
  return parts.join(' ')
}

/**
 * Format a runtime-specific handoff block for copy-pasting into an IDE.
 */
export function formatRuntimeHandoff(
  artifact: QuestArtifact,
  runtime: 'opencode' | 'kimi' | 'claude',
): string {
  const rt = artifact.runtimes[runtime]
  const lines: string[] = [
    `OpenAgent Quest v3 — ${runtime.toUpperCase()} Resume`,
    `Quest ID:    ${artifact.questId}`,
    `State:       ${artifact.state}`,
    `Trust:       ${artifact.trustLabel}`,
    ``,
    `Objective:   ${artifact.objective}`,
    `Scenario:    ${artifact.scenario}`,
    `Intensity:   ${artifact.intensity}`,
    ``,
    'Tasks:',
  ]

  for (const task of artifact.tasks) {
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
  lines.push(`  Current state:     ${artifact.checkpoint.currentState}`)
  if (artifact.checkpoint.lastValidation) {
    lines.push(`  Last validation:   ${artifact.checkpoint.lastValidation}`)
  }
  if (artifact.checkpoint.changedFiles.length > 0) {
    lines.push(`  Changed files:     ${artifact.checkpoint.changedFiles.join(', ')}`)
  }
  if (artifact.checkpoint.nextSuggestedAction) {
    lines.push(`  Next action:       ${artifact.checkpoint.nextSuggestedAction}`)
  }

  lines.push('')
  lines.push('Runtime command:')
  lines.push(`  ${rt.command}`)
  lines.push(`  (Load quest from ${artifact.questId}/quest.json)`)
  lines.push('')
  lines.push('Resume prompt:')
  lines.push(`  ${rt.promptHint}`)

  return lines.join('\n')
}

/**
 * Generate summary.md content.
 */
export function formatQuestSummary(artifact: QuestArtifact): string {
  const lines: string[] = [
    `# Quest Summary — ${artifact.questId}`,
    '',
    `- **Objective:** ${artifact.objective}`,
    `- **Scenario:** ${artifact.scenario}`,
    `- **Intensity:** ${artifact.intensity}`,
    `- **State:** ${artifact.state}`,
    `- **Trust Label:** ${artifact.trustLabel}`,
    `- **Created:** ${artifact.createdAt}`,
    `- **Updated:** ${artifact.updatedAt}`,
    '',
    '## Tasks',
    '',
  ]

  for (const task of artifact.tasks) {
    lines.push(`- [${task.status === 'completed' ? 'x' : ' '}] ${task.title} \`(${task.status})\``)
  }

  lines.push('')
  lines.push('## Checkpoint')
  lines.push('')
  lines.push(`- **Current state:** ${artifact.checkpoint.currentState}`)
  lines.push(`- **Completed tasks:** ${artifact.checkpoint.completedTasks.join(', ') || 'none'}`)
  lines.push(`- **Pending tasks:** ${artifact.checkpoint.pendingTasks.join(', ') || 'none'}`)
  lines.push(`- **Blocked tasks:** ${artifact.checkpoint.blockedTasks.join(', ') || 'none'}`)
  if (artifact.checkpoint.lastValidation) {
    lines.push(`- **Last validation:** ${artifact.checkpoint.lastValidation}`)
  }
  if (artifact.checkpoint.changedFiles.length > 0) {
    lines.push(`- **Changed files:** ${artifact.checkpoint.changedFiles.join(', ')}`)
  }
  if (artifact.checkpoint.nextSuggestedAction) {
    lines.push(`- **Next suggested action:** ${artifact.checkpoint.nextSuggestedAction}`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate acceptance-report.md content.
 */
export function formatAcceptanceReport(artifact: QuestArtifact): string {
  const lines: string[] = [
    `# Acceptance Report — ${artifact.questId}`,
    '',
    `- **Objective:** ${artifact.objective}`,
    `- **Final State:** ${artifact.state}`,
    `- **Trust Label:** ${artifact.trustLabel}`,
    `- **Completed At:** ${artifact.updatedAt}`,
    '',
    '## Acceptance Criteria',
    '',
  ]

  const completed = artifact.tasks.filter((t) => t.status === 'completed').length
  const total = artifact.tasks.length
  lines.push(`- ${completed} of ${total} tasks completed`)

  if (artifact.checkpoint.lastValidation) {
    lines.push(`- Last validation: ${artifact.checkpoint.lastValidation}`)
  }

  lines.push('')
  lines.push('## Changed Files')
  lines.push('')
  if (artifact.checkpoint.changedFiles.length === 0) {
    lines.push('_No files recorded as changed._')
  } else {
    for (const f of artifact.checkpoint.changedFiles) {
      lines.push(`- \`${f}\``)
    }
  }

  lines.push('')
  lines.push('## Remaining Risks')
  lines.push('')
  const blocked = artifact.tasks.filter((t) => t.status === 'blocked')
  const failed = artifact.tasks.filter((t) => t.status === 'failed')
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

// ── Cleanup (testing helper) ──────────────────────────────────────────────────

/** Remove a quest directory entirely. Intended for test teardown. */
export async function removeQuest(
  projectRoot: string,
  questId: string,
): Promise<void> {
  const questDir = getQuestDir(projectRoot, questId)
  await rm(questDir, { recursive: true, force: true })
}

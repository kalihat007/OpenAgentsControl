/**
 * Team Memory — durable lessons, conventions, and validated workflows
 * across all completed Quests in a project.
 *
 * Persisted to `.oac/team-memory.json`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLogger } from './logger.js'

const log = createLogger('team-memory')
const MEMORY_PATH = '.oac/team-memory.json'
const MAX_LESSONS = 500

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeamLesson {
  id: string
  timestamp: string
  category: 'convention' | 'command' | 'workflow' | 'risk' | 'pattern'
  lesson: string
  sourceQuestId?: string
  sourceTaskId?: string
  expertId?: string
  verified: boolean
  verificationCount: number
  lastConfirmed?: string
  context?: Record<string, unknown>
}

export interface TeamConvention {
  pattern: string
  convention: string
  source: 'detected' | 'user' | 'learned'
  confidence: number
  firstSeen: string
  lastConfirmed: string
}

export interface ValidatedCommand {
  command: string
  context: string
  worksIn: string[]
  lastVerified: string
  verifiedByQuestId?: string
}

export interface PreferredWorkflow {
  id: string
  name: string
  steps: string[]
  usedCount: number
  lastUsed: string
  preferredBy?: string[]
}

export interface RecurringFailure {
  id: string
  pattern: string
  failureSummary: string
  occurrenceCount: number
  firstSeen: string
  lastSeen: string
  resolved: boolean
  resolution?: string
  sourceQuestIds: string[]
}

export interface TeamMemory {
  version: '1'
  projectRoot: string
  lessons: TeamLesson[]
  conventions: TeamConvention[]
  validatedCommands: ValidatedCommand[]
  preferredWorkflows: PreferredWorkflow[]
  recurringFailures: RecurringFailure[]
  lastUpdated: string
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function initializeTeamMemory(projectRoot: string): TeamMemory {
  return {
    version: '1',
    projectRoot,
    lessons: [],
    conventions: [],
    validatedCommands: [],
    preferredWorkflows: [],
    recurringFailures: [],
    lastUpdated: new Date().toISOString(),
  }
}

export async function loadTeamMemory(projectRoot: string): Promise<TeamMemory> {
  const memoryPath = join(projectRoot, MEMORY_PATH)
  try {
    const raw = await readFile(memoryPath, 'utf-8')
    const parsed = JSON.parse(raw) as TeamMemory
    log.debug('Team memory loaded', {
      lessons: parsed.lessons.length,
      conventions: parsed.conventions.length,
      commands: parsed.validatedCommands.length,
    })
    return parsed
  } catch (err) {
    if (err instanceof SyntaxError) {
      log.warn('Corrupt team memory — reinitializing', { path: memoryPath })
    } else {
      log.debug('No existing team memory — initializing fresh', { path: memoryPath })
    }
    return initializeTeamMemory(projectRoot)
  }
}

export async function saveTeamMemory(memory: TeamMemory): Promise<void> {
  const memoryPath = join(memory.projectRoot, MEMORY_PATH)
  await mkdir(dirname(memoryPath), { recursive: true })

  const updated: TeamMemory = {
    ...memory,
    lastUpdated: new Date().toISOString(),
  }

  await writeFile(memoryPath, JSON.stringify(updated, null, 2) + '\n')
  log.debug('Team memory saved', { path: memoryPath })
}

export async function ensureTeamMemory(projectRoot: string): Promise<TeamMemory> {
  const memory = await loadTeamMemory(projectRoot)
  if (memory.lessons.length === 0 && memory.conventions.length === 0) {
    await saveTeamMemory(memory)
  }
  return memory
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export function recordLesson(
  memory: TeamMemory,
  lesson: Omit<TeamLesson, 'id' | 'timestamp' | 'verificationCount'>,
): TeamMemory {
  const newLesson: TeamLesson = {
    ...lesson,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    verificationCount: lesson.verified ? 1 : 0,
  }

  // Simple dedupe: if exact same lesson text exists, bump verification instead
  const existingIndex = memory.lessons.findIndex(
    (l) => l.lesson === newLesson.lesson && l.category === newLesson.category,
  )

  let lessons: TeamLesson[]
  if (existingIndex >= 0) {
    lessons = memory.lessons.slice()
    const existing = lessons[existingIndex]
    lessons[existingIndex] = {
      ...existing,
      verificationCount: existing.verificationCount + (newLesson.verified ? 1 : 0),
      lastConfirmed: newLesson.timestamp,
      verified: existing.verified || newLesson.verified,
    }
  } else {
    lessons = [...memory.lessons, newLesson]
  }

  // Prune if over limit — remove oldest unverified first
  if (lessons.length > MAX_LESSONS) {
    lessons = pruneLessons(lessons)
  }

  return { ...memory, lessons }
}

function pruneLessons(lessons: TeamLesson[]): TeamLesson[] {
  const sorted = [...lessons].sort((a, b) => {
    // Keep verified, higher verificationCount, newer
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    if (a.verificationCount !== b.verificationCount) {
      return b.verificationCount - a.verificationCount
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
  return sorted.slice(0, MAX_LESSONS)
}

export function getRelevantLessons(
  memory: TeamMemory,
  objective: string,
  limit = 10,
): TeamLesson[] {
  const keywords = objective.toLowerCase().split(/\s+/)
  const scored = memory.lessons.map((lesson) => {
    const text = `${lesson.lesson} ${lesson.category}`.toLowerCase()
    const score = keywords.filter((kw) => text.includes(kw)).length
    return { lesson, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.lesson)
}

// ── Conventions ───────────────────────────────────────────────────────────────

export function recordConvention(
  memory: TeamMemory,
  pattern: string,
  convention: string,
  source: TeamConvention['source'],
  confidence?: number,
): TeamMemory {
  const conventions = memory.conventions.slice()
  const existingIndex = conventions.findIndex((c) => c.pattern === pattern)
  const now = new Date().toISOString()
  const newConvention: TeamConvention = {
    pattern,
    convention,
    source,
    confidence: confidence ?? (source === 'user' ? 1.0 : source === 'learned' ? 0.7 : 0.5),
    firstSeen: now,
    lastConfirmed: now,
  }

  if (existingIndex >= 0) {
    const existing = conventions[existingIndex]
    if (source === 'user' || newConvention.confidence >= existing.confidence) {
      conventions[existingIndex] = { ...newConvention, firstSeen: existing.firstSeen }
    }
  } else {
    conventions.push(newConvention)
  }

  return { ...memory, conventions }
}

// ─- Validated Commands ────────────────────────────────────────────────────────

export function recordValidatedCommand(
  memory: TeamMemory,
  command: string,
  context: string,
  worksIn: string[],
  verifiedByQuestId?: string,
): TeamMemory {
  const existingIndex = memory.validatedCommands.findIndex(
    (c) => c.command === command && c.context === context,
  )
  const entry: ValidatedCommand = {
    command,
    context,
    worksIn,
    lastVerified: new Date().toISOString(),
    verifiedByQuestId,
  }

  const validatedCommands = memory.validatedCommands.slice()
  if (existingIndex >= 0) {
    validatedCommands[existingIndex] = entry
  } else {
    validatedCommands.push(entry)
  }

  return { ...memory, validatedCommands }
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export function recordWorkflowUsage(
  memory: TeamMemory,
  workflowId: string,
  name: string,
  steps: string[],
  preferredBy?: string,
): TeamMemory {
  const workflows = memory.preferredWorkflows.slice()
  const existing = workflows.find((w) => w.id === workflowId)
  const now = new Date().toISOString()

  if (existing) {
    existing.usedCount += 1
    existing.lastUsed = now
    if (preferredBy && !existing.preferredBy?.includes(preferredBy)) {
      existing.preferredBy = [...(existing.preferredBy ?? []), preferredBy]
    }
  } else {
    workflows.push({
      id: workflowId,
      name,
      steps,
      usedCount: 1,
      lastUsed: now,
      preferredBy: preferredBy ? [preferredBy] : undefined,
    })
  }

  return { ...memory, preferredWorkflows: workflows }
}

// ── Recurring Failures ────────────────────────────────────────────────────────

export function recordRecurringFailure(
  memory: TeamMemory,
  pattern: string,
  failureSummary: string,
  questId: string,
): TeamMemory {
  const recurringFailures = memory.recurringFailures.slice()
  const existing = recurringFailures.find((f) => f.pattern === pattern)
  const now = new Date().toISOString()

  if (existing) {
    existing.occurrenceCount += 1
    existing.lastSeen = now
    if (!existing.sourceQuestIds.includes(questId)) {
      existing.sourceQuestIds.push(questId)
    }
  } else {
    recurringFailures.push({
      id: randomUUID(),
      pattern,
      failureSummary,
      occurrenceCount: 1,
      firstSeen: now,
      lastSeen: now,
      resolved: false,
      sourceQuestIds: [questId],
    })
  }

  return { ...memory, recurringFailures }
}

export function resolveRecurringFailure(
  memory: TeamMemory,
  pattern: string,
  resolution: string,
): TeamMemory {
  const recurringFailures = memory.recurringFailures.map((f) =>
    f.pattern === pattern ? { ...f, resolved: true, resolution } : f,
  )
  return { ...memory, recurringFailures }
}

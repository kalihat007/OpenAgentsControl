/**
 * Deterministic memory extraction — v7 quality-gate-driven pattern learning.
 *
 * Rules:
 * - Only extract from events that have passed validation (no heuristics).
 * - Validated commands: from passing `validation` event checks.
 * - Conventions: from `file_change` event patterns (import style, naming).
 * - Recurring failures: from `incident.created` events.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEvents } from './quest-reconciler.js'
import type { ReconciledQuestRun, ReconcilerEvent } from './quest-reconciler.js'
import {
  loadTeamMemory,
  recordLesson,
  recordRecurringFailure,
  recordValidatedCommand,
  saveTeamMemory,
} from './team-memory.js'

export interface ExtractedMemory {
  validatedCommands: Array<{
    command: string
    name: string
    sourceQuestId: string
    extractedAt: string
  }>
  conventions: Array<{
    category: string
    pattern: string
    evidence: string[]
    sourceQuestId: string
    extractedAt: string
  }>
  failurePatterns: Array<{
    category: string
    pattern: string
    count: number
    sourceQuestId: string
    extractedAt: string
  }>
}

export interface MemoryExtractionResult {
  promotedLessons: number
  promotedCommands: number
  candidates: number
}

export async function extractMemoryFromQuest(
  projectRoot: string,
  questId: string,
): Promise<ExtractedMemory> {
  const events = await loadEvents(projectRoot, questId)
  return extractMemoryFromEvents(events, questId)
}

export function extractMemoryFromEvents(events: ReconcilerEvent[], questId: string): ExtractedMemory {
  const extractedAt = new Date().toISOString()
  const validatedCommands: ExtractedMemory['validatedCommands'] = []
  const conventions: ExtractedMemory['conventions'] = []
  const failurePatterns: ExtractedMemory['failurePatterns'] = []

  // Track incident categories for counting
  const incidentCounts = new Map<string, number>()

  for (const event of events) {
    switch (event.type) {
      case 'validation': {
        const data = event.data as Record<string, unknown>
        const result = data.result && typeof data.result === 'object'
          ? data.result as Record<string, unknown>
          : undefined
        const passed = data.passed === true || result?.overallPassed === true
        const rawChecks = Array.isArray(data.checks)
          ? data.checks
          : Array.isArray(result?.checks)
            ? result.checks
            : []
        const checks = rawChecks as Array<{ name?: string; passed?: boolean; command?: string }>

        if (passed) {
          for (const check of checks) {
            if (check.passed && check.command) {
              validatedCommands.push({
                command: check.command,
                name: check.name ?? 'unnamed',
                sourceQuestId: questId,
                extractedAt,
              })
            }
          }
        }
        break
      }

      case 'file_change': {
        const data = event.data as Record<string, unknown>
        const filePath = String(data.path ?? data.file ?? '')
        if (!filePath) continue

        // Detect import style convention from TypeScript/JavaScript files
        if (filePath.match(/\.(ts|tsx|js|jsx|mjs)$/)) {
          const content = String(data.content ?? '')
          const namedImports = (content.match(/import\s*\{[^}]+\}\s*from/g) ?? []).length
          const defaultImports = (content.match(/import\s+\w+\s+from/g) ?? []).length

          if (namedImports > 0 || defaultImports > 0) {
            const total = namedImports + defaultImports
            const style =
              namedImports / total > 0.8
                ? 'named'
                : defaultImports / total > 0.8
                  ? 'default'
                  : 'mixed'
            conventions.push({
              category: 'import_style',
              pattern: style,
              evidence: [filePath],
              sourceQuestId: questId,
              extractedAt,
            })
          }
        }

        // Detect kebab-case file naming convention
        const fileName = filePath.split('/').pop() ?? ''
        if (fileName && fileName.match(/^[a-z0-9]+(-[a-z0-9]+)*\.(ts|js|json|yaml|yml)$/)) {
          conventions.push({
            category: 'file_naming',
            pattern: 'kebab-case',
            evidence: [filePath],
            sourceQuestId: questId,
            extractedAt,
          })
        }
        break
      }

      case 'incident.created': {
        const data = event.data as Record<string, unknown>
        const category = String(data.category ?? 'unknown')
        incidentCounts.set(category, (incidentCounts.get(category) ?? 0) + 1)
        break
      }
    }
  }

  for (const [category, count] of incidentCounts) {
    failurePatterns.push({
      category,
      pattern: `Incident category "${category}" observed ${count} time(s)`,
      count,
      sourceQuestId: questId,
      extractedAt,
    })
  }

  return { validatedCommands, conventions, failurePatterns }
}

/**
 * Promote verified extraction output into team-memory.json.
 *
 * Only validated commands become verified team memory. Conventions and failure
 * observations are preserved as run-local candidates unless separately reviewed.
 */
export async function extractQuestMemory(
  projectRoot: string,
  quest: ReconciledQuestRun,
): Promise<MemoryExtractionResult> {
  const extracted = await extractMemoryFromQuest(projectRoot, quest.questId)
  let memory = await loadTeamMemory(projectRoot)
  let promotedLessons = 0
  let promotedCommands = 0

  for (const command of extracted.validatedCommands) {
    memory = recordValidatedCommand(
      memory,
      command.command,
      `Quest ${quest.scenario}`,
      [projectRoot],
      quest.questId,
    )
    promotedCommands += 1
  }

  if (extracted.validatedCommands.length > 0) {
    const lesson = `Validated commands for ${quest.scenario}: ${extracted.validatedCommands.map((cmd) => cmd.command).join(', ')}`
    if (!memory.lessons.some((entry) => entry.lesson === lesson && entry.category === 'command')) {
      memory = recordLesson(memory, {
        category: 'command',
        lesson,
        sourceQuestId: quest.questId,
        verified: true,
      })
      promotedLessons += 1
    }
  }

  for (const failure of extracted.failurePatterns) {
    memory = recordRecurringFailure(memory, failure.category, failure.pattern, quest.questId)
  }

  await saveTeamMemory(memory)

  const candidates = [
    ...extracted.conventions.map((candidate) => ({
      type: 'convention',
      ...candidate,
      verified: false,
      reason: 'Convention candidates require review before team-memory promotion.',
    })),
    ...extracted.failurePatterns.map((candidate) => ({
      type: 'failure_pattern',
      ...candidate,
      verified: false,
      reason: 'Failure patterns are tracked separately until repeated or reviewed.',
    })),
  ]
  await appendMemoryCandidates(projectRoot, quest.questId, candidates)

  return {
    promotedLessons,
    promotedCommands,
    candidates: candidates.length,
  }
}

/**
 * Merge extracted memory into team-memory.json format.
 */
export function mergeExtractedMemory(
  existing: {
    lessons?: Array<{ text: string; source?: string }>
    validatedCommands?: Array<{ command: string; name: string }>
    recurringFailures?: Array<{ pattern: string; count: number }>
  },
  extracted: ExtractedMemory,
): {
  lessons: Array<{ text: string; source?: string }>
  validatedCommands: Array<{ command: string; name: string }>
  recurringFailures: Array<{ pattern: string; count: number }>
} {
  const lessons = [...(existing.lessons ?? [])]
  const validatedCommands = [...(existing.validatedCommands ?? [])]
  const recurringFailures = [...(existing.recurringFailures ?? [])]

  // Deduplicate validated commands by command string
  const existingCommandSet = new Set(validatedCommands.map((c) => c.command))
  for (const cmd of extracted.validatedCommands) {
    if (!existingCommandSet.has(cmd.command)) {
      validatedCommands.push({ command: cmd.command, name: cmd.name })
      existingCommandSet.add(cmd.command)
    }
  }

  // Deduplicate conventions as lessons
  const existingLessonSet = new Set(lessons.map((l) => l.text))
  for (const conv of extracted.conventions) {
    const text = `${conv.category}: ${conv.pattern} (evidence: ${conv.evidence.join(', ')})`
    if (!existingLessonSet.has(text)) {
      lessons.push({ text, source: conv.sourceQuestId })
      existingLessonSet.add(text)
    }
  }

  // Merge failure patterns by category when possible, summing counts.
  const failureMap = new Map<string, { pattern: string; count: number }>()
  for (const f of recurringFailures) {
    failureMap.set(failurePatternKey(f.pattern), { pattern: f.pattern, count: f.count })
  }
  for (const f of extracted.failurePatterns) {
    const key = f.category || failurePatternKey(f.pattern)
    const existing = failureMap.get(key)
    failureMap.set(key, {
      pattern: existing?.pattern ?? f.pattern,
      count: (existing?.count ?? 0) + f.count,
    })
  }
  const mergedFailures = Array.from(failureMap.values())

  return { lessons, validatedCommands, recurringFailures: mergedFailures }
}

function failurePatternKey(pattern: string): string {
  const match = pattern.match(/Incident category "([^"]+)"/)
  return match?.[1] ?? pattern
}

async function appendMemoryCandidates(
  projectRoot: string,
  questId: string,
  candidates: Array<Record<string, unknown>>,
): Promise<void> {
  if (candidates.length === 0) return
  const runDir = join(projectRoot, '.oac', 'runs', questId)
  await mkdir(runDir, { recursive: true })
  const lines = candidates
    .map((candidate) => JSON.stringify({ ...candidate, timestamp: new Date().toISOString() }))
    .join('\n')
  await appendFile(join(runDir, 'memory-candidates.jsonl'), `${lines}\n`)
}

/**
 * Quest memory promotion — turns repeated interaction-memory learnings into
 * user-approved durable repo knowledge.
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { loadTeamMemory, recordLesson, saveTeamMemory, type TeamLesson } from './team-memory.js'
import type { QuestInteractionKnowledge, QuestInteractionMemory } from './quest-interaction-memory.js'

export type MemoryPromotionStatus = 'pending' | 'approved' | 'rejected'
export type MemoryPromotionTarget = 'team-memory.lesson'

export interface MemoryPromotionEvidence {
  questId: string
  timestamp: string
  kind: string
  summary: string
  files: string[]
  contexts: string[]
  cwd?: string
  runtime?: string
}

export interface MemoryPromotionCandidate {
  id: string
  status: MemoryPromotionStatus
  kind: string
  summary: string
  normalizedKey: string
  confidence: number
  recencyScore: number
  occurrenceCount: number
  sourceQuestIds: string[]
  sourceKinds: string[]
  files: string[]
  contexts: string[]
  runtimes: string[]
  firstSeen: string
  lastSeen: string
  evidence: MemoryPromotionEvidence[]
  target: MemoryPromotionTarget
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  rejectedAt?: string
  rejectionReason?: string
  promotedLessonId?: string
}

export interface ApprovedRepoKnowledge {
  id: string
  candidateId: string
  summary: string
  kind: string
  confidence: number
  occurrenceCount: number
  sourceQuestIds: string[]
  target: MemoryPromotionTarget
  promotedAt: string
  promotedBy: string
}

export interface MemoryPromotionStore {
  version: '1'
  projectRoot: string
  generatedAt: string
  minOccurrences: number
  minConfidence: number
  candidates: MemoryPromotionCandidate[]
  approvedKnowledge: ApprovedRepoKnowledge[]
}

export interface MemoryPromotionOptions {
  minOccurrences?: number
  minConfidence?: number
  now?: Date
}

const STORE_PATH = '.oac/memory/promotions.json'
const DEFAULT_MIN_OCCURRENCES = 2
const DEFAULT_MIN_CONFIDENCE = 0.65
const MAX_EVIDENCE_PER_CANDIDATE = 8
const PROMOTABLE_KINDS = new Set([
  'decision',
  'convention',
  'workflow',
  'pattern',
  'command',
  'risk',
  'blocker',
  'discovery',
  'user_preference',
  'preference',
  'research_performed',
  'knowledge',
])
const NON_PROMOTABLE_KINDS = new Set([
  'action_summary',
  'note',
  'validation',
  'context.loaded',
  'context.changed',
  'working_directory',
  'research_assessment',
])

export async function refreshMemoryPromotionStore(
  projectRoot: string,
  options: MemoryPromotionOptions = {},
): Promise<MemoryPromotionStore> {
  const existing = await loadMemoryPromotionStore(projectRoot)
  const minOccurrences = options.minOccurrences ?? existing.minOccurrences ?? DEFAULT_MIN_OCCURRENCES
  const minConfidence = options.minConfidence ?? existing.minConfidence ?? DEFAULT_MIN_CONFIDENCE
  const now = options.now ?? new Date()
  const generated = await buildPromotionCandidates(projectRoot, { minOccurrences, minConfidence, now })
  const existingById = new Map(existing.candidates.map((candidate) => [candidate.id, candidate]))
  const generatedIds = new Set(generated.map((candidate) => candidate.id))

  const candidates = generated.map((candidate) => {
    const prior = existingById.get(candidate.id)
    if (!prior) return candidate
    return {
      ...candidate,
      status: prior.status,
      createdAt: prior.createdAt,
      approvedAt: prior.approvedAt,
      approvedBy: prior.approvedBy,
      rejectedAt: prior.rejectedAt,
      rejectionReason: prior.rejectionReason,
      promotedLessonId: prior.promotedLessonId,
    }
  })

  for (const prior of existing.candidates) {
    if (prior.status === 'approved' && !generatedIds.has(prior.id)) {
      candidates.push(prior)
    }
  }

  const store: MemoryPromotionStore = {
    version: '1',
    projectRoot,
    generatedAt: now.toISOString(),
    minOccurrences,
    minConfidence,
    candidates: sortCandidates(candidates),
    approvedKnowledge: existing.approvedKnowledge,
  }
  await saveMemoryPromotionStore(projectRoot, store)
  return store
}

export async function loadMemoryPromotionStore(projectRoot: string): Promise<MemoryPromotionStore> {
  try {
    const raw = await readFile(join(projectRoot, STORE_PATH), 'utf-8')
    const parsed = JSON.parse(raw) as MemoryPromotionStore
    return {
      version: '1',
      projectRoot,
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
      minOccurrences: parsed.minOccurrences ?? DEFAULT_MIN_OCCURRENCES,
      minConfidence: parsed.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      candidates: parsed.candidates ?? [],
      approvedKnowledge: parsed.approvedKnowledge ?? [],
    }
  } catch {
    return {
      version: '1',
      projectRoot,
      generatedAt: new Date().toISOString(),
      minOccurrences: DEFAULT_MIN_OCCURRENCES,
      minConfidence: DEFAULT_MIN_CONFIDENCE,
      candidates: [],
      approvedKnowledge: [],
    }
  }
}

export async function saveMemoryPromotionStore(
  projectRoot: string,
  store: MemoryPromotionStore,
): Promise<string> {
  const storePath = join(projectRoot, STORE_PATH)
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(store, null, 2) + '\n')
  return storePath
}

export async function approveMemoryPromotion(
  projectRoot: string,
  candidateId: string,
  options: { approvedBy?: string } = {},
): Promise<MemoryPromotionCandidate> {
  const store = await loadMemoryPromotionStore(projectRoot)
  const index = store.candidates.findIndex((candidate) => candidate.id === candidateId)
  if (index < 0) {
    throw new Error(`Memory promotion candidate not found: ${candidateId}`)
  }

  const now = new Date().toISOString()
  const candidate = {
    ...store.candidates[index],
    status: 'approved' as const,
    approvedAt: now,
    approvedBy: options.approvedBy ?? 'user',
    updatedAt: now,
  }
  store.candidates[index] = candidate

  if (!store.approvedKnowledge.some((entry) => entry.candidateId === candidate.id)) {
    store.approvedKnowledge.push({
      id: `knowledge-${candidate.id}`,
      candidateId: candidate.id,
      summary: candidate.summary,
      kind: candidate.kind,
      confidence: candidate.confidence,
      occurrenceCount: candidate.occurrenceCount,
      sourceQuestIds: candidate.sourceQuestIds,
      target: candidate.target,
      promotedAt: now,
      promotedBy: options.approvedBy ?? 'user',
    })
  }

  let teamMemory = await loadTeamMemory(projectRoot)
  teamMemory = recordLesson(teamMemory, {
    category: lessonCategoryForKind(candidate.kind),
    lesson: candidate.summary,
    sourceQuestId: candidate.sourceQuestIds.at(-1),
    verified: true,
    context: {
      promotedFrom: 'quest-memory-promotion',
      candidateId: candidate.id,
      confidence: candidate.confidence,
      occurrenceCount: candidate.occurrenceCount,
      sourceQuestIds: candidate.sourceQuestIds,
      files: candidate.files,
      contexts: candidate.contexts,
    },
  })
  await saveTeamMemory(teamMemory)

  const promoted = teamMemory.lessons.find(
    (lesson) => lesson.lesson === candidate.summary && lesson.category === lessonCategoryForKind(candidate.kind),
  )
  if (promoted) {
    store.candidates[index] = { ...candidate, promotedLessonId: promoted.id }
  }

  await saveMemoryPromotionStore(projectRoot, store)
  return store.candidates[index]
}

export async function rejectMemoryPromotion(
  projectRoot: string,
  candidateId: string,
  reason?: string,
): Promise<MemoryPromotionCandidate> {
  const store = await loadMemoryPromotionStore(projectRoot)
  const index = store.candidates.findIndex((candidate) => candidate.id === candidateId)
  if (index < 0) {
    throw new Error(`Memory promotion candidate not found: ${candidateId}`)
  }

  const now = new Date().toISOString()
  store.candidates[index] = {
    ...store.candidates[index],
    status: 'rejected',
    rejectedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  }
  await saveMemoryPromotionStore(projectRoot, store)
  return store.candidates[index]
}

export async function buildPromotionCandidates(
  projectRoot: string,
  options: Required<MemoryPromotionOptions>,
): Promise<MemoryPromotionCandidate[]> {
  const memories = await loadAllInteractionMemories(projectRoot)
  const groups = new Map<string, MemoryPromotionEvidence[]>()

  for (const memory of memories) {
    for (const entry of memory.knowledge) {
      if (!isPromotable(entry)) continue
      const key = normalizedKnowledgeKey(entry)
      const evidence = groups.get(key) ?? []
      evidence.push({
        questId: memory.questId,
        timestamp: entry.timestamp,
        kind: entry.kind,
        summary: entry.summary,
        files: entry.files,
        contexts: entry.contexts,
        ...(entry.cwd && { cwd: entry.cwd }),
        ...(entry.runtime && { runtime: entry.runtime }),
      })
      groups.set(key, evidence)
    }
  }

  const now = options.now
  const candidates: MemoryPromotionCandidate[] = []
  for (const [normalizedKey, evidence] of groups) {
    const occurrenceCount = evidence.length
    const firstSeen = evidence.map((item) => item.timestamp).sort()[0] ?? now.toISOString()
    const lastSeen = evidence.map((item) => item.timestamp).sort().at(-1) ?? firstSeen
    const sourceQuestIds = unique(evidence.map((item) => item.questId))
    const sourceKinds = unique(evidence.map((item) => item.kind))
    const files = unique(evidence.flatMap((item) => item.files)).slice(0, 20)
    const contexts = unique(evidence.flatMap((item) => item.contexts)).slice(0, 20)
    const runtimes = unique(evidence.flatMap((item) => item.runtime ? [item.runtime] : []))
    const recencyScore = scoreRecency(lastSeen, now)
    const confidence = scoreConfidence({
      occurrenceCount,
      questCount: sourceQuestIds.length,
      evidenceSurfaceCount: files.length + contexts.length,
      recencyScore,
    })

    if (occurrenceCount < options.minOccurrences || confidence < options.minConfidence) {
      continue
    }

    const representative = pickRepresentativeEvidence(evidence)
    const timestamp = now.toISOString()
    candidates.push({
      id: candidateId(normalizedKey),
      status: 'pending',
      kind: representative.kind,
      summary: representative.summary,
      normalizedKey,
      confidence,
      recencyScore,
      occurrenceCount,
      sourceQuestIds,
      sourceKinds,
      files,
      contexts,
      runtimes,
      firstSeen,
      lastSeen,
      evidence: evidence
        .slice()
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, MAX_EVIDENCE_PER_CANDIDATE),
      target: 'team-memory.lesson',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  return sortCandidates(candidates)
}

export function memoryPromotionStorePath(projectRoot: string): string {
  return join(projectRoot, STORE_PATH)
}

async function loadAllInteractionMemories(projectRoot: string): Promise<QuestInteractionMemory[]> {
  const runsDir = join(projectRoot, '.oac', 'runs')
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await readdir(runsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const memories: QuestInteractionMemory[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(runsDir, entry.name, 'interaction-memory.json'), 'utf-8')
      memories.push(JSON.parse(raw) as QuestInteractionMemory)
    } catch {
      // Runs from older Quest versions may not have interaction memory.
    }
  }
  return memories
}

function isPromotable(entry: QuestInteractionKnowledge): boolean {
  if (!entry.summary || entry.summary.trim().length < 12) return false
  if (NON_PROMOTABLE_KINDS.has(entry.kind)) return false
  return PROMOTABLE_KINDS.has(entry.kind) || entry.kind.startsWith('knowledge')
}

function normalizedKnowledgeKey(entry: QuestInteractionKnowledge): string {
  return `${entry.kind}:${normalizeText(entry.summary)}`
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z\b/g, '<timestamp>')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateId(normalizedKey: string): string {
  return `mp-${createHash('sha256').update(normalizedKey).digest('hex').slice(0, 12)}`
}

function pickRepresentativeEvidence(evidence: MemoryPromotionEvidence[]): MemoryPromotionEvidence {
  return evidence.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]!
}

function scoreRecency(timestamp: string, now: Date): number {
  const seen = new Date(timestamp).getTime()
  if (!Number.isFinite(seen)) return 0.05
  const ageDays = Math.max(0, (now.getTime() - seen) / 86_400_000)
  if (ageDays <= 7) return 1
  if (ageDays <= 30) return 0.8
  if (ageDays <= 90) return 0.55
  if (ageDays <= 180) return 0.35
  return 0.15
}

function scoreConfidence(input: {
  occurrenceCount: number
  questCount: number
  evidenceSurfaceCount: number
  recencyScore: number
}): number {
  const occurrence = Math.min(0.35, (input.occurrenceCount - 1) * 0.16)
  const quest = Math.min(0.2, input.questCount * 0.07)
  const surface = Math.min(0.1, input.evidenceSurfaceCount * 0.02)
  const recency = input.recencyScore * 0.1
  return round(Math.min(0.98, 0.42 + occurrence + quest + surface + recency))
}

function lessonCategoryForKind(kind: string): TeamLesson['category'] {
  if (kind.includes('command')) return 'command'
  if (kind.includes('workflow')) return 'workflow'
  if (kind.includes('risk') || kind.includes('blocker')) return 'risk'
  if (kind.includes('convention')) return 'convention'
  return 'pattern'
}

function sortCandidates(candidates: MemoryPromotionCandidate[]): MemoryPromotionCandidate[] {
  return candidates.slice().sort((a, b) => {
    const statusScore = statusRank(a.status) - statusRank(b.status)
    if (statusScore !== 0) return statusScore
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    if (a.occurrenceCount !== b.occurrenceCount) return b.occurrenceCount - a.occurrenceCount
    return b.lastSeen.localeCompare(a.lastSeen)
  })
}

function statusRank(status: MemoryPromotionStatus): number {
  if (status === 'pending') return 0
  if (status === 'approved') return 1
  return 2
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

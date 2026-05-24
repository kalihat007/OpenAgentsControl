/**
 * Memory Indexer — semantic retrieval layer for cross-session learning.
 *
 * Builds a lightweight inverted index over team memory and quest patterns
 * so OpenAgent can surface the most relevant past lessons before starting
 * a new Quest. No external vector DB required; uses keyword overlap +
 * tf-idf-style scoring.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createLogger } from './logger.js'
import type { TeamMemory, TeamLesson, RecurringFailure } from './team-memory.js'
import type { QuestPattern } from './quest-feedback.js'

const log = createLogger('memory-indexer')
const INDEX_PATH = '.oac/memory-index.json'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryIndexEntry {
  id: string
  type: 'lesson' | 'convention' | 'failure' | 'pattern'
  source: string
  keywords: string[]
  score: number
  lastAccessed: string
}

export interface MemoryIndex {
  version: '1'
  projectRoot: string
  entries: MemoryIndexEntry[]
  keywordMap: Record<string, string[]> // keyword -> entry ids
  lastUpdated: string
}

export interface RetrievalResult {
  entries: MemoryIndexEntry[]
  totalCandidates: number
  queryKeywords: string[]
}

// ── Stopwords ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'from', 'into', 'up', 'out', 'if', 'about', 'than', 'then', 'so', 'no', 'not',
  'only', 'own', 'same', 'such', 'when', 'where', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'very', 'what', 'who', 'why', 'add', 'fix', 'update', 'remove', 'create',
])

// ── Tokenization ──────────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\-/]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 50)
}

export function extractKeywords(text: string): string[] {
  const tokens = tokenize(text)
  // Deduplicate while preserving order
  return [...new Set(tokens)]
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

function tfIdfScore(queryKeywords: string[], entryKeywords: string[], idfMap: Map<string, number>): number {
  let score = 0
  for (const kw of queryKeywords) {
    if (!entryKeywords.includes(kw)) continue
    const tf = entryKeywords.filter((k) => k === kw).length / entryKeywords.length
    const idf = idfMap.get(kw) ?? 1
    score += tf * idf
  }
  return score
}

function buildIdfMap(allEntries: MemoryIndexEntry[]): Map<string, number> {
  const docCount = allEntries.length || 1
  const keywordDocCount = new Map<string, number>()
  for (const entry of allEntries) {
    const seen = new Set<string>()
    for (const kw of entry.keywords) {
      if (!seen.has(kw)) {
        keywordDocCount.set(kw, (keywordDocCount.get(kw) ?? 0) + 1)
        seen.add(kw)
      }
    }
  }
  const idfMap = new Map<string, number>()
  for (const [kw, count] of keywordDocCount) {
    idfMap.set(kw, Math.log(docCount / count) + 1)
  }
  return idfMap
}

// ── Index Building ────────────────────────────────────────────────────────────

export function buildMemoryIndex(
  projectRoot: string,
  teamMemory: TeamMemory,
  patterns: QuestPattern[],
): MemoryIndex {
  const entries: MemoryIndexEntry[] = []

  // Index lessons
  for (const lesson of teamMemory.lessons) {
    const keywords = extractKeywords(`${lesson.lesson} ${lesson.category}`)
    entries.push({
      id: lesson.id,
      type: 'lesson',
      source: `team-memory:${lesson.category}`,
      keywords,
      score: lesson.verificationCount,
      lastAccessed: lesson.lastConfirmed ?? lesson.timestamp,
    })
  }

  // Index conventions
  for (const convention of teamMemory.conventions) {
    const keywords = extractKeywords(`${convention.convention} ${convention.pattern}`)
    entries.push({
      id: `conv-${convention.pattern}`,
      type: 'convention',
      source: 'team-memory:convention',
      keywords,
      score: convention.confidence * 10,
      lastAccessed: convention.lastConfirmed,
    })
  }

  // Index recurring failures
  for (const failure of teamMemory.recurringFailures) {
    const keywords = extractKeywords(`${failure.pattern} ${failure.failureSummary}`)
    entries.push({
      id: failure.id,
      type: 'failure',
      source: 'team-memory:recurring-failure',
      keywords,
      score: failure.occurrenceCount * 2,
      lastAccessed: failure.lastSeen,
    })
  }

  // Index quest patterns
  for (const pattern of patterns) {
    const keywords = [...pattern.objectiveKeywords]
    entries.push({
      id: pattern.patternId,
      type: 'pattern',
      source: `pattern:${pattern.scenario}:${pattern.outcome}`,
      keywords,
      score: pattern.outcome === 'success' ? 5 : 1,
      lastAccessed: pattern.createdAt,
    })
  }

  // Build keyword map
  const keywordMap: Record<string, string[]> = {}
  for (const entry of entries) {
    for (const kw of entry.keywords) {
      if (!keywordMap[kw]) keywordMap[kw] = []
      keywordMap[kw].push(entry.id)
    }
  }

  return {
    version: '1',
    projectRoot,
    entries,
    keywordMap,
    lastUpdated: new Date().toISOString(),
  }
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

export function retrieveRelevantMemory(
  index: MemoryIndex,
  query: string,
  options: { maxResults?: number; minScore?: number; typeFilter?: string[] } = {},
): RetrievalResult {
  const { maxResults = 5, minScore = 0.05, typeFilter } = options
  const queryKeywords = extractKeywords(query)

  if (queryKeywords.length === 0 || index.entries.length === 0) {
    return { entries: [], totalCandidates: 0, queryKeywords }
  }

  // Fast path: find candidate entries via keyword map
  const candidateIds = new Set<string>()
  for (const kw of queryKeywords) {
    const ids = index.keywordMap[kw]
    if (ids) {
      for (const id of ids) candidateIds.add(id)
    }
  }

  // If no direct keyword hits, there are no relevant candidates
  if (candidateIds.size === 0) {
    return { entries: [], totalCandidates: 0, queryKeywords }
  }
  const candidates = index.entries.filter((e) => candidateIds.has(e.id))

  const idfMap = buildIdfMap(index.entries)

  const scored = candidates
    .filter((e) => !typeFilter || typeFilter.includes(e.type))
    .map((entry) => {
      const tfidf = tfIdfScore(queryKeywords, entry.keywords, idfMap)
      const jaccard = jaccardSimilarity(queryKeywords, entry.keywords)
      // Combine scores: tf-idf for semantic relevance, jaccard for overlap, entry score for quality
      const combined = tfidf * 0.5 + jaccard * 0.3 + Math.min(entry.score / 10, 1) * 0.2
      return { entry, score: combined }
    })
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)

  return {
    entries: scored.map((s) => s.entry),
    totalCandidates: candidates.length,
    queryKeywords,
  }
}

// ── Persistence ─────────────────────────────────────────────────────────────────

export async function saveMemoryIndex(projectRoot: string, index: MemoryIndex): Promise<void> {
  const path = join(projectRoot, INDEX_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(index, null, 2))
  log.debug('Memory index saved', { entries: index.entries.length })
}

export async function loadMemoryIndex(projectRoot: string): Promise<MemoryIndex | null> {
  const path = join(projectRoot, INDEX_PATH)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as MemoryIndex
    if (parsed.version !== '1') {
      log.warn('Unknown memory index version', { version: parsed.version })
      return null
    }
    return parsed
  } catch {
    return null
  }
}

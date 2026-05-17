/**
 * Quest Feedback Loop — extracts patterns from completed quests and stores
 * them in a corpus that improves future task routing decisions.
 */

import { readFile, appendFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReconciledQuestRun } from './quest-reconciler.js'
import type { QuestScenario } from './task-router.js'

const CORPUS_DIR = '.oac/project-intelligence'
const CORPUS_FILE = 'quest-patterns.jsonl'

export interface QuestPattern {
  patternId: string
  objectiveKeywords: string[]
  scenario: QuestScenario
  expertSequence: string[]
  taskCount: number
  outcome: 'success' | 'failed' | 'blocked'
  durationMs: number
  createdAt: string
}

type QuestPatternMatch = QuestPattern & { similarity?: number }

interface CorpusEntry {
  pattern: QuestPattern
  similarityHash: string
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Extract keywords from an objective string.
 * Simple tokenization: lowercase, split on non-alphanumeric, filter stopwords.
 */
export function extractKeywords(objective: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  ])
  return objective
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !stopwords.has(w))
    .slice(0, 20)
}

/**
 * Compute Jaccard similarity between two keyword sets (0 to 1).
 */
export function keywordSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  return intersection.size / union.size
}

/**
 * Extract a pattern from a completed (or failed) reconciled quest.
 */
export function extractPattern(quest: ReconciledQuestRun): QuestPattern {
  const objectiveKeywords = extractKeywords(quest.objective)
  const expertSequence = quest.tasks
    .filter((t) => t.status === 'completed')
    .map((t) => t.expert)
    .filter((e, i, arr) => arr.indexOf(e) === i) // dedupe preserving order

  const outcome: QuestPattern['outcome'] =
    quest.state === 'COMPLETE' && quest.trustLabel !== 'failed'
      ? 'success'
      : quest.state === 'BLOCKED' || quest.state === 'FAILED'
        ? 'blocked'
        : 'failed'

  const createdAt = new Date(quest.createdAt).toISOString()
  const updatedAt = new Date(quest.updatedAt).toISOString()
  const durationMs = new Date(updatedAt).getTime() - new Date(createdAt).getTime()

  return {
    patternId: `pattern-${quest.questId}`,
    objectiveKeywords,
    scenario: quest.scenario,
    expertSequence,
    taskCount: quest.tasks.length,
    outcome,
    durationMs: Math.max(0, durationMs),
    createdAt: updatedAt,
  }
}

/**
 * Build a similarity hash for deduplication.
 */
function buildSimilarityHash(pattern: QuestPattern): string {
  const keywords = pattern.objectiveKeywords.sort().join(',')
  const experts = pattern.expertSequence.join('→')
  return `${pattern.scenario}::${keywords}::${experts}`
}

/**
 * Load all patterns from the corpus.
 */
export async function loadPatternCorpus(projectRoot: string): Promise<QuestPattern[]> {
  const path = join(projectRoot, CORPUS_DIR, CORPUS_FILE)
  if (!(await fileExists(path))) return []

  const raw = await readFile(path, 'utf-8')
  const patterns: QuestPattern[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line) as CorpusEntry
      patterns.push(entry.pattern)
    } catch {
      // skip corrupt lines
    }
  }
  return patterns
}

/**
 * Append a pattern to the corpus, avoiding near-duplicates.
 */
export async function appendPatternToCorpus(
  projectRoot: string,
  pattern: QuestPattern,
  options: { maxSize?: number; minSimilarityForDedup?: number } = {},
): Promise<{ appended: boolean; reason?: string }> {
  const maxSize = options.maxSize ?? 1000
  const minSimilarityForDedup = options.minSimilarityForDedup ?? 0.85

  const dir = join(projectRoot, CORPUS_DIR)
  await mkdir(dir, { recursive: true })
  const path = join(dir, CORPUS_FILE)

  const existing = await loadPatternCorpus(projectRoot)

  // Deduplication: skip if very similar pattern already exists
  const newHash = buildSimilarityHash(pattern)
  for (const existingPattern of existing) {
    const existingHash = buildSimilarityHash(existingPattern)
    if (existingHash === newHash) {
      return { appended: false, reason: 'exact duplicate' }
    }
    const sim = keywordSimilarity(pattern.objectiveKeywords, existingPattern.objectiveKeywords)
    if (sim >= minSimilarityForDedup && existingPattern.outcome === pattern.outcome) {
      return { appended: false, reason: `similar pattern exists (similarity ${sim.toFixed(2)})` }
    }
  }

  // Size limit: if at capacity, don't append (simple FIFO — could be enhanced to LRU)
  if (existing.length >= maxSize) {
    return { appended: false, reason: 'corpus at max size' }
  }

  const entry: CorpusEntry = { pattern, similarityHash: newHash }
  await appendFile(path, JSON.stringify(entry) + '\n')
  return { appended: true }
}

/**
 * Find patterns similar to the given objective keywords.
 */
export async function findSimilarPatterns(
  projectRoot: string,
  objective: string,
  options: { minConfidence?: number; maxResults?: number } = {},
): Promise<Array<QuestPattern & { similarity: number }>> {
  const minConfidence = options.minConfidence ?? 0.5
  const maxResults = options.maxResults ?? 5

  const keywords = extractKeywords(objective)
  const corpus = await loadPatternCorpus(projectRoot)

  const scored = corpus
    .map((pattern) => ({
      ...pattern,
      similarity: keywordSimilarity(keywords, pattern.objectiveKeywords),
    }))
    .filter((s) => s.similarity >= minConfidence)
    .sort((a, b) => b.similarity - a.similarity)

  return scored.slice(0, maxResults)
}

/**
 * Boost expert scores based on successful patterns in the corpus.
 */
export function boostExpertsFromPatterns(
  expertScores: Map<string, number>,
  patterns: QuestPatternMatch[],
  options: { boostAmount?: number; penalizeAmount?: number } = {},
): Map<string, number> {
  const boostAmount = options.boostAmount ?? 2
  const penalizeAmount = options.penalizeAmount ?? 1.5
  const boosted = new Map(expertScores)

  for (const pattern of patterns) {
    const weight = pattern.outcome === 'success' ? boostAmount : -penalizeAmount
    for (const expert of pattern.expertSequence) {
      const current = boosted.get(expert) ?? 0
      boosted.set(expert, current + weight * (pattern.similarity ?? 0.5))
    }
  }

  return boosted
}

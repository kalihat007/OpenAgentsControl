/**
 * Quest Temporal Memory (v14).
 *
 * Increment 1: a durable, cross-quest failure-fingerprint store. Unlike the
 * per-quest failure-fix memory in the Coding Autopilot / Semantic Repo Brain,
 * this store persists under `.oac/memory/temporal-memory.json` and accumulates
 * how often each failure recurs across quests. Commands that fail in three or
 * more distinct quests without ever being resolved become `chronic` and are
 * escalated by the guarded autofix runner instead of being retried.
 *
 * Later increments add a patch-outcome ledger and git-history signals on top of
 * the same durable store; see docs/quest-temporal-memory.md.
 */

import { execFile as execFileCb } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { QuestCodingAutopilot } from './quest-coding-autopilot.js'
import type { QuestPatchCapsule } from './quest-coding-intelligence.js'

const execFileAsync = promisify(execFileCb)

export const QUEST_TEMPORAL_MEMORY_VERSION = '14' as const

const STORE_PATH = '.oac/memory/temporal-memory.json'
const DEFAULT_TTL_DAYS = 90
const MAX_FAILURES = 2_000
const MAX_OUTCOMES = 2_000
const MAX_QUEST_IDS = 50
const MAX_EVIDENCE = 10
const CHRONIC_THRESHOLD = 3
const COMMIT_SCAN_LIMIT = 200

export type DurableFailureStatus = 'active' | 'resolved' | 'chronic'

export type PatchOutcome = 'pending' | 'validated' | 'reverted' | 'hotfixed' | 'merged'

export interface DurableFailureRecord {
  fingerprint: string
  command: string
  summary: string
  knownFix: string
  firstSeenQuestId: string
  lastSeenQuestId: string
  firstSeenAt: string
  lastSeenAt: string
  /** Number of distinct quests in which this fingerprint failed. */
  occurrenceCount: number
  /** Number of distinct quests in which the same command later succeeded. */
  resolvedCount: number
  questIds: string[]
  resolvedQuestIds: string[]
  status: DurableFailureStatus
  fixConfidence: number
}

export interface PatchOutcomeRecord {
  capsuleId: string
  fileKey: string
  summary: string
  questId: string
  recordedAt: string
  files: string[]
  outcome: PatchOutcome
  evidence: string[]
}

export interface TemporalMemoryStore {
  version: typeof QUEST_TEMPORAL_MEMORY_VERSION
  projectRoot: string
  generatedAt: string
  ttlDays: number
  failures: DurableFailureRecord[]
  outcomes: PatchOutcomeRecord[]
}

export interface QuestTemporalMemory {
  version: typeof QUEST_TEMPORAL_MEMORY_VERSION
  generatedAt: string
  projectRoot: string
  questId?: string
  summary: { total: number; active: number; resolved: number; chronic: number }
  /** Commands whose fingerprints are chronic — the autofix runner must escalate, not retry. */
  chronicCommands: string[]
  failures: DurableFailureRecord[]
  outcomeSummary: { total: number; pending: number; validated: number; reverted: number; hotfixed: number; merged: number }
  patchOutcomes: PatchOutcomeRecord[]
  policy: string[]
}

export interface BuildQuestTemporalMemoryOptions {
  projectRoot: string
  questId?: string
  files: string[]
  codingAutopilot: QuestCodingAutopilot
  patchCapsules?: QuestPatchCapsule[]
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  now?: string
  ttlDays?: number
}

interface IncomingFailure {
  command: string
  summary: string
  knownFix: string
}

const DEFAULT_FIX =
  'Replay the exact command, inspect the first actionable error, apply one scoped fix, then rerun the same command.'

/**
 * Stable, source-independent failure fingerprint. Unifies the Autopilot and
 * event-stream schemes (see docs/quest-temporal-memory.md §7) so the same
 * failure is not double-counted across sources or runs.
 */
export function failureFingerprint(command: string, summary: string): string {
  const key = `${command.trim()}:${normalizeSummary(summary)}`
  return `ff-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`
}

/** Strips volatile detail (paths, line/cols, hashes, timestamps, bare numbers). */
export function normalizeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, '<ts>')
    .replace(/[a-f0-9]{7,}/g, '<hash>')
    .replace(/:\d+(:\d+)?/g, ':<n>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export async function loadTemporalMemoryStore(projectRoot: string): Promise<TemporalMemoryStore> {
  try {
    const raw = await readFile(join(projectRoot, STORE_PATH), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TemporalMemoryStore>
    return {
      version: QUEST_TEMPORAL_MEMORY_VERSION,
      projectRoot,
      generatedAt: parsed.generatedAt ?? '',
      ttlDays: parsed.ttlDays ?? DEFAULT_TTL_DAYS,
      failures: Array.isArray(parsed.failures) ? parsed.failures.map(normalizeRecord) : [],
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes.map(normalizeOutcome) : [],
    }
  } catch {
    return emptyStore(projectRoot)
  }
}

export async function saveTemporalMemoryStore(
  projectRoot: string,
  store: TemporalMemoryStore,
): Promise<string> {
  const storePath = join(projectRoot, STORE_PATH)
  await mkdir(dirname(storePath), { recursive: true })
  // Atomic replace: write a sibling temp file, then rename over the target so a
  // concurrent reader never observes a half-written store.
  const tmpPath = `${storePath}.${process.pid}.tmp`
  await writeFile(tmpPath, JSON.stringify(store, null, 2) + '\n')
  await rename(tmpPath, storePath)
  return storePath
}

export async function buildQuestTemporalMemory(
  options: BuildQuestTemporalMemoryOptions,
): Promise<QuestTemporalMemory> {
  const now = options.now ?? new Date().toISOString()
  const questId = options.questId ?? 'manual'
  const store = await loadTemporalMemoryStore(options.projectRoot)
  store.ttlDays = options.ttlDays ?? store.ttlDays ?? DEFAULT_TTL_DAYS

  // Merge this quest's failures, counting each fingerprint at most once per quest.
  for (const failure of collectIncomingFailures(options)) {
    const fingerprint = failureFingerprint(failure.command, failure.summary)
    let record = store.failures.find((candidate) => candidate.fingerprint === fingerprint)
    if (!record) {
      record = {
        fingerprint,
        command: failure.command,
        summary: failure.summary,
        knownFix: failure.knownFix || DEFAULT_FIX,
        firstSeenQuestId: questId,
        lastSeenQuestId: questId,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 0,
        resolvedCount: 0,
        questIds: [],
        resolvedQuestIds: [],
        status: 'active',
        fixConfidence: 0.5,
      }
      store.failures.push(record)
    }
    record.lastSeenQuestId = questId
    record.lastSeenAt = now
    if (failure.knownFix) record.knownFix = failure.knownFix
    if (!record.questIds.includes(questId)) {
      record.questIds = [questId, ...record.questIds].slice(0, MAX_QUEST_IDS)
      record.occurrenceCount += 1
    }
  }

  // A command that now passes resolves matching active failures (once per quest).
  for (const command of collectSuccessCommands(options.events)) {
    for (const record of store.failures) {
      if (record.command === command && !record.resolvedQuestIds.includes(questId)) {
        record.resolvedQuestIds = [questId, ...record.resolvedQuestIds].slice(0, MAX_QUEST_IDS)
        record.resolvedCount += 1
      }
    }
  }

  for (const record of store.failures) record.status = statusFor(record)

  store.outcomes = await buildPatchOutcomes(store.outcomes, options, now, questId)

  store.failures = pruneFailures(store.failures, now, store.ttlDays).slice(0, MAX_FAILURES)
  store.outcomes = pruneOutcomes(store.outcomes, now, store.ttlDays).slice(0, MAX_OUTCOMES)
  store.generatedAt = now
  await saveTemporalMemoryStore(options.projectRoot, store)

  return snapshot(store, now, questId, options.questId)
}

export async function writeQuestTemporalMemoryArtifacts(
  dir: string,
  memory: QuestTemporalMemory,
): Promise<void> {
  await Promise.all([
    writeFile(join(dir, 'temporal-memory.json'), JSON.stringify(memory, null, 2) + '\n'),
    writeFile(
      join(dir, 'patch-outcome-ledger.json'),
      JSON.stringify({ version: memory.version, summary: memory.outcomeSummary, outcomes: memory.patchOutcomes }, null, 2) + '\n',
    ),
    writeFile(join(dir, 'temporal-memory.md'), formatTemporalMemoryBrief(memory)),
  ])
}

export function formatTemporalMemorySummary(memory: QuestTemporalMemory): string {
  return [
    '## Temporal Memory',
    '',
    `- Durable failures: ${memory.summary.total}`,
    `- Active: ${memory.summary.active}`,
    `- Resolved: ${memory.summary.resolved}`,
    `- Chronic (escalate, do not retry): ${memory.summary.chronic}`,
    ...(memory.chronicCommands.length > 0
      ? [`- Chronic commands: ${memory.chronicCommands.slice(0, 5).join(', ')}`]
      : []),
    `- Patch outcomes: ${memory.outcomeSummary.total} (reverted ${memory.outcomeSummary.reverted}, hotfixed ${memory.outcomeSummary.hotfixed}, merged ${memory.outcomeSummary.merged}, validated ${memory.outcomeSummary.validated}, pending ${memory.outcomeSummary.pending})`,
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------

function collectIncomingFailures(options: BuildQuestTemporalMemoryOptions): IncomingFailure[] {
  const fromAutopilot = options.codingAutopilot.failureMemory.failures.map((failure) => ({
    command: failure.command,
    summary: failure.summary,
    knownFix: failure.suggestedFix,
  }))
  const fromEvents = options.events.flatMap((event) => {
    if (event.type !== 'validation') return []
    const result = event.data?.result as
      | { checks?: Array<{ command?: string; passed?: boolean; output?: string }> }
      | undefined
    return (result?.checks ?? [])
      .filter((check) => check.passed === false && check.command)
      .map((check) => ({
        command: check.command as string,
        summary: summarizeOutput(check.output) ?? 'Validation command failed.',
        knownFix: DEFAULT_FIX,
      }))
  })
  return [...fromAutopilot, ...fromEvents]
}

function collectSuccessCommands(
  events: Array<{ type?: string; data?: Record<string, unknown> }>,
): string[] {
  const commands = events.flatMap((event) => {
    if (event.type !== 'validation') return []
    const result = event.data?.result as
      | { checks?: Array<{ command?: string; passed?: boolean }> }
      | undefined
    return (result?.checks ?? [])
      .filter((check) => check.passed === true && check.command)
      .map((check) => check.command as string)
  })
  return [...new Set(commands)]
}

function statusFor(record: DurableFailureRecord): DurableFailureStatus {
  if (record.occurrenceCount >= CHRONIC_THRESHOLD && record.resolvedCount === 0) return 'chronic'
  if (record.resolvedCount > 0) return 'resolved'
  return 'active'
}

const OUTCOME_RANK: Record<PatchOutcome, number> = {
  reverted: 5,
  hotfixed: 4,
  merged: 3,
  validated: 2,
  pending: 1,
}

function chooseOutcome(current: PatchOutcome, candidate: PatchOutcome): PatchOutcome {
  return OUTCOME_RANK[candidate] > OUTCOME_RANK[current] ? candidate : current
}

function fileKeyFor(files: string[]): string {
  const sorted = [...new Set(files.map((file) => file.replace(/\\/g, '/')))].sort()
  return `pf-${createHash('sha1').update(sorted.join('|')).digest('hex').slice(0, 16)}`
}

/**
 * Upserts a durable outcome record per patch capsule and re-grades every record
 * against recent git history. A revert commit touching a recorded file-set marks
 * it `reverted`; a fix/hotfix commit marks it `hotfixed`; a COMPLETE lifecycle
 * event marks the quest's patches `merged`; otherwise a passing validation marks
 * them `validated`.
 *
 * Limitation (refined in a later increment): revert/fix detection is not yet
 * ordered against the patch's own commit, so a same-quest fix-subject commit on
 * the file-set can read as `hotfixed`.
 */
async function buildPatchOutcomes(
  existing: PatchOutcomeRecord[],
  options: BuildQuestTemporalMemoryOptions,
  now: string,
  questId: string,
): Promise<PatchOutcomeRecord[]> {
  const outcomes = [...existing]
  const lifecycleComplete = options.events.some(
    (event) => event.type === 'state_change' && (event.data?.to as string | undefined) === 'COMPLETE',
  )
  const validationPassed = options.events.some(
    (event) => event.type === 'validation' && (event.data?.result as { overallPassed?: boolean } | undefined)?.overallPassed === true,
  )

  for (const capsule of options.patchCapsules ?? []) {
    if (capsule.files.length === 0) continue
    const fileKey = fileKeyFor(capsule.files)
    let record = outcomes.find((candidate) => candidate.fileKey === fileKey)
    if (!record) {
      record = {
        capsuleId: capsule.id,
        fileKey,
        summary: capsule.summary,
        questId,
        recordedAt: now,
        files: [...capsule.files],
        outcome: 'pending',
        evidence: [],
      }
      outcomes.push(record)
    } else {
      record.capsuleId = capsule.id
      record.summary = capsule.summary
    }
    if (validationPassed) record.outcome = chooseOutcome(record.outcome, 'validated')
    if (lifecycleComplete) record.outcome = chooseOutcome(record.outcome, 'merged')
  }

  // Re-grade all records (current + historical) against recent git history.
  const commits = await recentCommits(options.projectRoot, COMMIT_SCAN_LIMIT)
  if (commits.length > 0) {
    for (const record of outcomes) {
      const fileSet = new Set(record.files.map((file) => file.replace(/\\/g, '/')))
      for (const commit of commits) {
        if (!commit.files.some((file) => fileSet.has(file))) continue
        const candidate: PatchOutcome | null = isRevertSubject(commit.subject)
          ? 'reverted'
          : isFixSubject(commit.subject)
            ? 'hotfixed'
            : null
        if (!candidate) continue
        record.outcome = chooseOutcome(record.outcome, candidate)
        if (!record.evidence.includes(commit.sha)) {
          record.evidence = [commit.sha, ...record.evidence].slice(0, MAX_EVIDENCE)
        }
      }
    }
  }

  return outcomes
}

async function recentCommits(
  projectRoot: string,
  limit: number,
): Promise<Array<{ sha: string; subject: string; files: string[] }>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--no-merges', `--max-count=${limit}`, '--name-only', '--format=__C__%H|%s'],
      { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 },
    )
    const commits: Array<{ sha: string; subject: string; files: string[] }> = []
    let current: { sha: string; subject: string; files: string[] } | null = null
    for (const line of stdout.split('\n')) {
      if (line.startsWith('__C__')) {
        const rest = line.slice(5)
        const sep = rest.indexOf('|')
        current = { sha: rest.slice(0, sep), subject: rest.slice(sep + 1), files: [] }
        commits.push(current)
      } else if (line.trim() && current) {
        current.files.push(line.trim().replace(/\\/g, '/'))
      }
    }
    return commits
  } catch {
    return []
  }
}

function isRevertSubject(subject: string): boolean {
  return /\brevert\b/i.test(subject)
}

function isFixSubject(subject: string): boolean {
  return /\b(fix|hotfix|bug|regression|patch)\b/i.test(subject)
}

function pruneOutcomes(outcomes: PatchOutcomeRecord[], now: string, ttlDays: number): PatchOutcomeRecord[] {
  const cutoff = Date.parse(now) - ttlDays * 24 * 60 * 60 * 1000
  return outcomes
    .filter((record) => {
      const seen = Date.parse(record.recordedAt)
      return Number.isNaN(seen) || seen >= cutoff
    })
    .sort((a, b) => OUTCOME_RANK[b.outcome] - OUTCOME_RANK[a.outcome] || a.fileKey.localeCompare(b.fileKey))
}

function pruneFailures(
  failures: DurableFailureRecord[],
  now: string,
  ttlDays: number,
): DurableFailureRecord[] {
  const cutoff = Date.parse(now) - ttlDays * 24 * 60 * 60 * 1000
  return failures
    .filter((record) => {
      const seen = Date.parse(record.lastSeenAt)
      return Number.isNaN(seen) || seen >= cutoff
    })
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.command.localeCompare(b.command))
}

function snapshot(
  store: TemporalMemoryStore,
  now: string,
  questId: string,
  originalQuestId: string | undefined,
): QuestTemporalMemory {
  const chronicCommands = [
    ...new Set(store.failures.filter((record) => record.status === 'chronic').map((record) => record.command)),
  ].sort()
  const countOutcome = (outcome: PatchOutcome): number =>
    store.outcomes.filter((record) => record.outcome === outcome).length
  return {
    version: QUEST_TEMPORAL_MEMORY_VERSION,
    generatedAt: now,
    projectRoot: store.projectRoot,
    ...(originalQuestId && { questId }),
    summary: {
      total: store.failures.length,
      active: store.failures.filter((record) => record.status === 'active').length,
      resolved: store.failures.filter((record) => record.status === 'resolved').length,
      chronic: store.failures.filter((record) => record.status === 'chronic').length,
    },
    chronicCommands,
    failures: store.failures,
    outcomeSummary: {
      total: store.outcomes.length,
      pending: countOutcome('pending'),
      validated: countOutcome('validated'),
      reverted: countOutcome('reverted'),
      hotfixed: countOutcome('hotfixed'),
      merged: countOutcome('merged'),
    },
    patchOutcomes: store.outcomes,
    policy: [
      'Replay active failure fingerprints before broader validation.',
      'Escalate chronic fingerprints (failed in 3+ quests, never resolved) instead of retrying.',
      'A command that passes resolves its matching failure fingerprint.',
      'Treat reverted/hotfixed patch surfaces as higher-risk; prefer extra review there.',
      'Durable workflow lessons still require user-approved memory promotion.',
    ],
  }
}

function formatTemporalMemoryBrief(memory: QuestTemporalMemory): string {
  const lines = [
    '# Temporal Memory',
    '',
    `- Version: ${memory.version}`,
    `- Generated: ${memory.generatedAt}`,
    `- Durable failures: ${memory.summary.total} (active ${memory.summary.active}, resolved ${memory.summary.resolved}, chronic ${memory.summary.chronic})`,
    '',
    '## Chronic Failures (escalate, do not retry)',
    '',
    ...(memory.failures.filter((record) => record.status === 'chronic').length > 0
      ? memory.failures
          .filter((record) => record.status === 'chronic')
          .slice(0, 20)
          .map((record) => `- \`${record.command}\` — failed in ${record.occurrenceCount} quest(s): ${record.knownFix}`)
      : ['_No chronic failures._']),
    '',
    '## Higher-Risk Patch Surfaces (reverted / hotfixed)',
    '',
    ...(memory.patchOutcomes.filter((record) => record.outcome === 'reverted' || record.outcome === 'hotfixed').length > 0
      ? memory.patchOutcomes
          .filter((record) => record.outcome === 'reverted' || record.outcome === 'hotfixed')
          .slice(0, 20)
          .map((record) => `- **${record.outcome}** — ${record.files.slice(0, 4).join(', ')}: ${record.summary}`)
      : ['_No reverted or hotfixed patch surfaces recorded._']),
    '',
  ]
  return lines.join('\n')
}

function normalizeRecord(record: Partial<DurableFailureRecord>): DurableFailureRecord {
  return {
    fingerprint: record.fingerprint ?? '',
    command: record.command ?? '',
    summary: record.summary ?? '',
    knownFix: record.knownFix ?? DEFAULT_FIX,
    firstSeenQuestId: record.firstSeenQuestId ?? '',
    lastSeenQuestId: record.lastSeenQuestId ?? '',
    firstSeenAt: record.firstSeenAt ?? '',
    lastSeenAt: record.lastSeenAt ?? '',
    occurrenceCount: record.occurrenceCount ?? 0,
    resolvedCount: record.resolvedCount ?? 0,
    questIds: Array.isArray(record.questIds) ? record.questIds : [],
    resolvedQuestIds: Array.isArray(record.resolvedQuestIds) ? record.resolvedQuestIds : [],
    status: record.status ?? 'active',
    fixConfidence: record.fixConfidence ?? 0.5,
  }
}

function normalizeOutcome(record: Partial<PatchOutcomeRecord>): PatchOutcomeRecord {
  return {
    capsuleId: record.capsuleId ?? '',
    fileKey: record.fileKey ?? '',
    summary: record.summary ?? '',
    questId: record.questId ?? '',
    recordedAt: record.recordedAt ?? '',
    files: Array.isArray(record.files) ? record.files : [],
    outcome: record.outcome ?? 'pending',
    evidence: Array.isArray(record.evidence) ? record.evidence : [],
  }
}

function emptyStore(projectRoot: string): TemporalMemoryStore {
  return {
    version: QUEST_TEMPORAL_MEMORY_VERSION,
    projectRoot,
    generatedAt: '',
    ttlDays: DEFAULT_TTL_DAYS,
    failures: [],
    outcomes: [],
  }
}

function summarizeOutput(output: string | undefined): string | undefined {
  if (!output?.trim()) return undefined
  return output.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 240)
}

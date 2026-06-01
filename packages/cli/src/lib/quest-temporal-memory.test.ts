import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildQuestTemporalMemory,
  failureFingerprint,
  loadTemporalMemoryStore,
  normalizeSummary,
  saveTemporalMemoryStore,
  QUEST_TEMPORAL_MEMORY_VERSION,
  type DurableFailureRecord,
  type TemporalMemoryStore,
} from './quest-temporal-memory.js'
import { refreshQuestCodingIntelligence } from './quest-coding-intelligence.js'
import type { QuestCodingAutopilot } from './quest-coding-autopilot.js'

const NOW = '2026-06-01T00:00:00.000Z'

/** Minimal autopilot stub — buildQuestTemporalMemory only reads failureMemory.failures. */
function autopilotWith(
  failures: Array<{ command: string; summary: string; suggestedFix?: string }>,
): QuestCodingAutopilot {
  return {
    failureMemory: {
      failures: failures.map((failure, index) => ({
        id: `f-${index + 1}`,
        command: failure.command,
        summary: failure.summary,
        files: [],
        fingerprint: `legacy-${index}`,
        suggestedFix: failure.suggestedFix ?? 'fix it',
      })),
      reusableLearnings: [],
    },
  } as unknown as QuestCodingAutopilot
}

function validationEvent(checks: Array<{ command: string; passed: boolean; output?: string }>) {
  return { type: 'validation', data: { result: { checks } } }
}

function chronicRecord(command: string, lastSeenAt: string): DurableFailureRecord {
  return {
    fingerprint: failureFingerprint(command, 'boom'),
    command,
    summary: 'boom',
    knownFix: 'inspect and fix',
    firstSeenQuestId: 'q1',
    lastSeenQuestId: 'q3',
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    occurrenceCount: 3,
    resolvedCount: 0,
    questIds: ['q3', 'q2', 'q1'],
    resolvedQuestIds: [],
    status: 'chronic',
    fixConfidence: 0.5,
  }
}

async function seedProject(tmpRoot: string): Promise<void> {
  await mkdir(join(tmpRoot, 'packages', 'cli', 'src', 'lib'), { recursive: true })
  await mkdir(join(tmpRoot, 'plugins', 'kimi-code'), { recursive: true })
  await writeFile(
    join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'temporal-test', scripts: { test: 'bun test' } }, null, 2),
  )
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'sample.ts'),
    'export function sample(): number { return 1 }\n',
  )
  await writeFile(join(tmpRoot, 'plugins', 'kimi-code', 'openagent.yaml'), 'name: OpenAgent\n')
}

describe('quest-temporal-memory', () => {
  it('produces a stable, volatile-insensitive fingerprint', () => {
    // Differ only in numbers → same fingerprint.
    expect(failureFingerprint('npm test', 'failed after 42 ms')).toBe(
      failureFingerprint('npm test', 'failed after 990 ms'),
    )
    // Different command → different fingerprint.
    expect(failureFingerprint('npm test', 'boom')).not.toBe(failureFingerprint('npm build', 'boom'))
    // Volatile line:col and bare numbers normalize away.
    expect(normalizeSummary('failed at foo.ts:42:9 after 13 ms')).toBe(normalizeSummary('failed at foo.ts:7:1 after 900 ms'))
  })

  it('saves atomically and round-trips the store', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-rt-'))
    try {
      const store: TemporalMemoryStore = {
        version: QUEST_TEMPORAL_MEMORY_VERSION,
        projectRoot: tmpRoot,
        generatedAt: NOW,
        ttlDays: 90,
        failures: [chronicRecord('npm test', NOW)],
      }
      await saveTemporalMemoryStore(tmpRoot, store)

      // No temp file left behind by the atomic rename.
      const entries = await readdir(join(tmpRoot, '.oac', 'memory'))
      expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false)
      expect(entries).toContain('temporal-memory.json')

      const loaded = await loadTemporalMemoryStore(tmpRoot)
      expect(loaded.version).toBe(QUEST_TEMPORAL_MEMORY_VERSION)
      expect(loaded.failures).toHaveLength(1)
      expect(loaded.failures[0]?.command).toBe('npm test')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('counts a fingerprint once per quest and escalates to chronic after three quests', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-chronic-'))
    try {
      const fail = [{ command: 'npm test', summary: 'boom' }]

      // Same quest twice → must NOT inflate the count.
      await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q1', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })
      let mem = await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q1', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })
      expect(mem.failures[0]?.occurrenceCount).toBe(1)
      expect(mem.summary.active).toBe(1)
      expect(mem.summary.chronic).toBe(0)

      // Two more distinct quests → chronic at three.
      await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q2', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })
      mem = await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q3', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })

      expect(mem.failures[0]?.occurrenceCount).toBe(3)
      expect(mem.failures[0]?.status).toBe('chronic')
      expect(mem.summary.chronic).toBe(1)
      expect(mem.chronicCommands).toContain('npm test')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('resolves a fingerprint when the same command later passes', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-resolve-'))
    try {
      const fail = [{ command: 'npm test', summary: 'boom' }]
      await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q1', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })
      await buildQuestTemporalMemory({ projectRoot: tmpRoot, questId: 'q2', files: [], codingAutopilot: autopilotWith(fail), events: [], now: NOW })

      // q3: the command now passes, no new failure observed.
      const mem = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q3',
        files: [],
        codingAutopilot: autopilotWith([]),
        events: [validationEvent([{ command: 'npm test', passed: true, output: 'ok' }])],
        now: NOW,
      })

      expect(mem.failures[0]?.resolvedCount).toBe(1)
      expect(mem.failures[0]?.status).toBe('resolved')
      expect(mem.chronicCommands).not.toContain('npm test')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('prunes failures older than the TTL', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-ttl-'))
    try {
      const old = '2026-01-01T00:00:00.000Z' // ~5 months before NOW
      await saveTemporalMemoryStore(tmpRoot, {
        version: QUEST_TEMPORAL_MEMORY_VERSION,
        projectRoot: tmpRoot,
        generatedAt: old,
        ttlDays: 30,
        failures: [chronicRecord('npm test', old)],
      })

      const mem = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        files: [],
        codingAutopilot: autopilotWith([]),
        events: [],
        now: NOW,
        ttlDays: 30,
      })

      expect(mem.summary.total).toBe(0)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('escalates chronic commands in the guarded autofix runner via the coding-intelligence loop', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-e2e-'))
    try {
      await seedProject(tmpRoot)
      // 'git diff --check' is always in the smart-test minimum credible commands,
      // so seeding it as chronic guarantees it reaches the autofix queue.
      await saveTemporalMemoryStore(tmpRoot, {
        version: QUEST_TEMPORAL_MEMORY_VERSION,
        projectRoot: tmpRoot,
        generatedAt: new Date().toISOString(),
        ttlDays: 90,
        failures: [chronicRecord('git diff --check', new Date().toISOString())],
      })

      const intelligence = await refreshQuestCodingIntelligence(tmpRoot, {
        objective: 'exercise chronic escalation',
        changedFiles: ['packages/cli/src/lib/sample.ts'],
        reason: 'test',
      })

      expect(intelligence.temporalMemory.version).toBe(QUEST_TEMPORAL_MEMORY_VERSION)
      expect(intelligence.temporalMemory.chronicCommands).toContain('git diff --check')

      const queued = intelligence.codingExecution.guardedAutofixRunner.queue.find(
        (item) => item.command === 'git diff --check',
      )
      expect(queued?.escalate).toBe(true)
      expect(intelligence.codingExecution.guardedAutofixRunner.stopConditions.some((line) => /chronic/i.test(line))).toBe(true)

      // Artifact sidecars are written.
      const artDir = join(tmpRoot, '.oac', 'coding-intelligence')
      expect(await readFile(join(artDir, 'temporal-memory.json'), 'utf-8')).toContain('"version": "14"')
      expect(await readFile(join(artDir, 'temporal-memory.md'), 'utf-8')).toContain('Temporal Memory')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

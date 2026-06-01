import { describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { QuestPatchCapsule } from './quest-coding-intelligence.js'
import {
  buildQuestTemporalMemory,
  empiricalConfidenceAdjustment,
  failureFingerprint,
  loadTemporalMemoryStore,
  normalizeSummary,
  saveTemporalMemoryStore,
  QUEST_TEMPORAL_MEMORY_VERSION,
  type DurableFailureRecord,
  type PatchOutcomeRecord,
  type RepoHistorySignals,
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

function capsule(id: string, files: string[], summary = 'change'): QuestPatchCapsule {
  return { id, summary, files, expectedBehavior: '', validationCommands: [], rollbackNote: '' }
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
      expect(await readFile(join(artDir, 'patch-outcome-ledger.json'), 'utf-8')).toContain('"version": "14"')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('records a validated patch outcome from a passing validation and upserts per file-set', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-validated-'))
    try {
      const built = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q1',
        files: [],
        codingAutopilot: autopilotWith([]),
        patchCapsules: [capsule('c1', ['src/x.ts'], 'add helper')],
        events: [{ type: 'validation', data: { result: { overallPassed: true, checks: [] } } }],
        now: NOW,
      })
      expect(built.patchOutcomes).toHaveLength(1)
      expect(built.patchOutcomes[0]?.outcome).toBe('validated')
      expect(built.outcomeSummary.validated).toBe(1)

      // Same file-set in a later quest upserts the same record (no duplicate).
      const again = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q2',
        files: [],
        codingAutopilot: autopilotWith([]),
        patchCapsules: [capsule('c2', ['src/x.ts'], 'tweak helper')],
        events: [],
        now: NOW,
      })
      expect(again.patchOutcomes).toHaveLength(1)
      expect(again.outcomeSummary.total).toBe(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('marks patch surfaces merged on quest completion', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-merged-'))
    try {
      const mem = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q1',
        files: [],
        codingAutopilot: autopilotWith([]),
        patchCapsules: [capsule('c1', ['src/y.ts'])],
        events: [{ type: 'state_change', data: { to: 'COMPLETE' } }],
        now: NOW,
      })
      expect(mem.patchOutcomes[0]?.outcome).toBe('merged')
      expect(mem.outcomeSummary.merged).toBe(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('grades a patch surface as reverted only when the revert post-dates the record', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-revert-'))
    try {
      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpRoot, stdio: 'ignore' })
      git('init', '-q')
      git('config', 'user.email', 'test@example.com')
      git('config', 'user.name', 'Test')
      await writeFile(join(tmpRoot, 'feature.ts'), 'export const a = 1\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'add feature')

      // Record the patch first (recordedAt within TTL), passing validation.
      const recorded = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q1',
        files: [],
        codingAutopilot: autopilotWith([]),
        patchCapsules: [capsule('c1', ['feature.ts'], 'introduce feature')],
        events: [{ type: 'validation', data: { result: { overallPassed: true, checks: [] } } }],
        now: '2026-06-01T00:00:00.000Z',
      })
      expect(recorded.patchOutcomes.find((r) => r.files.includes('feature.ts'))?.outcome).toBe('validated')

      // A revert commit dated AFTER the record flips it to reverted (deterministic date).
      await writeFile(join(tmpRoot, 'feature.ts'), 'export const a = 2\n')
      git('add', '-A')
      execFileSync('git', ['commit', '-q', '-m', 'Revert "add feature" change'], {
        cwd: tmpRoot,
        stdio: 'ignore',
        env: { ...process.env, GIT_AUTHOR_DATE: '2026-06-02T00:00:00', GIT_COMMITTER_DATE: '2026-06-02T00:00:00' },
      })

      const regraded = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        questId: 'q2',
        files: [],
        codingAutopilot: autopilotWith([]),
        events: [],
        now: '2026-06-03T00:00:00.000Z',
      })

      const record = regraded.patchOutcomes.find((r) => r.files.includes('feature.ts'))
      expect(record?.outcome).toBe('reverted')
      expect(record?.evidence.length).toBeGreaterThan(0)
      expect(regraded.outcomeSummary.reverted).toBe(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('adjusts confidence empirically from outcomes and bug-density', () => {
    const history: RepoHistorySignals = {
      headSha: 'abc',
      computedAt: NOW,
      commitsScanned: 4,
      coChange: {},
      churn: {},
      bugDensity: { 'a.ts': { fixCommits: 3, totalCommits: 4, ratio: 0.75 } },
      ownership: {},
    }
    const outcome = (files: string[], o: PatchOutcomeRecord['outcome']): PatchOutcomeRecord => ({
      capsuleId: 'c', fileKey: 'k', summary: 's', questId: 'q', recordedAt: NOW, files, outcome: o, evidence: [],
    })

    // Reverted surface → lower than base, high risk.
    const reverted = empiricalConfidenceAdjustment('b.ts', 0.86, { patchOutcomes: [outcome(['b.ts'], 'reverted')], history })
    expect(reverted.score).toBeLessThan(0.86)
    expect(reverted.risk).toBe('high')

    // Bug-prone file with no outcomes → still high risk, lowered score.
    const buggy = empiricalConfidenceAdjustment('a.ts', 0.86, { patchOutcomes: [], history })
    expect(buggy.risk).toBe('high')
    expect(buggy.score).toBeLessThan(0.86)

    // Clean file with prior validated outcomes → low risk, not below base.
    const clean = empiricalConfidenceAdjustment('c.ts', 0.86, { patchOutcomes: [outcome(['c.ts'], 'validated')], history })
    expect(clean.risk).toBe('low')
    expect(clean.score).toBeGreaterThanOrEqual(0.86)

    // Monotonic: more reverts → strictly lower score.
    const one = empiricalConfidenceAdjustment('d.ts', 0.86, { patchOutcomes: [outcome(['d.ts'], 'reverted')], history })
    const two = empiricalConfidenceAdjustment('d.ts', 0.86, {
      patchOutcomes: [
        { ...outcome(['d.ts'], 'reverted'), fileKey: 'k1' },
        { ...outcome(['d.ts'], 'reverted'), fileKey: 'k2' },
      ],
      history,
    })
    expect(two.score).toBeLessThan(one.score)
  })

  it('extracts co-change, churn, bug-density, and ownership from git history', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-history-'))
    try {
      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpRoot, stdio: 'ignore' })
      git('init', '-q')
      git('config', 'user.email', 'dev@example.com')
      git('config', 'user.name', 'Dev')

      await writeFile(join(tmpRoot, 'a.ts'), 'export const a = 1\n')
      await writeFile(join(tmpRoot, 'b.ts'), 'export const b = 1\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'add a and b')
      await writeFile(join(tmpRoot, 'a.ts'), 'export const a = 2\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'fix bug in a')
      await writeFile(join(tmpRoot, 'a.ts'), 'export const a = 3\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'refactor a')

      const mem = await buildQuestTemporalMemory({
        projectRoot: tmpRoot,
        files: [],
        codingAutopilot: autopilotWith([]),
        events: [],
      })

      const h = mem.history
      expect(h.headSha.length).toBeGreaterThan(0)
      expect(h.commitsScanned).toBe(3)
      expect(h.churn['a.ts']?.commits).toBe(3)
      expect(h.churn['b.ts']?.commits).toBe(1)
      expect(h.bugDensity['a.ts']?.fixCommits).toBe(1)
      expect(h.bugDensity['a.ts']?.ratio).toBeGreaterThan(0)
      expect(h.coChange['a.ts']?.some((n) => n.file === 'b.ts')).toBe(true)
      expect(h.ownership['a.ts']?.topAuthor).toBe('Dev')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('caches history signals by HEAD sha and recomputes only when HEAD moves', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-hcache-'))
    try {
      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpRoot, stdio: 'ignore' })
      git('init', '-q')
      git('config', 'user.email', 'dev@example.com')
      git('config', 'user.name', 'Dev')
      await writeFile(join(tmpRoot, 'a.ts'), 'export const a = 1\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'initial')

      const first = await buildQuestTemporalMemory({ projectRoot: tmpRoot, files: [], codingAutopilot: autopilotWith([]), events: [], now: '2026-05-01T00:00:00.000Z' })
      // HEAD unchanged → reuse cached signals (computedAt stays at the first value).
      const second = await buildQuestTemporalMemory({ projectRoot: tmpRoot, files: [], codingAutopilot: autopilotWith([]), events: [], now: '2026-06-01T00:00:00.000Z' })
      expect(second.history.computedAt).toBe(first.history.computedAt)
      expect(second.history.computedAt).toBe('2026-05-01T00:00:00.000Z')

      // New commit moves HEAD → recompute.
      await writeFile(join(tmpRoot, 'a.ts'), 'export const a = 2\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'change a')
      const third = await buildQuestTemporalMemory({ projectRoot: tmpRoot, files: [], codingAutopilot: autopilotWith([]), events: [], now: '2026-06-02T00:00:00.000Z' })
      expect(third.history.computedAt).toBe('2026-06-02T00:00:00.000Z')
      expect(third.history.headSha).not.toBe(first.history.headSha)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('returns empty history outside a git repository', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-temporal-nogit-'))
    try {
      const mem = await buildQuestTemporalMemory({ projectRoot: tmpRoot, files: [], codingAutopilot: autopilotWith([]), events: [], now: NOW })
      expect(mem.history.headSha).toBe('')
      expect(mem.history.commitsScanned).toBe(0)
      expect(Object.keys(mem.history.churn)).toHaveLength(0)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

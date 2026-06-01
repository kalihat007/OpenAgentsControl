import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendQuestEvent, buildQuestRun, persistQuestRun } from './quest-run.js'
import { refreshQuestCodingIntelligence } from './quest-coding-intelligence.js'
import {
  formatSemanticRepoBrainSummary,
  QUEST_SEMANTIC_REPO_BRAIN_VERSION,
} from './quest-semantic-repo-brain.js'
import {
  saveMemoryPromotionStore,
  type MemoryPromotionCandidate,
  type MemoryPromotionStore,
} from './quest-memory-promotion.js'
import { planExecution } from './swarm-executor.js'
import type { RouterResult } from './task-router.js'

const NOW = '2026-06-01T00:00:00.000Z'

function routerResult(objective: string): RouterResult {
  return {
    objective,
    scenario: 'code_with_spec',
    primaryExperts: [
      {
        id: 'coder',
        name: 'CoderAgent',
        description: 'writes code',
        category: 'development',
        keywords: ['code'],
        filePatterns: ['*.ts'],
        score: 10,
      },
    ],
    secondaryExperts: [],
    reasoning: [],
    estimatedChunks: 2,
    confidence: { score: 1, isLowConfidence: false, isAmbiguous: false, ambiguousExperts: [] },
    clarification: { needed: false, questions: [] },
  }
}

/**
 * Seeds a temp project that exercises every semantic extractor: a Commander CLI
 * command file, a schema module, package scripts, a runtime prompt, and a
 * source/test symbol pair.
 */
async function seedProject(tmpRoot: string): Promise<void> {
  await mkdir(join(tmpRoot, 'packages', 'cli', 'src', 'lib'), { recursive: true })
  await mkdir(join(tmpRoot, 'packages', 'cli', 'src', 'commands'), { recursive: true })
  await mkdir(join(tmpRoot, 'plugins', 'kimi-code'), { recursive: true })

  await writeFile(
    join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'brain-test', scripts: { test: 'bun test', typecheck: 'tsc --noEmit' } }, null, 2),
  )
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'sample.ts'),
    'export function sample(): number { return 1 }\n',
  )
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'sample.test.ts'),
    'import { sample } from "./sample.js"\nif (sample() !== 1) throw new Error("bad")\n',
  )
  // Schema surface — name matches isSchemaModule heuristic.
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'user-schema.ts'),
    'export interface UserSchema { id: string }\nexport const userSchema = { id: "" }\n',
  )
  // CLI command registrations for extractCliCommands.
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'commands', 'demo.ts'),
    [
      'export function register(program: any): void {',
      "  program.command('demo').description('demo command')",
      "  program.command('sync <id>').description('sync command')",
      '}',
      '',
    ].join('\n'),
  )
  // Runtime prompt surface for loadRuntimePromptFiles.
  await writeFile(join(tmpRoot, 'plugins', 'kimi-code', 'openagent.yaml'), 'name: OpenAgent\n')
}

function candidate(partial: Partial<MemoryPromotionCandidate> & Pick<MemoryPromotionCandidate, 'id'>): MemoryPromotionCandidate {
  return {
    status: 'pending',
    kind: 'workflow',
    summary: 'run typecheck before pushing changes',
    normalizedKey: partial.id,
    confidence: 0.82,
    recencyScore: 0.9,
    occurrenceCount: 3,
    sourceQuestIds: ['quest-1', 'quest-2', 'quest-3'],
    sourceKinds: ['workflow'],
    files: ['packages/cli/src/lib/sample.ts'],
    contexts: [],
    runtimes: ['kimi'],
    firstSeen: NOW,
    lastSeen: NOW,
    evidence: [
      { questId: 'quest-1', timestamp: NOW, kind: 'workflow', summary: 'ran typecheck', files: [], contexts: [] },
    ],
    target: 'team-memory.lesson',
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

async function seedPromotionStore(tmpRoot: string, candidates: MemoryPromotionCandidate[]): Promise<void> {
  const store: MemoryPromotionStore = {
    version: '1',
    projectRoot: tmpRoot,
    generatedAt: NOW,
    minOccurrences: 2,
    minConfidence: 0.65,
    candidates,
    approvedKnowledge: [],
  }
  await saveMemoryPromotionStore(tmpRoot, store)
}

describe('quest-semantic-repo-brain', () => {
  it('builds an AST-level semantic graph, confidence score, and completion gate', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-brain-graph-'))
    try {
      await seedProject(tmpRoot)
      const intelligence = await refreshQuestCodingIntelligence(tmpRoot, {
        objective: 'extend the CLI coding workflow',
        changedFiles: ['packages/cli/src/lib/sample.ts'],
        reason: 'test',
      })
      const brain = intelligence.semanticRepoBrain

      expect(brain.version).toBe(QUEST_SEMANTIC_REPO_BRAIN_VERSION)
      expect(brain.objective).toBe('extend the CLI coding workflow')

      // Semantic graph: each extractor contributed nodes.
      const graph = brain.semanticGraph
      expect(graph.summary.nodes).toBe(graph.nodes.length)
      expect(graph.summary.edges).toBe(graph.edges.length)
      expect(graph.summary.symbols).toBeGreaterThan(0)
      expect(graph.summary.cliCommands).toBeGreaterThanOrEqual(2)
      expect(graph.summary.schemas).toBeGreaterThanOrEqual(1)
      expect(graph.summary.packageScripts).toBeGreaterThanOrEqual(2)
      expect(graph.summary.runtimePrompts).toBeGreaterThanOrEqual(1)
      expect(graph.summary.owners).toBeGreaterThan(0)

      // CLI command names extracted from Commander `.command()` calls (arg suffix stripped).
      const commandNames = graph.nodes.filter((node) => node.kind === 'cli-command').map((node) => node.name)
      expect(commandNames).toContain('demo')
      expect(commandNames).toContain('sync')

      // Test files are classified distinctly from source files.
      expect(graph.nodes.some((node) => node.kind === 'test' || node.path?.endsWith('sample.test.ts'))).toBe(true)

      // Edges connect files to their declared symbols and commands to their host file.
      expect(graph.edges.some((edge) => edge.kind === 'declares')).toBe(true)
      expect(graph.edges.some((edge) => edge.kind === 'implements-command')).toBe(true)
      expect(graph.edges.some((edge) => edge.kind === 'owns')).toBe(true)

      // Nodes and edges are deterministically sorted and de-duplicated by id.
      const ids = graph.nodes.map((node) => node.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids)

      // Confidence score exposes all five states and a numeric overall.
      const confidence = brain.knowledgeConfidenceScore
      expect(confidence.facts.length).toBeGreaterThan(0)
      expect(Object.keys(confidence.summary).sort()).toEqual(
        ['inferred', 'missing', 'needs-research', 'stale', 'verified'],
      )
      expect(confidence.overall).toBeGreaterThanOrEqual(0)
      expect(confidence.overall).toBeLessThanOrEqual(1)
      // The synthetic graph fact is verified because the graph has nodes.
      expect(
        confidence.facts.some((fact) => fact.subject === 'semantic-repo-graph' && fact.status === 'verified'),
      ).toBe(true)

      // Completion gate aggregates five checks into a single verdict.
      const gate = brain.completionGate
      expect(gate.checks).toHaveLength(5)
      expect(gate.verdict).toMatch(/^(pass|review|blocked)$/)
      const blocked = gate.checks.some((check) => check.status === 'blocked')
      const review = gate.checks.some((check) => check.status === 'review')
      expect(gate.verdict).toBe(blocked ? 'blocked' : review ? 'review' : 'pass')

      // Summary formatting surfaces headline metrics.
      const summary = formatSemanticRepoBrainSummary(brain)
      expect(summary).toContain('## Semantic Repo Brain')
      expect(summary).toContain(`Completion gate: ${gate.verdict}`)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('surfaces approval-gated skill candidates filtered from the promotion store', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-brain-skills-'))
    try {
      await seedProject(tmpRoot)
      await seedPromotionStore(tmpRoot, [
        candidate({ id: 'cand-pending', status: 'pending', kind: 'workflow', summary: 'run typecheck before pushing' }),
        candidate({ id: 'cand-approved', status: 'approved', kind: 'command', summary: 'use bun test for the cli package', confidence: 0.9, occurrenceCount: 4 }),
        candidate({ id: 'cand-rejected', status: 'rejected', kind: 'pattern', summary: 'always edit dist files directly' }),
        // Not skill-worthy: only seen once.
        candidate({ id: 'cand-weak', status: 'pending', kind: 'workflow', summary: 'one off note', occurrenceCount: 1 }),
      ])

      const intelligence = await refreshQuestCodingIntelligence(tmpRoot, {
        objective: 'review skill candidates',
        changedFiles: ['packages/cli/src/lib/sample.ts'],
        reason: 'test',
      })
      const builder = intelligence.semanticRepoBrain.autoSkillBuilder

      const bySource = new Map(builder.candidates.map((c) => [c.sourceCandidateId, c]))
      // Weak candidate (occurrenceCount < 2) is excluded.
      expect(bySource.has('cand-weak')).toBe(false)
      expect(builder.candidates).toHaveLength(3)

      const pending = bySource.get('cand-pending')
      expect(pending?.status).toBe('pending-user-approval')
      expect(pending?.approvalCommand).toBe('oac memory-promote --approve cand-pending')
      expect(pending?.suggestedSkillName.length).toBeGreaterThan(0)
      expect(pending?.buildPlan).toHaveLength(4)

      const approved = bySource.get('cand-approved')
      expect(approved?.status).toBe('approved-for-build')
      expect(approved?.approvalCommand).toBeUndefined()

      expect(bySource.get('cand-rejected')?.status).toBe('rejected')

      expect(builder.policy.length).toBeGreaterThanOrEqual(4)
      expect(builder.policy.some((line) => /user approval/i.test(line))).toBe(true)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('records and de-duplicates failed-command fingerprints from validation events', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-brain-failure-'))
    try {
      await seedProject(tmpRoot)
      const routed = routerResult('harden the validation flow')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      const failedCheck = {
        result: {
          overallPassed: false,
          checks: [
            { command: 'npm run typecheck', passed: false, output: 'error TS2345: argument not assignable' },
            { command: 'bun test', passed: true, output: 'ok' },
          ],
        },
      }
      // Emit the same failing validation twice — must collapse to one fingerprint.
      await appendQuestEvent(tmpRoot, quest.questId, { timestamp: NOW, type: 'validation', data: failedCheck })
      await appendQuestEvent(tmpRoot, quest.questId, { timestamp: NOW, type: 'validation', data: failedCheck })

      const runDir = join(tmpRoot, '.oac', 'runs', quest.questId)
      const memory = JSON.parse(await readFile(join(runDir, 'failure-fix-memory.json'), 'utf-8')) as {
        version: string
        fingerprints: Array<{ command: string; fingerprint: string; status: string; knownFix: string }>
        replayCommands: string[]
        policy: string[]
      }

      expect(memory.version).toBe(QUEST_SEMANTIC_REPO_BRAIN_VERSION)
      // The failing command is recorded; the passing check is not.
      const typecheckFailures = memory.fingerprints.filter((f) => f.command === 'npm run typecheck')
      expect(typecheckFailures.length).toBeGreaterThanOrEqual(1)
      expect(memory.fingerprints.some((f) => f.command === 'bun test')).toBe(false)
      expect(typecheckFailures[0]?.status).toBe('active')
      expect(typecheckFailures[0]?.knownFix.length).toBeGreaterThan(0)
      // Dedup contract: no two entries share a fingerprint (the duplicated
      // validation event collapses), even though one command may surface from
      // both the autopilot and event-stream sources under distinct fingerprints.
      const fingerprints = memory.fingerprints.map((f) => f.fingerprint)
      expect(new Set(fingerprints).size).toBe(fingerprints.length)
      expect(memory.replayCommands).toContain('npm run typecheck')
      expect(memory.policy.length).toBeGreaterThanOrEqual(4)

      // All six sidecar artifacts are written by writeQuestSemanticRepoBrainArtifacts.
      for (const artifact of [
        'semantic-repo-brain.json',
        'ast-knowledgebase.json',
        'knowledge-confidence-score.json',
        'failure-fix-memory.json',
        'auto-skill-builder.json',
        'semantic-repo-brain.md',
      ]) {
        const content = await readFile(join(runDir, artifact), 'utf-8')
        expect(content).toContain(artifact.endsWith('.md') ? 'Semantic Repo Brain' : '"version": "13"')
      }
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

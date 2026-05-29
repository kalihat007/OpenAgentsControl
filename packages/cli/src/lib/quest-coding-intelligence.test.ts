import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendQuestEvent, buildQuestRun, persistQuestRun } from './quest-run.js'
import { refreshQuestCodingIntelligence } from './quest-coding-intelligence.js'
import { planExecution } from './swarm-executor.js'
import type { RouterResult } from './task-router.js'

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
    confidence: {
      score: 1,
      isLowConfidence: false,
      isAmbiguous: false,
      ambiguousExperts: [],
    },
    clarification: {
      needed: false,
      questions: [],
    },
  }
}

async function seedProject(tmpRoot: string): Promise<void> {
  await mkdir(join(tmpRoot, 'packages', 'cli', 'src', 'lib'), { recursive: true })
  await mkdir(join(tmpRoot, 'plugins', 'kimi-code'), { recursive: true })
  await writeFile(
    join(tmpRoot, 'package.json'),
    JSON.stringify({ name: 'quest-v9-test', scripts: { test: 'bun test' } }, null, 2),
  )
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'sample.ts'),
    'export function sample(): number { return 1 }\n',
  )
  await writeFile(
    join(tmpRoot, 'packages', 'cli', 'src', 'lib', 'sample.test.ts'),
    'import { sample } from "./sample.js"\nif (sample() !== 1) throw new Error("bad")\n',
  )
  await writeFile(join(tmpRoot, 'plugins', 'kimi-code', 'openagent.yaml'), 'name: OpenAgent\n')
}

describe('quest-coding-intelligence', () => {
  it('builds Quest v9 coding intent, patch capsules, smart tests, and review artifacts', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-v9-'))
    try {
      await seedProject(tmpRoot)

      const intelligence = await refreshQuestCodingIntelligence(tmpRoot, {
        objective: 'improve the CLI coding workflow',
        changedFiles: ['packages/cli/src/lib/sample.ts'],
        reason: 'test',
      })

      expect(intelligence.version).toBe('9')
      expect(intelligence.intent.affectedFiles).toContain('packages/cli/src/lib/sample.ts')
      expect(intelligence.patchCapsules).toHaveLength(1)
      expect(intelligence.testRecommendations.some((test) => test.command === 'git diff --check')).toBe(true)
      expect(intelligence.testRecommendations.some((test) => test.command === 'npm run typecheck -w packages/cli')).toBe(true)
      expect(intelligence.codingAutopilot.version).toBe('10')
      expect(intelligence.codingAutopilot.symbolGraph.summary.files).toBeGreaterThan(0)
      expect(intelligence.codingAutopilot.smartTestMatrix.minimumCredibleCommands).toContain('git diff --check')
      expect(intelligence.codingAutopilot.preEditContract.allowedFiles).toContain('packages/cli/src/lib/sample.ts')
      expect(intelligence.codingExecution.version).toBe('11')
      expect(intelligence.codingExecution.executableAcceptance.checks.length).toBeGreaterThan(0)
      expect(intelligence.codingExecution.runtimeCompatibilityMatrix.runtimes.some((runtime) => runtime.runtime === 'kimi')).toBe(true)
      expect(intelligence.codingExecution.securitySecretsGate.patternsChecked).toContain('api-key-assignment')
      expect(intelligence.verifiedKnowledgebase.version).toBe('12')
      expect(intelligence.verifiedKnowledgebase.knowledgebaseIndex.summary.sources).toBeGreaterThan(0)
      expect(intelligence.verifiedKnowledgebase.evidenceLedger.facts.length).toBeGreaterThan(0)
      expect(intelligence.verifiedKnowledgebase.hallucinationGate.checks.length).toBeGreaterThan(0)
      expect(intelligence.verifiedKnowledgebase.contractFacts.facts.length).toBeGreaterThan(0)
      expect(intelligence.verifiedKnowledgebase.behaviorOracle.signals.length).toBeGreaterThan(0)
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Quest v9 Coding Intelligence')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Coding Autopilot')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Coding Execution')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Verified Knowledgebase')
      for (const artifact of [
        'coding-autopilot.json',
        'symbol-graph.json',
        'smart-test-matrix.json',
        'patch-ledger.json',
        'pre-edit-contract.json',
        'automatic-code-review.json',
        'failure-memory.json',
        'runtime-parity-enforcer.json',
        'dependency-research-gate.json',
        'autofix-plan.json',
        'pr-readiness.md',
        'coding-execution.json',
        'executable-acceptance.json',
        'guarded-autofix-runner.json',
        'contract-drift-guard.json',
        'review-patch-loop.json',
        'test-gap-finder.json',
        'regression-snapshots.json',
        'runtime-compatibility-matrix.json',
        'ownership-lock-plan.json',
        'security-secrets-gate.json',
        'pr-auto-packager.json',
        'pr-auto-packager.md',
        'verified-knowledgebase.json',
        'knowledgebase-index.json',
        'evidence-ledger.json',
        'hallucination-gate.json',
        'contract-facts.json',
        'source-to-patch-trace.json',
        'stale-knowledge-report.json',
        'dependency-research-cache.json',
        'behavior-oracle.json',
        'test-authoring-plan.json',
        'verified-knowledgebase.md',
      ]) {
        const content = await readFile(join(tmpRoot, '.oac', 'coding-intelligence', artifact), 'utf-8')
        expect(content).toContain(artifact === 'pr-readiness.md' ? 'PR Readiness' : artifact === 'verified-knowledgebase.md' ? 'Verified Knowledgebase' : artifact.endsWith('.md') ? 'Summary' : 'version')
      }
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('refreshes Quest v9 artifacts from Quest creation and file-change events', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-v9-event-'))
    try {
      await seedProject(tmpRoot)
      const routed = routerResult('update Kimi OpenAgent coding mode')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      await appendQuestEvent(tmpRoot, quest.questId, {
        timestamp: new Date().toISOString(),
        type: 'file_change',
        data: { added: 'plugins/kimi-code/openagent.yaml' },
      })

      const raw = await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-intelligence.json'), 'utf-8')
      const parsed = JSON.parse(raw) as {
        version: string
        reason: string
        runtimeParity: { kimi: boolean }
        codingAutopilot: { runtimeParityEnforcer: { requiredRuntimes: string[] } }
        codingExecution: { runtimeCompatibilityMatrix: { runtimes: Array<{ runtime: string }> } }
        verifiedKnowledgebase: { hallucinationGate: { verdict: string } }
      }
      expect(parsed.version).toBe('9')
      expect(parsed.reason).toBe('quest.file_change')
      expect(parsed.runtimeParity.kimi).toBe(true)
      expect(parsed.codingAutopilot.runtimeParityEnforcer.requiredRuntimes).toContain('kimi')
      expect(parsed.codingExecution.runtimeCompatibilityMatrix.runtimes.some((runtime) => runtime.runtime === 'kimi')).toBe(true)
      expect(parsed.verifiedKnowledgebase.hallucinationGate.verdict).toMatch(/pass|review|blocked/)
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'patch-capsules.json'), 'utf-8')).toContain('patch-')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-autopilot.json'), 'utf-8')).toContain('"version": "10"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-execution.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'executable-acceptance.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'evidence-ledger.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'hallucination-gate.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.md'), 'utf-8')).toContain('Verified Knowledgebase')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-auto-packager.md'), 'utf-8')).toContain('Summary')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'symbol-graph.json'), 'utf-8')).toContain('openagent.yaml')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

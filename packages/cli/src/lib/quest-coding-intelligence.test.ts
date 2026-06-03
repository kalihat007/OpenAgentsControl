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
      expect(intelligence.semanticRepoBrain.version).toBe('13')
      expect(intelligence.semanticRepoBrain.semanticGraph.summary.nodes).toBeGreaterThan(0)
      expect(intelligence.semanticRepoBrain.knowledgeConfidenceScore.facts.length).toBeGreaterThan(0)
      expect(intelligence.semanticRepoBrain.completionGate.verdict).toMatch(/pass|review|blocked/)
      expect(intelligence.temporalMemory.version).toBe('14')
      expect(Array.isArray(intelligence.temporalMemory.chronicCommands)).toBe(true)
      expect(intelligence.intelligentCodingTeam.version).toBe('15')
      expect(intelligence.intelligentCodingTeam.requirementCompiler.readiness).toMatch(/ready|needs-clarification|blocked/)
      expect(intelligence.intelligentCodingTeam.expertTeamBlackboard.roster.some((expert) => expert.role === 'coder')).toBe(true)
      expect(intelligence.intelligentCodingTeam.changeImpactSimulator.predictedSurfaces.length).toBeGreaterThan(0)
      expect(intelligence.intelligentCodingTeam.projectSkillPackBuilder.candidates.some((candidate) => candidate.name === 'project-validation-playbook')).toBe(true)
      expect(intelligence.intelligentCodingTeam.teamGate.verdict).toMatch(/pass|review|blocked/)
      expect(intelligence.verifiedDelivery.version).toBe('16')
      expect(intelligence.verifiedDelivery.acceptanceCompiler.criteria.length).toBeGreaterThan(0)
      expect(intelligence.verifiedDelivery.evidenceFirstGate.claims.length).toBeGreaterThan(0)
      expect(intelligence.verifiedDelivery.patchProvenanceLedger.entries.length).toBeGreaterThan(0)
      expect(intelligence.verifiedDelivery.runtimeCycleMatrix.requiredCycles).toBe(3)
      expect(intelligence.verifiedDelivery.autoEvalGenerator.candidates.length).toBeGreaterThan(0)
      expect(intelligence.verifiedDelivery.agentDebateGate.participants.length).toBe(4)
      expect(intelligence.verifiedDelivery.releaseReadinessDashboard.verdict).toMatch(/pass|review|blocked/)
      expect(intelligence.productArchitect.version).toBe('17')
      expect(intelligence.productArchitect.productArchitectReview.verdict).toMatch(/ready|review|blocked/)
      expect(intelligence.runtimeReliability.version).toBe('18')
      expect(intelligence.runtimeReliability.runtimeReliabilityBrain.verdict).toMatch(/pass|review|blocked/)
      expect(intelligence.runtimeReliability.timeoutPolicy.kimiRecommended.nativeTimeoutSymptom).toBe('Killed by timeout (30s)')
      expect(intelligence.runtimeReliability.claimLedger.claims.length).toBeGreaterThan(0)
      expect(intelligence.runtimeReliability.runtimeDoctorReport.checks.some((check) => check.runtime === 'kimi')).toBe(true)
      expect(intelligence.deepCodingCollaboration.version).toBe('19')
      expect(intelligence.deepCodingCollaboration.deepThinkingReview.hardQuestions.length).toBeGreaterThan(0)
      expect(intelligence.deepCodingCollaboration.ideaToBuildBrief.buildSlices.length).toBeGreaterThan(0)
      expect(intelligence.deepCodingCollaboration.smarterCodePlan.codeQualityMoves.length).toBeGreaterThan(0)
      expect(intelligence.deepCodingCollaboration.collaborationBoard.agentCommitments.length).toBeGreaterThan(0)
      expect(intelligence.deepCodingCollaboration.decisionTradeoffMatrix.tradeoffs.length).toBeGreaterThan(0)
      expect(intelligence.selfImprovingCodingTeam.version).toBe('20')
      expect(intelligence.selfImprovingCodingTeam.codingTeamMetrics.deliveryScore).toBeGreaterThanOrEqual(0)
      expect(intelligence.selfImprovingCodingTeam.deliveryRetrospective.wins.length).toBeGreaterThan(0)
      expect(intelligence.selfImprovingCodingTeam.learningFeedbackLoop.policy.length).toBeGreaterThan(0)
      expect(intelligence.selfImprovingCodingTeam.improvementBacklog.length).toBeGreaterThan(0)
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Quest v9 Coding Intelligence')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Coding Autopilot')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Coding Execution')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Verified Knowledgebase')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Semantic Repo Brain')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Temporal Memory')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Intelligent Coding Team OS')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Verified Coding Delivery OS')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Runtime Reliability + Evidence Replay OS')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Deep Coding Collaboration OS')
      expect(await readFile(join(tmpRoot, '.oac', 'coding-intelligence', 'coding-review.md'), 'utf-8')).toContain('Self-Improving Coding Team OS')
      const expectedArtifactMarker = (artifact: string): string => {
        if (artifact === 'pr-readiness.md') return 'PR Readiness'
        if (artifact === 'verified-knowledgebase.md') return 'Verified Knowledgebase'
        if (artifact === 'semantic-repo-brain.md') return 'Semantic Repo Brain'
        if (artifact === 'temporal-memory.md') return 'Temporal Memory'
        if (artifact === 'intelligent-coding-team.md') return 'Intelligent Coding Team OS'
        if (artifact === 'verified-delivery-os.md') return 'Verified Coding Delivery OS'
        if (artifact === 'strategic-next-actions.md') return 'Product Architect Strategic Next Actions'
        if (artifact === 'evidence-replay.md') return 'Quest v18 Evidence Replay'
        if (artifact === 'build-better-roadmap.md') return 'Quest v19 Build Better Roadmap'
        if (artifact === 'self-improvement-roadmap.md') return 'Quest v20 Self-Improvement Roadmap'
        if (artifact === 'coding-team-metrics.json') return 'deliveryScore'
        if (artifact === 'delivery-retrospective.json') return 'wins'
        if (artifact === 'learning-feedback-loop.json') return 'policy'
        if (artifact === 'product-architect-review.json') return 'version'
        if (artifact.includes('next-steps')) return '['
        if (artifact.includes('roadmap')) return '['
        if (artifact.includes('capability')) return '['
        if (artifact.includes('risk')) return '['
        if (artifact.includes('value')) return '['
        if (artifact.includes('refactor')) return '['
        if (artifact.includes('architecture-decision')) return '['
        if (artifact.includes('backlog')) return '['
        if (artifact.includes('skill-evolution')) return '['
        if (artifact.endsWith('.md')) return 'Summary'
        return 'version'
      }

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
        'semantic-repo-brain.json',
        'ast-knowledgebase.json',
        'knowledge-confidence-score.json',
        'failure-fix-memory.json',
        'auto-skill-builder.json',
        'semantic-repo-brain.md',
        'temporal-memory.json',
        'patch-outcome-ledger.json',
        'repo-history-signals.json',
        'temporal-memory.md',
        'intelligent-coding-team.json',
        'requirement-compiler.json',
        'expert-team-blackboard.json',
        'change-impact-simulator.json',
        'project-skill-pack-builder.json',
        'intelligent-coding-team.md',
        'verified-delivery-os.json',
        'acceptance-compiler.json',
        'evidence-first-gate.json',
        'patch-provenance-ledger.json',
        'runtime-cycle-matrix.json',
        'auto-eval-generator.json',
        'agent-debate-gate.json',
        'release-readiness-dashboard.json',
        'verified-delivery-os.md',
        'product-architect-review.json',
        'architecture-next-steps.json',
        'roadmap-signals.json',
        'capability-gap-map.json',
        'product-risk-register.json',
        'user-value-matrix.json',
        'strategic-refactor-radar.json',
        'architecture-decision-suggestions.json',
        'strategic-next-actions.md',
        'runtime-reliability-os.json',
        'command-failure-index.json',
        'timeout-policy.json',
        'claim-ledger.json',
        'runtime-doctor-report.json',
        'autonomous-recovery-plan.json',
        'flaky-command-memory.json',
        'evidence-replay.md',
        'deep-coding-collaboration-os.json',
        'deep-thinking-review.json',
        'idea-to-build-brief.json',
        'smarter-code-plan.json',
        'collaboration-board.json',
        'decision-tradeoff-matrix.json',
        'build-better-roadmap.md',
        'self-improving-coding-team-os.json',
        'coding-team-metrics.json',
        'delivery-retrospective.json',
        'learning-feedback-loop.json',
        'improvement-backlog.json',
        'skill-evolution-candidates.json',
        'self-improvement-roadmap.md',
      ]) {
        const content = await readFile(join(tmpRoot, '.oac', 'coding-intelligence', artifact), 'utf-8')
        expect(content).toContain(expectedArtifactMarker(artifact))
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
        semanticRepoBrain: { completionGate: { verdict: string } }
        temporalMemory: { version: string; chronicCommands: string[] }
        intelligentCodingTeam: { version: string; teamGate: { verdict: string } }
        verifiedDelivery: { version: string; releaseReadinessDashboard: { verdict: string } }
        productArchitect: { version: string; productArchitectReview: { verdict: string }; roadmapSignals: unknown[] }
        runtimeReliability: { version: string; verdict: string; claimLedger: { claims: unknown[] } }
        deepCodingCollaboration: { version: string; verdict: string; deepThinkingReview: { hardQuestions: unknown[] } }
        selfImprovingCodingTeam: { version: string; verdict: string; codingTeamMetrics: { deliveryScore: number }; improvementBacklog: unknown[] }
      }
      expect(parsed.version).toBe('9')
      expect(parsed.reason).toBe('quest.file_change')
      expect(parsed.runtimeParity.kimi).toBe(true)
      expect(parsed.codingAutopilot.runtimeParityEnforcer.requiredRuntimes).toContain('kimi')
      expect(parsed.codingExecution.runtimeCompatibilityMatrix.runtimes.some((runtime) => runtime.runtime === 'kimi')).toBe(true)
      expect(parsed.verifiedKnowledgebase.hallucinationGate.verdict).toMatch(/pass|review|blocked/)
      expect(parsed.semanticRepoBrain.completionGate.verdict).toMatch(/pass|review|blocked/)
      expect(parsed.temporalMemory.version).toBe('14')
      expect(Array.isArray(parsed.temporalMemory.chronicCommands)).toBe(true)
      expect(parsed.intelligentCodingTeam.version).toBe('15')
      expect(parsed.intelligentCodingTeam.teamGate.verdict).toMatch(/pass|review|blocked/)
      expect(parsed.verifiedDelivery.version).toBe('16')
      expect(parsed.verifiedDelivery.releaseReadinessDashboard.verdict).toMatch(/pass|review|blocked/)
      expect(parsed.productArchitect.version).toBe('17')
      expect(parsed.productArchitect.productArchitectReview.verdict).toMatch(/ready|review|blocked/)
      expect(Array.isArray(parsed.productArchitect.roadmapSignals)).toBe(true)
      expect(parsed.runtimeReliability.version).toBe('18')
      expect(parsed.runtimeReliability.verdict).toMatch(/pass|review|blocked/)
      expect(Array.isArray(parsed.runtimeReliability.claimLedger.claims)).toBe(true)
      expect(parsed.deepCodingCollaboration.version).toBe('19')
      expect(parsed.deepCodingCollaboration.verdict).toMatch(/ready|review|blocked/)
      expect(Array.isArray(parsed.deepCodingCollaboration.deepThinkingReview.hardQuestions)).toBe(true)
      expect(parsed.selfImprovingCodingTeam.version).toBe('20')
      expect(parsed.selfImprovingCodingTeam.verdict).toMatch(/ready|review|blocked/)
      expect(parsed.selfImprovingCodingTeam.codingTeamMetrics.deliveryScore).toBeGreaterThanOrEqual(0)
      expect(Array.isArray(parsed.selfImprovingCodingTeam.improvementBacklog)).toBe(true)
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'patch-capsules.json'), 'utf-8')).toContain('patch-')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-autopilot.json'), 'utf-8')).toContain('"version": "10"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-execution.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'executable-acceptance.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'evidence-ledger.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'hallucination-gate.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.md'), 'utf-8')).toContain('Verified Knowledgebase')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-auto-packager.md'), 'utf-8')).toContain('Summary')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'semantic-repo-brain.json'), 'utf-8')).toContain('"version": "13"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'ast-knowledgebase.json'), 'utf-8')).toContain('"version": "13"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'knowledge-confidence-score.json'), 'utf-8')).toContain('"version": "13"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'failure-fix-memory.json'), 'utf-8')).toContain('"version": "13"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'auto-skill-builder.json'), 'utf-8')).toContain('"version": "13"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'semantic-repo-brain.md'), 'utf-8')).toContain('Semantic Repo Brain')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'temporal-memory.json'), 'utf-8')).toContain('"version": "14"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'patch-outcome-ledger.json'), 'utf-8')).toContain('"version": "14"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'repo-history-signals.json'), 'utf-8')).toContain('"version": "14"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'temporal-memory.md'), 'utf-8')).toContain('Temporal Memory')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'intelligent-coding-team.json'), 'utf-8')).toContain('"version": "15"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'requirement-compiler.json'), 'utf-8')).toContain('"version": "15"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'expert-team-blackboard.json'), 'utf-8')).toContain('"version": "15"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'change-impact-simulator.json'), 'utf-8')).toContain('"version": "15"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'project-skill-pack-builder.json'), 'utf-8')).toContain('"version": "15"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'intelligent-coding-team.md'), 'utf-8')).toContain('Intelligent Coding Team OS')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-delivery-os.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'acceptance-compiler.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'evidence-first-gate.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'patch-provenance-ledger.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'runtime-cycle-matrix.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'auto-eval-generator.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'agent-debate-gate.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'release-readiness-dashboard.json'), 'utf-8')).toContain('"version": "16"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-delivery-os.md'), 'utf-8')).toContain('Verified Coding Delivery OS')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'product-architect-review.json'), 'utf-8')).toContain('"version": "17"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'architecture-next-steps.json'), 'utf-8')).toContain('architect-completion-review')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'roadmap-signals.json'), 'utf-8')).toContain('"theme"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'capability-gap-map.json'), 'utf-8')).toContain('"capability"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'product-risk-register.json'), 'utf-8')).toContain('"severity"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'user-value-matrix.json'), 'utf-8')).toContain('"persona"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'strategic-refactor-radar.json'), 'utf-8')).toContain('[')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'architecture-decision-suggestions.json'), 'utf-8')).toContain('"suggestedAdrPath"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'strategic-next-actions.md'), 'utf-8')).toContain('Product Architect Strategic Next Actions')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'runtime-reliability-os.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'command-failure-index.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'timeout-policy.json'), 'utf-8')).toContain('"Killed by timeout (30s)"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'claim-ledger.json'), 'utf-8')).toContain('"claims"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'runtime-doctor-report.json'), 'utf-8')).toContain('"checks"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'autonomous-recovery-plan.json'), 'utf-8')).toContain('"decisionRules"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'flaky-command-memory.json'), 'utf-8')).toContain('"commands"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'evidence-replay.md'), 'utf-8')).toContain('Quest v18 Evidence Replay')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'deep-coding-collaboration-os.json'), 'utf-8')).toContain('"version": "19"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'deep-thinking-review.json'), 'utf-8')).toContain('"hardQuestions"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'idea-to-build-brief.json'), 'utf-8')).toContain('"buildSlices"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'smarter-code-plan.json'), 'utf-8')).toContain('"codeQualityMoves"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'collaboration-board.json'), 'utf-8')).toContain('"agentCommitments"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'decision-tradeoff-matrix.json'), 'utf-8')).toContain('"tradeoffs"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'build-better-roadmap.md'), 'utf-8')).toContain('Quest v19 Build Better Roadmap')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'self-improving-coding-team-os.json'), 'utf-8')).toContain('"version": "20"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-team-metrics.json'), 'utf-8')).toContain('"deliveryScore"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'delivery-retrospective.json'), 'utf-8')).toContain('"wins"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'learning-feedback-loop.json'), 'utf-8')).toContain('"policy"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'improvement-backlog.json'), 'utf-8')).toContain('"title"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'skill-evolution-candidates.json'), 'utf-8')).toContain('[')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'self-improvement-roadmap.md'), 'utf-8')).toContain('Quest v20 Self-Improvement Roadmap')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'symbol-graph.json'), 'utf-8')).toContain('openagent.yaml')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

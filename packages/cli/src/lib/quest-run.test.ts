import { describe, it, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildQuestRun,
  persistQuestRun,
  generateQuestId,
  questExists,
  appendQuestEvent,
  writeTaskGraph,
  formatRuntimeHandoff,
  normalizeQuestRun,
  formatQuestSummary,
  formatAcceptanceReport,
  type QuestRun,
} from './quest-run.js'
import { loadQuestMemoryGraph } from './quest-memory-graph.js'
import { loadQuestInteractionMemory } from './quest-interaction-memory.js'
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

describe('quest-run', () => {
  it('builds a v8 Quest sidecar from a plan', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    expect(quest.version).toBe('8')
    expect(quest.questId).toBe(plan.session.id)
    expect(quest.state).toBe('SPEC')
    expect(quest.tasks.length).toBeGreaterThan(0)
    expect(quest.artifacts.memoryGraph).toBe('memory-graph.json')
    expect(quest.artifacts.interactionMemory).toBe('interaction-memory.json')
    expect(quest.artifacts.repoWiki).toBe('../../repo-wiki/index.md')
    expect(quest.artifacts.codingIntelligence).toBe('coding-intelligence.json')
    expect(quest.artifacts.patchCapsules).toBe('patch-capsules.json')
    expect(quest.artifacts.codingReview).toBe('coding-review.md')
    expect(quest.artifacts.codingAutopilot).toBe('coding-autopilot.json')
    expect(quest.artifacts.symbolGraph).toBe('symbol-graph.json')
    expect(quest.artifacts.smartTestMatrix).toBe('smart-test-matrix.json')
    expect(quest.artifacts.patchLedger).toBe('patch-ledger.json')
    expect(quest.artifacts.preEditContract).toBe('pre-edit-contract.json')
    expect(quest.artifacts.automaticCodeReview).toBe('automatic-code-review.json')
    expect(quest.artifacts.failureMemory).toBe('failure-memory.json')
    expect(quest.artifacts.runtimeParityEnforcer).toBe('runtime-parity-enforcer.json')
    expect(quest.artifacts.dependencyResearchGate).toBe('dependency-research-gate.json')
    expect(quest.artifacts.autofixPlan).toBe('autofix-plan.json')
    expect(quest.artifacts.prReadiness).toBe('pr-readiness.md')
    expect(quest.artifacts.codingExecution).toBe('coding-execution.json')
    expect(quest.artifacts.executableAcceptance).toBe('executable-acceptance.json')
    expect(quest.artifacts.guardedAutofixRunner).toBe('guarded-autofix-runner.json')
    expect(quest.artifacts.contractDriftGuard).toBe('contract-drift-guard.json')
    expect(quest.artifacts.reviewPatchLoop).toBe('review-patch-loop.json')
    expect(quest.artifacts.testGapFinder).toBe('test-gap-finder.json')
    expect(quest.artifacts.regressionSnapshots).toBe('regression-snapshots.json')
    expect(quest.artifacts.runtimeCompatibilityMatrix).toBe('runtime-compatibility-matrix.json')
    expect(quest.artifacts.ownershipLockPlan).toBe('ownership-lock-plan.json')
    expect(quest.artifacts.securitySecretsGate).toBe('security-secrets-gate.json')
    expect(quest.artifacts.prAutoPackager).toBe('pr-auto-packager.json')
    expect(quest.artifacts.prAutoPackagerBrief).toBe('pr-auto-packager.md')
    expect(quest.artifacts.verifiedKnowledgebase).toBe('verified-knowledgebase.json')
    expect(quest.artifacts.knowledgebaseIndex).toBe('knowledgebase-index.json')
    expect(quest.artifacts.evidenceLedger).toBe('evidence-ledger.json')
    expect(quest.artifacts.hallucinationGate).toBe('hallucination-gate.json')
    expect(quest.artifacts.contractFacts).toBe('contract-facts.json')
    expect(quest.artifacts.sourceToPatchTrace).toBe('source-to-patch-trace.json')
    expect(quest.artifacts.staleKnowledgeReport).toBe('stale-knowledge-report.json')
    expect(quest.artifacts.dependencyResearchCache).toBe('dependency-research-cache.json')
    expect(quest.artifacts.behaviorOracle).toBe('behavior-oracle.json')
    expect(quest.artifacts.testAuthoringPlan).toBe('test-authoring-plan.json')
    expect(quest.artifacts.verifiedKnowledgebaseBrief).toBe('verified-knowledgebase.md')
    expect(quest.artifacts.semanticRepoBrain).toBe('semantic-repo-brain.json')
    expect(quest.artifacts.astKnowledgebase).toBe('ast-knowledgebase.json')
    expect(quest.artifacts.knowledgeConfidenceScore).toBe('knowledge-confidence-score.json')
    expect(quest.artifacts.failureFixMemory).toBe('failure-fix-memory.json')
    expect(quest.artifacts.autoSkillBuilder).toBe('auto-skill-builder.json')
    expect(quest.artifacts.semanticRepoBrainBrief).toBe('semantic-repo-brain.md')
    expect(quest.artifacts.temporalMemory).toBe('temporal-memory.json')
    expect(quest.artifacts.temporalMemoryBrief).toBe('temporal-memory.md')
    expect(quest.artifacts.patchOutcomeLedger).toBe('patch-outcome-ledger.json')
    expect(quest.artifacts.repoHistorySignals).toBe('repo-history-signals.json')
    expect(quest.artifacts.intelligentCodingTeam).toBe('intelligent-coding-team.json')
    expect(quest.artifacts.requirementCompiler).toBe('requirement-compiler.json')
    expect(quest.artifacts.expertTeamBlackboard).toBe('expert-team-blackboard.json')
    expect(quest.artifacts.changeImpactSimulator).toBe('change-impact-simulator.json')
    expect(quest.artifacts.projectSkillPackBuilder).toBe('project-skill-pack-builder.json')
    expect(quest.artifacts.intelligentCodingTeamBrief).toBe('intelligent-coding-team.md')
    expect(quest.artifacts.verifiedDelivery).toBe('verified-delivery-os.json')
    expect(quest.artifacts.acceptanceCompiler).toBe('acceptance-compiler.json')
    expect(quest.artifacts.evidenceFirstGate).toBe('evidence-first-gate.json')
    expect(quest.artifacts.patchProvenanceLedger).toBe('patch-provenance-ledger.json')
    expect(quest.artifacts.runtimeCycleMatrix).toBe('runtime-cycle-matrix.json')
    expect(quest.artifacts.autoEvalGenerator).toBe('auto-eval-generator.json')
    expect(quest.artifacts.agentDebateGate).toBe('agent-debate-gate.json')
    expect(quest.artifacts.releaseReadinessDashboard).toBe('release-readiness-dashboard.json')
    expect(quest.artifacts.verifiedDeliveryBrief).toBe('verified-delivery-os.md')
    expect(quest.artifacts.productArchitectReview).toBe('product-architect-review.json')
    expect(quest.artifacts.architectureNextSteps).toBe('architecture-next-steps.json')
    expect(quest.artifacts.roadmapSignals).toBe('roadmap-signals.json')
    expect(quest.artifacts.capabilityGapMap).toBe('capability-gap-map.json')
    expect(quest.artifacts.productRiskRegister).toBe('product-risk-register.json')
    expect(quest.artifacts.userValueMatrix).toBe('user-value-matrix.json')
    expect(quest.artifacts.strategicRefactorRadar).toBe('strategic-refactor-radar.json')
    expect(quest.artifacts.architectureDecisionSuggestions).toBe('architecture-decision-suggestions.json')
    expect(quest.artifacts.strategicNextActions).toBe('strategic-next-actions.md')
    expect(quest.artifacts.runtimeReliability).toBe('runtime-reliability-os.json')
    expect(quest.artifacts.commandFailureIndex).toBe('command-failure-index.json')
    expect(quest.artifacts.timeoutPolicy).toBe('timeout-policy.json')
    expect(quest.artifacts.claimLedger).toBe('claim-ledger.json')
    expect(quest.artifacts.runtimeDoctorReport).toBe('runtime-doctor-report.json')
    expect(quest.artifacts.autonomousRecoveryPlan).toBe('autonomous-recovery-plan.json')
    expect(quest.artifacts.flakyCommandMemory).toBe('flaky-command-memory.json')
    expect(quest.artifacts.evidenceReplay).toBe('evidence-replay.md')
    expect(quest.artifacts.deepCodingCollaboration).toBe('deep-coding-collaboration-os.json')
    expect(quest.artifacts.deepThinkingReview).toBe('deep-thinking-review.json')
    expect(quest.artifacts.ideaToBuildBrief).toBe('idea-to-build-brief.json')
    expect(quest.artifacts.smarterCodePlan).toBe('smarter-code-plan.json')
    expect(quest.artifacts.collaborationBoard).toBe('collaboration-board.json')
    expect(quest.artifacts.decisionTradeoffMatrix).toBe('decision-tradeoff-matrix.json')
    expect(quest.artifacts.buildBetterRoadmap).toBe('build-better-roadmap.md')
    expect(quest.artifacts.selfImprovingCodingTeam).toBe('self-improving-coding-team-os.json')
    expect(quest.artifacts.codingTeamMetrics).toBe('coding-team-metrics.json')
    expect(quest.artifacts.deliveryRetrospective).toBe('delivery-retrospective.json')
    expect(quest.artifacts.learningFeedbackLoop).toBe('learning-feedback-loop.json')
    expect(quest.artifacts.improvementBacklog).toBe('improvement-backlog.json')
    expect(quest.artifacts.skillEvolutionCandidates).toBe('skill-evolution-candidates.json')
    expect(quest.artifacts.selfImprovementRoadmap).toBe('self-improvement-roadmap.md')
    expect(quest.artifacts.predictiveEngineering).toBe('predictive-engineering-os.json')
    expect(quest.artifacts.intentArchitectureCompiler).toBe('intent-architecture-compiler.json')
    expect(quest.artifacts.changeSimulationEngine).toBe('change-simulation-engine.json')
    expect(quest.artifacts.riskForecastScore).toBe('risk-forecast-score.json')
    expect(quest.artifacts.implementationPathRanking).toBe('implementation-path-ranking.json')
    expect(quest.artifacts.testIntelligencePlanner).toBe('test-intelligence-planner.json')
    expect(quest.artifacts.proofContract).toBe('proof-contract.json')
    expect(quest.artifacts.architectureDriftDetector).toBe('architecture-drift-detector.json')
    expect(quest.artifacts.contextFreshnessGate).toBe('context-freshness-gate.json')
    expect(quest.artifacts.predictiveTimeoutGuard).toBe('predictive-timeout-guard.json')
    expect(quest.artifacts.predictiveEngineeringRoadmap).toBe('predictive-engineering-roadmap.md')
    expect(quest.runtimes.kimi.command).toContain('kimi --work-dir .')
  })

  it('persists quest.json under .oac/runs/{id}', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-run-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      const questPath = await persistQuestRun(tmpRoot, quest)
      const raw = await readFile(questPath, 'utf-8')
      expect(JSON.parse(raw).questId).toBe(plan.session.id)
      const graph = await loadQuestMemoryGraph(tmpRoot, quest.questId)
      expect(graph?.summary.requests).toBe(1)
      expect(graph?.summary.tasks).toBe(quest.tasks.length)
      const interactionMemory = await loadQuestInteractionMemory(tmpRoot, quest.questId)
      expect(interactionMemory?.summary.requests).toBe(1)
      expect(interactionMemory?.workingContext.currentWorkDir).toBe(tmpRoot)
      const repoWiki = await readFile(join(tmpRoot, '.oac', 'repo-wiki', 'index.md'), 'utf-8')
      expect(repoWiki).toContain('Repo Wiki')
      const codingIntelligence = await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-intelligence.json'), 'utf-8')
      expect(codingIntelligence).toContain('"version": "9"')
      const codingAutopilot = await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-autopilot.json'), 'utf-8')
      expect(codingAutopilot).toContain('"version": "10"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'smart-test-matrix.json'), 'utf-8')).toContain('minimumCredibleCommands')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-readiness.md'), 'utf-8')).toContain('PR Readiness')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-execution.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'executable-acceptance.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'security-secrets-gate.json'), 'utf-8')).toContain('patternsChecked')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-auto-packager.md'), 'utf-8')).toContain('Summary')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'knowledgebase-index.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'evidence-ledger.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'hallucination-gate.json'), 'utf-8')).toContain('"version": "12"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'verified-knowledgebase.md'), 'utf-8')).toContain('Verified Knowledgebase')
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
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'strategic-next-actions.md'), 'utf-8')).toContain('Product Architect Strategic Next Actions')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'runtime-reliability-os.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'command-failure-index.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'timeout-policy.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'claim-ledger.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'runtime-doctor-report.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'autonomous-recovery-plan.json'), 'utf-8')).toContain('"version": "18"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'flaky-command-memory.json'), 'utf-8')).toContain('"version": "18"')
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
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'self-improvement-roadmap.md'), 'utf-8')).toContain('Quest v20 Self-Improvement Roadmap')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'predictive-engineering-os.json'), 'utf-8')).toContain('"version": "21"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'risk-forecast-score.json'), 'utf-8')).toContain('"overallRisk"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'proof-contract.json'), 'utf-8')).toContain('"doneClaims"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'predictive-engineering-roadmap.md'), 'utf-8')).toContain('Quest v21 Predictive Engineering Roadmap')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('generateQuestId creates sequential IDs for the same day', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-id-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs'), { recursive: true })

      // Create directories to reserve IDs
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-001'))
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-002'))

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const id1 = await generateQuestId(tmpRoot)
      expect(id1).toBe(`quest-${today}-001`)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('questExists returns true for persisted quests and false otherwise', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-exists-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      expect(await questExists(tmpRoot, quest.questId)).toBe(false)
      await persistQuestRun(tmpRoot, quest)
      expect(await questExists(tmpRoot, quest.questId)).toBe(true)
      expect(await questExists(tmpRoot, 'nonexistent')).toBe(false)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('appendQuestEvent appends to events.ndjson', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-events-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      await appendQuestEvent(tmpRoot, quest.questId, {
        timestamp: new Date().toISOString(),
        type: 'task_update',
        data: { taskId: '1', to: 'completed' },
      })

      const eventsPath = join(tmpRoot, '.oac', 'runs', quest.questId, 'events.ndjson')
      const raw = await readFile(eventsPath, 'utf-8')
      const lines = raw.trim().split('\n')
      expect(lines.length).toBe(1)
      const event = JSON.parse(lines[0] as string)
      expect(event.type).toBe('task_update')
      const graph = await loadQuestMemoryGraph(tmpRoot, quest.questId)
      expect(graph?.summary.actions).toBe(1)
      const interactionMemory = await loadQuestInteractionMemory(tmpRoot, quest.questId)
      expect(interactionMemory?.summary.actions).toBe(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('writeTaskGraph writes task-graph.json', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-graph-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs', 'q1'), { recursive: true })
      await writeTaskGraph(tmpRoot, 'q1', [
        { id: '1', title: 'A', status: 'completed' },
        { id: '2', title: 'B', status: 'pending' },
      ])
      const raw = await readFile(join(tmpRoot, '.oac', 'runs', 'q1', 'task-graph.json'), 'utf-8')
      const graph = JSON.parse(raw)
      expect(graph.tasks).toHaveLength(2)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('formatRuntimeHandoff includes runtime command and resume prompt', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const text = formatRuntimeHandoff(quest, 'kimi')
    expect(text).toContain(quest.questId)
    expect(text).toContain('kimi --work-dir')
    expect(text).toContain('Resume prompt:')
    expect(text).toContain('interaction-memory.json')
    expect(text).toContain('.oac/repo-wiki/index.md')
    expect(text).toContain('coding-intelligence.json')
    expect(text).toContain('patch-capsules.json')
    expect(text).toContain('coding-autopilot.json')
    expect(text).toContain('symbol-graph.json')
    expect(text).toContain('smart-test-matrix.json')
    expect(text).toContain('pre-edit-contract.json')
    expect(text).toContain('autofix-plan.json')
    expect(text).toContain('coding-execution.json')
    expect(text).toContain('executable-acceptance.json')
    expect(text).toContain('security-secrets-gate.json')
    expect(text).toContain('pr-auto-packager.md')
    expect(text).toContain('verified-knowledgebase.json')
    expect(text).toContain('evidence-ledger.json')
    expect(text).toContain('hallucination-gate.json')
    expect(text).toContain('source-to-patch-trace.json')
    expect(text).toContain('behavior-oracle.json')
    expect(text).toContain('semantic-repo-brain.json')
    expect(text).toContain('knowledge-confidence-score.json')
    expect(text).toContain('failure-fix-memory.json')
    expect(text).toContain('auto-skill-builder.json')
    expect(text).toContain('temporal-memory.json')
    expect(text).toContain('patch-outcome-ledger.json')
    expect(text).toContain('repo-history-signals.json')
    expect(text).toContain('intelligent-coding-team.json')
    expect(text).toContain('requirement-compiler.json')
    expect(text).toContain('expert-team-blackboard.json')
    expect(text).toContain('change-impact-simulator.json')
    expect(text).toContain('project-skill-pack-builder.json')
    expect(text).toContain('Quest v9 coding')
    expect(text).toContain('Coding Autopilot')
    expect(text).toContain('Coding Execution')
    expect(text).toContain('Verified Knowledgebase')
    expect(text).toContain('Semantic Repo Brain')
    expect(text).toContain('Temporal Memory')
    expect(text).toContain('Intelligent Coding Team OS')
    expect(text).toContain('Pre-Execution Discovery Gate')
    expect(text).toContain('research.assessed')
    expect(text).toContain('Predictive Engineering OS')
    expect(text).toContain('predictive-engineering-os.json')
    expect(text).toContain('risk-forecast-score.json')
    expect(text).toContain('proof-contract.json')
    expect(text).toContain('predictive-timeout-guard.json')
  })

  it('formatRuntimeHandoff includes codex command', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const text = formatRuntimeHandoff(quest, 'codex')
    expect(text).toContain('CODEX Resume')
    expect(text).toContain('codex exec -C .')
  })

  it('normalizeQuestRun backfills codex for legacy quest.json', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
    const legacy = {
      ...quest,
      runtimes: {
        opencode: quest.runtimes.opencode,
        kimi: quest.runtimes.kimi,
        claude: quest.runtimes.claude,
      },
    } as QuestRun

    const normalized = normalizeQuestRun(legacy)
    expect(normalized.runtimes.codex.command).toContain('codex exec -C .')
    expect(normalized.artifacts.intelligentCodingTeam).toBe('intelligent-coding-team.json')
    expect(normalized.artifacts.requirementCompiler).toBe('requirement-compiler.json')
    expect(normalized.artifacts.expertTeamBlackboard).toBe('expert-team-blackboard.json')
    expect(normalized.artifacts.changeImpactSimulator).toBe('change-impact-simulator.json')
    expect(normalized.artifacts.projectSkillPackBuilder).toBe('project-skill-pack-builder.json')
    expect(normalized.artifacts.verifiedDelivery).toBe('verified-delivery-os.json')
    expect(normalized.artifacts.acceptanceCompiler).toBe('acceptance-compiler.json')
    expect(normalized.artifacts.evidenceFirstGate).toBe('evidence-first-gate.json')
    expect(normalized.artifacts.patchProvenanceLedger).toBe('patch-provenance-ledger.json')
    expect(normalized.artifacts.runtimeCycleMatrix).toBe('runtime-cycle-matrix.json')
    expect(normalized.artifacts.autoEvalGenerator).toBe('auto-eval-generator.json')
    expect(normalized.artifacts.agentDebateGate).toBe('agent-debate-gate.json')
    expect(normalized.artifacts.releaseReadinessDashboard).toBe('release-readiness-dashboard.json')
    expect(normalized.artifacts.productArchitectReview).toBe('product-architect-review.json')
    expect(normalized.artifacts.architectureNextSteps).toBe('architecture-next-steps.json')
    expect(normalized.artifacts.roadmapSignals).toBe('roadmap-signals.json')
    expect(normalized.artifacts.capabilityGapMap).toBe('capability-gap-map.json')
    expect(normalized.artifacts.productRiskRegister).toBe('product-risk-register.json')
    expect(normalized.artifacts.userValueMatrix).toBe('user-value-matrix.json')
    expect(normalized.artifacts.strategicRefactorRadar).toBe('strategic-refactor-radar.json')
    expect(normalized.artifacts.architectureDecisionSuggestions).toBe('architecture-decision-suggestions.json')
    expect(normalized.artifacts.strategicNextActions).toBe('strategic-next-actions.md')
    expect(normalized.artifacts.runtimeReliability).toBe('runtime-reliability-os.json')
    expect(normalized.artifacts.commandFailureIndex).toBe('command-failure-index.json')
    expect(normalized.artifacts.timeoutPolicy).toBe('timeout-policy.json')
    expect(normalized.artifacts.claimLedger).toBe('claim-ledger.json')
    expect(normalized.artifacts.runtimeDoctorReport).toBe('runtime-doctor-report.json')
    expect(normalized.artifacts.autonomousRecoveryPlan).toBe('autonomous-recovery-plan.json')
    expect(normalized.artifacts.flakyCommandMemory).toBe('flaky-command-memory.json')
    expect(normalized.artifacts.evidenceReplay).toBe('evidence-replay.md')
    expect(normalized.artifacts.deepCodingCollaboration).toBe('deep-coding-collaboration-os.json')
    expect(normalized.artifacts.deepThinkingReview).toBe('deep-thinking-review.json')
    expect(normalized.artifacts.ideaToBuildBrief).toBe('idea-to-build-brief.json')
    expect(normalized.artifacts.smarterCodePlan).toBe('smarter-code-plan.json')
    expect(normalized.artifacts.collaborationBoard).toBe('collaboration-board.json')
    expect(normalized.artifacts.decisionTradeoffMatrix).toBe('decision-tradeoff-matrix.json')
    expect(normalized.artifacts.buildBetterRoadmap).toBe('build-better-roadmap.md')
    expect(normalized.artifacts.selfImprovingCodingTeam).toBe('self-improving-coding-team-os.json')
    expect(normalized.artifacts.codingTeamMetrics).toBe('coding-team-metrics.json')
    expect(normalized.artifacts.deliveryRetrospective).toBe('delivery-retrospective.json')
    expect(normalized.artifacts.learningFeedbackLoop).toBe('learning-feedback-loop.json')
    expect(normalized.artifacts.improvementBacklog).toBe('improvement-backlog.json')
    expect(normalized.artifacts.skillEvolutionCandidates).toBe('skill-evolution-candidates.json')
    expect(normalized.artifacts.selfImprovementRoadmap).toBe('self-improvement-roadmap.md')
    expect(normalized.artifacts.predictiveEngineering).toBe('predictive-engineering-os.json')
    expect(normalized.artifacts.intentArchitectureCompiler).toBe('intent-architecture-compiler.json')
    expect(normalized.artifacts.changeSimulationEngine).toBe('change-simulation-engine.json')
    expect(normalized.artifacts.riskForecastScore).toBe('risk-forecast-score.json')
    expect(normalized.artifacts.implementationPathRanking).toBe('implementation-path-ranking.json')
    expect(normalized.artifacts.testIntelligencePlanner).toBe('test-intelligence-planner.json')
    expect(normalized.artifacts.proofContract).toBe('proof-contract.json')
    expect(normalized.artifacts.architectureDriftDetector).toBe('architecture-drift-detector.json')
    expect(normalized.artifacts.contextFreshnessGate).toBe('context-freshness-gate.json')
    expect(normalized.artifacts.predictiveTimeoutGuard).toBe('predictive-timeout-guard.json')
    expect(normalized.artifacts.predictiveEngineeringRoadmap).toBe('predictive-engineering-roadmap.md')
  })

  it('formatQuestSummary produces markdown', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatQuestSummary(quest)
    expect(md).toContain('# Quest Summary')
    expect(md).toContain(quest.objective)
    expect(md).toContain('## Next Action')
  })

  it('formatAcceptanceReport includes risks for failed tasks', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatAcceptanceReport(quest)
    expect(md).toContain('# Acceptance Report')
    expect(md).toContain('## Remaining Risks')
  })
})

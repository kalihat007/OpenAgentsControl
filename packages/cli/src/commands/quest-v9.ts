/**
 * oac quest-v9 - refresh and inspect Quest v9 coding intelligence.
 */

import type { Command } from 'commander'
import { join } from 'node:path'
import { refreshQuestCodingIntelligence } from '../lib/quest-coding-intelligence.js'
import { CommandUsageError } from '../lib/errors.js'
import { questExists } from '../lib/quest-run.js'
import { dim, info, log, success, warn } from '../ui/logger.js'

export interface QuestV9Options {
  json?: boolean
  objective?: string
  changedFile?: string[]
}

export async function questV9Command(
  questId: string | undefined,
  options: QuestV9Options = {},
): Promise<void> {
  const projectRoot = process.cwd()
  if (questId && !(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  const intelligence = await refreshQuestCodingIntelligence(projectRoot, {
    questId,
    objective: options.objective,
    reason: questId ? 'quest-v9.command' : 'quest-v9.working-tree',
    changedFiles: options.changedFile,
  })

  if (options.json) {
    log(JSON.stringify(intelligence, null, 2))
    return
  }

  log('')
  success('Quest v9 coding intelligence refreshed')
  info(`Version: ${intelligence.version}`)
  info(`Risk: ${intelligence.intent.riskLevel}`)
  info(`Affected files: ${intelligence.intent.affectedFiles.length}`)
  info(`Affected modules: ${intelligence.intent.affectedModules.length}`)
  info(`Patch capsules: ${intelligence.patchCapsules.length}`)
  info(`Smart tests: ${intelligence.testRecommendations.length}`)
  info(`Autopilot symbols: ${intelligence.codingAutopilot.symbolGraph.summary.symbols}`)
  info(`Autopilot review: ${intelligence.codingAutopilot.automaticCodeReview.verdict}`)
  info(`PR readiness: ${intelligence.codingAutopilot.prReadiness.ready ? 'ready' : 'needs work'}`)
  info(`Dependency research: ${intelligence.codingAutopilot.dependencyResearchGate.needed ? 'needed' : 'not needed'}`)
  info(`Autofix loop: ${intelligence.codingAutopilot.autofixPlan.enabled ? 'enabled' : 'not needed'}`)
  info(`Execution acceptance: ${intelligence.codingExecution.executableAcceptance.checks.length} checks`)
  info(`Guarded autofix runner: ${intelligence.codingExecution.guardedAutofixRunner.enabled ? 'enabled' : 'not needed'}`)
  info(`Contract drift watchers: ${intelligence.codingExecution.contractDriftGuard.watchedContracts.length}`)
  info(`Test gaps: ${intelligence.codingExecution.testGapFinder.gaps.length}`)
  info(`Runtime matrix: ${intelligence.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered ? 'covered' : 'needs test'}`)
  info(`Security gate: ${intelligence.codingExecution.securitySecretsGate.verdict}`)
  info(`PR package: ${intelligence.codingExecution.prAutoPackager.ready ? 'ready' : 'needs work'}`)
  info(`Verified knowledgebase sources: ${intelligence.verifiedKnowledgebase.knowledgebaseIndex.summary.sources}`)
  info(`Evidence ledger: ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.verified} verified / ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.assumed} assumed / ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.unknown} unknown`)
  info(`Hallucination gate: ${intelligence.verifiedKnowledgebase.hallucinationGate.verdict}`)
  info(`Contract facts: ${intelligence.verifiedKnowledgebase.contractFacts.facts.length}`)
  info(`Stale knowledge: ${intelligence.verifiedKnowledgebase.staleKnowledgeReport.staleItems} stale/missing`)
  info(`Behavior oracle: ${intelligence.verifiedKnowledgebase.behaviorOracle.signals.length} signals`)
  info(`Test-authoring candidates: ${intelligence.verifiedKnowledgebase.testAuthoringPlan.candidates.length}`)
  info(`Semantic repo nodes: ${intelligence.semanticRepoBrain.semanticGraph.summary.nodes}`)
  info(`Knowledge confidence: ${intelligence.semanticRepoBrain.knowledgeConfidenceScore.overall}`)
  info(`Failure-fix fingerprints: ${intelligence.semanticRepoBrain.failureFixMemory.fingerprints.length}`)
  info(`Skill candidates: ${intelligence.semanticRepoBrain.autoSkillBuilder.candidates.length}`)
  info(`Semantic gate: ${intelligence.semanticRepoBrain.completionGate.verdict}`)
  info(`Chronic failure commands: ${intelligence.temporalMemory.chronicCommands.length}`)
  info(`Patch outcomes: ${intelligence.temporalMemory.outcomeSummary.total} (reverted ${intelligence.temporalMemory.outcomeSummary.reverted}, hotfixed ${intelligence.temporalMemory.outcomeSummary.hotfixed})`)
  info(`History commits scanned: ${intelligence.temporalMemory.history.commitsScanned}`)
  info(`Requirement readiness: ${intelligence.intelligentCodingTeam.requirementCompiler.readiness}`)
  info(`Team experts: ${intelligence.intelligentCodingTeam.expertTeamBlackboard.roster.length}`)
  info(`Impact simulation: ${intelligence.intelligentCodingTeam.changeImpactSimulator.blastRadius}`)
  info(`Project skill candidates: ${intelligence.intelligentCodingTeam.projectSkillPackBuilder.candidates.length}`)
  info(`Team gate: ${intelligence.intelligentCodingTeam.teamGate.verdict}`)
  info(`Acceptance compiler: ${intelligence.verifiedDelivery.acceptanceCompiler.readiness}`)
  info(`Evidence-first gate: ${intelligence.verifiedDelivery.evidenceFirstGate.verdict}`)
  info(`Patch provenance entries: ${intelligence.verifiedDelivery.patchProvenanceLedger.entries.length}`)
  info(`Runtime three-cycle matrix: ${intelligence.verifiedDelivery.runtimeCycleMatrix.allRequiredCovered ? 'covered' : 'needs test'}`)
  info(`Auto-eval candidates: ${intelligence.verifiedDelivery.autoEvalGenerator.candidates.length}`)
  info(`Agent debate gate: ${intelligence.verifiedDelivery.agentDebateGate.verdict}`)
  info(`Release readiness: ${intelligence.verifiedDelivery.releaseReadinessDashboard.verdict}`)
  info(`Product architect verdict: ${intelligence.productArchitect.productArchitectReview.verdict}`)
  info(`Architecture next steps: ${intelligence.productArchitect.architectureNextSteps.length}`)
  info(`Roadmap signals: ${intelligence.productArchitect.roadmapSignals.length}`)
  info(`Capability gaps: ${intelligence.productArchitect.capabilityGapMap.length}`)
  info(`Product risks: ${intelligence.productArchitect.productRiskRegister.length}`)
  info(`Strategic refactor signals: ${intelligence.productArchitect.strategicRefactorRadar.length}`)
  info(`Runtime reliability: ${intelligence.runtimeReliability.verdict} (${intelligence.runtimeReliability.reliabilityScore})`)
  info(`Command failure fingerprints: ${intelligence.runtimeReliability.commandFailureIndex.fingerprints.length}`)
  info(`Claim ledger: ${intelligence.runtimeReliability.claimLedger.summary.verified} verified / ${intelligence.runtimeReliability.claimLedger.summary.missing} missing / ${intelligence.runtimeReliability.claimLedger.summary.blocked} blocked`)
  info(`Runtime doctor: ${intelligence.runtimeReliability.runtimeDoctorReport.verdict}`)
  info(`Recovery actions: ${intelligence.runtimeReliability.autonomousRecoveryPlan.actions.length}`)
  info(`Deep coding collaboration: ${intelligence.deepCodingCollaboration.verdict} (${intelligence.deepCodingCollaboration.depthScore})`)
  info(`Deep hard questions: ${intelligence.deepCodingCollaboration.deepThinkingReview.hardQuestions.length}`)
  info(`Idea-to-build slices: ${intelligence.deepCodingCollaboration.ideaToBuildBrief.buildSlices.length}`)
  info(`Smarter code moves: ${intelligence.deepCodingCollaboration.smarterCodePlan.codeQualityMoves.length}`)
  info(`Collaboration decisions: ${intelligence.deepCodingCollaboration.collaborationBoard.decisionsNeeded.length}`)
  info(`Decision tradeoffs: ${intelligence.deepCodingCollaboration.decisionTradeoffMatrix.tradeoffs.length}`)
  info(`Self-improving coding team: ${intelligence.selfImprovingCodingTeam.verdict} (${intelligence.selfImprovingCodingTeam.improvementScore})`)
  info(`Coding team metrics: delivery ${intelligence.selfImprovingCodingTeam.codingTeamMetrics.deliveryScore} / quality ${intelligence.selfImprovingCodingTeam.codingTeamMetrics.qualityScore} / runtime ${intelligence.selfImprovingCodingTeam.codingTeamMetrics.runtimeScore}`)
  info(`Improvement backlog: ${intelligence.selfImprovingCodingTeam.improvementBacklog.length}`)
  info(`Skill evolution candidates: ${intelligence.selfImprovingCodingTeam.skillEvolutionCandidates.length}`)
  info(`Predictive engineering: ${intelligence.predictiveEngineering.verdict} (${intelligence.predictiveEngineering.predictiveScore})`)
  info(`Risk forecast: ${intelligence.predictiveEngineering.riskForecastScore.overallRisk} (${intelligence.predictiveEngineering.riskForecastScore.riskScore})`)
  info(`Implementation path: ${intelligence.predictiveEngineering.implementationPathRanking.selectedPath}`)
  info(`Predictive required tests: ${intelligence.predictiveEngineering.testIntelligencePlanner.requiredTests.length}`)
  info(`Proof blockers: ${intelligence.predictiveEngineering.proofContract.blockers.length}`)
  info(`Context freshness: ${intelligence.predictiveEngineering.contextFreshnessGate.verdict}`)
  info(`Predictive timeout guard: ${intelligence.predictiveEngineering.predictiveTimeoutGuard.verdict}`)

  if (intelligence.reviewSignals.length > 0) {
    warn(`Review signals: ${intelligence.reviewSignals.length}`)
    for (const signal of intelligence.reviewSignals.slice(0, 5)) {
      log(`  - [${signal.severity}] ${signal.summary}`)
      dim(`    ${signal.recommendation}`)
    }
  }

  if (intelligence.testRecommendations.length > 0) {
    log('')
    info('Recommended validation:')
    for (const test of intelligence.testRecommendations.slice(0, 8)) {
      log(`  - ${test.command}`)
      dim(`    ${test.reason}`)
    }
  }

  log('')
  info('Artifacts:')
  const artifactDir = questId
    ? join('.oac', 'runs', questId)
    : join('.oac', 'coding-intelligence')
  log(`  - ${join(artifactDir, 'coding-intelligence.json')}`)
  log(`  - ${join(artifactDir, 'patch-capsules.json')}`)
  log(`  - ${join(artifactDir, 'coding-review.md')}`)
  log(`  - ${join(artifactDir, 'coding-autopilot.json')}`)
  log(`  - ${join(artifactDir, 'symbol-graph.json')}`)
  log(`  - ${join(artifactDir, 'smart-test-matrix.json')}`)
  log(`  - ${join(artifactDir, 'patch-ledger.json')}`)
  log(`  - ${join(artifactDir, 'pre-edit-contract.json')}`)
  log(`  - ${join(artifactDir, 'automatic-code-review.json')}`)
  log(`  - ${join(artifactDir, 'failure-memory.json')}`)
  log(`  - ${join(artifactDir, 'runtime-parity-enforcer.json')}`)
  log(`  - ${join(artifactDir, 'dependency-research-gate.json')}`)
  log(`  - ${join(artifactDir, 'autofix-plan.json')}`)
  log(`  - ${join(artifactDir, 'pr-readiness.md')}`)
  log(`  - ${join(artifactDir, 'coding-execution.json')}`)
  log(`  - ${join(artifactDir, 'executable-acceptance.json')}`)
  log(`  - ${join(artifactDir, 'guarded-autofix-runner.json')}`)
  log(`  - ${join(artifactDir, 'contract-drift-guard.json')}`)
  log(`  - ${join(artifactDir, 'review-patch-loop.json')}`)
  log(`  - ${join(artifactDir, 'test-gap-finder.json')}`)
  log(`  - ${join(artifactDir, 'regression-snapshots.json')}`)
  log(`  - ${join(artifactDir, 'runtime-compatibility-matrix.json')}`)
  log(`  - ${join(artifactDir, 'ownership-lock-plan.json')}`)
  log(`  - ${join(artifactDir, 'security-secrets-gate.json')}`)
  log(`  - ${join(artifactDir, 'pr-auto-packager.json')}`)
  log(`  - ${join(artifactDir, 'pr-auto-packager.md')}`)
  log(`  - ${join(artifactDir, 'verified-knowledgebase.json')}`)
  log(`  - ${join(artifactDir, 'knowledgebase-index.json')}`)
  log(`  - ${join(artifactDir, 'evidence-ledger.json')}`)
  log(`  - ${join(artifactDir, 'hallucination-gate.json')}`)
  log(`  - ${join(artifactDir, 'contract-facts.json')}`)
  log(`  - ${join(artifactDir, 'source-to-patch-trace.json')}`)
  log(`  - ${join(artifactDir, 'stale-knowledge-report.json')}`)
  log(`  - ${join(artifactDir, 'dependency-research-cache.json')}`)
  log(`  - ${join(artifactDir, 'behavior-oracle.json')}`)
  log(`  - ${join(artifactDir, 'test-authoring-plan.json')}`)
  log(`  - ${join(artifactDir, 'verified-knowledgebase.md')}`)
  log(`  - ${join(artifactDir, 'semantic-repo-brain.json')}`)
  log(`  - ${join(artifactDir, 'ast-knowledgebase.json')}`)
  log(`  - ${join(artifactDir, 'knowledge-confidence-score.json')}`)
  log(`  - ${join(artifactDir, 'failure-fix-memory.json')}`)
  log(`  - ${join(artifactDir, 'auto-skill-builder.json')}`)
  log(`  - ${join(artifactDir, 'semantic-repo-brain.md')}`)
  log(`  - ${join(artifactDir, 'temporal-memory.json')}`)
  log(`  - ${join(artifactDir, 'patch-outcome-ledger.json')}`)
  log(`  - ${join(artifactDir, 'repo-history-signals.json')}`)
  log(`  - ${join(artifactDir, 'temporal-memory.md')}`)
  log(`  - ${join(artifactDir, 'intelligent-coding-team.json')}`)
  log(`  - ${join(artifactDir, 'requirement-compiler.json')}`)
  log(`  - ${join(artifactDir, 'expert-team-blackboard.json')}`)
  log(`  - ${join(artifactDir, 'change-impact-simulator.json')}`)
  log(`  - ${join(artifactDir, 'project-skill-pack-builder.json')}`)
  log(`  - ${join(artifactDir, 'intelligent-coding-team.md')}`)
  log(`  - ${join(artifactDir, 'verified-delivery-os.json')}`)
  log(`  - ${join(artifactDir, 'acceptance-compiler.json')}`)
  log(`  - ${join(artifactDir, 'evidence-first-gate.json')}`)
  log(`  - ${join(artifactDir, 'patch-provenance-ledger.json')}`)
  log(`  - ${join(artifactDir, 'runtime-cycle-matrix.json')}`)
  log(`  - ${join(artifactDir, 'auto-eval-generator.json')}`)
  log(`  - ${join(artifactDir, 'agent-debate-gate.json')}`)
  log(`  - ${join(artifactDir, 'release-readiness-dashboard.json')}`)
  log(`  - ${join(artifactDir, 'verified-delivery-os.md')}`)
  log(`  - ${join(artifactDir, 'product-architect-review.json')}`)
  log(`  - ${join(artifactDir, 'architecture-next-steps.json')}`)
  log(`  - ${join(artifactDir, 'roadmap-signals.json')}`)
  log(`  - ${join(artifactDir, 'capability-gap-map.json')}`)
  log(`  - ${join(artifactDir, 'product-risk-register.json')}`)
  log(`  - ${join(artifactDir, 'user-value-matrix.json')}`)
  log(`  - ${join(artifactDir, 'strategic-refactor-radar.json')}`)
  log(`  - ${join(artifactDir, 'architecture-decision-suggestions.json')}`)
  log(`  - ${join(artifactDir, 'strategic-next-actions.md')}`)
  log(`  - ${join(artifactDir, 'runtime-reliability-os.json')}`)
  log(`  - ${join(artifactDir, 'command-failure-index.json')}`)
  log(`  - ${join(artifactDir, 'timeout-policy.json')}`)
  log(`  - ${join(artifactDir, 'claim-ledger.json')}`)
  log(`  - ${join(artifactDir, 'runtime-doctor-report.json')}`)
  log(`  - ${join(artifactDir, 'autonomous-recovery-plan.json')}`)
  log(`  - ${join(artifactDir, 'flaky-command-memory.json')}`)
  log(`  - ${join(artifactDir, 'evidence-replay.md')}`)
  log(`  - ${join(artifactDir, 'deep-coding-collaboration-os.json')}`)
  log(`  - ${join(artifactDir, 'deep-thinking-review.json')}`)
  log(`  - ${join(artifactDir, 'idea-to-build-brief.json')}`)
  log(`  - ${join(artifactDir, 'smarter-code-plan.json')}`)
  log(`  - ${join(artifactDir, 'collaboration-board.json')}`)
  log(`  - ${join(artifactDir, 'decision-tradeoff-matrix.json')}`)
  log(`  - ${join(artifactDir, 'build-better-roadmap.md')}`)
  log(`  - ${join(artifactDir, 'self-improving-coding-team-os.json')}`)
  log(`  - ${join(artifactDir, 'coding-team-metrics.json')}`)
  log(`  - ${join(artifactDir, 'delivery-retrospective.json')}`)
  log(`  - ${join(artifactDir, 'learning-feedback-loop.json')}`)
  log(`  - ${join(artifactDir, 'improvement-backlog.json')}`)
  log(`  - ${join(artifactDir, 'skill-evolution-candidates.json')}`)
  log(`  - ${join(artifactDir, 'self-improvement-roadmap.md')}`)
  log(`  - ${join(artifactDir, 'predictive-engineering-os.json')}`)
  log(`  - ${join(artifactDir, 'intent-architecture-compiler.json')}`)
  log(`  - ${join(artifactDir, 'change-simulation-engine.json')}`)
  log(`  - ${join(artifactDir, 'risk-forecast-score.json')}`)
  log(`  - ${join(artifactDir, 'implementation-path-ranking.json')}`)
  log(`  - ${join(artifactDir, 'test-intelligence-planner.json')}`)
  log(`  - ${join(artifactDir, 'proof-contract.json')}`)
  log(`  - ${join(artifactDir, 'architecture-drift-detector.json')}`)
  log(`  - ${join(artifactDir, 'context-freshness-gate.json')}`)
  log(`  - ${join(artifactDir, 'predictive-timeout-guard.json')}`)
  log(`  - ${join(artifactDir, 'predictive-engineering-roadmap.md')}`)
  log('')
}

export function registerQuestV9Command(program: Command): void {
  program
    .command('quest-v9 [quest-id]')
    .description('Refresh and inspect Quest v9 coding intelligence through the v21 Predictive Engineering artifacts')
    .option('--json', 'Print machine-readable coding intelligence', false)
    .option('--objective <text>', 'Objective to use when no quest id is supplied')
    .option('--changed-file <path...>', 'Changed file path(s) to include in the analysis')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-v9
  oac quest-v9 swarm-abc123
  oac quest-v9 --objective "harden installer validation" --changed-file install.sh update.sh
  oac quest-v9 swarm-abc123 --json
`,
    )
    .action(async (questId: string | undefined, opts: QuestV9Options) => {
      await questV9Command(questId, opts)
    })
}

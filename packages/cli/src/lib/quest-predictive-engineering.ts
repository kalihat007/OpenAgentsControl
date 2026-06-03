/**
 * Quest v21 Predictive Engineering OS.
 *
 * Turns the predecessor coding sidecars into a pre-execution forecast: intent
 * architecture, blast-radius simulation, risk scoring, implementation path
 * ranking, validation planning, proof contracts, freshness checks, and timeout
 * guards before editing or claiming completion.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ImpactAnalysis } from './codebase-indexer.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'
import type { QuestDeepCodingCollaborationOS } from './quest-deep-coding-collaboration.js'
import type { QuestIntelligentCodingTeam } from './quest-intelligent-coding-team.js'
import type { QuestProductArchitectIntelligence } from './quest-product-architect.js'
import type { QuestRuntimeReliabilityOS } from './quest-runtime-reliability.js'
import type { QuestSelfImprovingCodingTeamOS } from './quest-self-improving-coding-team.js'
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedDeliveryOS } from './quest-verified-delivery.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_PREDICTIVE_ENGINEERING_VERSION = '21' as const

export type QuestPredictiveVerdict = 'ready' | 'review' | 'blocked'
export type QuestPredictivePriority = 'low' | 'medium' | 'high'
export type QuestForecastStatus = 'verified' | 'inferred' | 'stale' | 'missing' | 'needs-research'

export interface QuestIntentArchitectureCompiler {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  requirements: Array<{ id: string; statement: string; evidence: string[]; confidence: number }>
  invariants: string[]
  nonGoals: string[]
  architectureSurfaces: Array<{ id: string; surface: string; files: string[]; risk: QuestPredictivePriority; evidence: string[] }>
  acceptanceProof: string[]
  assumptions: Array<{ statement: string; status: QuestForecastStatus; evidence: string[] }>
  confidence: number
}

export interface QuestChangeSimulationFinding {
  id: string
  severity: QuestPredictivePriority
  summary: string
  affectedFiles: string[]
  mitigation: string
  evidence: string[]
}

export interface QuestChangeSimulationEngine {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  touchedFiles: string[]
  predictedSurfaces: Array<{ surface: string; files: string[]; reason: string }>
  blastRadius: 'narrow' | 'moderate' | 'wide'
  dependencyImpacts: string[]
  promptRuntimeImpacts: string[]
  migrationNeeded: boolean
  findings: QuestChangeSimulationFinding[]
}

export interface QuestRiskDimension {
  score: number
  status: QuestForecastStatus
  evidence: string[]
  mitigation: string
}

export interface QuestRiskForecastScore {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  overallRisk: QuestPredictivePriority
  riskScore: number
  hallucinationRisk: QuestRiskDimension
  regressionRisk: QuestRiskDimension
  timeoutRisk: QuestRiskDimension
  missingKnowledgeRisk: QuestRiskDimension
  architectureDriftRisk: QuestRiskDimension
  evidence: string[]
}

export interface QuestImplementationPath {
  id: string
  title: string
  rank: number
  score: number
  strategy: string
  tradeoffs: string[]
  risks: string[]
  whenToUse: string
  requiredEvidence: string[]
}

export interface QuestImplementationPathRanking {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  selectedPath: string
  rationale: string
  paths: QuestImplementationPath[]
}

export interface QuestTestIntelligencePlanner {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  requiredTests: Array<{ command: string; reason: string; scope: QuestTestRecommendation['scope']; confidence: number }>
  optionalTests: Array<{ command: string; reason: string }>
  runtimeParityChecks: Array<{ runtime: 'opencode' | 'kimi' | 'codex' | 'claude'; required: boolean; reason: string }>
  missingTests: Array<{ title: string; suggestedPath: string; reason: string }>
  confidence: number
}

export interface QuestProofContract {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  doneClaims: Array<{ id: string; claim: string; evidenceRequired: string[]; status: QuestForecastStatus }>
  requiredEvidence: string[]
  blockers: string[]
  completionPolicy: string[]
}

export interface QuestArchitectureDriftDetector {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  verdict: QuestPredictiveVerdict
  driftSignals: QuestChangeSimulationFinding[]
  protectedContracts: Array<{ name: string; source: string; evidence: string[] }>
  policy: string[]
}

export interface QuestContextFreshnessGate {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  verdict: QuestPredictiveVerdict
  repoWikiFreshness: QuestForecastStatus
  semanticBrainFreshness: QuestForecastStatus
  docsResearchNeeded: boolean
  webResearchNeeded: boolean
  reasons: string[]
  recommendedRefreshCommands: string[]
}

export interface QuestPredictiveTimeoutGuard {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  verdict: QuestPredictiveVerdict
  riskyCommands: Array<{ command: string; timeoutSeconds: number; reason: string }>
  timeoutPolicy: string[]
  stepLimitPolicy: string[]
  splitRecommendations: string[]
}

export interface QuestPredictiveEngineeringOS {
  version: typeof QUEST_PREDICTIVE_ENGINEERING_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  verdict: QuestPredictiveVerdict
  predictiveScore: number
  intentArchitectureCompiler: QuestIntentArchitectureCompiler
  changeSimulationEngine: QuestChangeSimulationEngine
  riskForecastScore: QuestRiskForecastScore
  implementationPathRanking: QuestImplementationPathRanking
  testIntelligencePlanner: QuestTestIntelligencePlanner
  proofContract: QuestProofContract
  architectureDriftDetector: QuestArchitectureDriftDetector
  contextFreshnessGate: QuestContextFreshnessGate
  predictiveTimeoutGuard: QuestPredictiveTimeoutGuard
}

export interface BuildQuestPredictiveEngineeringOptions {
  projectRoot: string
  objective: string
  files: string[]
  impact: ImpactAnalysis
  patchCapsules: QuestPatchCapsule[]
  testRecommendations: QuestTestRecommendation[]
  reviewSignals: QuestReviewSignal[]
  runtimeParity: QuestRuntimeParity
  verifiedKnowledgebase: QuestVerifiedKnowledgebase
  semanticRepoBrain: QuestSemanticRepoBrain
  temporalMemory: QuestTemporalMemory
  intelligentCodingTeam: QuestIntelligentCodingTeam
  verifiedDelivery: QuestVerifiedDeliveryOS
  productArchitect: QuestProductArchitectIntelligence
  runtimeReliability: QuestRuntimeReliabilityOS
  deepCodingCollaboration: QuestDeepCodingCollaborationOS
  selfImprovingCodingTeam: QuestSelfImprovingCodingTeamOS
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

interface EventSummary {
  validationsPassed: number
  validationsFailed: number
  contextLoads: number
  researchPerformed: number
  timeouts: number
  stepLimits: number
  errors: number
}

export function buildQuestPredictiveEngineeringOS(
  options: BuildQuestPredictiveEngineeringOptions,
): QuestPredictiveEngineeringOS {
  const eventSummary = summarizeEvents(options.events)
  const intentArchitectureCompiler = buildIntentArchitectureCompiler(options)
  const changeSimulationEngine = buildChangeSimulationEngine(options)
  const riskForecastScore = buildRiskForecastScore(options, eventSummary, changeSimulationEngine)
  const implementationPathRanking = buildImplementationPathRanking(options, riskForecastScore, changeSimulationEngine)
  const testIntelligencePlanner = buildTestIntelligencePlanner(options)
  const proofContract = buildProofContract(options, riskForecastScore, testIntelligencePlanner)
  const architectureDriftDetector = buildArchitectureDriftDetector(options, changeSimulationEngine)
  const contextFreshnessGate = buildContextFreshnessGate(options, eventSummary)
  const predictiveTimeoutGuard = buildPredictiveTimeoutGuard(options, eventSummary)
  const verdict = predictiveVerdict(riskForecastScore, proofContract, architectureDriftDetector, contextFreshnessGate, predictiveTimeoutGuard)
  const predictiveScore = clampScore(
    100
    - riskForecastScore.riskScore
    - proofContract.blockers.length * 8
    - (contextFreshnessGate.verdict === 'blocked' ? 20 : contextFreshnessGate.verdict === 'review' ? 8 : 0)
    - (predictiveTimeoutGuard.verdict === 'blocked' ? 15 : predictiveTimeoutGuard.verdict === 'review' ? 6 : 0),
  )

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    objective: options.objective,
    verdict,
    predictiveScore,
    intentArchitectureCompiler,
    changeSimulationEngine,
    riskForecastScore,
    implementationPathRanking,
    testIntelligencePlanner,
    proofContract,
    architectureDriftDetector,
    contextFreshnessGate,
    predictiveTimeoutGuard,
  }
}

export async function writeQuestPredictiveEngineeringArtifacts(
  dir: string,
  os: QuestPredictiveEngineeringOS,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'predictive-engineering-os.json'), os),
    writeJson(join(dir, 'intent-architecture-compiler.json'), os.intentArchitectureCompiler),
    writeJson(join(dir, 'change-simulation-engine.json'), os.changeSimulationEngine),
    writeJson(join(dir, 'risk-forecast-score.json'), os.riskForecastScore),
    writeJson(join(dir, 'implementation-path-ranking.json'), os.implementationPathRanking),
    writeJson(join(dir, 'test-intelligence-planner.json'), os.testIntelligencePlanner),
    writeJson(join(dir, 'proof-contract.json'), os.proofContract),
    writeJson(join(dir, 'architecture-drift-detector.json'), os.architectureDriftDetector),
    writeJson(join(dir, 'context-freshness-gate.json'), os.contextFreshnessGate),
    writeJson(join(dir, 'predictive-timeout-guard.json'), os.predictiveTimeoutGuard),
    writeFile(join(dir, 'predictive-engineering-roadmap.md'), formatPredictiveEngineeringRoadmap(os)),
  ])
}

export function formatPredictiveEngineeringSummary(os: QuestPredictiveEngineeringOS): string {
  return [
    '## Predictive Engineering OS',
    '',
    `- Predictive verdict: ${os.verdict}`,
    `- Predictive score: ${os.predictiveScore}`,
    `- Overall risk: ${os.riskForecastScore.overallRisk} (${os.riskForecastScore.riskScore})`,
    `- Selected path: ${os.implementationPathRanking.selectedPath}`,
    `- Required tests: ${os.testIntelligencePlanner.requiredTests.length}`,
    `- Proof blockers: ${os.proofContract.blockers.length}`,
    `- Freshness gate: ${os.contextFreshnessGate.verdict}`,
    `- Timeout guard: ${os.predictiveTimeoutGuard.verdict}`,
  ].join('\n')
}

function buildIntentArchitectureCompiler(options: BuildQuestPredictiveEngineeringOptions): QuestIntentArchitectureCompiler {
  const requirementCriteria = options.intelligentCodingTeam.requirementCompiler.requirements
    .slice(0, 8)
    .map((requirement, index) => ({
      id: requirement.id ?? `requirement-${index + 1}`,
      statement: requirement.statement,
      evidence: requirement.evidence,
      confidence: requirement.confidence,
    }))
  const capsuleRequirements = options.patchCapsules.slice(0, 6).map((capsule, index) => ({
    id: `patch-${index + 1}`,
    statement: capsule.expectedBehavior,
    evidence: [`Patch capsule: ${capsule.id}`, ...capsule.files.slice(0, 4)],
    confidence: capsule.files.length > 0 ? 0.78 : 0.48,
  }))
  const requirements = requirementCriteria.length > 0 ? requirementCriteria : capsuleRequirements
  const architectureSurfaces = groupSurfaces(options.files).map((surface) => ({
    id: `surface-${stableId(surface.surface)}`,
    surface: surface.surface,
    files: surface.files,
    risk: surfaceRisk(surface.files, options),
    evidence: [`Files: ${surface.files.length}`, `Impact risk: ${options.impact.riskLevel}`],
  }))
  const assumptions = [
    {
      statement: 'Local repository evidence is the primary source of truth for implementation decisions.',
      status: options.repoWiki ? 'verified' as const : 'missing' as const,
      evidence: [`Repo wiki files: ${options.repoWiki?.files.length ?? 0}`],
    },
    {
      statement: 'External research is only needed when current APIs, provider behavior, standards, or unfamiliar domain facts affect correctness.',
      status: options.verifiedKnowledgebase.dependencyResearchCache.needed ? 'needs-research' as const : 'verified' as const,
      evidence: options.verifiedKnowledgebase.dependencyResearchCache.queries.slice(0, 4),
    },
  ]

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    requirements,
    invariants: [
      'Read required files and Quest sidecars before editing.',
      'Do not claim implementation, files, commands, or test results without local evidence.',
      'Keep skill and durable-memory promotion approval-gated.',
      'Respect runtime timeout and max-step guards before long validation.',
    ],
    nonGoals: options.deepCodingCollaboration.ideaToBuildBrief.nonGoals.slice(0, 8),
    architectureSurfaces,
    acceptanceProof: options.verifiedDelivery.acceptanceCompiler.criteria
      .slice(0, 8)
      .map((criterion) => `${criterion.id}: ${criterion.statement}`),
    assumptions,
    confidence: average([
      ...requirements.map((requirement) => requirement.confidence),
      options.semanticRepoBrain.knowledgeConfidenceScore.overall,
      options.verifiedKnowledgebase.hallucinationGate.verdict === 'pass' ? 0.86 : 0.55,
    ]),
  }
}

function buildChangeSimulationEngine(options: BuildQuestPredictiveEngineeringOptions): QuestChangeSimulationEngine {
  const predictedSurfaces = groupSurfaces(options.files).map((surface) => ({
    surface: surface.surface,
    files: surface.files,
    reason: surfaceReason(surface.surface),
  }))
  const dependencyImpacts = [
    ...options.impact.directlyAffected.slice(0, 8).map((file) => `Direct dependent: ${file}`),
    ...options.impact.transitivelyAffected.slice(0, 8).map((file) => `Transitive dependent: ${file}`),
  ]
  const promptRuntimeImpacts = options.files
    .filter((file) => isRuntimePromptFile(file) || isRuntimeAdapterFile(file))
    .slice(0, 10)
    .map((file) => `Runtime/prompt surface: ${file}`)
  const findings: QuestChangeSimulationFinding[] = []
  if (options.impact.riskLevel === 'high') {
    findings.push({
      id: 'high-impact-surface',
      severity: 'high',
      summary: 'High impact change set may affect shared behavior.',
      affectedFiles: options.files,
      mitigation: 'Run package tests plus runtime parity checks before completion.',
      evidence: [options.impact.summary],
    })
  }
  if (promptRuntimeImpacts.length > 0) {
    findings.push({
      id: 'runtime-prompt-impact',
      severity: 'medium',
      summary: 'Runtime prompt or adapter files changed.',
      affectedFiles: options.files.filter((file) => isRuntimePromptFile(file) || isRuntimeAdapterFile(file)),
      mitigation: 'Run Kimi/OpenCode/Codex Quest smoke checks and inspect write-back artifacts.',
      evidence: promptRuntimeImpacts,
    })
  }
  if (options.productArchitect.strategicRefactorRadar.length > 0) {
    findings.push({
      id: 'strategic-refactor-radar',
      severity: 'medium',
      summary: 'Product architect radar already sees refactor pressure on nearby surfaces.',
      affectedFiles: options.files.slice(0, 12),
      mitigation: 'Keep the implementation path narrow unless the user approves the strategic refactor.',
      evidence: options.productArchitect.strategicRefactorRadar.map((signal) => `${signal.area}: ${signal.proposedRefactor}`).slice(0, 5),
    })
  }

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    touchedFiles: options.files,
    predictedSurfaces,
    blastRadius: options.impact.riskLevel === 'high' || options.impact.transitivelyAffected.length > 8
      ? 'wide'
      : options.impact.directlyAffected.length > 4 || options.files.length > 6
        ? 'moderate'
        : 'narrow',
    dependencyImpacts,
    promptRuntimeImpacts,
    migrationNeeded: options.files.some((file) => file.includes('migration') || file.includes('schema') || file.endsWith('.sql')),
    findings,
  }
}

function buildRiskForecastScore(
  options: BuildQuestPredictiveEngineeringOptions,
  events: EventSummary,
  simulation: QuestChangeSimulationEngine,
): QuestRiskForecastScore {
  const hallucinationScore = options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked'
    ? 90
    : options.verifiedKnowledgebase.hallucinationGate.verdict === 'review'
      ? 55
      : 18
  const regressionScore = options.impact.riskLevel === 'high'
    ? 72
    : options.reviewSignals.length > 0 || simulation.blastRadius === 'moderate'
      ? 45
      : 20
  const timeoutScore = events.timeouts > 0 || options.runtimeReliability.commandFailureIndex.fingerprints.some((fingerprint) => fingerprint.kind === 'timeout')
    ? 78
    : options.testRecommendations.some((test) => isLongCommand(test.command))
      ? 48
      : 18
  const missingKnowledgeScore = options.semanticRepoBrain.completionGate.verdict === 'blocked'
    ? 82
    : options.verifiedKnowledgebase.staleKnowledgeReport.staleItems > 0
      ? 52
      : 18
  const architectureDriftScore = options.verifiedDelivery.releaseReadinessDashboard.verdict === 'blocked' || simulation.migrationNeeded
    ? 72
    : options.productArchitect.architectureDecisionSuggestions.length > 0
      ? 46
      : 16
  const riskScore = clampScore(Math.round((
    hallucinationScore * 0.22 +
    regressionScore * 0.25 +
    timeoutScore * 0.18 +
    missingKnowledgeScore * 0.18 +
    architectureDriftScore * 0.17
  )))

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    overallRisk: priorityFromScore(riskScore),
    riskScore,
    hallucinationRisk: {
      score: hallucinationScore,
      status: statusFromScore(hallucinationScore),
      evidence: [`Hallucination gate: ${options.verifiedKnowledgebase.hallucinationGate.verdict}`],
      mitigation: 'Refresh local evidence and stop on blocked hallucination checks.',
    },
    regressionRisk: {
      score: regressionScore,
      status: statusFromScore(regressionScore),
      evidence: [options.impact.summary, `Review signals: ${options.reviewSignals.length}`],
      mitigation: 'Use change simulation findings and run the selected focused tests.',
    },
    timeoutRisk: {
      score: timeoutScore,
      status: statusFromScore(timeoutScore),
      evidence: [`Timeout events: ${events.timeouts}`, `Failure fingerprints: ${options.runtimeReliability.commandFailureIndex.fingerprints.length}`],
      mitigation: 'Apply predictive timeout policy before long Kimi/shell-backed commands.',
    },
    missingKnowledgeRisk: {
      score: missingKnowledgeScore,
      status: statusFromScore(missingKnowledgeScore),
      evidence: [
        `Semantic gate: ${options.semanticRepoBrain.completionGate.verdict}`,
        `Stale items: ${options.verifiedKnowledgebase.staleKnowledgeReport.staleItems}`,
      ],
      mitigation: 'Refresh repo wiki, semantic brain, or dependency research before editing unknown surfaces.',
    },
    architectureDriftRisk: {
      score: architectureDriftScore,
      status: statusFromScore(architectureDriftScore),
      evidence: [
        `Release readiness: ${options.verifiedDelivery.releaseReadinessDashboard.verdict}`,
        `ADR candidates: ${options.productArchitect.architectureDecisionSuggestions.length}`,
      ],
      mitigation: 'Check protected contracts and add an ADR/user choice when architecture changes are intentional.',
    },
    evidence: [
      `Impact: ${options.impact.riskLevel}`,
      `Runtime reliability: ${options.runtimeReliability.verdict}`,
      `Self-improvement score: ${options.selfImprovingCodingTeam.improvementScore}`,
    ],
  }
}

function buildImplementationPathRanking(
  options: BuildQuestPredictiveEngineeringOptions,
  risk: QuestRiskForecastScore,
  simulation: QuestChangeSimulationEngine,
): QuestImplementationPathRanking {
  const paths: QuestImplementationPath[] = [
    {
      id: 'path-narrow-evidence-first',
      title: 'Narrow evidence-first implementation',
      rank: 1,
      score: clampScore(92 - risk.riskScore + (simulation.blastRadius === 'narrow' ? 12 : 0)),
      strategy: 'Edit only the files proven necessary by local evidence, then run focused validation.',
      tradeoffs: ['Fastest safe path', 'May defer broader refactors'],
      risks: ['Can miss systemic cleanup if the request is actually architectural'],
      whenToUse: 'Default for most coding requests and prompt/runtime changes.',
      requiredEvidence: ['Required files inspected', 'Patch capsule created', 'Focused tests selected'],
    },
    {
      id: 'path-runtime-parity-first',
      title: 'Runtime parity first',
      rank: 2,
      score: clampScore(75 + runtimeCount(options.runtimeParity) * 6 - risk.timeoutRisk.score / 4),
      strategy: 'Prove Kimi/OpenCode/Codex prompt parity before widening implementation.',
      tradeoffs: ['Best for adapter changes', 'Costs more validation time'],
      risks: ['Can hit provider step or timeout limits without scoped commands'],
      whenToUse: 'Use when prompt, plugin, installer, update, or smoke harness files change.',
      requiredEvidence: ['Runtime sidecars read', 'Timeout guard applied', 'Runtime smoke selected'],
    },
    {
      id: 'path-architectural-slice',
      title: 'Architectural slice with user-choice checkpoint',
      rank: 3,
      score: clampScore(68 - (risk.architectureDriftRisk.score / 5) + options.productArchitect.architectureNextSteps.length),
      strategy: 'Turn the change into a small architecture slice and ask for user approval before broadening scope.',
      tradeoffs: ['Better for product direction', 'Slower than a narrow patch'],
      risks: ['Can over-scope if user intent was only a bug fix'],
      whenToUse: 'Use when capability gaps, ADR suggestions, migrations, or strategic refactor signals are active.',
      requiredEvidence: ['Architecture next steps reviewed', 'Protected contracts identified', 'Proof blockers reported'],
    },
  ].sort((a, b) => b.score - a.score).map((path, index) => ({ ...path, rank: index + 1 }))

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    selectedPath: paths[0]?.id ?? 'path-narrow-evidence-first',
    rationale: paths[0]?.strategy ?? 'Use the narrow evidence-first implementation path.',
    paths,
  }
}

function buildTestIntelligencePlanner(options: BuildQuestPredictiveEngineeringOptions): QuestTestIntelligencePlanner {
  const requiredTests = options.testRecommendations.slice(0, 10).map((test) => ({
    command: test.command,
    reason: test.reason,
    scope: test.scope,
    confidence: test.confidence,
  }))
  const optionalTests = options.verifiedDelivery.autoEvalGenerator.candidates.slice(0, 5).map((candidate) => ({
    command: `Add or run eval candidate at ${candidate.suggestedPath}`,
    reason: candidate.reason,
  }))
  const runtimeParityChecks = ([
    ['opencode', options.runtimeParity.opencode],
    ['kimi', options.runtimeParity.kimi],
    ['codex', options.runtimeParity.codex],
    ['claude', options.runtimeParity.claude],
  ] as const).map(([runtime, required]) => ({
    runtime,
    required,
    reason: required ? `Runtime-facing files changed for ${runtime}.` : `${runtime} parity is not required by current file impact.`,
  }))
  const missingTests = options.verifiedDelivery.autoEvalGenerator.candidates
    .filter((candidate) => candidate.status === 'candidate' || candidate.status === 'blocked')
    .slice(0, 6)
    .map((candidate) => ({
      title: candidate.title,
      suggestedPath: candidate.suggestedPath,
      reason: candidate.reason,
    }))

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    requiredTests,
    optionalTests,
    runtimeParityChecks,
    missingTests,
    confidence: average([
      ...requiredTests.map((test) => test.confidence),
      options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 0.9 : 0.58,
    ]),
  }
}

function buildProofContract(
  options: BuildQuestPredictiveEngineeringOptions,
  risk: QuestRiskForecastScore,
  tests: QuestTestIntelligencePlanner,
): QuestProofContract {
  const doneClaims = [
    {
      id: 'claim-request-implemented',
      claim: `The requested objective is implemented or explicitly blocked: ${options.objective}`,
      evidenceRequired: ['Changed files or no-op explanation', 'Patch capsule', 'Acceptance report'],
      status: options.files.length > 0 ? 'inferred' as const : 'missing' as const,
    },
    {
      id: 'claim-tests-run',
      claim: 'Required validation was run or the blocker is reported.',
      evidenceRequired: tests.requiredTests.map((test) => test.command).slice(0, 8),
      status: options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 'verified' as const : 'missing' as const,
    },
    {
      id: 'claim-runtime-safe',
      claim: 'Kimi/runtime timeout and step-limit risks are handled before live validation.',
      evidenceRequired: ['predictive-timeout-guard.json', 'runtime-reliability-os.json'],
      status: risk.timeoutRisk.status,
    },
  ]
  const blockers = [
    ...(risk.overallRisk === 'high' ? ['High predictive risk: close risk-forecast-score.json mitigations before claiming done.'] : []),
    ...(options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked' ? ['Hallucination gate is blocked.'] : []),
    ...(options.verifiedDelivery.releaseReadinessDashboard.blockers.slice(0, 4)),
    ...(tests.requiredTests.length === 0 ? ['No required validation commands were selected.'] : []),
  ]

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    doneClaims,
    requiredEvidence: unique([
      'coding-review.md',
      'predictive-engineering-os.json',
      'risk-forecast-score.json',
      'test-intelligence-planner.json',
      ...tests.requiredTests.map((test) => test.command),
    ]),
    blockers,
    completionPolicy: [
      'Do not claim done until every done claim is verified, inferred with evidence, or explicitly blocked.',
      'Report blockers plainly instead of using repeated retries.',
      'Use proof-contract.json as the final-answer checklist for implementation, tests, and runtime safety.',
    ],
  }
}

function buildArchitectureDriftDetector(
  options: BuildQuestPredictiveEngineeringOptions,
  simulation: QuestChangeSimulationEngine,
): QuestArchitectureDriftDetector {
  const driftSignals: QuestChangeSimulationFinding[] = []
  for (const finding of simulation.findings) {
    if (finding.id === 'high-impact-surface' || finding.id === 'strategic-refactor-radar') {
      driftSignals.push(finding)
    }
  }
  for (const suggestion of options.productArchitect.architectureDecisionSuggestions.slice(0, 4)) {
    driftSignals.push({
      id: `adr-${stableId(suggestion.title)}`,
      severity: suggestion.status === 'needs-user-approval' ? 'medium' : 'low',
      summary: suggestion.title,
      affectedFiles: options.files.slice(0, 12),
      mitigation: `Review ADR candidate: ${suggestion.suggestedAdrPath}`,
      evidence: suggestion.evidence,
    })
  }

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    verdict: driftSignals.some((signal) => signal.severity === 'high') ? 'review' : 'ready',
    driftSignals,
    protectedContracts: options.verifiedKnowledgebase.contractFacts.facts.slice(0, 8).map((fact) => ({
      name: fact.claim,
      source: fact.path ?? fact.kind,
      evidence: fact.evidence.map((entry) => `${entry.source}: ${entry.detail}`).slice(0, 4),
    })),
    policy: [
      'Treat protected contracts as stable unless the user explicitly approves an architecture change.',
      'Record an ADR suggestion when the implementation path changes public behavior, runtime contracts, schemas, or installation defaults.',
      'Keep tactical coding changes separate from strategic refactors unless the user chooses the broader path.',
    ],
  }
}

function buildContextFreshnessGate(
  options: BuildQuestPredictiveEngineeringOptions,
  events: EventSummary,
): QuestContextFreshnessGate {
  const repoWikiFreshness = options.repoWiki
    ? options.gitStatus.length > 0 ? 'stale' : 'verified'
    : 'missing'
  const semanticBrainFreshness = options.semanticRepoBrain.completionGate.verdict === 'pass'
    ? 'verified'
    : options.semanticRepoBrain.completionGate.verdict === 'review'
      ? 'inferred'
      : 'missing'
  const docsResearchNeeded = options.verifiedKnowledgebase.dependencyResearchCache.needed
  const webResearchNeeded = docsResearchNeeded || options.deepCodingCollaboration.deepThinkingReview.hardQuestions
    .some((question) => question.status === 'needs-research')
  const reasons = [
    `Repo wiki freshness: ${repoWikiFreshness}`,
    `Semantic brain gate: ${options.semanticRepoBrain.completionGate.verdict}`,
    `Research events performed: ${events.researchPerformed}`,
    `Dependency research needed: ${docsResearchNeeded}`,
  ]

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    verdict: repoWikiFreshness === 'missing' || semanticBrainFreshness === 'missing'
      ? 'blocked'
      : repoWikiFreshness === 'stale' || webResearchNeeded
        ? 'review'
        : 'ready',
    repoWikiFreshness,
    semanticBrainFreshness,
    docsResearchNeeded,
    webResearchNeeded,
    reasons,
    recommendedRefreshCommands: [
      'oac repo-wiki',
      'oac quest-v9',
      ...(webResearchNeeded ? ['Perform current-docs research before editing external/provider-dependent behavior.'] : []),
    ],
  }
}

function buildPredictiveTimeoutGuard(
  options: BuildQuestPredictiveEngineeringOptions,
  events: EventSummary,
): QuestPredictiveTimeoutGuard {
  const riskyCommands = options.testRecommendations
    .filter((test) => isLongCommand(test.command) || test.scope === 'runtime' || test.scope === 'full')
    .slice(0, 8)
    .map((test) => ({
      command: test.command,
      timeoutSeconds: test.scope === 'runtime' || test.scope === 'full' ? 900 : 300,
      reason: test.reason,
    }))
  for (const fingerprint of options.runtimeReliability.commandFailureIndex.fingerprints.slice(0, 5)) {
    if (fingerprint.kind === 'timeout' || fingerprint.kind === 'step-limit') {
      riskyCommands.push({
        command: fingerprint.command,
        timeoutSeconds: fingerprint.kind === 'timeout' ? 900 : 300,
        reason: fingerprint.recommendedFix,
      })
    }
  }

  return {
    version: QUEST_PREDICTIVE_ENGINEERING_VERSION,
    verdict: events.stepLimits > 0 || events.timeouts > 1
      ? 'review'
      : riskyCommands.length > 0
        ? 'review'
        : 'ready',
    riskyCommands: uniqueCommands(riskyCommands),
    timeoutPolicy: [
      'Never retry a command that was killed by a 30s timeout with the same timeout.',
      'Use 300 seconds for normal validation and 900 seconds for live/runtime/deep validation.',
      'Prefer narrower focused commands before full suites when Kimi is near step or wall-clock limits.',
    ],
    stepLimitPolicy: [
      'Run one bounded Quest execution cycle per runtime handoff.',
      'If max steps are reached, append BLOCKED/WAITING with next_steps.suggested instead of continuing a tool loop.',
      'Split large work into implementation, validation, and evidence-replay cycles.',
    ],
    splitRecommendations: buildSplitRecommendations(options, riskyCommands),
  }
}

function predictiveVerdict(
  risk: QuestRiskForecastScore,
  proof: QuestProofContract,
  drift: QuestArchitectureDriftDetector,
  freshness: QuestContextFreshnessGate,
  timeout: QuestPredictiveTimeoutGuard,
): QuestPredictiveVerdict {
  if (freshness.verdict === 'blocked' || proof.blockers.some((blocker) => blocker.includes('Hallucination gate'))) return 'blocked'
  if (risk.overallRisk === 'high' || proof.blockers.length > 0 || drift.verdict === 'review' || timeout.verdict === 'review') return 'review'
  return 'ready'
}

function summarizeEvents(events: BuildQuestPredictiveEngineeringOptions['events']): EventSummary {
  const summary: EventSummary = {
    validationsPassed: 0,
    validationsFailed: 0,
    contextLoads: 0,
    researchPerformed: 0,
    timeouts: 0,
    stepLimits: 0,
    errors: 0,
  }
  for (const event of events) {
    if (event.type === 'validation') {
      if (validationPassed(event.data)) summary.validationsPassed += 1
      else summary.validationsFailed += 1
    }
    if (event.type === 'context.loaded') summary.contextLoads += 1
    if (event.type === 'research.performed') summary.researchPerformed += 1
    if (event.type === 'error') {
      summary.errors += 1
      const reason = asString(event.data?.reason ?? event.data?.message) ?? ''
      if (reason.toLowerCase().includes('timeout')) summary.timeouts += 1
      if (reason.toLowerCase().includes('step') || reason.toLowerCase().includes('max')) summary.stepLimits += 1
    }
  }
  return summary
}

function groupSurfaces(files: string[]): Array<{ surface: string; files: string[] }> {
  const groups = new Map<string, string[]>()
  for (const file of files.length > 0 ? files : ['working-tree']) {
    const surface = file.startsWith('packages/cli/')
      ? 'cli'
      : file.startsWith('plugins/kimi-code/')
        ? 'kimi-runtime'
        : file.startsWith('plugins/codex-cli/')
          ? 'codex-runtime'
          : file.startsWith('.opencode/')
            ? 'opencode-context'
            : file.startsWith('scripts/')
              ? 'test-harness'
              : file.startsWith('docs/')
                ? 'docs'
                : file.includes('install.sh') || file.includes('update.sh')
                  ? 'installer'
                  : file.split('/')[0] ?? 'repo'
    groups.set(surface, [...(groups.get(surface) ?? []), file])
  }
  return [...groups.entries()].map(([surface, surfaceFiles]) => ({ surface, files: surfaceFiles }))
}

function surfaceRisk(files: string[], options: BuildQuestPredictiveEngineeringOptions): QuestPredictivePriority {
  if (options.impact.riskLevel === 'high') return 'high'
  if (files.some((file) => isRuntimeAdapterFile(file) || file.includes('install.sh') || file.includes('update.sh'))) return 'medium'
  return options.impact.riskLevel
}

function surfaceReason(surface: string): string {
  const reasons: Record<string, string> = {
    cli: 'CLI command and sidecar behavior can affect all Quest runtimes.',
    'kimi-runtime': 'Kimi OpenAgent adapter behavior must preserve Quest default loading.',
    'codex-runtime': 'Codex adapter prompts must stay aligned with OpenAgent Quest defaults.',
    'opencode-context': 'OpenCode context changes alter default agent behavior.',
    'test-harness': 'Harness changes affect release evidence.',
    docs: 'Documentation changes must match generated behavior.',
    installer: 'Installer/updater changes affect user onboarding and runtime defaults.',
  }
  return reasons[surface] ?? 'Changed files share a project surface.'
}

function isRuntimePromptFile(file: string): boolean {
  return file.endsWith('openagent-system.md') || file.endsWith('openagent.yaml') || file.includes('.opencode/agent/')
}

function isRuntimeAdapterFile(file: string): boolean {
  return file.includes('plugins/kimi-code') ||
    file.includes('plugins/codex-cli') ||
    file.includes('test-kimi-quest') ||
    file.includes('test-codex-quest') ||
    file.includes('test-opencode-quest')
}

function runtimeCount(runtimeParity: QuestRuntimeParity): number {
  return [runtimeParity.opencode, runtimeParity.kimi, runtimeParity.codex, runtimeParity.claude].filter(Boolean).length
}

function isLongCommand(command: string): boolean {
  const lower = command.toLowerCase()
  return lower.includes('install') ||
    lower.includes('test:quest') ||
    lower.includes('bun test') ||
    lower.includes('npm test') ||
    lower.includes('test:all') ||
    lower.includes('docker') ||
    lower.includes('live')
}

function buildSplitRecommendations(
  options: BuildQuestPredictiveEngineeringOptions,
  riskyCommands: Array<{ command: string; timeoutSeconds: number; reason: string }>,
): string[] {
  const recommendations = [
    'Inspect required files and refresh v21 sidecars before editing.',
    'Apply one implementation slice, then run focused tests before full runtime validation.',
  ]
  if (riskyCommands.length > 0) {
    recommendations.push('Run risky validation commands with explicit timeout and preserve output as evidence.')
  }
  if (runtimeCount(options.runtimeParity) > 0) {
    recommendations.push('Run runtime parity checks after local typecheck/focused tests pass.')
  }
  return recommendations
}

function validationPassed(data: Record<string, unknown> | undefined): boolean {
  const result = data?.result
  if (typeof data?.overallPassed === 'boolean') return data.overallPassed
  if (typeof result === 'object' && result !== null && 'overallPassed' in result) {
    return Boolean((result as { overallPassed?: unknown }).overallPassed)
  }
  if (typeof data?.passed === 'boolean') return data.passed
  return false
}

function priorityFromScore(score: number): QuestPredictivePriority {
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function statusFromScore(score: number): QuestForecastStatus {
  if (score >= 75) return 'missing'
  if (score >= 55) return 'needs-research'
  if (score >= 35) return 'inferred'
  return 'verified'
}

function average(values: number[]): number {
  const usable = values.filter((value) => Number.isFinite(value))
  if (usable.length === 0) return 0.5
  return Math.round((usable.reduce((total, value) => total + value, 0) / usable.length) * 100) / 100
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function uniqueCommands(
  values: Array<{ command: string; timeoutSeconds: number; reason: string }>,
): Array<{ command: string; timeoutSeconds: number; reason: string }> {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value.command)) return false
    seen.add(value.command)
    return true
  })
}

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'unknown'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function formatPredictiveEngineeringRoadmap(os: QuestPredictiveEngineeringOS): string {
  const lines = [
    '# Quest v21 Predictive Engineering Roadmap',
    '',
    `- Version: ${os.version}`,
    `- Objective: ${os.objective}`,
    `- Verdict: ${os.verdict}`,
    `- Predictive score: ${os.predictiveScore}`,
    `- Overall risk: ${os.riskForecastScore.overallRisk} (${os.riskForecastScore.riskScore})`,
    '',
    '## Selected Implementation Path',
    '',
    `- ${os.implementationPathRanking.selectedPath}: ${os.implementationPathRanking.rationale}`,
    '',
    '## Risk Forecast',
    '',
    `- Hallucination risk: ${os.riskForecastScore.hallucinationRisk.status} (${os.riskForecastScore.hallucinationRisk.score})`,
    `- Regression risk: ${os.riskForecastScore.regressionRisk.status} (${os.riskForecastScore.regressionRisk.score})`,
    `- Timeout risk: ${os.riskForecastScore.timeoutRisk.status} (${os.riskForecastScore.timeoutRisk.score})`,
    `- Missing knowledge risk: ${os.riskForecastScore.missingKnowledgeRisk.status} (${os.riskForecastScore.missingKnowledgeRisk.score})`,
    `- Architecture drift risk: ${os.riskForecastScore.architectureDriftRisk.status} (${os.riskForecastScore.architectureDriftRisk.score})`,
    '',
    '## Proof Contract',
    '',
  ]

  for (const claim of os.proofContract.doneClaims) {
    lines.push(`- **${claim.status}:** ${claim.claim}`)
  }
  if (os.proofContract.blockers.length > 0) {
    lines.push('', '## Blockers', '')
    for (const blocker of os.proofContract.blockers) lines.push(`- ${blocker}`)
  }

  lines.push('', '## Required Validation', '')
  for (const test of os.testIntelligencePlanner.requiredTests) {
    lines.push(`- \`${test.command}\` - ${test.reason}`)
  }
  if (os.testIntelligencePlanner.requiredTests.length === 0) {
    lines.push('_No required tests selected._')
  }

  lines.push('', '## Timeout Guard', '')
  for (const command of os.predictiveTimeoutGuard.riskyCommands) {
    lines.push(`- \`${command.command}\` with ${command.timeoutSeconds}s timeout - ${command.reason}`)
  }
  if (os.predictiveTimeoutGuard.riskyCommands.length === 0) {
    lines.push('- No risky commands forecast.')
  }

  return `${lines.join('\n')}\n`
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

/**
 * Quest v17 Product Architect Intelligence Layer.
 *
 * Deterministic product/architecture layer that turns delivery evidence into
 * strategic next actions after a user request completes.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CodebaseIndex, ImpactAnalysis } from './codebase-indexer.js'
import type { QuestCodingAutopilot } from './quest-coding-autopilot.js'
import type { QuestCodingExecution } from './quest-coding-execution.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'
import type { QuestIntelligentCodingTeam } from './quest-intelligent-coding-team.js'
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedDeliveryOS } from './quest-verified-delivery.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_PRODUCT_ARCHITECT_VERSION = '17' as const

export type QuestProductArchitectPriority = 'low' | 'medium' | 'high'
export type QuestProductArchitectVerdict = 'ready' | 'review' | 'blocked'
export type QuestProductHorizon = 'now' | 'next' | 'later'
export type QuestProductTheme =
  | 'developer-velocity'
  | 'coding-accuracy'
  | 'runtime-reliability'
  | 'knowledgebase'
  | 'product-architecture'
  | 'release-quality'
  | 'user-experience'
  | 'governance'

export interface QuestArchitectureNextStep {
  id: string
  title: string
  horizon: QuestProductHorizon
  priority: QuestProductArchitectPriority
  rationale: string
  suggestedCommand?: string
  evidence: string[]
}

export interface QuestRoadmapSignal {
  id: string
  theme: QuestProductTheme
  signal: string
  confidence: number
  recurrence: number
  source: 'user-request' | 'changed-files' | 'runtime-parity' | 'delivery-gate' | 'memory' | 'inferred'
  recommendedRoadmapItem: string
  approvalRequired: boolean
  evidence: string[]
}

export interface QuestCapabilityGap {
  id: string
  capability: string
  currentState: string
  desiredState: string
  priority: QuestProductArchitectPriority
  owner: 'product-architect' | 'tech-lead' | 'runtime-owner' | 'qa-owner' | 'docs-owner'
  nextAction: string
  evidence: string[]
}

export interface QuestProductRisk {
  id: string
  title: string
  severity: QuestProductArchitectPriority
  likelihood: QuestProductArchitectPriority
  mitigation: string
  evidence: string[]
}

export interface QuestUserValueItem {
  id: string
  persona: 'developer' | 'maintainer' | 'product-owner' | 'runtime-user'
  value: string
  impact: QuestProductArchitectPriority
  proof: string[]
  nextAction: string
}

export interface QuestStrategicRefactorSignal {
  id: string
  area: string
  reason: string
  triggerCount: number
  priority: QuestProductArchitectPriority
  proposedRefactor: string
  evidence: string[]
}

export interface QuestArchitectureDecisionSuggestion {
  id: string
  title: string
  decision: string
  tradeoffs: string[]
  suggestedAdrPath: string
  status: 'candidate' | 'needs-user-approval' | 'already-covered'
  evidence: string[]
}

export interface QuestProductArchitectRecommendation {
  id: string
  title: string
  category: 'architecture' | 'product' | 'validation' | 'roadmap' | 'refactor' | 'governance'
  priority: QuestProductArchitectPriority
  reason: string
  nextAction: string
  evidence: string[]
}

export interface QuestProductArchitectReview {
  version: typeof QUEST_PRODUCT_ARCHITECT_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  verdict: QuestProductArchitectVerdict
  completionGate: {
    status: QuestProductArchitectVerdict
    reason: string
    requiredBeforeClaimingDone: string[]
  }
  recommendations: QuestProductArchitectRecommendation[]
  architectureNextSteps: QuestArchitectureNextStep[]
  roadmapSignals: QuestRoadmapSignal[]
  capabilityGaps: QuestCapabilityGap[]
  productRisks: QuestProductRisk[]
  userValueMatrix: QuestUserValueItem[]
  strategicRefactorRadar: QuestStrategicRefactorSignal[]
  architectureDecisionSuggestions: QuestArchitectureDecisionSuggestion[]
}

export interface QuestProductArchitectIntelligence {
  version: typeof QUEST_PRODUCT_ARCHITECT_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  productArchitectReview: QuestProductArchitectReview
  architectureNextSteps: QuestArchitectureNextStep[]
  roadmapSignals: QuestRoadmapSignal[]
  capabilityGapMap: QuestCapabilityGap[]
  productRiskRegister: QuestProductRisk[]
  userValueMatrix: QuestUserValueItem[]
  strategicRefactorRadar: QuestStrategicRefactorSignal[]
  architectureDecisionSuggestions: QuestArchitectureDecisionSuggestion[]
}

export interface BuildQuestProductArchitectOptions {
  projectRoot: string
  objective: string
  files: string[]
  index: CodebaseIndex
  impact: ImpactAnalysis
  patchCapsules: QuestPatchCapsule[]
  testRecommendations: QuestTestRecommendation[]
  reviewSignals: QuestReviewSignal[]
  runtimeParity: QuestRuntimeParity
  codingAutopilot: QuestCodingAutopilot
  codingExecution: QuestCodingExecution
  verifiedKnowledgebase: QuestVerifiedKnowledgebase
  semanticRepoBrain: QuestSemanticRepoBrain
  temporalMemory: QuestTemporalMemory
  intelligentCodingTeam: QuestIntelligentCodingTeam
  verifiedDelivery: QuestVerifiedDeliveryOS
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

export function buildQuestProductArchitectIntelligence(
  options: BuildQuestProductArchitectOptions,
): QuestProductArchitectIntelligence {
  const architectureNextSteps = buildArchitectureNextSteps(options)
  const roadmapSignals = buildRoadmapSignals(options)
  const capabilityGapMap = buildCapabilityGapMap(options)
  const productRiskRegister = buildProductRiskRegister(options)
  const userValueMatrix = buildUserValueMatrix(options)
  const strategicRefactorRadar = buildStrategicRefactorRadar(options)
  const architectureDecisionSuggestions = buildArchitectureDecisionSuggestions(options)
  const recommendations = buildRecommendations({
    architectureNextSteps,
    roadmapSignals,
    capabilityGapMap,
    productRiskRegister,
    userValueMatrix,
    strategicRefactorRadar,
    architectureDecisionSuggestions,
  })
  const verdict = productVerdict(options, productRiskRegister)
  const generatedAt = new Date().toISOString()
  const productArchitectReview: QuestProductArchitectReview = {
    version: QUEST_PRODUCT_ARCHITECT_VERSION,
    generatedAt,
    projectRoot: options.projectRoot,
    objective: options.objective,
    verdict,
    completionGate: {
      status: verdict,
      reason: completionGateReason(options, productRiskRegister),
      requiredBeforeClaimingDone: buildCompletionRequirements(options, productRiskRegister),
    },
    recommendations,
    architectureNextSteps,
    roadmapSignals,
    capabilityGaps: capabilityGapMap,
    productRisks: productRiskRegister,
    userValueMatrix,
    strategicRefactorRadar,
    architectureDecisionSuggestions,
  }

  return {
    version: QUEST_PRODUCT_ARCHITECT_VERSION,
    generatedAt,
    projectRoot: options.projectRoot,
    objective: options.objective,
    productArchitectReview,
    architectureNextSteps,
    roadmapSignals,
    capabilityGapMap,
    productRiskRegister,
    userValueMatrix,
    strategicRefactorRadar,
    architectureDecisionSuggestions,
  }
}

export async function writeQuestProductArchitectArtifacts(
  dir: string,
  architect: QuestProductArchitectIntelligence,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'product-architect-review.json'), architect.productArchitectReview),
    writeJson(join(dir, 'architecture-next-steps.json'), architect.architectureNextSteps),
    writeJson(join(dir, 'roadmap-signals.json'), architect.roadmapSignals),
    writeJson(join(dir, 'capability-gap-map.json'), architect.capabilityGapMap),
    writeJson(join(dir, 'product-risk-register.json'), architect.productRiskRegister),
    writeJson(join(dir, 'user-value-matrix.json'), architect.userValueMatrix),
    writeJson(join(dir, 'strategic-refactor-radar.json'), architect.strategicRefactorRadar),
    writeJson(join(dir, 'architecture-decision-suggestions.json'), architect.architectureDecisionSuggestions),
    writeFile(join(dir, 'strategic-next-actions.md'), formatStrategicNextActions(architect)),
  ])
}

export function formatProductArchitectSummary(architect: QuestProductArchitectIntelligence): string {
  return [
    '## Product Architect Intelligence',
    '',
    `- Product architect verdict: ${architect.productArchitectReview.verdict}`,
    `- Architecture next steps: ${architect.architectureNextSteps.length}`,
    `- Roadmap signals: ${architect.roadmapSignals.length}`,
    `- Capability gaps: ${architect.capabilityGapMap.length}`,
    `- Product risks: ${architect.productRiskRegister.length}`,
    `- User value items: ${architect.userValueMatrix.length}`,
    `- Strategic refactor signals: ${architect.strategicRefactorRadar.length}`,
    `- ADR suggestions: ${architect.architectureDecisionSuggestions.length}`,
  ].join('\n')
}

function buildArchitectureNextSteps(options: BuildQuestProductArchitectOptions): QuestArchitectureNextStep[] {
  const steps: QuestArchitectureNextStep[] = []
  addStep(steps, {
    id: 'architect-completion-review',
    title: 'Review product-architect recommendations after completion',
    horizon: 'now',
    priority: 'high',
    rationale: 'Every completed Quest should convert delivery evidence into product and architecture next steps.',
    evidence: ['quest-v17:default-completion-policy'],
  })

  if (hasRuntimeSurface(options.files)) {
    addStep(steps, {
      id: 'runtime-resilience-program',
      title: 'Strengthen runtime resilience across Kimi, OpenCode, Codex, and Claude',
      horizon: 'now',
      priority: 'high',
      rationale: 'Runtime adapter or harness files changed, so reliability should be treated as a product capability.',
      suggestedCommand: runtimeValidationCommand(options),
      evidence: runtimeEvidence(options),
    })
  }

  if (hasQuestCoreSurface(options.files)) {
    addStep(steps, {
      id: 'quest-sidecar-versioning',
      title: 'Document the Quest sidecar versioning contract',
      horizon: 'next',
      priority: 'medium',
      rationale: 'Core Quest sidecars changed; product architecture needs an explicit compatibility contract.',
      suggestedCommand: 'oac quest-v9',
      evidence: options.files.filter((file) => file.includes('quest-')).slice(0, 8),
    })
  }

  if (options.verifiedDelivery.releaseReadinessDashboard.verdict !== 'pass') {
    addStep(steps, {
      id: 'release-readiness-closure',
      title: 'Close release-readiness gaps before promoting the feature',
      horizon: 'now',
      priority: 'high',
      rationale: 'The v16 release dashboard is not fully passing.',
      evidence: options.verifiedDelivery.releaseReadinessDashboard.blockers,
    })
  }

  if (options.verifiedDelivery.autoEvalGenerator.candidates.length > 0) {
    addStep(steps, {
      id: 'eval-candidate-triage',
      title: 'Triage generated eval candidates into the regression suite',
      horizon: 'next',
      priority: 'medium',
      rationale: 'Delivery evidence produced eval candidates that can make future coding more accurate.',
      evidence: options.verifiedDelivery.autoEvalGenerator.candidates.map((candidate) => candidate.id).slice(0, 8),
    })
  }

  return steps
}

function buildRoadmapSignals(options: BuildQuestProductArchitectOptions): QuestRoadmapSignal[] {
  const requestTexts = options.events
    .filter((event) => event.type === 'request.received')
    .map((event) => asString(event.data?.text))
    .filter((text): text is string => Boolean(text))
  const objectiveText = [options.objective, ...requestTexts].join(' ').toLowerCase()
  const signals: QuestRoadmapSignal[] = []

  if (objectiveText.includes('kimi') || options.runtimeParity.kimi) {
    signals.push({
      id: 'roadmap-kimi-reliability',
      theme: 'runtime-reliability',
      signal: 'Kimi reliability and QuestMode behavior are recurring product concerns.',
      confidence: scoreSignal(0.7, requestTexts.length, options.runtimeParity.kimi),
      recurrence: countMatches([objectiveText, ...requestTexts], /kimi|step|runtime/i),
      source: options.runtimeParity.kimi ? 'runtime-parity' : 'user-request',
      recommendedRoadmapItem: 'Runtime Resilience Track for Kimi/OpenAgent QuestMode',
      approvalRequired: true,
      evidence: unique(['objective:kimi', ...options.files.filter((file) => file.includes('kimi')).slice(0, 8)]),
    })
  }

  if (objectiveText.includes('memory') || options.files.some((file) => file.includes('memory'))) {
    signals.push({
      id: 'roadmap-durable-memory',
      theme: 'knowledgebase',
      signal: 'Durable memory and knowledge reuse should be treated as a first-class product capability.',
      confidence: scoreSignal(0.65, requestTexts.length, true),
      recurrence: countMatches([objectiveText, ...requestTexts], /memory|knowledge|context/i),
      source: 'user-request',
      recommendedRoadmapItem: 'Verified Memory and Repo Knowledge Product Area',
      approvalRequired: true,
      evidence: options.files.filter((file) => file.includes('memory') || file.includes('knowledge')).slice(0, 8),
    })
  }

  if (hasQuestCoreSurface(options.files)) {
    signals.push({
      id: 'roadmap-coding-team-os',
      theme: 'coding-accuracy',
      signal: 'QuestMode is evolving from task execution into an intelligent coding team OS.',
      confidence: 0.86,
      recurrence: options.files.filter((file) => file.includes('quest-')).length,
      source: 'changed-files',
      recommendedRoadmapItem: 'OpenAgent Coding Team OS Roadmap',
      approvalRequired: true,
      evidence: options.files.filter((file) => file.includes('quest-')).slice(0, 10),
    })
  }

  if (options.verifiedDelivery.releaseReadinessDashboard.installUpdateGate.required) {
    signals.push({
      id: 'roadmap-installer-confidence',
      theme: 'release-quality',
      signal: 'Installer/update reliability is part of product trust, not just DevOps hygiene.',
      confidence: 0.78,
      recurrence: options.files.filter((file) => file === 'install.sh' || file === 'update.sh' || file.startsWith('plugins/')).length,
      source: 'delivery-gate',
      recommendedRoadmapItem: 'Install/Update Confidence Program',
      approvalRequired: true,
      evidence: options.verifiedDelivery.releaseReadinessDashboard.installUpdateGate.commands,
    })
  }

  return signals
}

function buildCapabilityGapMap(options: BuildQuestProductArchitectOptions): QuestCapabilityGap[] {
  const gaps: QuestCapabilityGap[] = []
  if (hasRuntimeSurface(options.files) && !options.verifiedDelivery.runtimeCycleMatrix.allRequiredCovered) {
    gaps.push({
      id: 'gap-runtime-cycle-proof',
      capability: 'Runtime three-cycle proof',
      currentState: 'Runtime-facing changes exist without complete three-cycle evidence.',
      desiredState: 'Every runtime adapter change proves request-after-completion behavior across required runtimes.',
      priority: 'high',
      owner: 'runtime-owner',
      nextAction: runtimeValidationCommand(options),
      evidence: options.verifiedDelivery.runtimeCycleMatrix.checks
        .filter((check) => check.required && check.status !== 'covered')
        .map((check) => `${check.runtime}:${check.status}`),
    })
  }

  if (options.verifiedDelivery.autoEvalGenerator.candidates.length > 0) {
    gaps.push({
      id: 'gap-eval-conversion',
      capability: 'Automatic eval conversion',
      currentState: 'Eval candidates are generated but still need user/team triage.',
      desiredState: 'High-confidence eval candidates become approval-gated regression tests.',
      priority: 'medium',
      owner: 'qa-owner',
      nextAction: 'Review auto-eval-generator.json and approve the highest-value regression candidate.',
      evidence: options.verifiedDelivery.autoEvalGenerator.candidates.map((candidate) => candidate.id).slice(0, 8),
    })
  }

  if (options.semanticRepoBrain.knowledgeConfidenceScore.overall < 0.7) {
    gaps.push({
      id: 'gap-repo-fact-confidence',
      capability: 'Verified repo knowledge confidence',
      currentState: `Semantic repo confidence is ${options.semanticRepoBrain.knowledgeConfidenceScore.overall}.`,
      desiredState: 'Product and coding recommendations rely on verified, fresh repo facts.',
      priority: 'medium',
      owner: 'tech-lead',
      nextAction: 'Refresh Semantic Repo Brain and resolve stale/missing facts before major roadmap decisions.',
      evidence: ['knowledge-confidence-score.json'],
    })
  }

  if (options.intelligentCodingTeam.projectSkillPackBuilder.candidates.length > 0) {
    gaps.push({
      id: 'gap-skill-promotion',
      capability: 'Approval-gated project skill promotion',
      currentState: 'Project skill candidates exist but require user approval.',
      desiredState: 'Repeated successful workflows become durable, approved project skills.',
      priority: 'medium',
      owner: 'product-architect',
      nextAction: 'Ask the user which project skill candidate should be promoted.',
      evidence: options.intelligentCodingTeam.projectSkillPackBuilder.candidates.map((candidate) => candidate.id).slice(0, 8),
    })
  }

  return gaps
}

function buildProductRiskRegister(options: BuildQuestProductArchitectOptions): QuestProductRisk[] {
  const risks: QuestProductRisk[] = []
  if (options.impact.riskLevel === 'high') {
    risks.push({
      id: 'risk-high-blast-radius',
      title: 'High blast radius may affect multiple product workflows',
      severity: 'high',
      likelihood: 'medium',
      mitigation: 'Use change-impact-simulator.json and runtime/package tests before release.',
      evidence: [options.impact.summary, ...options.impact.transitivelyAffected.slice(0, 6)],
    })
  }

  for (const blocker of options.verifiedDelivery.releaseReadinessDashboard.blockers.slice(0, 5)) {
    risks.push({
      id: `risk-release-${slug(blocker)}`,
      title: blocker,
      severity: 'high',
      likelihood: 'medium',
      mitigation: 'Close the blocker or document why it is intentionally deferred.',
      evidence: ['release-readiness-dashboard.json'],
    })
  }

  for (const signal of options.reviewSignals.filter((signal) => signal.severity !== 'info').slice(0, 4)) {
    risks.push({
      id: `risk-review-${signal.id}`,
      title: signal.summary,
      severity: signal.severity === 'error' ? 'high' : 'medium',
      likelihood: 'medium',
      mitigation: signal.recommendation,
      evidence: signal.files,
    })
  }

  if (options.codingExecution.securitySecretsGate.verdict !== 'pass') {
    risks.push({
      id: 'risk-security-gate',
      title: 'Security/secrets gate is not passing',
      severity: 'high',
      likelihood: 'medium',
      mitigation: 'Resolve security-secrets-gate.json findings before release-ready language.',
      evidence: options.codingExecution.securitySecretsGate.findings.map((finding) => finding.summary).slice(0, 6),
    })
  }

  return uniqueById(risks)
}

function buildUserValueMatrix(options: BuildQuestProductArchitectOptions): QuestUserValueItem[] {
  const items: QuestUserValueItem[] = [
    {
      id: 'value-developer-confidence',
      persona: 'developer',
      value: 'Develop faster with verified Quest context, delivery evidence, and architecture guidance.',
      impact: hasQuestCoreSurface(options.files) ? 'high' : 'medium',
      proof: ['coding-intelligence.json', 'verified-delivery-os.json', 'product-architect-review.json'],
      nextAction: 'Show strategic-next-actions.md after completion so developers can choose the next improvement.',
    },
    {
      id: 'value-maintainer-release-readiness',
      persona: 'maintainer',
      value: 'Understand release risk and runtime parity without manually re-reading every sidecar.',
      impact: options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 'medium' : 'high',
      proof: ['release-readiness-dashboard.json', 'product-risk-register.json'],
      nextAction: 'Use product-risk-register.json during release review.',
    },
  ]

  if (hasRuntimeSurface(options.files)) {
    items.push({
      id: 'value-runtime-user-stability',
      persona: 'runtime-user',
      value: 'Direct Kimi/OpenAgent users get bounded QuestMode behavior and better recovery recommendations.',
      impact: 'high',
      proof: runtimeEvidence(options),
      nextAction: 'Keep runtime three-cycle checks in the default release checklist.',
    })
  }

  if (options.objective.toLowerCase().includes('roadmap') || hasQuestCoreSurface(options.files)) {
    items.push({
      id: 'value-product-owner-roadmap',
      persona: 'product-owner',
      value: 'Repeated user intent becomes roadmap signal candidates without silently changing durable product strategy.',
      impact: 'medium',
      proof: ['roadmap-signals.json'],
      nextAction: 'Review approval-required roadmap signals before promotion.',
    } as QuestUserValueItem)
  }

  return items
}

function buildStrategicRefactorRadar(options: BuildQuestProductArchitectOptions): QuestStrategicRefactorSignal[] {
  const signals: QuestStrategicRefactorSignal[] = []
  const areas = [
    { id: 'quest-core', match: (file: string) => file.includes('quest-'), area: 'Quest sidecar orchestration' },
    { id: 'runtime-bridge', match: (file: string) => file.includes('runtime-bridge') || file.startsWith('plugins/'), area: 'Runtime adapter bridge' },
    { id: 'installer', match: (file: string) => file === 'install.sh' || file === 'update.sh', area: 'Install/update workflow' },
    { id: 'evals', match: (file: string) => file.startsWith('scripts/tests/') || file.startsWith('evals/'), area: 'Runtime/eval validation harness' },
  ]

  for (const area of areas) {
    const files = options.files.filter(area.match)
    if (files.length < 2) continue
    signals.push({
      id: `refactor-${area.id}`,
      area: area.area,
      reason: `${files.length} touched files suggest this area is becoming a product subsystem.`,
      triggerCount: files.length,
      priority: files.length >= 5 ? 'high' : 'medium',
      proposedRefactor: refactorProposal(area.id),
      evidence: files.slice(0, 12),
    })
  }

  for (const command of options.temporalMemory.chronicCommands.slice(0, 3)) {
    signals.push({
      id: `refactor-failure-${slug(command)}`,
      area: 'Failure recovery workflow',
      reason: `Temporal memory marks ${command} as chronic or repeated.`,
      triggerCount: 1,
      priority: 'medium',
      proposedRefactor: 'Create a reusable recovery helper or documented fallback before retrying this command path.',
      evidence: [command],
    })
  }

  return uniqueById(signals)
}

function buildArchitectureDecisionSuggestions(
  options: BuildQuestProductArchitectOptions,
): QuestArchitectureDecisionSuggestion[] {
  const suggestions: QuestArchitectureDecisionSuggestion[] = []
  if (hasQuestCoreSurface(options.files)) {
    suggestions.push({
      id: 'adr-quest-sidecar-versioning',
      title: 'Quest sidecar versioning and compatibility',
      decision: 'Define how v9-v17 sidecars are added, normalized, refreshed, and consumed by runtimes.',
      tradeoffs: [
        'More sidecars improve accuracy and explainability.',
        'More sidecars increase prompt and maintenance load if not bounded.',
      ],
      suggestedAdrPath: 'docs/adr/quest-sidecar-versioning.md',
      status: 'needs-user-approval',
      evidence: options.files.filter((file) => file.includes('quest-')).slice(0, 8),
    })
  }
  if (hasRuntimeSurface(options.files)) {
    suggestions.push({
      id: 'adr-runtime-step-budget',
      title: 'Runtime step-budget and recovery policy',
      decision: 'Treat provider step caps as recoverable Quest states with blocked/write-back evidence and bounded prompts.',
      tradeoffs: [
        'Bounded turns reduce runaway tool loops.',
        'Some deep work may require explicit continuation across smaller slices.',
      ],
      suggestedAdrPath: 'docs/adr/runtime-step-budget-policy.md',
      status: 'needs-user-approval',
      evidence: runtimeEvidence(options),
    })
  }
  if (options.verifiedDelivery.autoEvalGenerator.candidates.length > 0) {
    suggestions.push({
      id: 'adr-eval-promotion-policy',
      title: 'Eval candidate promotion policy',
      decision: 'Require user/team approval before generated eval candidates become durable regression tests.',
      tradeoffs: [
        'Approval avoids noisy eval sprawl.',
        'Manual review can delay useful regression coverage.',
      ],
      suggestedAdrPath: 'docs/adr/eval-candidate-promotion.md',
      status: 'needs-user-approval',
      evidence: options.verifiedDelivery.autoEvalGenerator.candidates.map((candidate) => candidate.id).slice(0, 8),
    })
  }
  return suggestions
}

function buildRecommendations(input: {
  architectureNextSteps: QuestArchitectureNextStep[]
  roadmapSignals: QuestRoadmapSignal[]
  capabilityGapMap: QuestCapabilityGap[]
  productRiskRegister: QuestProductRisk[]
  userValueMatrix: QuestUserValueItem[]
  strategicRefactorRadar: QuestStrategicRefactorSignal[]
  architectureDecisionSuggestions: QuestArchitectureDecisionSuggestion[]
}): QuestProductArchitectRecommendation[] {
  const recommendations: QuestProductArchitectRecommendation[] = []
  for (const step of input.architectureNextSteps.slice(0, 3)) {
    recommendations.push({
      id: `rec-${step.id}`,
      title: step.title,
      category: 'architecture',
      priority: step.priority,
      reason: step.rationale,
      nextAction: step.suggestedCommand ?? step.title,
      evidence: step.evidence,
    })
  }
  for (const gap of input.capabilityGapMap.slice(0, 2)) {
    recommendations.push({
      id: `rec-${gap.id}`,
      title: `Close capability gap: ${gap.capability}`,
      category: 'product',
      priority: gap.priority,
      reason: gap.currentState,
      nextAction: gap.nextAction,
      evidence: gap.evidence,
    })
  }
  for (const signal of input.roadmapSignals.slice(0, 2)) {
    recommendations.push({
      id: `rec-${signal.id}`,
      title: signal.recommendedRoadmapItem,
      category: 'roadmap',
      priority: signal.confidence >= 0.8 ? 'high' : 'medium',
      reason: signal.signal,
      nextAction: signal.approvalRequired
        ? 'Ask the user whether to promote this roadmap signal.'
        : 'Add this roadmap item to the active plan.',
      evidence: signal.evidence,
    })
  }
  for (const refactor of input.strategicRefactorRadar.slice(0, 2)) {
    recommendations.push({
      id: `rec-${refactor.id}`,
      title: `Strategic refactor: ${refactor.area}`,
      category: 'refactor',
      priority: refactor.priority,
      reason: refactor.reason,
      nextAction: refactor.proposedRefactor,
      evidence: refactor.evidence,
    })
  }
  for (const adr of input.architectureDecisionSuggestions.slice(0, 2)) {
    recommendations.push({
      id: `rec-${adr.id}`,
      title: `Create ADR: ${adr.title}`,
      category: 'governance',
      priority: 'medium',
      reason: adr.decision,
      nextAction: `Draft ${adr.suggestedAdrPath} after user approval.`,
      evidence: adr.evidence,
    })
  }
  return uniqueById(recommendations).slice(0, 8)
}

function productVerdict(
  options: BuildQuestProductArchitectOptions,
  risks: QuestProductRisk[],
): QuestProductArchitectVerdict {
  if (
    options.verifiedDelivery.releaseReadinessDashboard.verdict === 'blocked' ||
    risks.some((risk) => risk.severity === 'high' && risk.likelihood === 'high')
  ) {
    return 'blocked'
  }
  if (
    options.verifiedDelivery.releaseReadinessDashboard.verdict === 'review' ||
    risks.some((risk) => risk.severity === 'high') ||
    options.verifiedDelivery.runtimeCycleMatrix.allRequiredCovered === false
  ) {
    return 'review'
  }
  return 'ready'
}

function completionGateReason(
  options: BuildQuestProductArchitectOptions,
  risks: QuestProductRisk[],
): string {
  if (options.verifiedDelivery.releaseReadinessDashboard.verdict !== 'pass') {
    return 'Delivery is implemented, but product architecture still sees release/readiness follow-up work.'
  }
  if (risks.length > 0) {
    return 'Delivery can complete, but the product risk register has follow-up risks to track.'
  }
  return 'Delivery can complete and product architecture recommendations are ready for user choice.'
}

function buildCompletionRequirements(
  options: BuildQuestProductArchitectOptions,
  risks: QuestProductRisk[],
): string[] {
  return unique([
    ...(options.verifiedDelivery.releaseReadinessDashboard.blockers.length > 0
      ? ['Resolve or explicitly report release readiness blockers.']
      : []),
    ...(!options.verifiedDelivery.runtimeCycleMatrix.allRequiredCovered
      ? ['Run required runtime three-cycle checks or report the gap.']
      : []),
    ...(risks.some((risk) => risk.severity === 'high')
      ? ['Report high-priority product risks and mitigation in the final answer.']
      : []),
    'Suggest product-architect next steps after the user request is complete and wait for user choice.',
  ])
}

function formatStrategicNextActions(architect: QuestProductArchitectIntelligence): string {
  const review = architect.productArchitectReview
  const lines = [
    '# Product Architect Strategic Next Actions',
    '',
    `- Version: ${architect.version}`,
    `- Objective: ${architect.objective}`,
    `- Generated: ${architect.generatedAt}`,
    `- Product architect verdict: ${review.verdict}`,
    '',
    '## Completion Gate',
    '',
    `- Status: ${review.completionGate.status}`,
    `- Reason: ${review.completionGate.reason}`,
    ...review.completionGate.requiredBeforeClaimingDone.map((item) => `- Required: ${item}`),
    '',
    '## Recommendations',
    '',
    ...(review.recommendations.length > 0
      ? review.recommendations.map((item) => `- **${item.priority}: ${item.title}** - ${item.nextAction}`)
      : ['- No strategic recommendations generated.']),
    '',
    '## Capability Gaps',
    '',
    ...(architect.capabilityGapMap.length > 0
      ? architect.capabilityGapMap.map((gap) => `- **${gap.priority}: ${gap.capability}** - ${gap.nextAction}`)
      : ['- No product capability gaps detected.']),
    '',
    '## Roadmap Signals',
    '',
    ...(architect.roadmapSignals.length > 0
      ? architect.roadmapSignals.map((signal) => `- **${signal.theme}:** ${signal.recommendedRoadmapItem} (${signal.confidence})`)
      : ['- No roadmap signals detected.']),
    '',
    '## Product Risks',
    '',
    ...(architect.productRiskRegister.length > 0
      ? architect.productRiskRegister.map((risk) => `- **${risk.severity}: ${risk.title}** - ${risk.mitigation}`)
      : ['- No product risks detected.']),
    '',
    '## Architecture Decisions',
    '',
    ...(architect.architectureDecisionSuggestions.length > 0
      ? architect.architectureDecisionSuggestions.map((adr) => `- **${adr.title}:** ${adr.decision} (${adr.suggestedAdrPath})`)
      : ['- No ADR candidates detected.']),
    '',
  ]
  return lines.join('\n')
}

function hasRuntimeSurface(files: string[]): boolean {
  return files.some((file) =>
    file.includes('runtime-bridge') ||
    file.startsWith('plugins/') ||
    file.includes('test-kimi-quest') ||
    file.includes('test-opencode-quest') ||
    file.includes('test-codex-quest') ||
    file.includes('codex') ||
    file.includes('kimi') ||
    file.includes('opencode')
  )
}

function hasQuestCoreSurface(files: string[]): boolean {
  return files.some((file) =>
    file.startsWith('packages/cli/src/lib/quest-') ||
    file.startsWith('packages/cli/src/commands/quest-') ||
    file.includes('quest-mode')
  )
}

function runtimeValidationCommand(options: BuildQuestProductArchitectOptions): string {
  if (options.runtimeParity.kimi) {
    return 'npm run test:quest-v8:kimi && RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'
  }
  if (options.runtimeParity.codex) return 'npm run test:quest-v8:codex'
  if (options.runtimeParity.opencode) return 'npm run test:quest-v8:opencode'
  return 'npm run test:ci'
}

function runtimeEvidence(options: BuildQuestProductArchitectOptions): string[] {
  return unique([
    ...options.files.filter((file) => file.includes('runtime') || file.startsWith('plugins/') || file.includes('kimi') || file.includes('codex') || file.includes('opencode')).slice(0, 12),
    ...options.verifiedDelivery.runtimeCycleMatrix.checks
      .filter((check) => check.required)
      .map((check) => `${check.runtime}:${check.status}`),
  ])
}

function refactorProposal(id: string): string {
  const proposals: Record<string, string> = {
    'quest-core': 'Extract shared sidecar artifact registration and prompt fragment builders to reduce per-version wiring.',
    'runtime-bridge': 'Create a runtime adapter contract module for prompt budget, write-back, step-limit, and three-cycle behavior.',
    installer: 'Extract install/update adapter sync into reusable functions with focused shell tests.',
    evals: 'Move repeated v8 runtime smoke assertions into a shared shell helper.',
  }
  return proposals[id] ?? 'Create a small shared module around the repeated product capability.'
}

function scoreSignal(base: number, requestCount: number, directEvidence: boolean): number {
  const score = base + Math.min(requestCount * 0.04, 0.12) + (directEvidence ? 0.1 : 0)
  return Number(Math.min(score, 0.95).toFixed(2))
}

function countMatches(values: string[], pattern: RegExp): number {
  return values.filter((value) => pattern.test(value)).length
}

function addStep(steps: QuestArchitectureNextStep[], step: QuestArchitectureNextStep): void {
  if (!steps.some((existing) => existing.id === step.id)) steps.push(step)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'item'
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items.filter(Boolean))]
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

/**
 * Quest v20 Self-Improving Coding Team OS.
 *
 * Turns delivery evidence, runtime outcomes, and v19 collaboration outputs into
 * measurable team feedback and approval-gated improvement candidates.
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
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedDeliveryOS } from './quest-verified-delivery.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_SELF_IMPROVING_CODING_TEAM_VERSION = '20' as const

export type QuestSelfImprovementVerdict = 'ready' | 'review' | 'blocked'
export type QuestSelfImprovementPriority = 'low' | 'medium' | 'high'
export type QuestImprovementStatus = 'candidate' | 'needs-approval' | 'active' | 'deferred'

export interface QuestCodingTeamMetrics {
  version: typeof QUEST_SELF_IMPROVING_CODING_TEAM_VERSION
  deliveryScore: number
  qualityScore: number
  collaborationScore: number
  learningScore: number
  runtimeScore: number
  summary: {
    tasksCompleted: number
    tasksBlocked: number
    validationsPassed: number
    validationsFailed: number
    fileChanges: number
    contextLoads: number
    researchDecisions: number
    nextStepSuggestions: number
  }
  signals: Array<{ id: string; label: string; value: number; weight: number; evidence: string[] }>
}

export interface QuestDeliveryRetrospectiveItem {
  id: string
  title: string
  category: 'win' | 'friction' | 'risk' | 'opportunity'
  priority: QuestSelfImprovementPriority
  evidence: string[]
  action: string
}

export interface QuestDeliveryRetrospective {
  version: typeof QUEST_SELF_IMPROVING_CODING_TEAM_VERSION
  verdict: QuestSelfImprovementVerdict
  wins: QuestDeliveryRetrospectiveItem[]
  frictions: QuestDeliveryRetrospectiveItem[]
  risks: QuestDeliveryRetrospectiveItem[]
  opportunities: QuestDeliveryRetrospectiveItem[]
  questionsForUser: string[]
}

export interface QuestLearningFeedbackSignal {
  id: string
  source: string
  confidence: number
  recency: 'fresh' | 'recent' | 'stale'
  evidence: string[]
  recommendation: string
}

export interface QuestLearningFeedbackLoop {
  version: typeof QUEST_SELF_IMPROVING_CODING_TEAM_VERSION
  policy: string[]
  signals: QuestLearningFeedbackSignal[]
  promotionCandidates: Array<{ id: string; title: string; approvalCommand: string; evidence: string[] }>
  blockedLearning: string[]
}

export interface QuestImprovementBacklogItem {
  id: string
  title: string
  priority: QuestSelfImprovementPriority
  status: QuestImprovementStatus
  reason: string
  suggestedCommand?: string
  evidence: string[]
}

export interface QuestSkillEvolutionCandidate {
  id: string
  title: string
  source: 'approved-skill-candidate' | 'failure-pattern' | 'delivery-gap' | 'roadmap'
  status: QuestImprovementStatus
  confidence: number
  approvalRequired: true
  approvalCommand?: string
  evidence: string[]
}

export interface QuestSelfImprovingCodingTeamOS {
  version: typeof QUEST_SELF_IMPROVING_CODING_TEAM_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  verdict: QuestSelfImprovementVerdict
  improvementScore: number
  codingTeamMetrics: QuestCodingTeamMetrics
  deliveryRetrospective: QuestDeliveryRetrospective
  learningFeedbackLoop: QuestLearningFeedbackLoop
  improvementBacklog: QuestImprovementBacklogItem[]
  skillEvolutionCandidates: QuestSkillEvolutionCandidate[]
}

export interface BuildQuestSelfImprovingCodingTeamOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

export function buildQuestSelfImprovingCodingTeamOS(
  options: BuildQuestSelfImprovingCodingTeamOptions,
): QuestSelfImprovingCodingTeamOS {
  const eventSummary = summarizeEvents(options.events)
  const metrics = buildCodingTeamMetrics(options, eventSummary)
  const retrospective = buildDeliveryRetrospective(options, eventSummary, metrics)
  const learningFeedbackLoop = buildLearningFeedbackLoop(options, eventSummary)
  const skillEvolutionCandidates = buildSkillEvolutionCandidates(options)
  const improvementBacklog = buildImprovementBacklog(options, metrics, retrospective, skillEvolutionCandidates)
  const verdict = selfImprovementVerdict(metrics, retrospective, learningFeedbackLoop)
  const improvementScore = Math.round((
    metrics.deliveryScore +
    metrics.qualityScore +
    metrics.collaborationScore +
    metrics.learningScore +
    metrics.runtimeScore
  ) / 5)

  return {
    version: QUEST_SELF_IMPROVING_CODING_TEAM_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    objective: options.objective,
    verdict,
    improvementScore,
    codingTeamMetrics: metrics,
    deliveryRetrospective: retrospective,
    learningFeedbackLoop,
    improvementBacklog,
    skillEvolutionCandidates,
  }
}

export async function writeQuestSelfImprovingCodingTeamArtifacts(
  dir: string,
  os: QuestSelfImprovingCodingTeamOS,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'self-improving-coding-team-os.json'), os),
    writeJson(join(dir, 'coding-team-metrics.json'), os.codingTeamMetrics),
    writeJson(join(dir, 'delivery-retrospective.json'), os.deliveryRetrospective),
    writeJson(join(dir, 'learning-feedback-loop.json'), os.learningFeedbackLoop),
    writeJson(join(dir, 'improvement-backlog.json'), os.improvementBacklog),
    writeJson(join(dir, 'skill-evolution-candidates.json'), os.skillEvolutionCandidates),
    writeFile(join(dir, 'self-improvement-roadmap.md'), formatSelfImprovementRoadmap(os)),
  ])
}

export function formatSelfImprovingCodingTeamSummary(os: QuestSelfImprovingCodingTeamOS): string {
  return [
    '## Self-Improving Coding Team OS',
    '',
    `- Self-improvement verdict: ${os.verdict}`,
    `- Improvement score: ${os.improvementScore}`,
    `- Delivery score: ${os.codingTeamMetrics.deliveryScore}`,
    `- Quality score: ${os.codingTeamMetrics.qualityScore}`,
    `- Collaboration score: ${os.codingTeamMetrics.collaborationScore}`,
    `- Learning score: ${os.codingTeamMetrics.learningScore}`,
    `- Runtime score: ${os.codingTeamMetrics.runtimeScore}`,
    `- Retrospective wins: ${os.deliveryRetrospective.wins.length}`,
    `- Improvement backlog items: ${os.improvementBacklog.length}`,
    `- Skill evolution candidates: ${os.skillEvolutionCandidates.length}`,
  ].join('\n')
}

interface EventSummary {
  tasksCompleted: number
  tasksBlocked: number
  tasksFailed: number
  validationsPassed: number
  validationsFailed: number
  fileChanges: number
  contextLoads: number
  contextChanges: number
  researchDecisions: number
  researchPerformed: number
  nextStepSuggestions: number
  runtimeErrors: number
  timeoutErrors: number
  stepLimitErrors: number
}

function summarizeEvents(events: BuildQuestSelfImprovingCodingTeamOptions['events']): EventSummary {
  const summary: EventSummary = {
    tasksCompleted: 0,
    tasksBlocked: 0,
    tasksFailed: 0,
    validationsPassed: 0,
    validationsFailed: 0,
    fileChanges: 0,
    contextLoads: 0,
    contextChanges: 0,
    researchDecisions: 0,
    researchPerformed: 0,
    nextStepSuggestions: 0,
    runtimeErrors: 0,
    timeoutErrors: 0,
    stepLimitErrors: 0,
  }

  for (const event of events) {
    if (event.type === 'task_update') {
      const status = asString(event.data?.status)
      if (status === 'completed') summary.tasksCompleted += 1
      if (status === 'blocked') summary.tasksBlocked += 1
      if (status === 'failed') summary.tasksFailed += 1
    }
    if (event.type === 'validation') {
      if (validationPassed(event.data)) summary.validationsPassed += 1
      else summary.validationsFailed += 1
    }
    if (event.type === 'file_change') summary.fileChanges += 1
    if (event.type === 'context.loaded') summary.contextLoads += 1
    if (event.type === 'context.changed') summary.contextChanges += 1
    if (event.type === 'research.assessed') summary.researchDecisions += 1
    if (event.type === 'research.performed') summary.researchPerformed += 1
    if (event.type === 'next_steps.suggested') summary.nextStepSuggestions += 1
    if (event.type === 'error') {
      summary.runtimeErrors += 1
      const reason = asString(event.data?.reason ?? event.data?.message) ?? ''
      if (reason.includes('timeout')) summary.timeoutErrors += 1
      if (reason.includes('step') || reason.includes('max')) summary.stepLimitErrors += 1
    }
  }

  return summary
}

function buildCodingTeamMetrics(
  options: BuildQuestSelfImprovingCodingTeamOptions,
  events: EventSummary,
): QuestCodingTeamMetrics {
  const deliveryScore = clampScore(70 + events.tasksCompleted * 5 - events.tasksBlocked * 10 - events.tasksFailed * 15)
  const qualityScore = clampScore(
    60
    + Math.min(options.testRecommendations.length * 5, 20)
    + (options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 15 : 0)
    - options.reviewSignals.filter((signal) => signal.severity === 'warning' || signal.severity === 'error').length * 5,
  )
  const collaborationScore = clampScore(
    55
    + Math.min(options.deepCodingCollaboration.collaborationBoard.agentCommitments.length * 5, 20)
    + Math.min(events.nextStepSuggestions * 10, 20)
    - options.deepCodingCollaboration.collaborationBoard.decisionsNeeded.length * 4,
  )
  const learningScore = clampScore(
    55
    + Math.min(options.semanticRepoBrain.autoSkillBuilder.candidates.length * 4, 20)
    + Math.min(options.temporalMemory.patchOutcomes.length * 3, 15)
    - Math.min(options.temporalMemory.chronicCommands.length * 8, 24),
  )
  const runtimeScore = clampScore(
    80
    - events.runtimeErrors * 8
    - events.timeoutErrors * 12
    - events.stepLimitErrors * 12
    - (options.runtimeReliability.verdict === 'blocked' ? 25 : options.runtimeReliability.verdict === 'review' ? 10 : 0),
  )

  return {
    version: QUEST_SELF_IMPROVING_CODING_TEAM_VERSION,
    deliveryScore,
    qualityScore,
    collaborationScore,
    learningScore,
    runtimeScore,
    summary: {
      tasksCompleted: events.tasksCompleted,
      tasksBlocked: events.tasksBlocked,
      validationsPassed: events.validationsPassed,
      validationsFailed: events.validationsFailed,
      fileChanges: events.fileChanges,
      contextLoads: events.contextLoads,
      researchDecisions: events.researchDecisions,
      nextStepSuggestions: events.nextStepSuggestions,
    },
    signals: [
      {
        id: 'delivery-throughput',
        label: 'Completed vs blocked/failed tasks',
        value: deliveryScore,
        weight: 0.25,
        evidence: [`Completed: ${events.tasksCompleted}`, `Blocked: ${events.tasksBlocked}`, `Failed: ${events.tasksFailed}`],
      },
      {
        id: 'quality-evidence',
        label: 'Validation and release-readiness evidence',
        value: qualityScore,
        weight: 0.25,
        evidence: [
          `Tests recommended: ${options.testRecommendations.length}`,
          `Release readiness: ${options.verifiedDelivery.releaseReadinessDashboard.verdict}`,
        ],
      },
      {
        id: 'collaboration-loop',
        label: 'Next-step and collaboration discipline',
        value: collaborationScore,
        weight: 0.2,
        evidence: [
          `Next-step suggestions: ${events.nextStepSuggestions}`,
          `Collaboration decisions: ${options.deepCodingCollaboration.collaborationBoard.decisionsNeeded.length}`,
        ],
      },
      {
        id: 'learning-loop',
        label: 'Reusable learning with approval gates',
        value: learningScore,
        weight: 0.15,
        evidence: [
          `Skill candidates: ${options.semanticRepoBrain.autoSkillBuilder.candidates.length}`,
          `Chronic commands: ${options.temporalMemory.chronicCommands.length}`,
        ],
      },
      {
        id: 'runtime-resilience',
        label: 'Runtime timeout and step-limit resilience',
        value: runtimeScore,
        weight: 0.15,
        evidence: [
          `Runtime reliability: ${options.runtimeReliability.verdict}`,
          `Timeout errors: ${events.timeoutErrors}`,
          `Step-limit errors: ${events.stepLimitErrors}`,
        ],
      },
    ],
  }
}

function buildDeliveryRetrospective(
  options: BuildQuestSelfImprovingCodingTeamOptions,
  events: EventSummary,
  metrics: QuestCodingTeamMetrics,
): QuestDeliveryRetrospective {
  const wins: QuestDeliveryRetrospectiveItem[] = [
    {
      id: 'evidence-sidecars',
      title: 'Evidence sidecars are available for coding decisions',
      category: 'win',
      priority: 'medium',
      evidence: [
        `Knowledgebase verdict: ${options.verifiedKnowledgebase.hallucinationGate.verdict}`,
        `Semantic confidence: ${options.semanticRepoBrain.knowledgeConfidenceScore.overall}`,
      ],
      action: 'Keep using evidence sidecars before final completion claims.',
    },
  ]
  if (metrics.collaborationScore >= 70) {
    wins.push({
      id: 'collaboration-discipline',
      title: 'Collaboration loop is explicit',
      category: 'win',
      priority: 'medium',
      evidence: [`Collaboration score: ${metrics.collaborationScore}`],
      action: 'Continue suggesting user-choice next steps after completion.',
    })
  }

  const frictions: QuestDeliveryRetrospectiveItem[] = []
  if (events.timeoutErrors > 0 || options.runtimeReliability.commandFailureIndex.fingerprints.length > 0) {
    frictions.push({
      id: 'runtime-failures',
      title: 'Runtime failures need reusable fixes',
      category: 'friction',
      priority: events.timeoutErrors > 0 ? 'high' : 'medium',
      evidence: [
        `Timeout errors: ${events.timeoutErrors}`,
        `Failure fingerprints: ${options.runtimeReliability.commandFailureIndex.fingerprints.length}`,
      ],
      action: 'Use timeout policy and failure-fix memory before retrying broken runtime paths.',
    })
  }
  if (options.reviewSignals.length > 0) {
    frictions.push({
      id: 'review-signals',
      title: 'Review signals need closure before claiming done',
      category: 'friction',
      priority: options.reviewSignals.some((signal) => signal.severity === 'error') ? 'high' : 'medium',
      evidence: options.reviewSignals.map((signal) => signal.summary).slice(0, 5),
      action: 'Close or explicitly report review gaps in the final summary.',
    })
  }

  const risks: QuestDeliveryRetrospectiveItem[] = options.productArchitect.productRiskRegister
    .slice(0, 4)
    .map((risk, index) => ({
      id: `product-risk-${index + 1}`,
      title: risk.title,
      category: 'risk' as const,
      priority: risk.severity === 'high' ? 'high' : 'medium',
      evidence: risk.evidence,
      action: risk.mitigation,
    }))

  const opportunities: QuestDeliveryRetrospectiveItem[] = options.deepCodingCollaboration.buildBetterRoadmap
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      category: 'opportunity' as const,
      priority: item.priority,
      evidence: item.evidence,
      action: item.suggestedCommand ?? item.reason,
    }))

  return {
    version: QUEST_SELF_IMPROVING_CODING_TEAM_VERSION,
    verdict: retrospectiveVerdict(metrics, frictions, risks),
    wins,
    frictions,
    risks,
    opportunities,
    questionsForUser: buildQuestionsForUser(options, frictions, risks),
  }
}

function buildLearningFeedbackLoop(
  options: BuildQuestSelfImprovingCodingTeamOptions,
  events: EventSummary,
): QuestLearningFeedbackLoop {
  const signals: QuestLearningFeedbackSignal[] = [
    {
      id: 'validated-delivery',
      source: 'validation-events',
      confidence: events.validationsPassed > 0 ? 0.85 : 0.45,
      recency: 'fresh',
      evidence: [`Passed validations: ${events.validationsPassed}`, `Failed validations: ${events.validationsFailed}`],
      recommendation: events.validationsPassed > 0
        ? 'Reuse the selected validation path as evidence for similar changes.'
        : 'Do not promote delivery knowledge until a validation path passes.',
    },
    {
      id: 'failure-fix-loop',
      source: 'runtime-reliability',
      confidence: options.runtimeReliability.commandFailureIndex.fingerprints.length > 0 ? 0.82 : 0.55,
      recency: 'fresh',
      evidence: options.runtimeReliability.commandFailureIndex.fingerprints
        .map((fingerprint) => `${fingerprint.kind}: ${fingerprint.command}`)
        .slice(0, 5),
      recommendation: 'Store failed-command fingerprints and known fixes so future Quests avoid repeated broken paths.',
    },
    {
      id: 'repo-brain-confidence',
      source: 'semantic-repo-brain',
      confidence: options.semanticRepoBrain.knowledgeConfidenceScore.overall,
      recency: options.repoWiki ? 'fresh' : 'recent',
      evidence: [
        `Semantic nodes: ${options.semanticRepoBrain.semanticGraph.summary.nodes}`,
        `Repo wiki files: ${options.repoWiki?.files.length ?? 0}`,
      ],
      recommendation: 'Use high-confidence repo facts automatically; label inferred or stale facts before acting.',
    },
  ]

  const promotionCandidates = options.semanticRepoBrain.autoSkillBuilder.candidates.slice(0, 6).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    approvalCommand: candidate.approvalCommand ?? `oac memory-promote --approve ${candidate.id}`,
    evidence: [`Evidence count: ${candidate.evidenceCount}`, `Status: ${candidate.status}`],
  }))

  const blockedLearning = [
    ...(events.validationsFailed > 0 ? ['Validation failures cannot become durable delivery knowledge until fixed.'] : []),
    ...(options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked'
      ? ['Hallucination gate is blocked; refresh evidence before promoting knowledge.']
      : []),
    ...(options.semanticRepoBrain.autoSkillBuilder.candidates.some((candidate) => candidate.status === 'pending-user-approval')
      ? ['Skill candidates remain approval-gated and must not be auto-promoted.']
      : []),
  ]

  return {
    version: QUEST_SELF_IMPROVING_CODING_TEAM_VERSION,
    policy: [
      'Never turn a single event into durable knowledge automatically.',
      'Promote repeated learnings only through scored candidates and explicit user approval.',
      'Use validation, runtime, and source evidence to raise confidence; stale or inferred facts stay labeled.',
      'Treat failed commands and timeout paths as reusable avoidance knowledge after evidence is recorded.',
    ],
    signals,
    promotionCandidates,
    blockedLearning,
  }
}

function buildImprovementBacklog(
  options: BuildQuestSelfImprovingCodingTeamOptions,
  metrics: QuestCodingTeamMetrics,
  retrospective: QuestDeliveryRetrospective,
  skillCandidates: QuestSkillEvolutionCandidate[],
): QuestImprovementBacklogItem[] {
  const items: QuestImprovementBacklogItem[] = []
  if (metrics.runtimeScore < 75) {
    items.push({
      id: 'runtime-resilience',
      title: 'Harden runtime timeout and step-limit recovery',
      priority: 'high',
      status: 'candidate',
      reason: 'Runtime resilience score is below target.',
      suggestedCommand: 'oac runtime-doctor --runtime kimi',
      evidence: [`Runtime score: ${metrics.runtimeScore}`, `Runtime verdict: ${options.runtimeReliability.verdict}`],
    })
  }
  if (metrics.qualityScore < 75) {
    items.push({
      id: 'quality-evidence',
      title: 'Improve focused validation coverage for changed surfaces',
      priority: 'high',
      status: 'candidate',
      reason: 'Quality score is below target or review signals remain open.',
      evidence: [`Quality score: ${metrics.qualityScore}`, ...options.reviewSignals.map((signal) => signal.summary).slice(0, 4)],
    })
  }
  for (const opportunity of retrospective.opportunities.slice(0, 4)) {
    items.push({
      id: `roadmap-${opportunity.id}`,
      title: opportunity.title,
      priority: opportunity.priority,
      status: 'candidate',
      reason: 'V19 build-better roadmap identified this as the next useful improvement.',
      suggestedCommand: opportunity.action.startsWith('npm ') || opportunity.action.startsWith('oac ') ? opportunity.action : undefined,
      evidence: opportunity.evidence,
    })
  }
  for (const candidate of skillCandidates.slice(0, 4)) {
    items.push({
      id: `skill-${candidate.id}`,
      title: candidate.title,
      priority: candidate.confidence >= 0.8 ? 'medium' : 'low',
      status: 'needs-approval',
      reason: 'Skill evolution candidates require user approval before durable use.',
      suggestedCommand: candidate.approvalCommand,
      evidence: candidate.evidence,
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'continue-measurement',
      title: 'Keep measuring delivery, quality, collaboration, learning, and runtime scores',
      priority: 'medium',
      status: 'active',
      reason: 'The current coding-team loop is healthy; continue collecting evidence across Quests.',
      evidence: [`Improvement score: ${Math.round((metrics.deliveryScore + metrics.qualityScore + metrics.collaborationScore + metrics.learningScore + metrics.runtimeScore) / 5)}`],
    })
  }
  return items.slice(0, 10)
}

function buildSkillEvolutionCandidates(options: BuildQuestSelfImprovingCodingTeamOptions): QuestSkillEvolutionCandidate[] {
  const candidates: QuestSkillEvolutionCandidate[] = options.semanticRepoBrain.autoSkillBuilder.candidates
    .slice(0, 6)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      source: 'approved-skill-candidate',
      status: 'needs-approval',
      confidence: Math.min(0.95, 0.5 + candidate.evidenceCount * 0.08),
      approvalRequired: true,
      approvalCommand: candidate.approvalCommand,
      evidence: [`Evidence count: ${candidate.evidenceCount}`, candidate.summary],
    }))

  for (const command of options.temporalMemory.chronicCommands.slice(0, 4)) {
    candidates.push({
      id: `failure-${stableId(command)}`,
      title: `Avoid repeated failure path: ${command}`,
      source: 'failure-pattern',
      status: 'candidate',
      confidence: 0.8,
      approvalRequired: true,
      evidence: [`Chronic command fingerprint: ${command}`],
    })
  }

  if (options.verifiedDelivery.autoEvalGenerator.candidates.length > 0) {
    for (const evalCandidate of options.verifiedDelivery.autoEvalGenerator.candidates.slice(0, 3)) {
      candidates.push({
        id: `eval-${evalCandidate.id}`,
        title: evalCandidate.title,
        source: 'delivery-gap',
        status: 'candidate',
        confidence: priorityConfidence(evalCandidate.priority),
        approvalRequired: true,
        evidence: evalCandidate.evidence,
      })
    }
  }

  return candidates.slice(0, 10)
}

function retrospectiveVerdict(
  metrics: QuestCodingTeamMetrics,
  frictions: QuestDeliveryRetrospectiveItem[],
  risks: QuestDeliveryRetrospectiveItem[],
): QuestSelfImprovementVerdict {
  if (metrics.runtimeScore < 45 || metrics.qualityScore < 45) return 'blocked'
  if (frictions.some((item) => item.priority === 'high') || risks.some((item) => item.priority === 'high')) return 'review'
  if (metrics.deliveryScore < 65 || metrics.learningScore < 60) return 'review'
  return 'ready'
}

function selfImprovementVerdict(
  metrics: QuestCodingTeamMetrics,
  retrospective: QuestDeliveryRetrospective,
  feedback: QuestLearningFeedbackLoop,
): QuestSelfImprovementVerdict {
  if (retrospective.verdict === 'blocked') return 'blocked'
  if (feedback.blockedLearning.length > 0) return 'review'
  if (metrics.qualityScore < 60 || metrics.runtimeScore < 60) return 'review'
  return retrospective.verdict
}

function buildQuestionsForUser(
  options: BuildQuestSelfImprovingCodingTeamOptions,
  frictions: QuestDeliveryRetrospectiveItem[],
  risks: QuestDeliveryRetrospectiveItem[],
): string[] {
  const questions = [
    ...risks.filter((risk) => risk.priority === 'high').map((risk) => `Should we mitigate or accept this product risk next: ${risk.title}?`),
    ...frictions.filter((friction) => friction.priority === 'high').map((friction) => `Should OpenAgent prioritize this improvement next: ${friction.title}?`),
    ...options.deepCodingCollaboration.collaborationBoard.decisionsNeeded
      .slice(0, 3)
      .map((decision) => `User decision needed: ${decision.title}`),
  ]
  if (questions.length === 0) {
    questions.push('Which improvement backlog item should OpenAgent implement next?')
  }
  return questions.slice(0, 5)
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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function priorityConfidence(priority: QuestSelfImprovementPriority): number {
  if (priority === 'high') return 0.85
  if (priority === 'medium') return 0.7
  return 0.55
}

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'unknown'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function formatSelfImprovementRoadmap(os: QuestSelfImprovingCodingTeamOS): string {
  const lines = [
    '# Quest v20 Self-Improvement Roadmap',
    '',
    `- Version: ${os.version}`,
    `- Objective: ${os.objective}`,
    `- Verdict: ${os.verdict}`,
    `- Improvement score: ${os.improvementScore}`,
    '',
    '## Metrics',
    '',
    `- Delivery: ${os.codingTeamMetrics.deliveryScore}`,
    `- Quality: ${os.codingTeamMetrics.qualityScore}`,
    `- Collaboration: ${os.codingTeamMetrics.collaborationScore}`,
    `- Learning: ${os.codingTeamMetrics.learningScore}`,
    `- Runtime: ${os.codingTeamMetrics.runtimeScore}`,
    '',
    '## Improvement Backlog',
    '',
  ]

  for (const item of os.improvementBacklog) {
    lines.push(`- **${item.priority}/${item.status}:** ${item.title}`)
    lines.push(`  - ${item.reason}`)
    if (item.suggestedCommand) lines.push(`  - Command: \`${item.suggestedCommand}\``)
  }

  lines.push('', '## Learning Policy', '')
  for (const rule of os.learningFeedbackLoop.policy) lines.push(`- ${rule}`)

  lines.push('', '## Skill Evolution Candidates', '')
  for (const candidate of os.skillEvolutionCandidates) {
    lines.push(`- **${candidate.status}:** ${candidate.title}`)
    lines.push(`  - Confidence: ${candidate.confidence}`)
    if (candidate.approvalCommand) lines.push(`  - Approval: \`${candidate.approvalCommand}\``)
  }
  if (os.skillEvolutionCandidates.length === 0) lines.push('_No skill evolution candidates generated._')

  return `${lines.join('\n')}\n`
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

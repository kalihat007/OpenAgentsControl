/**
 * Quest v19 Deep Coding Collaboration OS.
 *
 * Deterministic reasoning layer that turns Quest evidence into an idea-to-build
 * collaboration plan, deeper code thinking checks, and smarter implementation
 * guidance before editing or claiming completion.
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
import type { QuestProductArchitectIntelligence } from './quest-product-architect.js'
import type { QuestRuntimeReliabilityOS } from './quest-runtime-reliability.js'
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedDeliveryOS } from './quest-verified-delivery.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_DEEP_CODING_COLLABORATION_VERSION = '19' as const

export type QuestDeepCodingVerdict = 'ready' | 'review' | 'blocked'
export type QuestDeepCodingPriority = 'low' | 'medium' | 'high'
export type QuestDeepThinkingDepth = 'focused' | 'deep' | 'insufficient'
export type QuestDeepQuestionStatus = 'answered' | 'needs-user-choice' | 'needs-research' | 'needs-code-reading'

export interface QuestDeepThinkingQuestion {
  id: string
  question: string
  whyItMatters: string
  status: QuestDeepQuestionStatus
  evidence: string[]
  nextAction: string
}

export interface QuestReasoningCheck {
  id: string
  title: string
  status: 'pass' | 'review' | 'blocked'
  evidence: string[]
  action: string
}

export interface QuestDeepThinkingReview {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  depth: QuestDeepThinkingDepth
  verdict: QuestDeepCodingVerdict
  problemFraming: string
  assumptions: Array<{ statement: string; confidence: number; evidence: string[] }>
  hardQuestions: QuestDeepThinkingQuestion[]
  reasoningChecks: QuestReasoningCheck[]
  completionRules: string[]
}

export interface QuestIdeaBuildSlice {
  id: string
  title: string
  goal: string
  files: string[]
  acceptance: string[]
  validation: string[]
}

export interface QuestIdeaToBuildBrief {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  userIdea: string
  productGoal: string
  userValue: string[]
  architectureShape: string[]
  buildSlices: QuestIdeaBuildSlice[]
  nonGoals: string[]
  collaborationCheckpoints: string[]
}

export interface QuestCodeQualityMove {
  id: string
  title: string
  priority: QuestDeepCodingPriority
  reason: string
  files: string[]
  evidence: string[]
}

export interface QuestSmarterCodePlan {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  strategy: string
  codeQualityMoves: QuestCodeQualityMove[]
  refactorBoundaries: string[]
  validationStrategy: string[]
  hallucinationControls: string[]
}

export interface QuestCollaborationDecision {
  id: string
  title: string
  owner: 'user' | 'openagent' | 'expert-team'
  priority: QuestDeepCodingPriority
  recommendation: string
  evidence: string[]
}

export interface QuestCollaborationBoard {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  roles: Array<{ role: string; responsibility: string; files: string[] }>
  decisionsNeeded: QuestCollaborationDecision[]
  agentCommitments: string[]
  checkpointCadence: string[]
}

export interface QuestDecisionTradeoff {
  id: string
  decision: string
  options: Array<{ option: string; pros: string[]; cons: string[] }>
  recommendedOption: string
  confidence: number
  evidence: string[]
}

export interface QuestDecisionTradeoffMatrix {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  tradeoffs: QuestDecisionTradeoff[]
  decisionPolicy: string[]
}

export interface QuestBuildBetterRoadmapItem {
  id: string
  title: string
  horizon: 'now' | 'next' | 'later'
  priority: QuestDeepCodingPriority
  reason: string
  suggestedCommand?: string
  evidence: string[]
}

export interface QuestDeepCodingCollaborationOS {
  version: typeof QUEST_DEEP_CODING_COLLABORATION_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  verdict: QuestDeepCodingVerdict
  depthScore: number
  deepThinkingReview: QuestDeepThinkingReview
  ideaToBuildBrief: QuestIdeaToBuildBrief
  smarterCodePlan: QuestSmarterCodePlan
  collaborationBoard: QuestCollaborationBoard
  decisionTradeoffMatrix: QuestDecisionTradeoffMatrix
  buildBetterRoadmap: QuestBuildBetterRoadmapItem[]
}

export interface BuildQuestDeepCodingCollaborationOptions {
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
  productArchitect: QuestProductArchitectIntelligence
  runtimeReliability: QuestRuntimeReliabilityOS
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

export function buildQuestDeepCodingCollaborationOS(
  options: BuildQuestDeepCodingCollaborationOptions,
): QuestDeepCodingCollaborationOS {
  const hardQuestions = buildHardQuestions(options)
  const reasoningChecks = buildReasoningChecks(options)
  const verdict = deepCodingVerdict(hardQuestions, reasoningChecks, options)
  const depthScore = scoreDepth(hardQuestions, reasoningChecks, options)
  const deepThinkingReview = buildDeepThinkingReview(options, hardQuestions, reasoningChecks, verdict, depthScore)
  const ideaToBuildBrief = buildIdeaToBuildBrief(options)
  const smarterCodePlan = buildSmarterCodePlan(options)
  const collaborationBoard = buildCollaborationBoard(options, hardQuestions)
  const decisionTradeoffMatrix = buildDecisionTradeoffMatrix(options)
  const buildBetterRoadmap = buildBuildBetterRoadmapItems(options)

  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    objective: options.objective,
    verdict,
    depthScore,
    deepThinkingReview,
    ideaToBuildBrief,
    smarterCodePlan,
    collaborationBoard,
    decisionTradeoffMatrix,
    buildBetterRoadmap,
  }
}

export async function writeQuestDeepCodingCollaborationArtifacts(
  dir: string,
  collaboration: QuestDeepCodingCollaborationOS,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'deep-coding-collaboration-os.json'), collaboration),
    writeJson(join(dir, 'deep-thinking-review.json'), collaboration.deepThinkingReview),
    writeJson(join(dir, 'idea-to-build-brief.json'), collaboration.ideaToBuildBrief),
    writeJson(join(dir, 'smarter-code-plan.json'), collaboration.smarterCodePlan),
    writeJson(join(dir, 'collaboration-board.json'), collaboration.collaborationBoard),
    writeJson(join(dir, 'decision-tradeoff-matrix.json'), collaboration.decisionTradeoffMatrix),
    writeFile(join(dir, 'build-better-roadmap.md'), formatBuildBetterRoadmap(collaboration)),
  ])
}

export function formatDeepCodingCollaborationSummary(collaboration: QuestDeepCodingCollaborationOS): string {
  return [
    '## Deep Coding Collaboration OS',
    '',
    `- Deep coding verdict: ${collaboration.verdict}`,
    `- Depth score: ${collaboration.depthScore}`,
    `- Hard questions: ${collaboration.deepThinkingReview.hardQuestions.length}`,
    `- Reasoning checks: ${collaboration.deepThinkingReview.reasoningChecks.length}`,
    `- Build slices: ${collaboration.ideaToBuildBrief.buildSlices.length}`,
    `- Code quality moves: ${collaboration.smarterCodePlan.codeQualityMoves.length}`,
    `- Collaboration decisions: ${collaboration.collaborationBoard.decisionsNeeded.length}`,
    `- Tradeoffs: ${collaboration.decisionTradeoffMatrix.tradeoffs.length}`,
    `- Build-better roadmap items: ${collaboration.buildBetterRoadmap.length}`,
  ].join('\n')
}

function buildDeepThinkingReview(
  options: BuildQuestDeepCodingCollaborationOptions,
  hardQuestions: QuestDeepThinkingQuestion[],
  reasoningChecks: QuestReasoningCheck[],
  verdict: QuestDeepCodingVerdict,
  depthScore: number,
): QuestDeepThinkingReview {
  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    depth: depthScore >= 80 ? 'deep' : depthScore >= 55 ? 'focused' : 'insufficient',
    verdict,
    problemFraming: `Turn the user idea into a bounded coding outcome: ${options.objective}`,
    assumptions: buildAssumptions(options),
    hardQuestions,
    reasoningChecks,
    completionRules: [
      'Read the relevant files and sidecars before editing.',
      'State unknowns as assumptions or ask for user choice when they can change architecture.',
      'Prefer the smallest coherent implementation that preserves existing repo patterns.',
      'Map every completion claim to evidence, validation, or an explicit gap.',
      'After completion, suggest next product/build steps and wait for user choice.',
    ],
  }
}

function buildIdeaToBuildBrief(options: BuildQuestDeepCodingCollaborationOptions): QuestIdeaToBuildBrief {
  const userValues = options.productArchitect.userValueMatrix
    .map((item) => item.value)
    .slice(0, 6)
  const architectureShape = unique([
    options.impact.summary,
    ...options.impact.directlyAffected.slice(0, 6).map((file) => `Directly affected: ${file}`),
    ...options.semanticRepoBrain.semanticGraph.nodes.slice(0, 6).map((node) => `${node.kind}: ${node.name}`),
  ])
  const buildSlices = options.patchCapsules.map((capsule, index) => ({
    id: `slice-${String(index + 1).padStart(3, '0')}`,
    title: capsule.summary,
    goal: capsule.expectedBehavior,
    files: capsule.files,
    acceptance: [
      capsule.expectedBehavior,
      ...options.verifiedDelivery.acceptanceCompiler.criteria.slice(0, 4).map((criterion) => criterion.statement),
    ],
    validation: capsule.validationCommands.length > 0
      ? capsule.validationCommands
      : options.testRecommendations.map((test) => test.command).slice(0, 4),
  }))

  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    userIdea: options.objective,
    productGoal: productGoal(options),
    userValue: userValues.length > 0 ? userValues : ['Developer can move from idea to implemented, verified code with less rework.'],
    architectureShape,
    buildSlices: buildSlices.length > 0 ? buildSlices : [{
      id: 'slice-001',
      title: 'Clarify and plan the first implementation slice',
      goal: `Create a concrete build path for: ${options.objective}`,
      files: options.files,
      acceptance: ['Plan includes affected files, validation, and rollback path.'],
      validation: options.testRecommendations.map((test) => test.command).slice(0, 4),
    }],
    nonGoals: inferNonGoals(options),
    collaborationCheckpoints: [
      'Before editing: confirm objective, risk, impacted files, and validation strategy.',
      'During editing: keep patch capsules small and update events for file/context changes.',
      'Before completion: run selected evidence gates and summarize any unverified assumptions.',
      'After completion: recommend next architecture/product steps and wait for user decision.',
    ],
  }
}

function buildSmarterCodePlan(options: BuildQuestDeepCodingCollaborationOptions): QuestSmarterCodePlan {
  const codeQualityMoves: QuestCodeQualityMove[] = [
    {
      id: 'read-before-write',
      title: 'Read affected source and tests before changing code',
      priority: 'high',
      reason: 'Deep coding starts from local truth instead of memory or assumptions.',
      files: options.files.slice(0, 12),
      evidence: [`Affected files: ${options.files.length}`, options.impact.summary],
    },
    {
      id: 'pattern-preservation',
      title: 'Preserve established package patterns',
      priority: options.semanticRepoBrain.knowledgeConfidenceScore.overall < 0.7 ? 'medium' : 'high',
      reason: 'Smarter code should fit the existing module conventions and ownership.',
      files: unique(options.semanticRepoBrain.semanticGraph.nodes.slice(0, 8).map((node) => node.path ?? '')),
      evidence: [
        `Semantic repo confidence: ${options.semanticRepoBrain.knowledgeConfidenceScore.overall}`,
        `AST nodes: ${options.semanticRepoBrain.semanticGraph.summary.nodes}`,
      ],
    },
    {
      id: 'evidence-first-validation',
      title: 'Choose validation from risk and runtime impact',
      priority: options.impact.riskLevel === 'high' ? 'high' : 'medium',
      reason: 'Validation should match the blast radius, not just the nearest test.',
      files: options.files,
      evidence: options.testRecommendations.map((test) => `${test.command} (${test.reason})`).slice(0, 6),
    },
    {
      id: 'bounded-refactor',
      title: 'Keep refactors inside the requested build slice',
      priority: 'medium',
      reason: 'Idea-to-build collaboration moves fastest when cleanup is scoped and reversible.',
      files: options.patchCapsules.flatMap((capsule) => capsule.files).slice(0, 12),
      evidence: options.patchCapsules.map((capsule) => capsule.rollbackNote).slice(0, 4),
    },
  ]

  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    strategy: strategyFor(options),
    codeQualityMoves,
    refactorBoundaries: [
      'Do not widen the change beyond files needed for the current objective without user approval.',
      'Avoid architectural rewrites unless Product Architect Intelligence marks the refactor as urgent.',
      'Prefer additive compatibility paths for runtime adapters and installer flows.',
      'Move unrelated cleanup into next-step recommendations.',
    ],
    validationStrategy: validationStrategy(options),
    hallucinationControls: [
      'Treat unknown repo facts as missing until supported by local files, sidecars, tests, or current research.',
      'Use Semantic Repo Brain confidence labels before claiming symbol, command, or ownership knowledge.',
      'Use claim-ledger and evidence-replay before final completion claims.',
      'Ask the user for product decisions when a choice changes scope, UX, architecture, or compatibility.',
    ],
  }
}

function buildCollaborationBoard(
  options: BuildQuestDeepCodingCollaborationOptions,
  hardQuestions: QuestDeepThinkingQuestion[],
): QuestCollaborationBoard {
  const roles = options.intelligentCodingTeam.expertTeamBlackboard.roster.slice(0, 8).map((expert) => ({
    role: expert.role,
    responsibility: expert.responsibilities[0] ?? expert.title,
    files: expert.files,
  }))
  const decisionsNeeded: QuestCollaborationDecision[] = [
    ...hardQuestions
      .filter((question) => question.status === 'needs-user-choice')
      .slice(0, 4)
      .map((question, index) => ({
        id: `decision-${String(index + 1).padStart(3, '0')}`,
        title: question.question,
        owner: 'user' as const,
        priority: 'high' as const,
        recommendation: question.nextAction,
        evidence: question.evidence,
      })),
    ...options.productArchitect.architectureDecisionSuggestions
      .filter((decision) => decision.status === 'needs-user-approval')
      .slice(0, 4)
      .map((decision, index) => ({
        id: `adr-${String(index + 1).padStart(3, '0')}`,
        title: decision.title,
        owner: 'user' as const,
        priority: 'medium' as const,
        recommendation: decision.decision,
        evidence: decision.evidence,
      })),
  ]

  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    roles: roles.length > 0 ? roles : [
      { role: 'team-lead', responsibility: 'Coordinate idea-to-build execution and evidence gates.', files: options.files },
      { role: 'coder', responsibility: 'Make the smallest coherent implementation slice.', files: options.files },
      { role: 'test-engineer', responsibility: 'Match validation to blast radius and runtime impact.', files: [] },
    ],
    decisionsNeeded,
    agentCommitments: [
      'Explore required files and local context before implementation.',
      'Research only when current or external facts can affect correctness.',
      'Use sidecars to reason deeply, then implement in small verified patches.',
      'Keep the user in control of scope, architecture, roadmap, and skill promotion choices.',
    ],
    checkpointCadence: [
      'Idea checkpoint: restate outcome, non-goals, and user value.',
      'Build checkpoint: identify files, risks, and validation before edits.',
      'Review checkpoint: connect changes to requirements and evidence.',
      'Next-step checkpoint: recommend practical product/build follow-ups after completion.',
    ],
  }
}

function buildDecisionTradeoffMatrix(options: BuildQuestDeepCodingCollaborationOptions): QuestDecisionTradeoffMatrix {
  const tradeoffs: QuestDecisionTradeoff[] = [
    {
      id: 'scope-depth',
      decision: 'How deep should this implementation go now?',
      options: [
        {
          option: 'Small verified slice',
          pros: ['Fast feedback', 'Lower regression risk', 'Easy rollback'],
          cons: ['May leave broader architecture work for later'],
        },
        {
          option: 'Broad architecture refactor',
          pros: ['Can reduce future duplication', 'May solve adjacent capability gaps'],
          cons: ['Higher blast radius', 'Requires deeper validation and user approval'],
        },
      ],
      recommendedOption: options.impact.riskLevel === 'high' ? 'Small verified slice' : 'Small verified slice first, then propose refactor follow-up',
      confidence: options.impact.riskLevel === 'high' ? 0.9 : 0.75,
      evidence: [options.impact.summary, `Risk: ${options.impact.riskLevel}`],
    },
    {
      id: 'validation-depth',
      decision: 'How much validation is enough before claiming done?',
      options: [
        {
          option: 'Focused validation',
          pros: ['Fast', 'Good for low-risk documentation or prompt changes'],
          cons: ['May miss runtime or integration drift'],
        },
        {
          option: 'Deep runtime validation',
          pros: ['Better for installer, adapter, runtime, and QuestMode changes'],
          cons: ['Slower and may need timeout-aware execution'],
        },
      ],
      recommendedOption: requiresRuntimeDepth(options) ? 'Deep runtime validation' : 'Focused validation plus evidence ledger',
      confidence: requiresRuntimeDepth(options) ? 0.88 : 0.72,
      evidence: [
        `Runtime parity reason: ${options.runtimeParity.reason}`,
        `Runtime reliability: ${options.runtimeReliability.verdict}`,
      ],
    },
    {
      id: 'collaboration-mode',
      decision: 'When should OpenAgent ask the user instead of proceeding?',
      options: [
        {
          option: 'Proceed with inferred implementation',
          pros: ['Keeps flow moving', 'Good when evidence is strong'],
          cons: ['Can encode the wrong product choice when requirements are ambiguous'],
        },
        {
          option: 'Pause for user choice',
          pros: ['Better for architecture/product direction', 'Prevents hidden scope drift'],
          cons: ['Adds a decision checkpoint'],
        },
      ],
      recommendedOption: options.productArchitect.architectureDecisionSuggestions.some((decision) => decision.status === 'needs-user-approval')
        ? 'Pause for user choice'
        : 'Proceed with inferred implementation and label assumptions',
      confidence: 0.8,
      evidence: options.productArchitect.architectureDecisionSuggestions.slice(0, 4).map((decision) => decision.title),
    },
  ]

  return {
    version: QUEST_DEEP_CODING_COLLABORATION_VERSION,
    tradeoffs,
    decisionPolicy: [
      'Prefer evidence-backed small slices for implementation.',
      'Escalate to user choice when a decision changes product behavior, architecture, compatibility, or roadmap.',
      'Use deep runtime validation for installer, adapter, runtime, and QuestMode surfaces.',
      'Record tradeoffs in the final summary when they affected the implementation path.',
    ],
  }
}

function buildBuildBetterRoadmapItems(options: BuildQuestDeepCodingCollaborationOptions): QuestBuildBetterRoadmapItem[] {
  const items: QuestBuildBetterRoadmapItem[] = [
    ...options.productArchitect.architectureNextSteps.slice(0, 4).map((step, index) => ({
      id: `architect-${String(index + 1).padStart(3, '0')}`,
      title: step.title,
      horizon: step.horizon,
      priority: step.priority,
      reason: step.rationale,
      suggestedCommand: step.suggestedCommand,
      evidence: step.evidence,
    })),
    ...options.verifiedDelivery.autoEvalGenerator.candidates.slice(0, 3).map((candidate, index) => ({
      id: `eval-${String(index + 1).padStart(3, '0')}`,
      title: candidate.title,
      horizon: 'next' as const,
      priority: candidate.priority,
      reason: candidate.reason,
      evidence: candidate.evidence,
    })),
    ...options.semanticRepoBrain.autoSkillBuilder.candidates.slice(0, 2).map((candidate, index) => ({
      id: `skill-${String(index + 1).padStart(3, '0')}`,
      title: candidate.title,
      horizon: 'later' as const,
      priority: 'medium' as const,
      reason: candidate.summary,
      suggestedCommand: candidate.approvalCommand,
      evidence: [`Evidence count: ${candidate.evidenceCount}`, `Candidate status: ${candidate.status}`],
    })),
  ]

  if (items.length === 0) {
    items.push({
      id: 'roadmap-001',
      title: 'Capture the next build slice after this Quest completes',
      horizon: 'next',
      priority: 'medium',
      reason: 'Deep collaboration should keep momentum from idea to build without starting hidden work automatically.',
      evidence: [`Objective: ${options.objective}`],
    })
  }

  return items.slice(0, 9)
}

function buildHardQuestions(options: BuildQuestDeepCodingCollaborationOptions): QuestDeepThinkingQuestion[] {
  const questions: QuestDeepThinkingQuestion[] = []
  const vague = options.objective.trim().split(/\s+/).length < 5
  if (vague || options.files.length === 0) {
    questions.push({
      id: 'scope-shape',
      question: 'What exact user-visible or developer-visible behavior should change?',
      whyItMatters: 'A vague idea can otherwise turn into broad, unreviewable implementation work.',
      status: options.files.length > 0 ? 'needs-code-reading' : 'needs-user-choice',
      evidence: [`Objective: ${options.objective}`, `Affected files: ${options.files.length}`],
      nextAction: options.files.length > 0
        ? 'Read affected files and infer the smallest behavior change.'
        : 'Ask the user to choose the first build slice or run discovery before editing.',
    })
  }
  if (options.impact.riskLevel === 'high') {
    questions.push({
      id: 'must-not-break',
      question: 'What behavior must not regress while implementing this?',
      whyItMatters: 'High-impact changes need explicit guardrails before code edits.',
      status: options.testRecommendations.length > 1 ? 'answered' : 'needs-user-choice',
      evidence: [options.impact.summary, `Tests selected: ${options.testRecommendations.length}`],
      nextAction: 'Run package/runtime validation and call out any untested behavior.',
    })
  }
  if (options.verifiedKnowledgebase.hallucinationGate.verdict !== 'pass') {
    questions.push({
      id: 'knowledge-proof',
      question: 'Which facts are still assumptions rather than verified repo knowledge?',
      whyItMatters: 'Smart coding depends on local truth, not guessed APIs or behavior.',
      status: 'needs-code-reading',
      evidence: [`Hallucination gate: ${options.verifiedKnowledgebase.hallucinationGate.verdict}`],
      nextAction: 'Refresh stale facts by reading source, tests, docs, or current external documentation when required.',
    })
  }
  if (options.runtimeReliability.verdict !== 'pass') {
    questions.push({
      id: 'runtime-proof',
      question: 'What runtime reliability evidence is missing before claiming done?',
      whyItMatters: 'Kimi/OpenAgent runtime issues can make a correct patch unreliable in practice.',
      status: 'needs-code-reading',
      evidence: [
        `Runtime reliability: ${options.runtimeReliability.verdict}`,
        `Claim ledger missing: ${options.runtimeReliability.claimLedger.summary.missing}`,
      ],
      nextAction: 'Use runtime doctor, timeout policy, and evidence replay before final completion claims.',
    })
  }
  if (options.productArchitect.productRiskRegister.some((risk) => risk.severity === 'high')) {
    questions.push({
      id: 'product-risk',
      question: 'Which product or architecture risk should be accepted, mitigated, or deferred?',
      whyItMatters: 'Deep collaboration keeps product tradeoffs explicit instead of burying them in code.',
      status: 'needs-user-choice',
      evidence: options.productArchitect.productRiskRegister
        .filter((risk) => risk.severity === 'high')
        .map((risk) => risk.title)
        .slice(0, 4),
      nextAction: 'Recommend options after completing the current request and wait for user choice.',
    })
  }
  if (questions.length === 0) {
    questions.push({
      id: 'better-build',
      question: 'What is the smallest better build step that improves this product after the current request?',
      whyItMatters: 'QuestMode should collaborate from idea to shipped improvement, then propose next steps.',
      status: 'answered',
      evidence: options.productArchitect.architectureNextSteps.slice(0, 3).map((step) => step.title),
      nextAction: 'Use build-better-roadmap.md after completion to suggest user-choice follow-ups.',
    })
  }
  return questions
}

function buildReasoningChecks(options: BuildQuestDeepCodingCollaborationOptions): QuestReasoningCheck[] {
  return [
    {
      id: 'local-context-first',
      title: 'Required local context is available before editing',
      status: options.files.length > 0 || options.semanticRepoBrain.semanticGraph.summary.nodes > 0 ? 'pass' : 'review',
      evidence: [`Files: ${options.files.length}`, `Semantic nodes: ${options.semanticRepoBrain.semanticGraph.summary.nodes}`],
      action: 'Read relevant files and sidecars before changing code.',
    },
    {
      id: 'requirements-compiled',
      title: 'Requirements are compiled into acceptance checks',
      status: options.intelligentCodingTeam.requirementCompiler.readiness === 'blocked'
        ? 'blocked'
        : options.intelligentCodingTeam.requirementCompiler.readiness === 'needs-clarification'
          ? 'review'
          : 'pass',
      evidence: [
        `Requirement readiness: ${options.intelligentCodingTeam.requirementCompiler.readiness}`,
        `Acceptance criteria: ${options.verifiedDelivery.acceptanceCompiler.criteria.length}`,
      ],
      action: 'Clarify or infer requirements before implementation; keep acceptance evidence current.',
    },
    {
      id: 'validation-selected',
      title: 'Validation strategy matches risk',
      status: options.testRecommendations.length === 0
        ? 'blocked'
        : options.impact.riskLevel === 'high' && options.testRecommendations.length < 2
          ? 'review'
          : 'pass',
      evidence: options.testRecommendations.map((test) => test.command).slice(0, 8),
      action: 'Select focused and runtime validation before completion.',
    },
    {
      id: 'runtime-claims-proven',
      title: 'Runtime and completion claims have replayable proof',
      status: options.runtimeReliability.claimLedger.summary.blocked > 0
        ? 'blocked'
        : options.runtimeReliability.claimLedger.summary.missing > 0
          ? 'review'
          : 'pass',
      evidence: [
        `Verified claims: ${options.runtimeReliability.claimLedger.summary.verified}`,
        `Missing claims: ${options.runtimeReliability.claimLedger.summary.missing}`,
        `Blocked claims: ${options.runtimeReliability.claimLedger.summary.blocked}`,
      ],
      action: 'Use claim-ledger.json and evidence-replay.md before final summary.',
    },
    {
      id: 'next-step-collaboration',
      title: 'After completion, OpenAgent recommends next steps and waits',
      status: options.productArchitect.architectureNextSteps.length > 0 ? 'pass' : 'review',
      evidence: options.productArchitect.architectureNextSteps.slice(0, 5).map((step) => step.title),
      action: 'Suggest practical build/product follow-ups instead of starting hidden work.',
    },
  ]
}

function buildAssumptions(options: BuildQuestDeepCodingCollaborationOptions): QuestDeepThinkingReview['assumptions'] {
  return [
    {
      statement: 'The current objective should be implemented as a bounded Quest build slice.',
      confidence: options.files.length > 0 ? 0.82 : 0.55,
      evidence: [`Objective: ${options.objective}`, `Files: ${options.files.length}`],
    },
    {
      statement: 'Existing repo patterns should be preferred over new abstractions unless the sidecars show repeated complexity.',
      confidence: options.semanticRepoBrain.knowledgeConfidenceScore.overall,
      evidence: [
        `Knowledge confidence: ${options.semanticRepoBrain.knowledgeConfidenceScore.overall}`,
        `AST facts: ${options.semanticRepoBrain.knowledgeConfidenceScore.facts.length}`,
      ],
    },
    {
      statement: 'Runtime-facing QuestMode changes require Kimi/OpenCode/Codex parity checks.',
      confidence: requiresRuntimeDepth(options) ? 0.9 : 0.65,
      evidence: [`Runtime parity: ${options.runtimeParity.reason}`],
    },
  ]
}

function deepCodingVerdict(
  hardQuestions: QuestDeepThinkingQuestion[],
  checks: QuestReasoningCheck[],
  options: BuildQuestDeepCodingCollaborationOptions,
): QuestDeepCodingVerdict {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked'
  if (hardQuestions.some((question) => question.status === 'needs-user-choice')) return 'review'
  if (checks.some((check) => check.status === 'review')) return 'review'
  if (options.verifiedDelivery.releaseReadinessDashboard.verdict === 'blocked') return 'blocked'
  return 'ready'
}

function scoreDepth(
  hardQuestions: QuestDeepThinkingQuestion[],
  checks: QuestReasoningCheck[],
  options: BuildQuestDeepCodingCollaborationOptions,
): number {
  let score = 50
  score += Math.min(options.files.length, 10)
  score += Math.min(options.testRecommendations.length * 4, 16)
  score += checks.filter((check) => check.status === 'pass').length * 6
  score += hardQuestions.filter((question) => question.status === 'answered').length * 4
  score -= checks.filter((check) => check.status === 'blocked').length * 18
  score -= checks.filter((check) => check.status === 'review').length * 8
  score -= hardQuestions.filter((question) => question.status === 'needs-user-choice').length * 10
  score -= options.runtimeReliability.verdict === 'blocked' ? 15 : options.runtimeReliability.verdict === 'review' ? 6 : 0
  return Math.max(0, Math.min(100, score))
}

function productGoal(options: BuildQuestDeepCodingCollaborationOptions): string {
  const firstValue = options.productArchitect.userValueMatrix[0]?.value
  if (firstValue) return firstValue
  if (options.objective.toLowerCase().includes('coding')) {
    return 'Make coding work faster, smarter, more collaborative, and more evidence-grounded.'
  }
  return `Deliver the requested outcome with verified code and clear next-step collaboration: ${options.objective}`
}

function inferNonGoals(options: BuildQuestDeepCodingCollaborationOptions): string[] {
  const nonGoals = [
    'Do not start follow-up roadmap work automatically after completing the current request.',
    'Do not promote repeated learnings into durable skills without user approval.',
    'Do not claim unverified runtime or code behavior as complete.',
  ]
  if (options.impact.riskLevel === 'high') {
    nonGoals.push('Do not perform broad architectural rewrites without explicit user approval.')
  }
  return nonGoals
}

function strategyFor(options: BuildQuestDeepCodingCollaborationOptions): string {
  if (requiresRuntimeDepth(options)) {
    return 'Use a timeout-aware, runtime-parity implementation strategy: inspect sidecars, patch small, run package checks, then Kimi/OpenCode/Codex smoke where relevant.'
  }
  if (options.impact.riskLevel === 'high') {
    return 'Use a high-assurance implementation strategy: read impacted files, limit the patch, run focused plus package validation, and surface remaining risks.'
  }
  return 'Use a focused idea-to-build strategy: clarify outcome, preserve patterns, implement the smallest useful slice, validate, then recommend next steps.'
}

function validationStrategy(options: BuildQuestDeepCodingCollaborationOptions): string[] {
  const strategy = options.testRecommendations.map((test) => `${test.command} - ${test.reason}`).slice(0, 8)
  if (requiresRuntimeDepth(options)) {
    strategy.push('Run Kimi/OpenAgent runtime smoke after install/update when adapter or QuestMode behavior changes.')
  }
  strategy.push('Run evidence replay before final completion claims.')
  return unique(strategy)
}

function requiresRuntimeDepth(options: BuildQuestDeepCodingCollaborationOptions): boolean {
  const runtimeFiles = options.files.some((file) =>
    file.includes('kimi-code')
    || file.includes('codex-cli')
    || file.includes('.opencode/')
    || file.includes('runtime')
    || file.includes('quest-')
    || file === 'install.sh'
    || file === 'update.sh',
  )
  return runtimeFiles || !options.runtimeParity.opencode || !options.runtimeParity.kimi || !options.runtimeParity.codex
}

function formatBuildBetterRoadmap(collaboration: QuestDeepCodingCollaborationOS): string {
  const lines = [
    '# Quest v19 Build Better Roadmap',
    '',
    `- Version: ${collaboration.version}`,
    `- Objective: ${collaboration.objective}`,
    `- Verdict: ${collaboration.verdict}`,
    `- Depth score: ${collaboration.depthScore}`,
    '',
    '## Roadmap',
    '',
  ]

  for (const item of collaboration.buildBetterRoadmap) {
    lines.push(`- **${item.horizon}/${item.priority}:** ${item.title}`)
    lines.push(`  - ${item.reason}`)
    if (item.suggestedCommand) lines.push(`  - Command: \`${item.suggestedCommand}\``)
  }
  if (collaboration.buildBetterRoadmap.length === 0) {
    lines.push('_No build-better roadmap items generated._')
  }

  lines.push('', '## Collaboration Rules', '')
  for (const rule of collaboration.deepThinkingReview.completionRules) {
    lines.push(`- ${rule}`)
  }

  return `${lines.join('\n')}\n`
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

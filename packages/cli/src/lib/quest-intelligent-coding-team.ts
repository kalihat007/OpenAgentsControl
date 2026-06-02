/**
 * Quest Intelligent Coding Team OS (v15).
 *
 * Deterministic team layer that turns Quest sidecars into a shared coding-team
 * operating board: requirement compiler, expert blackboard, change-impact
 * simulator, and project skill-pack builder.
 */

import { createHash } from 'node:crypto'
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
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_INTELLIGENT_CODING_TEAM_VERSION = '15' as const

export type RequirementReadiness = 'ready' | 'needs-clarification' | 'blocked'
export type ExpertRole =
  | 'team-lead'
  | 'architect'
  | 'coder'
  | 'reviewer'
  | 'test-engineer'
  | 'security'
  | 'devops'
  | 'docs'
  | 'product'

export interface QuestCompiledRequirement {
  id: string
  statement: string
  type: 'functional' | 'non-functional' | 'validation' | 'constraint'
  source: 'objective' | 'quest-event' | 'patch-capsule' | 'artifact' | 'inferred'
  confidence: number
  evidence: string[]
}

export interface QuestRequirementCompiler {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  readiness: RequirementReadiness
  confidence: number
  objective: string
  requirements: QuestCompiledRequirement[]
  nonGoals: string[]
  acceptanceCriteria: string[]
  clarifyingQuestions: string[]
  researchGate: {
    needed: boolean
    reason: string
    queries: string[]
  }
}

export interface QuestTeamExpert {
  id: string
  role: ExpertRole
  title: string
  status: 'active' | 'standby' | 'blocked'
  responsibilities: string[]
  files: string[]
  evidence: string[]
}

export interface QuestTeamWorkItem {
  id: string
  title: string
  owner: ExpertRole
  status: 'ready' | 'in-progress' | 'blocked' | 'waiting-review'
  files: string[]
  dependencies: string[]
  acceptance: string[]
}

export interface QuestExpertTeamBlackboard {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  roster: QuestTeamExpert[]
  workItems: QuestTeamWorkItem[]
  sharedContext: {
    currentFiles: string[]
    affectedModules: string[]
    requiredSidecars: string[]
    openQuestions: string[]
  }
  fileLocks: Array<{ file: string; owner: ExpertRole; mode: 'read' | 'write'; reason: string }>
  coordinationRules: string[]
}

export interface QuestChangeImpactSimulator {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  blastRadius: 'low' | 'medium' | 'high'
  confidence: number
  predictedSurfaces: Array<{
    id: string
    kind: 'file' | 'module' | 'test' | 'runtime' | 'docs' | 'schema' | 'command'
    name: string
    risk: 'low' | 'medium' | 'high'
    reason: string
    validation: string[]
  }>
  dependencyWalk: {
    directlyAffected: string[]
    transitivelyAffected: string[]
    coChangeNeighbors: Array<{ file: string; neighbors: string[] }>
  }
  riskScenarios: Array<{
    id: string
    title: string
    severity: 'low' | 'medium' | 'high'
    trigger: string
    mitigation: string
  }>
  validationPlan: string[]
}

export interface QuestProjectSkillCandidate {
  id: string
  name: string
  title: string
  summary: string
  source: 'approved-memory-candidate' | 'repo-pattern' | 'validation-pattern' | 'runtime-pattern'
  status: 'pending-user-approval' | 'approved-for-build' | 'rejected'
  confidence: number
  evidence: string[]
  approvalCommand?: string
  buildPlan: string[]
}

export interface QuestProjectSkillPackBuilder {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  candidates: QuestProjectSkillCandidate[]
  projectPlaybook: {
    stack: string[]
    commands: string[]
    conventions: string[]
    riskPolicies: string[]
  }
  approvalPolicy: string[]
}

export interface QuestIntelligentTeamGate {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  verdict: 'pass' | 'review' | 'blocked'
  checks: Array<{
    id: string
    status: 'pass' | 'review' | 'blocked'
    title: string
    evidence: string[]
    recommendation: string
  }>
}

export interface QuestIntelligentCodingTeam {
  version: typeof QUEST_INTELLIGENT_CODING_TEAM_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  requirementCompiler: QuestRequirementCompiler
  expertTeamBlackboard: QuestExpertTeamBlackboard
  changeImpactSimulator: QuestChangeImpactSimulator
  projectSkillPackBuilder: QuestProjectSkillPackBuilder
  teamGate: QuestIntelligentTeamGate
}

export interface BuildQuestIntelligentCodingTeamOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

export function buildQuestIntelligentCodingTeam(
  options: BuildQuestIntelligentCodingTeamOptions,
): QuestIntelligentCodingTeam {
  const generatedAt = new Date().toISOString()
  const requirementCompiler = buildRequirementCompiler(options)
  const expertTeamBlackboard = buildExpertTeamBlackboard(options, requirementCompiler)
  const changeImpactSimulator = buildChangeImpactSimulator(options)
  const projectSkillPackBuilder = buildProjectSkillPackBuilder(options)
  const teamGate = buildTeamGate(requirementCompiler, expertTeamBlackboard, changeImpactSimulator, projectSkillPackBuilder)

  return {
    version: QUEST_INTELLIGENT_CODING_TEAM_VERSION,
    generatedAt,
    projectRoot: options.projectRoot,
    objective: options.objective,
    requirementCompiler,
    expertTeamBlackboard,
    changeImpactSimulator,
    projectSkillPackBuilder,
    teamGate,
  }
}

export async function writeQuestIntelligentCodingTeamArtifacts(
  dir: string,
  team: QuestIntelligentCodingTeam,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'intelligent-coding-team.json'), team),
    writeJson(join(dir, 'requirement-compiler.json'), team.requirementCompiler),
    writeJson(join(dir, 'expert-team-blackboard.json'), team.expertTeamBlackboard),
    writeJson(join(dir, 'change-impact-simulator.json'), team.changeImpactSimulator),
    writeJson(join(dir, 'project-skill-pack-builder.json'), team.projectSkillPackBuilder),
    writeFile(join(dir, 'intelligent-coding-team.md'), formatIntelligentCodingTeamBrief(team)),
  ])
}

export function formatIntelligentCodingTeamSummary(team: QuestIntelligentCodingTeam): string {
  return [
    '## Intelligent Coding Team OS',
    '',
    `- Requirement readiness: ${team.requirementCompiler.readiness}`,
    `- Team experts: ${team.expertTeamBlackboard.roster.length}`,
    `- Work items: ${team.expertTeamBlackboard.workItems.length}`,
    `- Blast radius: ${team.changeImpactSimulator.blastRadius}`,
    `- Skill candidates: ${team.projectSkillPackBuilder.candidates.length}`,
    `- Team gate: ${team.teamGate.verdict}`,
  ].join('\n')
}

function formatIntelligentCodingTeamBrief(team: QuestIntelligentCodingTeam): string {
  const lines = [
    '# Intelligent Coding Team OS',
    '',
    `- Version: ${team.version}`,
    `- Objective: ${team.objective}`,
    `- Generated: ${team.generatedAt}`,
    `- Requirement readiness: ${team.requirementCompiler.readiness}`,
    `- Team gate: ${team.teamGate.verdict}`,
    '',
    '## Requirements',
    '',
    ...team.requirementCompiler.requirements
      .slice(0, 12)
      .map((requirement) => `- **${requirement.type}:** ${requirement.statement}`),
    '',
    '## Expert Blackboard',
    '',
    ...team.expertTeamBlackboard.roster
      .map((expert) => `- **${expert.title}:** ${expert.status}; files ${expert.files.length}`),
    '',
    '## Impact Simulation',
    '',
    `- Blast radius: ${team.changeImpactSimulator.blastRadius}`,
    ...team.changeImpactSimulator.riskScenarios
      .slice(0, 8)
      .map((scenario) => `- **${scenario.severity}:** ${scenario.title} - ${scenario.mitigation}`),
    '',
    '## Skill Pack Builder',
    '',
    ...team.projectSkillPackBuilder.candidates
      .slice(0, 8)
      .map((candidate) => `- **${candidate.status}:** ${candidate.name} - ${candidate.summary}`),
    '',
    '## Team Gate',
    '',
    ...team.teamGate.checks.map((check) => `- **${check.status}:** ${check.title} - ${check.recommendation}`),
    '',
  ]
  return lines.join('\n')
}

function buildRequirementCompiler(options: BuildQuestIntelligentCodingTeamOptions): QuestRequirementCompiler {
  const objective = options.objective.trim() || 'Current coding task'
  const lower = objective.toLowerCase()
  const vague = /\b(do it|fix everything|make better|improve|all|everything|smart|intelligent)\b/.test(lower)
  const blocked = options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked'
    || options.semanticRepoBrain.completionGate.verdict === 'blocked'
  const readiness: RequirementReadiness = blocked
    ? 'blocked'
    : vague && options.files.length === 0
      ? 'needs-clarification'
      : 'ready'
  const requirements: QuestCompiledRequirement[] = [
    {
      id: stableId(`objective:${objective}`),
      statement: objective,
      type: 'functional',
      source: 'objective',
      confidence: readiness === 'needs-clarification' ? 0.64 : 0.86,
      evidence: ['user objective'],
    },
    ...options.patchCapsules.slice(0, 8).map((capsule) => ({
      id: stableId(`capsule:${capsule.id}`),
      statement: capsule.expectedBehavior,
      type: 'functional' as const,
      source: 'patch-capsule' as const,
      confidence: 0.78,
      evidence: [capsule.id, ...capsule.files.slice(0, 4)],
    })),
    ...options.testRecommendations.slice(0, 6).map((test) => ({
      id: stableId(`validation:${test.command}`),
      statement: `Validate with ${test.command}`,
      type: 'validation' as const,
      source: 'artifact' as const,
      confidence: test.confidence,
      evidence: [test.reason],
    })),
    {
      id: 'req-no-hallucination',
      statement: 'Do not claim files, commands, symbols, APIs, docs, or test results without local evidence.',
      type: 'constraint',
      source: 'artifact',
      confidence: 0.94,
      evidence: ['hallucination-gate.json', 'evidence-ledger.json'],
    },
  ]

  return {
    version: QUEST_INTELLIGENT_CODING_TEAM_VERSION,
    readiness,
    confidence: average(requirements.map((requirement) => requirement.confidence)),
    objective,
    requirements,
    nonGoals: [
      'Do not silently promote memories or skills without user approval.',
      'Do not edit unrelated files outside the requirement and patch capsule scope.',
      'Do not skip validation when runtime, installer, or prompt surfaces change.',
    ],
    acceptanceCriteria: buildAcceptanceCriteria(options),
    clarifyingQuestions: readiness === 'needs-clarification'
      ? [
          'Which exact files, command, runtime, or user-facing behavior should change?',
          'What validation must pass before this Quest can be called complete?',
        ]
      : [],
    researchGate: {
      needed: options.codingAutopilot.dependencyResearchGate.needed,
      reason: options.codingAutopilot.dependencyResearchGate.reason,
      queries: options.codingAutopilot.dependencyResearchGate.queries,
    },
  }
}

function buildExpertTeamBlackboard(
  options: BuildQuestIntelligentCodingTeamOptions,
  compiler: QuestRequirementCompiler,
): QuestExpertTeamBlackboard {
  const roles = selectRoles(options)
  const roster = roles.map((role) => buildExpert(role, options))
  const workItems = options.patchCapsules.length > 0
    ? options.patchCapsules.map((capsule, index) => ({
        id: capsule.id,
        title: capsule.summary,
        owner: ownerForFiles(capsule.files),
        status: compiler.readiness === 'blocked' ? 'blocked' as const : 'ready' as const,
        files: capsule.files,
        dependencies: index === 0 ? [] : [options.patchCapsules[index - 1]?.id ?? 'previous-capsule'],
        acceptance: capsule.validationCommands.length > 0 ? capsule.validationCommands : compiler.acceptanceCriteria,
      }))
    : [{
        id: 'team-work-001',
        title: compiler.objective,
        owner: 'team-lead' as const,
        status: compiler.readiness === 'blocked' ? 'blocked' as const : 'ready' as const,
        files: options.files,
        dependencies: [],
        acceptance: compiler.acceptanceCriteria,
      }]

  return {
    version: QUEST_INTELLIGENT_CODING_TEAM_VERSION,
    roster,
    workItems,
    sharedContext: {
      currentFiles: options.files,
      affectedModules: affectedModules(options),
      requiredSidecars: [
        'requirement-compiler.json',
        'expert-team-blackboard.json',
        'change-impact-simulator.json',
        'project-skill-pack-builder.json',
        'intelligent-coding-team.json',
      ],
      openQuestions: compiler.clarifyingQuestions,
    },
    fileLocks: buildFileLocks(options.files),
    coordinationRules: [
      'Team Lead owns requirement readiness and final Quest state.',
      'Coder owns implementation files only after Requirement Compiler readiness is ready.',
      'Reviewer and Test Engineer must inspect patch capsules before COMPLETE.',
      'Security owns secret/destructive-risk findings and can block completion.',
      'Every agent writes append-only events; quest.json remains immutable runtime state.',
    ],
  }
}

function buildChangeImpactSimulator(options: BuildQuestIntelligentCodingTeamOptions): QuestChangeImpactSimulator {
  const commands = options.testRecommendations.map((test) => test.command)
  const runtimeFiles = options.semanticRepoBrain.semanticGraph.nodes
    .filter((node) => node.kind === 'runtime-prompt')
    .map((node) => node.path)
    .filter((path): path is string => Boolean(path))
  const docFiles = options.files.filter((file) => /\.(md|mdx)$/i.test(file))
  const schemaFiles = options.files.filter((file) => /(schema|zod|types?|contract)/i.test(file))
  const predictedSurfaces = unique([
    ...options.files.map((file) => surface('file', file, options.impact.riskLevel, 'Changed or directly relevant file', commands)),
    ...affectedModules(options).map((module) => surface('module', module, options.impact.riskLevel, 'Module affected by selected files', commands)),
    ...commands.map((command) => surface('test', command, 'medium', 'Recommended validation command', [command])),
    ...runtimeFiles.slice(0, 8).map((file) => surface('runtime', file, 'medium', 'Runtime prompt may need parity with sidecar contract', commands)),
    ...docFiles.map((file) => surface('docs', file, 'low', 'Documentation changed or should explain behavior', commands)),
    ...schemaFiles.map((file) => surface('schema', file, 'high', 'Schema or contract surface should be watched for drift', commands)),
  ], (item) => `${item.kind}:${item.name}`)

  return {
    version: QUEST_INTELLIGENT_CODING_TEAM_VERSION,
    blastRadius: options.impact.riskLevel,
    confidence: clamp(0.58 + (options.files.length > 0 ? 0.14 : 0) + (commands.length > 0 ? 0.14 : 0) + (options.temporalMemory.history.commitsScanned > 0 ? 0.08 : 0)),
    predictedSurfaces,
    dependencyWalk: {
      directlyAffected: options.impact.directlyAffected,
      transitivelyAffected: options.impact.transitivelyAffected,
      coChangeNeighbors: options.files.slice(0, 20).map((file) => ({
        file,
        neighbors: (options.temporalMemory.history.coChange[file] ?? []).map((entry) => entry.file).slice(0, 6),
      })),
    },
    riskScenarios: buildRiskScenarios(options),
    validationPlan: unique([
      ...commands,
      ...options.codingExecution.runtimeCompatibilityMatrix.commands,
      ...options.verifiedKnowledgebase.staleKnowledgeReport.refreshCommands,
    ]).slice(0, 12),
  }
}

function buildProjectSkillPackBuilder(options: BuildQuestIntelligentCodingTeamOptions): QuestProjectSkillPackBuilder {
  const approvedOrPending = options.semanticRepoBrain.autoSkillBuilder.candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.suggestedSkillName,
    title: candidate.title,
    summary: candidate.summary,
    source: 'approved-memory-candidate' as const,
    status: candidate.status,
    confidence: candidate.confidence,
    evidence: [`occurrences:${candidate.occurrenceCount}`, `evidence:${candidate.evidenceCount}`],
    approvalCommand: candidate.approvalCommand,
    buildPlan: candidate.buildPlan,
  }))
  const inferred = inferSkillCandidates(options)

  return {
    version: QUEST_INTELLIGENT_CODING_TEAM_VERSION,
    candidates: unique([...approvedOrPending, ...inferred], (candidate) => candidate.id).slice(0, 20),
    projectPlaybook: {
      stack: [
        ...options.index.techStack.languages,
        ...options.index.techStack.frameworks,
        ...options.index.techStack.buildTools,
      ].slice(0, 20),
      commands: options.testRecommendations.map((test) => test.command).slice(0, 12),
      conventions: [
        `fileNaming:${options.index.conventions.fileNaming}`,
        `testPattern:${options.index.conventions.testPattern}`,
        `importStyle:${options.index.conventions.importStyle}`,
        `errorHandling:${options.index.conventions.errorHandling}`,
      ],
      riskPolicies: [
        'Use approval before destructive, secret, production, or paid external actions.',
        'Use local evidence before claims; unresolved evidence keeps the team gate in review.',
        'Promote reusable skills only through user approval.',
      ],
    },
    approvalPolicy: [
      'Skill candidates are suggestions only until the user approves them.',
      'Repeated successful workflows should enter the promotion queue before becoming durable skills.',
      'A skill pack must include trigger, context, commands, failure modes, and verification evidence.',
    ],
  }
}

function buildTeamGate(
  compiler: QuestRequirementCompiler,
  blackboard: QuestExpertTeamBlackboard,
  simulator: QuestChangeImpactSimulator,
  skillBuilder: QuestProjectSkillPackBuilder,
): QuestIntelligentTeamGate {
  const checks: QuestIntelligentTeamGate['checks'] = [
    {
      id: 'requirements-compiled',
      status: compiler.readiness === 'blocked' ? 'blocked' : compiler.readiness === 'ready' ? 'pass' : 'review',
      title: 'Requirements are compiled before coding',
      evidence: compiler.requirements.map((requirement) => requirement.id).slice(0, 8),
      recommendation: compiler.readiness === 'ready'
        ? 'Proceed with scoped implementation.'
        : 'Resolve clarifying questions before broad edits.',
    },
    {
      id: 'team-roster-ready',
      status: blackboard.roster.some((expert) => expert.status === 'active') ? 'pass' : 'review',
      title: 'Expert team has active owners',
      evidence: blackboard.roster.map((expert) => expert.title),
      recommendation: 'Keep file locks and task ownership visible in expert-team-blackboard.json.',
    },
    {
      id: 'impact-simulated',
      status: simulator.predictedSurfaces.length > 0 ? 'pass' : 'review',
      title: 'Change impact is predicted before edits',
      evidence: simulator.predictedSurfaces.map((surface) => `${surface.kind}:${surface.name}`).slice(0, 8),
      recommendation: 'Use change-impact-simulator.json to select validation and review surfaces.',
    },
    {
      id: 'skill-promotion-gated',
      status: skillBuilder.candidates.every((candidate) => candidate.status !== 'approved-for-build' || candidate.approvalCommand) ? 'pass' : 'review',
      title: 'Project skill candidates remain approval-gated',
      evidence: skillBuilder.candidates.map((candidate) => `${candidate.name}:${candidate.status}`).slice(0, 8),
      recommendation: 'Do not write durable skills without explicit user approval.',
    },
  ]
  const verdict = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'review')
      ? 'review'
      : 'pass'
  return { version: QUEST_INTELLIGENT_CODING_TEAM_VERSION, verdict, checks }
}

function selectRoles(options: BuildQuestIntelligentCodingTeamOptions): ExpertRole[] {
  const roles: ExpertRole[] = ['team-lead', 'architect', 'coder', 'reviewer', 'test-engineer']
  if (options.codingExecution.securitySecretsGate.verdict !== 'pass' || options.files.some((file) => /auth|security|secret|token|crypto/i.test(file))) roles.push('security')
  if (options.runtimeParity.kimi || options.runtimeParity.codex || options.runtimeParity.opencode || options.files.some((file) => /plugin|runtime|install|update|package\.json|\.ya?ml|\.toml/i.test(file))) roles.push('devops')
  if (options.files.some((file) => /\.(md|mdx)$/i.test(file))) roles.push('docs')
  if (options.objective.length > 0) roles.push('product')
  return unique(roles)
}

function buildExpert(role: ExpertRole, options: BuildQuestIntelligentCodingTeamOptions): QuestTeamExpert {
  const fileMatchers: Record<ExpertRole, RegExp[]> = {
    'team-lead': [/.*/],
    architect: [/schema|contract|runtime|package|architecture|index|types?/i],
    coder: [/\.(ts|tsx|js|jsx|go|rs|py|sh)$/i],
    reviewer: [/.*/],
    'test-engineer': [/test|spec|vitest|bun|playwright|scripts\/tests/i],
    security: [/auth|security|secret|token|crypto|permission/i],
    devops: [/install|update|package\.json|\.github|plugin|runtime|\.ya?ml|\.toml/i],
    docs: [/\.(md|mdx)$/i],
    product: [/README|docs|context|quest|agent/i],
  }
  const files = role === 'team-lead'
    ? options.files.slice(0, 30)
    : options.files.filter((file) => fileMatchers[role].some((pattern) => pattern.test(file))).slice(0, 30)
  const status = role === 'security' && options.codingExecution.securitySecretsGate.verdict === 'blocked'
    ? 'blocked'
    : files.length > 0 || role === 'team-lead' || role === 'reviewer' || role === 'product'
      ? 'active'
      : 'standby'
  return {
    id: `expert-${role}`,
    role,
    title: roleTitle(role),
    status,
    responsibilities: responsibilities(role),
    files,
    evidence: [
      `impact:${options.impact.riskLevel}`,
      `tests:${options.testRecommendations.length}`,
      `reviewSignals:${options.reviewSignals.length}`,
    ],
  }
}

function buildAcceptanceCriteria(options: BuildQuestIntelligentCodingTeamOptions): string[] {
  return unique([
    'Requirement Compiler is ready or explicitly marked for review before implementation.',
    ...options.patchCapsules.flatMap((capsule) => capsule.validationCommands),
    ...options.testRecommendations.map((test) => test.command),
    'Review signals are resolved or acknowledged before COMPLETE.',
    'Next steps are suggested after completion and the agent waits for the user.',
  ]).slice(0, 20)
}

function buildFileLocks(files: string[]): QuestExpertTeamBlackboard['fileLocks'] {
  return files.slice(0, 40).map((file) => ({
    file,
    owner: ownerForFiles([file]),
    mode: 'write',
    reason: 'Prevent parallel expert write conflicts while preserving fast team execution.',
  }))
}

function buildRiskScenarios(options: BuildQuestIntelligentCodingTeamOptions): QuestChangeImpactSimulator['riskScenarios'] {
  const scenarios: QuestChangeImpactSimulator['riskScenarios'] = []
  if (options.impact.riskLevel === 'high') {
    scenarios.push({
      id: 'risk-high-blast-radius',
      title: 'High blast-radius edit may affect transitive modules',
      severity: 'high',
      trigger: options.impact.summary,
      mitigation: 'Run package/unit validation plus runtime smoke checks before COMPLETE.',
    })
  }
  if (!options.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered) {
    scenarios.push({
      id: 'risk-runtime-parity',
      title: 'Runtime adapter parity may drift',
      severity: 'medium',
      trigger: 'Runtime compatibility matrix is not fully covered.',
      mitigation: 'Update OpenCode/Kimi/Codex/Claude prompts and run matching smoke scripts.',
    })
  }
  if (options.codingExecution.testGapFinder.gaps.length > 0) {
    scenarios.push({
      id: 'risk-test-gap',
      title: 'Changed source has missing nearby tests',
      severity: 'medium',
      trigger: `${options.codingExecution.testGapFinder.gaps.length} test gaps detected.`,
      mitigation: 'Add focused tests or document why existing validation is sufficient.',
    })
  }
  if (options.temporalMemory.chronicCommands.length > 0) {
    scenarios.push({
      id: 'risk-chronic-failure',
      title: 'Known chronic failure commands need escalation',
      severity: 'high',
      trigger: options.temporalMemory.chronicCommands.slice(0, 3).join(', '),
      mitigation: 'Do not retry blindly; inspect known fixes and choose an alternative validation path.',
    })
  }
  if (scenarios.length === 0) {
    scenarios.push({
      id: 'risk-standard-review',
      title: 'Standard coding review risk',
      severity: 'low',
      trigger: 'No high-risk sidecar signal detected.',
      mitigation: 'Run minimum credible validation and refresh Quest sidecars.',
    })
  }
  return scenarios
}

function inferSkillCandidates(options: BuildQuestIntelligentCodingTeamOptions): QuestProjectSkillCandidate[] {
  const candidates: QuestProjectSkillCandidate[] = []
  if (options.testRecommendations.length > 0) {
    candidates.push(skillCandidate(
      'project-validation-playbook',
      'Project Validation Playbook',
      'Capture the minimum credible validation ladder for this repository.',
      'validation-pattern',
      options.testRecommendations.map((test) => test.command),
    ))
  }
  if (options.runtimeParity.kimi || options.runtimeParity.codex || options.runtimeParity.opencode) {
    candidates.push(skillCandidate(
      'runtime-adapter-parity-playbook',
      'Runtime Adapter Parity Playbook',
      'Capture the prompt, installer, and smoke-test checklist for keeping OpenAgent runtimes aligned.',
      'runtime-pattern',
      ['runtime-parity-enforcer.json', 'runtime-compatibility-matrix.json'],
    ))
  }
  if (options.index.techStack.languages.length > 0) {
    candidates.push(skillCandidate(
      'repo-coding-conventions-playbook',
      'Repository Coding Conventions Playbook',
      'Capture stack, naming, imports, tests, and error-handling conventions for faster future coding.',
      'repo-pattern',
      [
        `languages:${options.index.techStack.languages.join(',')}`,
        `testPattern:${options.index.conventions.testPattern}`,
      ],
    ))
  }
  return candidates
}

function skillCandidate(
  name: string,
  title: string,
  summary: string,
  source: QuestProjectSkillCandidate['source'],
  evidence: string[],
): QuestProjectSkillCandidate {
  return {
    id: stableId(`skill:${name}:${evidence.join('|')}`),
    name,
    title,
    summary,
    source,
    status: 'pending-user-approval',
    confidence: evidence.length > 1 ? 0.74 : 0.62,
    evidence: evidence.slice(0, 8),
    approvalCommand: `oac memory-promote --approve ${name}`,
    buildPlan: [
      'Confirm repeated usefulness with the user.',
      'Write trigger, required context, commands, failure modes, and verification evidence.',
      'Install only after explicit approval.',
    ],
  }
}

function affectedModules(options: BuildQuestIntelligentCodingTeamOptions): string[] {
  return unique(options.files.flatMap((file) => {
    const module = options.index.modules.find((candidate) => candidate.path === file || candidate.path.endsWith(file))
    return module ? [`${module.type}:${module.path}`] : []
  })).slice(0, 30)
}

function ownerForFiles(files: string[]): ExpertRole {
  const joined = files.join(' ')
  if (/test|spec|scripts\/tests/i.test(joined)) return 'test-engineer'
  if (/auth|security|secret|token|crypto/i.test(joined)) return 'security'
  if (/install|update|package\.json|plugin|runtime|\.ya?ml|\.toml/i.test(joined)) return 'devops'
  if (/\.(md|mdx)$/i.test(joined)) return 'docs'
  return 'coder'
}

function roleTitle(role: ExpertRole): string {
  const titles: Record<ExpertRole, string> = {
    'team-lead': 'Team Lead',
    architect: 'System Architect',
    coder: 'Coder',
    reviewer: 'Code Reviewer',
    'test-engineer': 'Test Engineer',
    security: 'Security Reviewer',
    devops: 'Runtime/DevOps Engineer',
    docs: 'Documentation Engineer',
    product: 'Requirement/Product Analyst',
  }
  return titles[role]
}

function responsibilities(role: ExpertRole): string[] {
  const map: Record<ExpertRole, string[]> = {
    'team-lead': ['maintain Quest state', 'coordinate experts', 'decide completion gate'],
    architect: ['map blast radius', 'watch contracts', 'align module boundaries'],
    coder: ['implement patch capsules', 'preserve local conventions', 'append file_change events'],
    reviewer: ['inspect risk signals', 'map findings to patches', 'block unsafe completion'],
    'test-engineer': ['choose smart tests', 'close test gaps', 'verify evidence'],
    security: ['check secrets/destructive risk', 'enforce approval gates', 'review sensitive changes'],
    devops: ['keep runtime/install prompts aligned', 'validate CLI and shell harnesses', 'watch package scripts'],
    docs: ['update docs and repo wiki context', 'keep user-facing instructions accurate'],
    product: ['compile requirements', 'track non-goals', 'suggest next steps'],
  }
  return map[role]
}

function surface(
  kind: QuestChangeImpactSimulator['predictedSurfaces'][number]['kind'],
  name: string,
  risk: QuestChangeImpactSimulator['predictedSurfaces'][number]['risk'],
  reason: string,
  validation: string[],
): QuestChangeImpactSimulator['predictedSurfaces'][number] {
  return { id: stableId(`${kind}:${name}`), kind, name, risk, reason, validation: validation.slice(0, 5) }
}

function stableId(input: string): string {
  return `ict-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

function unique<T>(items: T[], key?: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const value = key ? key(item) : String(item)
    if (seen.has(value)) continue
    seen.add(value)
    result.push(item)
  }
  return result
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

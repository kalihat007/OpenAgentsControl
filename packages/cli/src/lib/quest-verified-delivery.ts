/**
 * Quest v16 Verified Coding Delivery OS.
 *
 * Deterministic delivery layer that turns the v9-v16 coding sidecars into
 * acceptance, evidence, provenance, runtime-cycle, eval, debate, and release
 * readiness artifacts.
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
import type { QuestVerifiedKnowledgebase, QuestEvidenceStatus } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_VERIFIED_DELIVERY_VERSION = '16' as const

export type QuestDeliveryVerdict = 'pass' | 'review' | 'blocked'
export type QuestAcceptanceStatus = 'satisfied' | 'pending' | 'blocked'
export type QuestDeliveryEvidenceStatus =
  | 'verified'
  | 'inferred'
  | 'stale'
  | 'missing'
  | 'needs-research'

export interface QuestAcceptanceCriterion {
  id: string
  statement: string
  source: 'requirement-compiler' | 'patch-capsule' | 'smart-test' | 'runtime' | 'inferred'
  status: QuestAcceptanceStatus
  evidence: string[]
  validationCommands: string[]
}

export interface QuestAcceptanceCompilerV16 {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  readiness: QuestDeliveryVerdict
  confidence: number
  objective: string
  doneDefinition: string[]
  criteria: QuestAcceptanceCriterion[]
  nonGoals: string[]
  openRisks: string[]
}

export interface QuestEvidenceClaim {
  id: string
  claim: string
  status: QuestDeliveryEvidenceStatus
  confidence: number
  evidence: string[]
  action: string
}

export interface QuestEvidenceFirstGate {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  verdict: QuestDeliveryVerdict
  summary: {
    verified: number
    inferred: number
    stale: number
    missing: number
    needsResearch: number
  }
  claims: QuestEvidenceClaim[]
  rules: string[]
}

export interface QuestPatchProvenanceEntry {
  id: string
  patchCapsuleId: string
  reason: string
  files: string[]
  requirementIds: string[]
  evidenceFactIds: string[]
  validationCommands: string[]
  risk: 'low' | 'medium' | 'high'
  status: 'traceable' | 'needs-evidence' | 'blocked'
}

export interface QuestPatchProvenanceLedger {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  entries: QuestPatchProvenanceEntry[]
  changedFiles: string[]
  policy: string[]
}

export interface QuestRuntimeCycleCheck {
  runtime: 'opencode' | 'kimi' | 'codex' | 'claude'
  required: boolean
  status: 'covered' | 'needs-test' | 'not-required'
  command: string
  reason: string
  evidence: string[]
}

export interface QuestRuntimeCycleMatrix {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  requiredCycles: number
  checks: QuestRuntimeCycleCheck[]
  allRequiredCovered: boolean
  policy: string[]
}

export interface QuestAutoEvalCandidate {
  id: string
  title: string
  source: 'changed-code' | 'runtime-parity' | 'failure-memory' | 'review-signal' | 'requirement'
  suggestedPath: string
  reason: string
  priority: 'low' | 'medium' | 'high'
  status: 'candidate' | 'blocked' | 'already-covered'
  evidence: string[]
}

export interface QuestAutoEvalGenerator {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  candidates: QuestAutoEvalCandidate[]
  policy: string[]
}

export interface QuestAgentDebateParticipant {
  role: 'tech-lead' | 'tester' | 'security' | 'release-lead'
  verdict: QuestDeliveryVerdict
  summary: string
  evidence: string[]
  requiredAction: string
}

export interface QuestAgentDebateGate {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  verdict: QuestDeliveryVerdict
  participants: QuestAgentDebateParticipant[]
  rules: string[]
}

export interface QuestReleaseReadinessDashboard {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  verdict: QuestDeliveryVerdict
  changedFiles: string[]
  requiredCommands: Array<{
    command: string
    status: 'passed' | 'pending' | 'failed'
    reason: string
    evidence: string[]
  }>
  installUpdateGate: {
    required: boolean
    status: 'passed' | 'pending' | 'not-required'
    commands: string[]
    reason: string
  }
  blockers: string[]
  nextActions: string[]
}

export interface QuestVerifiedDeliveryOS {
  version: typeof QUEST_VERIFIED_DELIVERY_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  acceptanceCompiler: QuestAcceptanceCompilerV16
  evidenceFirstGate: QuestEvidenceFirstGate
  patchProvenanceLedger: QuestPatchProvenanceLedger
  runtimeCycleMatrix: QuestRuntimeCycleMatrix
  autoEvalGenerator: QuestAutoEvalGenerator
  agentDebateGate: QuestAgentDebateGate
  releaseReadinessDashboard: QuestReleaseReadinessDashboard
}

export interface BuildQuestVerifiedDeliveryOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

interface ValidationCheck {
  name: string
  command?: string
  passed: boolean
  evidence: string
}

export function buildQuestVerifiedDeliveryOS(
  options: BuildQuestVerifiedDeliveryOptions,
): QuestVerifiedDeliveryOS {
  const validationChecks = extractValidationChecks(options.events)
  const acceptanceCompiler = buildAcceptanceCompiler(options, validationChecks)
  const evidenceFirstGate = buildEvidenceFirstGate(options, validationChecks)
  const patchProvenanceLedger = buildPatchProvenanceLedger(options)
  const runtimeCycleMatrix = buildRuntimeCycleMatrix(options, validationChecks)
  const autoEvalGenerator = buildAutoEvalGenerator(options)
  const agentDebateGate = buildAgentDebateGate(
    acceptanceCompiler,
    evidenceFirstGate,
    runtimeCycleMatrix,
    options,
  )
  const releaseReadinessDashboard = buildReleaseReadinessDashboard(
    options,
    validationChecks,
    acceptanceCompiler,
    evidenceFirstGate,
    runtimeCycleMatrix,
    agentDebateGate,
  )

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    objective: options.objective,
    acceptanceCompiler,
    evidenceFirstGate,
    patchProvenanceLedger,
    runtimeCycleMatrix,
    autoEvalGenerator,
    agentDebateGate,
    releaseReadinessDashboard,
  }
}

export async function writeQuestVerifiedDeliveryArtifacts(
  dir: string,
  delivery: QuestVerifiedDeliveryOS,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'verified-delivery-os.json'), delivery),
    writeJson(join(dir, 'acceptance-compiler.json'), delivery.acceptanceCompiler),
    writeJson(join(dir, 'evidence-first-gate.json'), delivery.evidenceFirstGate),
    writeJson(join(dir, 'patch-provenance-ledger.json'), delivery.patchProvenanceLedger),
    writeJson(join(dir, 'runtime-cycle-matrix.json'), delivery.runtimeCycleMatrix),
    writeJson(join(dir, 'auto-eval-generator.json'), delivery.autoEvalGenerator),
    writeJson(join(dir, 'agent-debate-gate.json'), delivery.agentDebateGate),
    writeJson(join(dir, 'release-readiness-dashboard.json'), delivery.releaseReadinessDashboard),
    writeFile(join(dir, 'verified-delivery-os.md'), formatVerifiedDeliveryBrief(delivery)),
  ])
}

export function formatVerifiedDeliverySummary(delivery: QuestVerifiedDeliveryOS): string {
  return [
    '## Verified Coding Delivery OS',
    '',
    `- Acceptance readiness: ${delivery.acceptanceCompiler.readiness}`,
    `- Evidence gate: ${delivery.evidenceFirstGate.verdict}`,
    `- Patch provenance entries: ${delivery.patchProvenanceLedger.entries.length}`,
    `- Runtime three-cycle matrix: ${delivery.runtimeCycleMatrix.allRequiredCovered ? 'covered' : 'needs test'}`,
    `- Auto-eval candidates: ${delivery.autoEvalGenerator.candidates.length}`,
    `- Agent debate gate: ${delivery.agentDebateGate.verdict}`,
    `- Release readiness: ${delivery.releaseReadinessDashboard.verdict}`,
  ].join('\n')
}

function buildAcceptanceCompiler(
  options: BuildQuestVerifiedDeliveryOptions,
  validationChecks: ValidationCheck[],
): QuestAcceptanceCompilerV16 {
  const validationCommands = unique(options.testRecommendations.map((test) => test.command))
  const requirementCriteria = options.intelligentCodingTeam.requirementCompiler.acceptanceCriteria
    .slice(0, 12)
    .map((statement, index): QuestAcceptanceCriterion => ({
      id: `acceptance-${String(index + 1).padStart(3, '0')}`,
      statement,
      source: 'requirement-compiler',
      status: inferAcceptanceStatus(statement, validationCommands, validationChecks),
      evidence: [
        `requirement-compiler:${options.intelligentCodingTeam.requirementCompiler.readiness}`,
      ],
      validationCommands: validationCommands.slice(0, 5),
    }))
  const patchCriteria = options.patchCapsules.slice(0, 8).map((capsule): QuestAcceptanceCriterion => ({
    id: `acceptance-patch-${capsule.id}`,
    statement: capsule.expectedBehavior,
    source: 'patch-capsule',
    status: capsule.validationCommands.some((command) => commandPassed(command, validationChecks))
      ? 'satisfied'
      : 'pending',
    evidence: [`patch-capsule:${capsule.id}`, ...capsule.files.slice(0, 6)],
    validationCommands: capsule.validationCommands,
  }))
  const runtimeCriteria = buildRuntimeCriteria(options)
  const criteria = uniqueById([...requirementCriteria, ...patchCriteria, ...runtimeCriteria])
  const blocked = criteria.some((criterion) => criterion.status === 'blocked')
  const pending = criteria.some((criterion) => criterion.status === 'pending')
  const readiness: QuestDeliveryVerdict = blocked ? 'blocked' : pending ? 'review' : 'pass'

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    readiness,
    confidence: confidenceFromStatuses(criteria.map((criterion) => criterion.status)),
    objective: options.objective,
    doneDefinition: [
      'All acceptance criteria are satisfied or explicitly carried as review/blocker evidence.',
      'Claims in the final answer are backed by local files, commands, events, or marked as assumptions.',
      'Patch provenance maps changed files to requirements, evidence, and validation.',
      'Runtime three-cycle checks are covered for changed runtime adapters.',
      'Release readiness dashboard has no blockers before claiming done.',
    ],
    criteria,
    nonGoals: options.intelligentCodingTeam.requirementCompiler.nonGoals,
    openRisks: unique([
      ...options.reviewSignals.map((signal) => signal.summary),
      ...options.intelligentCodingTeam.changeImpactSimulator.riskScenarios.map((risk) => risk.title),
    ]).slice(0, 10),
  }
}

function buildEvidenceFirstGate(
  options: BuildQuestVerifiedDeliveryOptions,
  validationChecks: ValidationCheck[],
): QuestEvidenceFirstGate {
  const ledger = options.verifiedKnowledgebase.evidenceLedger
  const semanticConfidence = options.semanticRepoBrain.knowledgeConfidenceScore.overall
  const verifiedCommands = validationChecks.filter((check) => check.passed).map((check) => check.command ?? check.name)
  const requiredRuntime = Object.entries(options.runtimeParity)
    .filter(([key, value]) => key !== 'reason' && value === true)
    .map(([runtime]) => runtime)
  const claims: QuestEvidenceClaim[] = [
    {
      id: 'claim-local-evidence',
      claim: 'Coding work must rely on local evidence before completion.',
      status: mapEvidenceStatus(ledger.summary.verified > 0 ? 'verified' : 'unknown'),
      confidence: ledger.summary.confidence,
      evidence: [`verified=${ledger.summary.verified}`, `assumed=${ledger.summary.assumed}`, `unknown=${ledger.summary.unknown}`],
      action: ledger.summary.verified > 0
        ? 'Use cited local evidence in final summary.'
        : 'Inspect source files or events before making factual claims.',
    },
    {
      id: 'claim-hallucination-gate',
      claim: 'Hallucination gate must not be blocked.',
      status: options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked' ? 'missing' : 'verified',
      confidence: options.verifiedKnowledgebase.hallucinationGate.verdict === 'pass' ? 0.9 : 0.65,
      evidence: [`hallucination-gate:${options.verifiedKnowledgebase.hallucinationGate.verdict}`],
      action: options.verifiedKnowledgebase.hallucinationGate.verdict === 'blocked'
        ? 'Stop and resolve unknown references.'
        : 'Continue using evidence-labeled claims.',
    },
    {
      id: 'claim-command-evidence',
      claim: 'Do not claim tested unless validation events or command output evidence exist.',
      status: verifiedCommands.length > 0 ? 'verified' : 'missing',
      confidence: verifiedCommands.length > 0 ? 0.92 : 0.45,
      evidence: verifiedCommands.length > 0 ? verifiedCommands : options.testRecommendations.map((test) => test.command).slice(0, 6),
      action: verifiedCommands.length > 0
        ? 'Final answer may cite the passing validation commands.'
        : 'Run or record selected validation before using tested language.',
    },
    {
      id: 'claim-semantic-confidence',
      claim: 'Repo facts should be verified or explicitly labeled as inferred/stale/missing.',
      status: semanticConfidence >= 0.7 ? 'verified' : semanticConfidence >= 0.45 ? 'inferred' : 'missing',
      confidence: semanticConfidence,
      evidence: [`semantic-confidence:${semanticConfidence}`],
      action: 'Use knowledge-confidence-score.json labels for repo claims.',
    },
    {
      id: 'claim-runtime-parity',
      claim: 'Runtime-facing changes require explicit runtime parity evidence.',
      status: requiredRuntime.length === 0 ? 'verified' : 'needs-research',
      confidence: requiredRuntime.length === 0 ? 0.9 : 0.55,
      evidence: requiredRuntime.length === 0 ? ['runtime-parity:not-required'] : requiredRuntime,
      action: requiredRuntime.length === 0
        ? 'No runtime parity gate is required for this change set.'
        : 'Run the matching Quest runtime smoke and three-cycle request test.',
    },
  ]
  const summary = summarizeEvidenceClaims(claims)
  const verdict = claims.some((claim) => claim.status === 'missing')
    ? 'blocked'
    : claims.some((claim) => claim.status === 'needs-research' || claim.status === 'inferred' || claim.status === 'stale')
      ? 'review'
      : 'pass'

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    verdict,
    summary,
    claims,
    rules: [
      'Verified claims can be stated directly in final answers.',
      'Inferred, stale, missing, and needs-research claims must be labeled or resolved first.',
      'A test is not considered passed unless a validation event or command evidence exists.',
      'Runtime parity claims require the matching runtime smoke or three-cycle request evidence.',
    ],
  }
}

function buildPatchProvenanceLedger(options: BuildQuestVerifiedDeliveryOptions): QuestPatchProvenanceLedger {
  const requirementIds = options.intelligentCodingTeam.requirementCompiler.requirements.map((requirement) => requirement.id)
  const evidenceFactIds = options.verifiedKnowledgebase.evidenceLedger.facts.map((fact) => fact.id)
  const entries = options.patchCapsules.map((capsule): QuestPatchProvenanceEntry => {
    const risk = options.impact.riskLevel
    const hasValidation = capsule.validationCommands.length > 0
    const hasEvidence = evidenceFactIds.length > 0
    return {
      id: `provenance-${capsule.id}`,
      patchCapsuleId: capsule.id,
      reason: capsule.summary,
      files: capsule.files,
      requirementIds: requirementIds.slice(0, 8),
      evidenceFactIds: evidenceFactIds.slice(0, 12),
      validationCommands: capsule.validationCommands,
      risk,
      status: hasEvidence && hasValidation ? 'traceable' : hasEvidence ? 'needs-evidence' : 'blocked',
    }
  })

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    entries,
    changedFiles: unique(options.files),
    policy: [
      'Every changed file should map to a patch capsule.',
      'Every patch capsule should name the requirement, evidence facts, validation commands, and rollback note.',
      'Untraceable patches block release readiness until explained or validated.',
    ],
  }
}

function buildRuntimeCycleMatrix(
  options: BuildQuestVerifiedDeliveryOptions,
  validationChecks: ValidationCheck[],
): QuestRuntimeCycleMatrix {
  const runtimes: QuestRuntimeCycleCheck['runtime'][] = ['opencode', 'kimi', 'codex', 'claude']
  const runtimeRequired: Record<QuestRuntimeCycleCheck['runtime'], boolean> = {
    opencode: options.runtimeParity.opencode,
    kimi: options.runtimeParity.kimi,
    codex: options.runtimeParity.codex,
    claude: options.runtimeParity.claude,
  }
  const commands: Record<QuestRuntimeCycleCheck['runtime'], string> = {
    opencode: 'npm run test:quest-v8:opencode',
    kimi: 'npm run test:quest-v8:kimi && RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi',
    codex: 'npm run test:quest-v8:codex',
    claude: './install.sh advanced --with-claude --install-dir <tmp> && ./update.sh --with-claude --install-dir <tmp>',
  }
  const checks = runtimes.map((runtime): QuestRuntimeCycleCheck => {
    const required = runtimeRequired[runtime]
    const covered = !required || commandPassed(commands[runtime], validationChecks) || runtimeCycleEvidence(runtime, options.events)
    return {
      runtime,
      required,
      status: !required ? 'not-required' : covered ? 'covered' : 'needs-test',
      command: commands[runtime],
      reason: required
        ? `${runtime} runtime-facing files or plugin surfaces changed.`
        : `${runtime} runtime surface was not detected in this change set.`,
      evidence: covered
        ? [`${runtime}:covered`]
        : [`${runtime}:run ${commands[runtime]}`],
    }
  })

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    requiredCycles: 3,
    checks,
    allRequiredCovered: checks.every((check) => !check.required || check.status === 'covered'),
    policy: [
      'For runtime prompt/adapter changes, verify at least three request cycles: complete, next request, complete, third request.',
      'Kimi runtime changes require both the standard smoke and forced live daemon/write-back path when available.',
      'Do not claim runtime parity unless the matching matrix row is covered or explicitly marked not-required.',
    ],
  }
}

function buildAutoEvalGenerator(options: BuildQuestVerifiedDeliveryOptions): QuestAutoEvalGenerator {
  const candidates: QuestAutoEvalCandidate[] = []
  const add = (candidate: QuestAutoEvalCandidate) => {
    if (!candidates.some((existing) => existing.id === candidate.id)) candidates.push(candidate)
  }

  if (options.files.some((file) => file.startsWith('packages/cli/src/lib/') && !file.endsWith('.test.ts'))) {
    add({
      id: 'eval-cli-lib-focused',
      title: 'Add focused CLI library regression eval',
      source: 'changed-code',
      suggestedPath: 'packages/cli/src/lib/<feature>.test.ts',
      reason: 'CLI library behavior changed; a focused Bun test should preserve the contract.',
      priority: 'high',
      status: 'candidate',
      evidence: options.files.filter((file) => file.startsWith('packages/cli/src/lib/')).slice(0, 8),
    })
  }
  if (options.runtimeParity.kimi || options.runtimeParity.opencode || options.runtimeParity.codex || options.runtimeParity.claude) {
    add({
      id: 'eval-runtime-three-cycle',
      title: 'Add runtime three-cycle request eval',
      source: 'runtime-parity',
      suggestedPath: 'scripts/tests/test-<runtime>-quest-v8.sh',
      reason: 'Runtime prompt or adapter behavior changed; repeated completed requests must start fresh Quests.',
      priority: 'high',
      status: 'candidate',
      evidence: [
        options.runtimeParity.kimi ? 'kimi' : '',
        options.runtimeParity.opencode ? 'opencode' : '',
        options.runtimeParity.codex ? 'codex' : '',
        options.runtimeParity.claude ? 'claude' : '',
      ].filter(Boolean),
    })
  }
  for (const command of options.temporalMemory.chronicCommands.slice(0, 3)) {
    const fingerprint = `chronic-command:${slug(command)}`
    add({
      id: `eval-failure-${slug(command)}`,
      title: `Add regression eval for chronic failure: ${command}`,
      source: 'failure-memory',
      suggestedPath: 'evals/agents/shared/tests/edge-cases/<failure>.yaml',
      reason: `Temporal memory has seen repeated failure around ${command}. Add a regression so OpenAgent avoids the same broken path.`,
      priority: 'medium',
      status: 'candidate',
      evidence: [command, fingerprint],
    })
  }
  for (const signal of options.reviewSignals.filter((signal) => signal.severity !== 'info').slice(0, 3)) {
    add({
      id: `eval-review-${signal.id}`,
      title: `Add eval for review signal: ${signal.summary}`,
      source: 'review-signal',
      suggestedPath: 'evals/agents/shared/tests/golden/<review-signal>.yaml',
      reason: signal.recommendation,
      priority: signal.severity === 'error' ? 'high' : 'medium',
      status: 'candidate',
      evidence: signal.files,
    })
  }

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    candidates,
    policy: [
      'Generate eval candidates for new behavior, runtime regressions, chronic failures, and high-risk review signals.',
      'Do not create or promote durable skills automatically; ask for user approval first.',
      'Attach eval candidates to patch provenance so future failures become reproducible.',
    ],
  }
}

function buildAgentDebateGate(
  acceptance: QuestAcceptanceCompilerV16,
  evidence: QuestEvidenceFirstGate,
  runtime: QuestRuntimeCycleMatrix,
  options: BuildQuestVerifiedDeliveryOptions,
): QuestAgentDebateGate {
  const techLead: QuestAgentDebateParticipant = {
    role: 'tech-lead',
    verdict: acceptance.readiness,
    summary: `Acceptance compiler readiness is ${acceptance.readiness}.`,
    evidence: acceptance.criteria.slice(0, 6).map((criterion) => `${criterion.id}:${criterion.status}`),
    requiredAction: acceptance.readiness === 'pass'
      ? 'Proceed to validation/release summary.'
      : 'Resolve pending or blocked acceptance criteria.',
  }
  const testerPending = options.testRecommendations.some((test) => !commandPassed(test.command, extractValidationChecks(options.events)))
  const tester: QuestAgentDebateParticipant = {
    role: 'tester',
    verdict: testerPending ? 'review' : 'pass',
    summary: testerPending ? 'Selected smart tests still need evidence.' : 'Selected smart tests have evidence or no test gap is detected.',
    evidence: options.testRecommendations.map((test) => test.command).slice(0, 8),
    requiredAction: testerPending ? 'Run or record selected validation commands.' : 'Cite validation evidence in the final answer.',
  }
  const securityVerdict = options.codingExecution.securitySecretsGate.verdict
  const security: QuestAgentDebateParticipant = {
    role: 'security',
    verdict: securityVerdict,
    summary: `Security/secrets gate is ${securityVerdict}.`,
    evidence: options.codingExecution.securitySecretsGate.findings.map((finding) => finding.summary).slice(0, 6),
    requiredAction: securityVerdict === 'pass'
      ? 'No security blocker detected.'
      : 'Resolve or explicitly report security/secrets findings.',
  }
  const releaseLead: QuestAgentDebateParticipant = {
    role: 'release-lead',
    verdict: evidence.verdict === 'blocked' || !runtime.allRequiredCovered ? 'review' : 'pass',
    summary: `Evidence gate is ${evidence.verdict}; runtime matrix is ${runtime.allRequiredCovered ? 'covered' : 'not covered'}.`,
    evidence: [
      `evidence:${evidence.verdict}`,
      `runtime:${runtime.allRequiredCovered ? 'covered' : 'needs-test'}`,
      `team:${options.intelligentCodingTeam.teamGate.verdict}`,
    ],
    requiredAction: evidence.verdict === 'pass' && runtime.allRequiredCovered
      ? 'Release summary can cite verified delivery artifacts.'
      : 'Close evidence/runtime gaps before release-ready claims.',
  }
  const participants = [techLead, tester, security, releaseLead]

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    verdict: combineVerdicts(participants.map((participant) => participant.verdict)),
    participants,
    rules: [
      'Tech Lead owns requirement completion.',
      'Tester owns validation sufficiency.',
      'Security owns secret/destructive risk.',
      'Release Lead owns install/update/runtime readiness and final evidence claims.',
    ],
  }
}

function buildReleaseReadinessDashboard(
  options: BuildQuestVerifiedDeliveryOptions,
  validationChecks: ValidationCheck[],
  acceptance: QuestAcceptanceCompilerV16,
  evidence: QuestEvidenceFirstGate,
  runtime: QuestRuntimeCycleMatrix,
  debate: QuestAgentDebateGate,
): QuestReleaseReadinessDashboard {
  const requiredCommands = options.testRecommendations.map((test) => {
    const passed = commandPassed(test.command, validationChecks)
    const failed = validationChecks.some((check) => check.command === test.command && !check.passed)
    return {
      command: test.command,
      status: passed ? 'passed' as const : failed ? 'failed' as const : 'pending' as const,
      reason: test.reason,
      evidence: validationChecks
        .filter((check) => check.command === test.command)
        .map((check) => check.evidence),
    }
  })
  const installUpdateRequired = options.files.some((file) =>
    file === 'install.sh' ||
    file === 'update.sh' ||
    file.startsWith('plugins/') ||
    file.includes('test-kimi-quest') ||
    file.includes('test-codex-quest') ||
    file.includes('test-opencode-quest')
  )
  const installUpdateCommands = installUpdateRequired
    ? [
        './install.sh advanced --with-kimi --with-codex --with-claude --install-dir <tmp>',
        './update.sh --install-dir <tmp> --with-kimi --with-codex --with-claude',
      ]
    : []
  const blockers = unique([
    ...(acceptance.readiness === 'blocked' ? ['Acceptance compiler has blocked criteria.'] : []),
    ...(evidence.verdict === 'blocked' ? ['Evidence-first gate is blocked.'] : []),
    ...requiredCommands
      .filter((command) => command.status === 'failed')
      .map((command) => `Validation failed: ${command.command}`),
    ...runtime.checks
      .filter((check) => check.required && check.status === 'needs-test')
      .map((check) => `Runtime three-cycle evidence missing: ${check.runtime}`),
    ...(debate.verdict === 'blocked' ? ['Agent debate gate is blocked.'] : []),
  ])
  const pending = requiredCommands.some((command) => command.status === 'pending') ||
    (installUpdateRequired && !installUpdatePassed(validationChecks)) ||
    debate.verdict === 'review' ||
    evidence.verdict === 'review' ||
    acceptance.readiness === 'review'

  return {
    version: QUEST_VERIFIED_DELIVERY_VERSION,
    verdict: blockers.length > 0 ? 'blocked' : pending ? 'review' : 'pass',
    changedFiles: unique(options.files),
    requiredCommands,
    installUpdateGate: {
      required: installUpdateRequired,
      status: !installUpdateRequired ? 'not-required' : installUpdatePassed(validationChecks) ? 'passed' : 'pending',
      commands: installUpdateCommands,
      reason: installUpdateRequired
        ? 'Installer, updater, runtime adapter, or runtime harness files changed.'
        : 'No installer/update/runtime adapter surface detected.',
    },
    blockers,
    nextActions: buildReleaseNextActions(requiredCommands, runtime, installUpdateRequired),
  }
}

function buildRuntimeCriteria(options: BuildQuestVerifiedDeliveryOptions): QuestAcceptanceCriterion[] {
  const criteria: QuestAcceptanceCriterion[] = []
  if (options.runtimeParity.kimi) {
    criteria.push({
      id: 'acceptance-runtime-kimi',
      statement: 'Kimi runtime starts a fresh Quest for repeated completed requests and passes daemon write-back validation.',
      source: 'runtime',
      status: 'pending',
      evidence: ['runtime-parity:kimi'],
      validationCommands: ['npm run test:quest-v8:kimi', 'RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'],
    })
  }
  if (options.runtimeParity.opencode) {
    criteria.push({
      id: 'acceptance-runtime-opencode',
      statement: 'OpenCode runtime prompt remains in Quest Mode with v16 sidecar awareness.',
      source: 'runtime',
      status: 'pending',
      evidence: ['runtime-parity:opencode'],
      validationCommands: ['npm run test:quest-v8:opencode'],
    })
  }
  if (options.runtimeParity.codex) {
    criteria.push({
      id: 'acceptance-runtime-codex',
      statement: 'Codex runtime prompt/default config remains in Quest Mode with v16 sidecar awareness.',
      source: 'runtime',
      status: 'pending',
      evidence: ['runtime-parity:codex'],
      validationCommands: ['npm run test:quest-v8:codex'],
    })
  }
  return criteria
}

function inferAcceptanceStatus(
  statement: string,
  validationCommands: string[],
  validationChecks: ValidationCheck[],
): QuestAcceptanceStatus {
  const lower = statement.toLowerCase()
  if (lower.includes('blocker') || lower.includes('blocking')) return 'blocked'
  if (lower.includes('validation') || lower.includes('test')) {
    return validationCommands.some((command) => commandPassed(command, validationChecks))
      ? 'satisfied'
      : 'pending'
  }
  return 'pending'
}

function extractValidationChecks(events: Array<{ type?: string; data?: Record<string, unknown> }>): ValidationCheck[] {
  const checks: ValidationCheck[] = []
  for (const event of events) {
    if (event.type !== 'validation') continue
    const candidates = [
      event.data?.checks,
      (event.data?.result as Record<string, unknown> | undefined)?.checks,
    ]
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue
      for (const item of candidate) {
        if (!item || typeof item !== 'object') continue
        const data = item as Record<string, unknown>
        const command = asString(data.command)
        const name = asString(data.name) ?? command ?? 'validation'
        const passed = data.passed === true || data.ok === true
        checks.push({
          name,
          ...(command && { command }),
          passed,
          evidence: `${name}:${passed ? 'passed' : 'failed'}`,
        })
      }
    }
    const result = event.data?.result as Record<string, unknown> | undefined
    if (typeof result?.overallPassed === 'boolean' && checks.length === 0) {
      checks.push({
        name: 'overall',
        passed: result.overallPassed,
        evidence: `overall:${result.overallPassed ? 'passed' : 'failed'}`,
      })
    }
  }
  return checks
}

function commandPassed(command: string, checks: ValidationCheck[]): boolean {
  return checks.some((check) => check.passed && (check.command === command || check.name === command))
}

function runtimeCycleEvidence(
  runtime: QuestRuntimeCycleCheck['runtime'],
  events: Array<{ type?: string; data?: Record<string, unknown> }>,
): boolean {
  const runtimeEvents = events.filter((event) => JSON.stringify(event.data ?? {}).toLowerCase().includes(runtime))
  const hasThreeCycleMarker = runtimeEvents.some((event) =>
    JSON.stringify(event.data ?? {}).includes('three_cycle') ||
    JSON.stringify(event.data ?? {}).includes('three-cycle') ||
    JSON.stringify(event.data ?? {}).includes('cycle_3')
  )
  return hasThreeCycleMarker || runtimeEvents.some((event) => event.type === 'runtime.completed')
}

function installUpdatePassed(checks: ValidationCheck[]): boolean {
  return checks.some((check) =>
    check.passed &&
    (
      check.name.toLowerCase().includes('install') ||
      check.name.toLowerCase().includes('update') ||
      (check.command ?? '').includes('install.sh') ||
      (check.command ?? '').includes('update.sh')
    )
  )
}

function buildReleaseNextActions(
  commands: QuestReleaseReadinessDashboard['requiredCommands'],
  runtime: QuestRuntimeCycleMatrix,
  installUpdateRequired: boolean,
): string[] {
  return unique([
    ...commands.filter((command) => command.status !== 'passed').map((command) => `Run: ${command.command}`),
    ...runtime.checks
      .filter((check) => check.required && check.status === 'needs-test')
      .map((check) => `Run runtime three-cycle check: ${check.command}`),
    ...(installUpdateRequired ? ['Run temp install/update with enabled runtime adapters.'] : []),
    'Refresh oac quest-v9 and cite verified-delivery-os.json before final completion.',
  ]).slice(0, 8)
}

function mapEvidenceStatus(status: QuestEvidenceStatus): QuestDeliveryEvidenceStatus {
  if (status === 'verified') return 'verified'
  if (status === 'stale') return 'stale'
  if (status === 'assumed') return 'inferred'
  return 'missing'
}

function summarizeEvidenceClaims(claims: QuestEvidenceClaim[]): QuestEvidenceFirstGate['summary'] {
  return {
    verified: claims.filter((claim) => claim.status === 'verified').length,
    inferred: claims.filter((claim) => claim.status === 'inferred').length,
    stale: claims.filter((claim) => claim.status === 'stale').length,
    missing: claims.filter((claim) => claim.status === 'missing').length,
    needsResearch: claims.filter((claim) => claim.status === 'needs-research').length,
  }
}

function confidenceFromStatuses(statuses: QuestAcceptanceStatus[]): number {
  if (statuses.length === 0) return 0.5
  const total = statuses.reduce((sum, status) => {
    if (status === 'satisfied') return sum + 1
    if (status === 'pending') return sum + 0.55
    return sum + 0.15
  }, 0)
  return Number((total / statuses.length).toFixed(2))
}

function combineVerdicts(verdicts: QuestDeliveryVerdict[]): QuestDeliveryVerdict {
  if (verdicts.includes('blocked')) return 'blocked'
  if (verdicts.includes('review')) return 'review'
  return 'pass'
}

function formatVerifiedDeliveryBrief(delivery: QuestVerifiedDeliveryOS): string {
  const lines = [
    '# Verified Coding Delivery OS',
    '',
    `- Version: ${delivery.version}`,
    `- Objective: ${delivery.objective}`,
    `- Generated: ${delivery.generatedAt}`,
    `- Acceptance readiness: ${delivery.acceptanceCompiler.readiness}`,
    `- Evidence gate: ${delivery.evidenceFirstGate.verdict}`,
    `- Agent debate gate: ${delivery.agentDebateGate.verdict}`,
    `- Release readiness: ${delivery.releaseReadinessDashboard.verdict}`,
    '',
    '## Acceptance Criteria',
    '',
    ...delivery.acceptanceCompiler.criteria
      .slice(0, 12)
      .map((criterion) => `- **${criterion.status}:** ${criterion.statement}`),
    '',
    '## Evidence Claims',
    '',
    ...delivery.evidenceFirstGate.claims
      .map((claim) => `- **${claim.status}:** ${claim.claim}`),
    '',
    '## Runtime Three-Cycle Matrix',
    '',
    ...delivery.runtimeCycleMatrix.checks
      .map((check) => `- **${check.runtime}:** ${check.status} - \`${check.command}\``),
    '',
    '## Release Next Actions',
    '',
    ...(delivery.releaseReadinessDashboard.nextActions.length > 0
      ? delivery.releaseReadinessDashboard.nextActions.map((action) => `- ${action}`)
      : ['- No pending release actions detected.']),
    '',
  ]
  return lines.join('\n')
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
  return [...new Set(items)]
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n')
}

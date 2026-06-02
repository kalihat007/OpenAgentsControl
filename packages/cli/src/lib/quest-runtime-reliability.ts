/**
 * Quest v18 Runtime Reliability + Evidence Replay OS.
 *
 * Deterministic reliability layer that turns Quest events, validation evidence,
 * runtime parity, delivery gates, and product-architect signals into replayable
 * proof and recovery guidance.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CodebaseIndex, ImpactAnalysis } from './codebase-indexer.js'
import type { QuestCodingExecution } from './quest-coding-execution.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'
import type { QuestProductArchitectIntelligence } from './quest-product-architect.js'
import type { QuestSemanticRepoBrain } from './quest-semantic-repo-brain.js'
import type { QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedDeliveryOS } from './quest-verified-delivery.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_RUNTIME_RELIABILITY_VERSION = '18' as const

export type QuestRuntimeNameV18 = 'opencode' | 'kimi' | 'codex' | 'claude'
export type QuestReliabilityVerdict = 'pass' | 'review' | 'blocked'
export type QuestReliabilityPriority = 'low' | 'medium' | 'high'
export type QuestEvidenceReplayStatus = 'verified' | 'inferred' | 'missing' | 'blocked'
export type QuestCommandFailureKind =
  | 'timeout'
  | 'step-limit'
  | 'flaky'
  | 'missing-dependency'
  | 'exit-code'
  | 'unknown'

export interface QuestRuntimeReliabilitySignal {
  id: string
  runtime: QuestRuntimeNameV18 | 'unknown'
  kind: QuestCommandFailureKind | 'configuration' | 'write-back' | 'evidence'
  severity: QuestReliabilityPriority
  summary: string
  recommendedAction: string
  evidence: string[]
}

export interface QuestRuntimeReliabilityBrain {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  score: number
  verdict: QuestReliabilityVerdict
  signals: QuestRuntimeReliabilitySignal[]
  policies: string[]
}

export interface QuestCommandFailureFingerprint {
  id: string
  command: string
  normalizedCommand: string
  kind: QuestCommandFailureKind
  occurrences: number
  confidence: number
  recommendedFix: string
  evidence: string[]
}

export interface QuestCommandFailureIndex {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  fingerprints: QuestCommandFailureFingerprint[]
  policy: string[]
}

export interface QuestTimeoutPolicyRule {
  id: string
  commandClass: 'quick' | 'normal-validation' | 'deep-validation' | 'network' | 'runtime-live' | 'docker'
  timeoutSeconds: number
  matcher: string
  reason: string
}

export interface QuestTimeoutPolicy {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  defaultTimeoutSeconds: number
  kimiRecommended: {
    normalValidationSeconds: number
    deepValidationSeconds: number
    nativeTimeoutSymptom: string
  }
  rules: QuestTimeoutPolicyRule[]
  policy: string[]
}

export interface QuestEvidenceReplayClaim {
  id: string
  claim: string
  status: QuestEvidenceReplayStatus
  confidence: number
  evidence: string[]
  replayCommand?: string
  requiredAction: string
}

export interface QuestClaimLedger {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  summary: {
    verified: number
    inferred: number
    missing: number
    blocked: number
  }
  claims: QuestEvidenceReplayClaim[]
  policy: string[]
}

export interface QuestRuntimeDoctorCheck {
  id: string
  runtime: QuestRuntimeNameV18
  status: 'pass' | 'warn' | 'fail' | 'unknown'
  summary: string
  evidence: string[]
  recommendedAction: string
}

export interface QuestRuntimeDoctorReport {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  generatedAt: string
  projectRoot: string
  verdict: QuestReliabilityVerdict
  checks: QuestRuntimeDoctorCheck[]
  configHints: string[]
}

export interface QuestAutonomousRecoveryAction {
  id: string
  trigger: string
  priority: QuestReliabilityPriority
  action: string
  command?: string
  approvalRequired: boolean
  evidence: string[]
}

export interface QuestAutonomousRecoveryPlan {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  verdict: QuestReliabilityVerdict
  actions: QuestAutonomousRecoveryAction[]
  decisionRules: string[]
}

export interface QuestFlakyCommandMemoryEntry {
  id: string
  command: string
  occurrences: number
  trend: 'stable' | 'flaky' | 'worsening'
  lastFailure: string
  knownFixes: string[]
  evidence: string[]
}

export interface QuestFlakyCommandMemory {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  commands: QuestFlakyCommandMemoryEntry[]
  policy: string[]
}

export interface QuestRuntimeReliabilityOS {
  version: typeof QUEST_RUNTIME_RELIABILITY_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  verdict: QuestReliabilityVerdict
  reliabilityScore: number
  runtimeReliabilityBrain: QuestRuntimeReliabilityBrain
  commandFailureIndex: QuestCommandFailureIndex
  timeoutPolicy: QuestTimeoutPolicy
  claimLedger: QuestClaimLedger
  runtimeDoctorReport: QuestRuntimeDoctorReport
  autonomousRecoveryPlan: QuestAutonomousRecoveryPlan
  flakyCommandMemory: QuestFlakyCommandMemory
  evidenceReplay: {
    markdownPath: 'evidence-replay.md'
    claims: QuestEvidenceReplayClaim[]
    replayCommands: string[]
  }
}

export interface BuildQuestRuntimeReliabilityOptions {
  projectRoot: string
  objective: string
  files: string[]
  index: CodebaseIndex
  impact: ImpactAnalysis
  patchCapsules: QuestPatchCapsule[]
  testRecommendations: QuestTestRecommendation[]
  reviewSignals: QuestReviewSignal[]
  runtimeParity: QuestRuntimeParity
  codingExecution: QuestCodingExecution
  verifiedKnowledgebase: QuestVerifiedKnowledgebase
  semanticRepoBrain: QuestSemanticRepoBrain
  temporalMemory: QuestTemporalMemory
  verifiedDelivery: QuestVerifiedDeliveryOS
  productArchitect: QuestProductArchitectIntelligence
  events: Array<{ type?: string; data?: Record<string, unknown>; timestamp?: string }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

interface CommandEvent {
  command: string
  eventType: string
  ok: boolean
  message: string
  runtime: QuestRuntimeNameV18 | 'unknown'
  timestamp?: string
}

export function buildQuestRuntimeReliabilityOS(
  options: BuildQuestRuntimeReliabilityOptions,
): QuestRuntimeReliabilityOS {
  const commandEvents = extractCommandEvents(options.events)
  const commandFailureIndex = buildCommandFailureIndex(commandEvents, options)
  const timeoutPolicy = buildTimeoutPolicy(options)
  const claimLedger = buildClaimLedger(commandEvents, options)
  const runtimeDoctorReport = buildRuntimeDoctorReport(options.projectRoot, options.runtimeParity)
  const runtimeReliabilityBrain = buildRuntimeReliabilityBrain(
    commandFailureIndex,
    claimLedger,
    runtimeDoctorReport,
    options,
  )
  const autonomousRecoveryPlan = buildAutonomousRecoveryPlan(
    commandFailureIndex,
    claimLedger,
    runtimeDoctorReport,
    options,
  )
  const flakyCommandMemory = buildFlakyCommandMemory(commandFailureIndex)
  const verdict = combineVerdicts([
    runtimeReliabilityBrain.verdict,
    autonomousRecoveryPlan.verdict,
    runtimeDoctorReport.verdict,
  ])

  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    objective: options.objective,
    verdict,
    reliabilityScore: runtimeReliabilityBrain.score,
    runtimeReliabilityBrain,
    commandFailureIndex,
    timeoutPolicy,
    claimLedger,
    runtimeDoctorReport,
    autonomousRecoveryPlan,
    flakyCommandMemory,
    evidenceReplay: {
      markdownPath: 'evidence-replay.md',
      claims: claimLedger.claims,
      replayCommands: buildReplayCommands(options),
    },
  }
}

export async function writeQuestRuntimeReliabilityArtifacts(
  dir: string,
  reliability: QuestRuntimeReliabilityOS,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'runtime-reliability-os.json'), reliability),
    writeJson(join(dir, 'command-failure-index.json'), reliability.commandFailureIndex),
    writeJson(join(dir, 'timeout-policy.json'), reliability.timeoutPolicy),
    writeJson(join(dir, 'claim-ledger.json'), reliability.claimLedger),
    writeJson(join(dir, 'runtime-doctor-report.json'), reliability.runtimeDoctorReport),
    writeJson(join(dir, 'autonomous-recovery-plan.json'), reliability.autonomousRecoveryPlan),
    writeJson(join(dir, 'flaky-command-memory.json'), reliability.flakyCommandMemory),
    writeFile(join(dir, 'evidence-replay.md'), formatEvidenceReplay(reliability)),
  ])
}

export function formatRuntimeReliabilitySummary(reliability: QuestRuntimeReliabilityOS): string {
  return [
    '## Runtime Reliability + Evidence Replay OS',
    '',
    `- Runtime reliability verdict: ${reliability.verdict}`,
    `- Reliability score: ${reliability.reliabilityScore}`,
    `- Reliability signals: ${reliability.runtimeReliabilityBrain.signals.length}`,
    `- Command failure fingerprints: ${reliability.commandFailureIndex.fingerprints.length}`,
    `- Claim ledger: ${reliability.claimLedger.summary.verified} verified / ${reliability.claimLedger.summary.inferred} inferred / ${reliability.claimLedger.summary.missing} missing / ${reliability.claimLedger.summary.blocked} blocked`,
    `- Runtime doctor checks: ${reliability.runtimeDoctorReport.checks.length}`,
    `- Recovery actions: ${reliability.autonomousRecoveryPlan.actions.length}`,
    `- Flaky commands: ${reliability.flakyCommandMemory.commands.length}`,
  ].join('\n')
}

export function formatEvidenceReplay(reliability: QuestRuntimeReliabilityOS): string {
  const lines: string[] = [
    '# Quest v18 Evidence Replay',
    '',
    `- **Objective:** ${reliability.objective}`,
    `- **Verdict:** ${reliability.verdict}`,
    `- **Reliability Score:** ${reliability.reliabilityScore}`,
    `- **Generated:** ${reliability.generatedAt}`,
    '',
    '## Replay Commands',
    '',
  ]

  for (const command of reliability.evidenceReplay.replayCommands) {
    lines.push(`- \`${command}\``)
  }
  if (reliability.evidenceReplay.replayCommands.length === 0) {
    lines.push('_No replay commands were selected._')
  }

  lines.push('', '## Claim Ledger', '')
  for (const claim of reliability.claimLedger.claims) {
    lines.push(`- **${claim.status}:** ${claim.claim}`)
    lines.push(`  - Confidence: ${claim.confidence}`)
    if (claim.replayCommand) lines.push(`  - Replay: \`${claim.replayCommand}\``)
    lines.push(`  - Required action: ${claim.requiredAction}`)
    if (claim.evidence.length > 0) {
      lines.push(`  - Evidence: ${claim.evidence.map((item) => `\`${item}\``).join(', ')}`)
    }
  }

  lines.push('', '## Runtime Reliability Signals', '')
  for (const signal of reliability.runtimeReliabilityBrain.signals) {
    lines.push(`- **${signal.severity}:** ${signal.summary}`)
    lines.push(`  - Runtime: ${signal.runtime}`)
    lines.push(`  - Action: ${signal.recommendedAction}`)
  }
  if (reliability.runtimeReliabilityBrain.signals.length === 0) {
    lines.push('_No reliability signals._')
  }

  lines.push('', '## Recovery Plan', '')
  for (const action of reliability.autonomousRecoveryPlan.actions) {
    lines.push(`- **${action.priority}:** ${action.action}`)
    lines.push(`  - Trigger: ${action.trigger}`)
    if (action.command) lines.push(`  - Command: \`${action.command}\``)
  }
  if (reliability.autonomousRecoveryPlan.actions.length === 0) {
    lines.push('_No recovery actions needed._')
  }

  lines.push('')
  return lines.join('\n')
}

export function buildRuntimeDoctorReport(
  projectRoot: string,
  runtimeParity: Partial<Record<QuestRuntimeNameV18, boolean>> = {},
): QuestRuntimeDoctorReport {
  const checks: QuestRuntimeDoctorCheck[] = []
  const generatedAt = new Date().toISOString()
  for (const runtime of ['kimi', 'opencode', 'codex', 'claude'] as QuestRuntimeNameV18[]) {
    checks.push(checkRuntimeCli(runtime))
  }

  checks.push(checkKimiAdapter(projectRoot))
  checks.push(checkKimiConfig())

  for (const runtime of ['kimi', 'opencode', 'codex', 'claude'] as QuestRuntimeNameV18[]) {
    if (runtimeParity[runtime]) {
      checks.push({
        id: `${runtime}-runtime-parity-required`,
        runtime,
        status: 'warn',
        summary: `${runtime} parity is required by changed files or runtime surfaces.`,
        evidence: ['runtime-parity:true'],
        recommendedAction: `Run the relevant ${runtime} Quest smoke before release-ready language.`,
      })
    }
  }

  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    generatedAt,
    projectRoot,
    verdict: doctorVerdict(checks),
    checks,
    configHints: [
      'Kimi long validation should request timeout_s: 300; deep/live runtime validation should request timeout_s: 900.',
      'Kimi direct runs should use --max-steps-per-turn 160 for deep QuestMode sessions.',
      'Installed runtime adapters should match repository plugins after ./update.sh --with-kimi.',
    ],
  }
}

function buildRuntimeReliabilityBrain(
  commandFailureIndex: QuestCommandFailureIndex,
  claimLedger: QuestClaimLedger,
  runtimeDoctorReport: QuestRuntimeDoctorReport,
  options: BuildQuestRuntimeReliabilityOptions,
): QuestRuntimeReliabilityBrain {
  const signals: QuestRuntimeReliabilitySignal[] = []

  for (const fingerprint of commandFailureIndex.fingerprints) {
    signals.push({
      id: `signal-${fingerprint.id}`,
      runtime: runtimeFromText(fingerprint.command),
      kind: fingerprint.kind,
      severity: fingerprint.kind === 'timeout' || fingerprint.kind === 'step-limit' ? 'high' : 'medium',
      summary: `${fingerprint.kind} failure observed for ${fingerprint.normalizedCommand}`,
      recommendedAction: fingerprint.recommendedFix,
      evidence: fingerprint.evidence,
    })
  }

  if (claimLedger.summary.missing > 0 || claimLedger.summary.blocked > 0) {
    signals.push({
      id: 'signal-claim-proof-gap',
      runtime: 'unknown',
      kind: 'evidence',
      severity: 'high',
      summary: 'Completion claims include missing or blocked proof.',
      recommendedAction: 'Run the replay commands or mark the claim as not verified before completion.',
      evidence: ['claim-ledger.json'],
    })
  }

  for (const check of runtimeDoctorReport.checks.filter((check) => check.status === 'fail')) {
    signals.push({
      id: `signal-doctor-${check.id}`,
      runtime: check.runtime,
      kind: 'configuration',
      severity: 'high',
      summary: check.summary,
      recommendedAction: check.recommendedAction,
      evidence: check.evidence,
    })
  }

  if (hasRuntimeSurface(options.files) && !options.verifiedDelivery.runtimeCycleMatrix.allRequiredCovered) {
    signals.push({
      id: 'signal-runtime-cycle-gap',
      runtime: 'unknown',
      kind: 'write-back',
      severity: 'high',
      summary: 'Runtime-facing files changed without complete runtime cycle proof.',
      recommendedAction: 'Run required Kimi/OpenCode/Codex Quest smoke tests or record the skipped checks.',
      evidence: ['runtime-cycle-matrix.json'],
    })
  }

  const score = Math.max(0, Number((1 - signals.filter((signal) => signal.severity === 'high').length * 0.18 - signals.filter((signal) => signal.severity === 'medium').length * 0.08).toFixed(2)))
  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    score,
    verdict: score < 0.55 ? 'blocked' : score < 0.82 ? 'review' : 'pass',
    signals: uniqueById(signals),
    policies: [
      'Do not repeat a failed command fingerprint without a known fix.',
      'Timeout failures require a larger explicit timeout or smaller command slice.',
      'Runtime-facing changes require write-back evidence before completion claims.',
      'Every final summary claim must map to command, file, event, or sidecar evidence.',
    ],
  }
}

function buildCommandFailureIndex(
  commandEvents: CommandEvent[],
  options: BuildQuestRuntimeReliabilityOptions,
): QuestCommandFailureIndex {
  const failures = commandEvents.filter((event) => !event.ok || failureKind(event.message) !== 'unknown')
  const byFingerprint = new Map<string, QuestCommandFailureFingerprint>()

  for (const event of failures) {
    const normalizedCommand = normalizeCommand(event.command)
    const kind = failureKind([event.message, event.command].join(' '))
    const id = `cmd-${slug(normalizedCommand)}-${kind}`
    const current = byFingerprint.get(id)
    const evidence = unique([
      ...(current?.evidence ?? []),
      `${event.eventType}:${event.timestamp ?? 'unknown-time'}`,
      event.message.slice(0, 160),
    ]).filter(Boolean)
    byFingerprint.set(id, {
      id,
      command: event.command,
      normalizedCommand,
      kind,
      occurrences: (current?.occurrences ?? 0) + 1,
      confidence: kind === 'unknown' ? 0.45 : 0.85,
      recommendedFix: recommendedFixFor(kind, event.command, options),
      evidence,
    })
  }

  for (const command of options.temporalMemory.chronicCommands.slice(0, 5)) {
    const normalizedCommand = normalizeCommand(command)
    const id = `cmd-${slug(normalizedCommand)}-flaky`
    if (!byFingerprint.has(id)) {
      byFingerprint.set(id, {
        id,
        command,
        normalizedCommand,
        kind: 'flaky',
        occurrences: 3,
        confidence: 0.8,
        recommendedFix: 'Use the known temporal-memory fix path before retrying this command.',
        evidence: ['temporal-memory:chronic-command'],
      })
    }
  }

  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    fingerprints: [...byFingerprint.values()],
    policy: [
      'Fingerprint commands by normalized executable and arguments.',
      'Timeout and step-limit fingerprints are never retried unchanged.',
      'Known chronic commands should be routed to recovery planning before execution.',
    ],
  }
}

function buildTimeoutPolicy(options: BuildQuestRuntimeReliabilityOptions): QuestTimeoutPolicy {
  const rules: QuestTimeoutPolicyRule[] = [
    {
      id: 'timeout-quick',
      commandClass: 'quick',
      timeoutSeconds: 60,
      matcher: 'git diff --check, bash -n, focused syntax checks',
      reason: 'Fast checks should fail quickly but still have enough room for slower machines.',
    },
    {
      id: 'timeout-normal-validation',
      commandClass: 'normal-validation',
      timeoutSeconds: 300,
      matcher: 'bun test, npm run typecheck, npm run build, package unit tests',
      reason: 'Normal validation regularly exceeds Kimi native 30s shell defaults.',
    },
    {
      id: 'timeout-deep-validation',
      commandClass: 'deep-validation',
      timeoutSeconds: 900,
      matcher: 'full suite, live Quest runtime validation, installer/update E2E',
      reason: 'Deep runtime validation needs enough time to complete without false timeout kills.',
    },
    {
      id: 'timeout-runtime-live',
      commandClass: 'runtime-live',
      timeoutSeconds: 900,
      matcher: 'RUN_LIVE_KIMI=1, quest-v8:kimi, quest daemon smoke',
      reason: 'Live Kimi/OpenAgent flows include model, tool, daemon, and write-back latency.',
    },
    {
      id: 'timeout-docker-network',
      commandClass: 'docker',
      timeoutSeconds: 900,
      matcher: 'docker build, docker push, install/update with network',
      reason: 'Network and image operations are prone to long but valid execution.',
    },
  ]

  const runtimeFacing = hasRuntimeSurface(options.files)
  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    defaultTimeoutSeconds: runtimeFacing ? 300 : 120,
    kimiRecommended: {
      normalValidationSeconds: 300,
      deepValidationSeconds: 900,
      nativeTimeoutSymptom: 'Killed by timeout (30s)',
    },
    rules,
    policy: [
      'Classify command duration before execution.',
      'For Kimi shell/background tools, request timeout_s explicitly for commands that may exceed 20 seconds.',
      'Split long validation into smaller replayable commands when feasible.',
      'If native timeout occurs, retry once only with a larger timeout and narrower scope, then block with next steps.',
    ],
  }
}

function buildClaimLedger(
  commandEvents: CommandEvent[],
  options: BuildQuestRuntimeReliabilityOptions,
): QuestClaimLedger {
  const claims: QuestEvidenceReplayClaim[] = []
  const validationCommands = successfulCommands(commandEvents)

  addClaim(claims, {
    id: 'claim-files-changed',
    claim: options.files.length > 0 ? `${options.files.length} affected files were identified.` : 'No affected files were identified.',
    status: options.files.length > 0 ? 'verified' : 'inferred',
    confidence: options.files.length > 0 ? 0.9 : 0.55,
    evidence: options.files.slice(0, 12),
    requiredAction: options.files.length > 0 ? 'Use these files as the replay scope.' : 'Refresh with --changed-file if the working-tree scope is incomplete.',
  })

  addClaim(claims, {
    id: 'claim-validation-evidence',
    claim: validationCommands.length > 0 ? 'Validation commands have successful evidence.' : 'Validation evidence is missing.',
    status: validationCommands.length > 0 ? 'verified' : 'missing',
    confidence: validationCommands.length > 0 ? 0.88 : 0.3,
    evidence: validationCommands.slice(0, 8),
    replayCommand: options.testRecommendations[0]?.command,
    requiredAction: validationCommands.length > 0 ? 'Keep command outputs attached to the Quest.' : 'Run selected smart tests before claiming tested status.',
  })

  addClaim(claims, {
    id: 'claim-runtime-parity',
    claim: 'Runtime parity requirements were evaluated for OpenCode, Kimi, Codex, and Claude.',
    status: options.runtimeParity.opencode || options.runtimeParity.kimi || options.runtimeParity.codex || options.runtimeParity.claude ? 'verified' : 'inferred',
    confidence: 0.78,
    evidence: runtimeParityEvidence(options.runtimeParity),
    replayCommand: runtimeReplayCommand(options.runtimeParity),
    requiredAction: 'Run required runtime smokes when runtime-facing files changed.',
  })

  addClaim(claims, {
    id: 'claim-release-readiness',
    claim: `Release readiness is ${options.verifiedDelivery.releaseReadinessDashboard.verdict}.`,
    status: options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 'verified' : options.verifiedDelivery.releaseReadinessDashboard.verdict === 'blocked' ? 'blocked' : 'inferred',
    confidence: options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 0.9 : 0.65,
    evidence: ['release-readiness-dashboard.json', ...options.verifiedDelivery.releaseReadinessDashboard.blockers.slice(0, 6)],
    requiredAction: options.verifiedDelivery.releaseReadinessDashboard.verdict === 'pass' ? 'No release-readiness blocker detected.' : 'Close or explicitly defer release-readiness blockers.',
  })

  addClaim(claims, {
    id: 'claim-product-architecture-next-step',
    claim: 'Product/architecture next-step recommendations were generated.',
    status: options.productArchitect.architectureNextSteps.length > 0 ? 'verified' : 'missing',
    confidence: options.productArchitect.architectureNextSteps.length > 0 ? 0.84 : 0.25,
    evidence: ['product-architect-review.json', 'strategic-next-actions.md'],
    requiredAction: 'Show next-step choices to the user instead of continuing automatically.',
  })

  const summary = {
    verified: claims.filter((claim) => claim.status === 'verified').length,
    inferred: claims.filter((claim) => claim.status === 'inferred').length,
    missing: claims.filter((claim) => claim.status === 'missing').length,
    blocked: claims.filter((claim) => claim.status === 'blocked').length,
  }

  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    summary,
    claims,
    policy: [
      'Final summaries must not claim tested, pushed, or release-ready status without a verified claim.',
      'Missing claims become replay commands or explicit skipped-check notes.',
      'Blocked claims prevent confident completion language.',
    ],
  }
}

function buildAutonomousRecoveryPlan(
  commandFailureIndex: QuestCommandFailureIndex,
  claimLedger: QuestClaimLedger,
  runtimeDoctorReport: QuestRuntimeDoctorReport,
  options: BuildQuestRuntimeReliabilityOptions,
): QuestAutonomousRecoveryPlan {
  const actions: QuestAutonomousRecoveryAction[] = []

  for (const fingerprint of commandFailureIndex.fingerprints) {
    actions.push({
      id: `recover-${fingerprint.id}`,
      trigger: `${fingerprint.kind}:${fingerprint.normalizedCommand}`,
      priority: fingerprint.kind === 'timeout' || fingerprint.kind === 'step-limit' ? 'high' : 'medium',
      action: fingerprint.recommendedFix,
      command: saferCommandFor(fingerprint, options),
      approvalRequired: false,
      evidence: fingerprint.evidence,
    })
  }

  for (const claim of claimLedger.claims.filter((claim) => claim.status === 'missing' || claim.status === 'blocked')) {
    actions.push({
      id: `recover-${claim.id}`,
      trigger: `claim:${claim.status}`,
      priority: claim.status === 'blocked' ? 'high' : 'medium',
      action: claim.requiredAction,
      command: claim.replayCommand,
      approvalRequired: false,
      evidence: claim.evidence,
    })
  }

  for (const check of runtimeDoctorReport.checks.filter((check) => check.status === 'fail')) {
    actions.push({
      id: `recover-${check.id}`,
      trigger: `doctor:${check.id}`,
      priority: 'high',
      action: check.recommendedAction,
      approvalRequired: false,
      evidence: check.evidence,
    })
  }

  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    verdict: actions.some((action) => action.priority === 'high') ? 'review' : 'pass',
    actions: uniqueById(actions).slice(0, 12),
    decisionRules: [
      'Prefer replaying the smallest command that proves the missing claim.',
      'Retry a timeout once with explicit larger timeout and narrower scope.',
      'Escalate repeated command fingerprints to user-visible blocked state.',
      'Never continue follow-up work automatically after completion; suggest choices.',
    ],
  }
}

function buildFlakyCommandMemory(commandFailureIndex: QuestCommandFailureIndex): QuestFlakyCommandMemory {
  return {
    version: QUEST_RUNTIME_RELIABILITY_VERSION,
    commands: commandFailureIndex.fingerprints
      .filter((fingerprint) => fingerprint.occurrences > 1 || fingerprint.kind === 'flaky')
      .map((fingerprint) => ({
        id: `flaky-${fingerprint.id}`,
        command: fingerprint.command,
        occurrences: fingerprint.occurrences,
        trend: fingerprint.occurrences >= 3 ? 'worsening' : 'flaky',
        lastFailure: fingerprint.evidence.at(-1) ?? 'unknown',
        knownFixes: [fingerprint.recommendedFix],
        evidence: fingerprint.evidence,
      })),
    policy: [
      'Repeated failed commands are memory candidates, not automatic long-term skills.',
      'Known fixes should be used before retrying the same command fingerprint.',
    ],
  }
}

function extractCommandEvents(events: BuildQuestRuntimeReliabilityOptions['events']): CommandEvent[] {
  const commandEvents: CommandEvent[] = []
  for (const event of events) {
    const data = event.data ?? {}
    const command = asString(data.command ?? data.cmd ?? data.validationCommand)
    const message = asString(data.message ?? data.summary ?? data.errorMessage ?? data.errorPreview ?? data.stdoutPreview) ?? ''
    const runtime = normalizeRuntime(asString(data.runtime))
    const ok = data.ok === true || data.passed === true || data.status === 'completed'
    const failed =
      data.ok === false ||
      data.passed === false ||
      data.status === 'failed' ||
      data.status === 'blocked' ||
      event.type === 'error'
    if (command || failed || message) {
      commandEvents.push({
        command: command ?? 'unknown command',
        eventType: event.type ?? 'unknown',
        ok: ok && !failed,
        message,
        runtime,
        timestamp: event.timestamp,
      })
    }
  }
  return commandEvents
}

function checkRuntimeCli(runtime: QuestRuntimeNameV18): QuestRuntimeDoctorCheck {
  const binary = runtime === 'opencode' ? 'opencode' : runtime
  try {
    const result = spawnSync(binary, ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000,
    })
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    return {
      id: `${runtime}-cli`,
      runtime,
      status: result.status === 0 ? 'pass' : 'fail',
      summary: result.status === 0 ? `${runtime} CLI is available.` : `${runtime} CLI did not return a healthy version.`,
      evidence: output ? [output.split('\n')[0] ?? output] : [],
      recommendedAction: result.status === 0 ? 'No action needed.' : `Install or repair the ${runtime} CLI before strict runtime validation.`,
    }
  } catch (err) {
    return {
      id: `${runtime}-cli`,
      runtime,
      status: 'fail',
      summary: `${runtime} CLI is not available.`,
      evidence: [err instanceof Error ? err.message : String(err)],
      recommendedAction: `Install or repair the ${runtime} CLI before strict runtime validation.`,
    }
  }
}

function checkKimiAdapter(projectRoot: string): QuestRuntimeDoctorCheck {
  const repoAdapter = join(projectRoot, 'plugins', 'kimi-code', 'openagent.yaml')
  const installedAdapter = join(homedir(), '.kimi', 'agents', 'openagents-control', 'openagent.yaml')
  if (!existsSync(installedAdapter)) {
    return {
      id: 'kimi-installed-adapter',
      runtime: 'kimi',
      status: 'fail',
      summary: 'Kimi OpenAgent adapter is not installed.',
      evidence: [installedAdapter],
      recommendedAction: './install.sh advanced --with-kimi',
    }
  }
  if (existsSync(repoAdapter)) {
    const repo = readFileSafe(repoAdapter)
    const installed = readFileSafe(installedAdapter)
    if (repo && installed && repo !== installed) {
      return {
        id: 'kimi-installed-adapter',
        runtime: 'kimi',
        status: 'warn',
        summary: 'Installed Kimi adapter differs from the repository plugin.',
        evidence: [repoAdapter, installedAdapter],
        recommendedAction: './update.sh --with-kimi',
      }
    }
  }
  return {
    id: 'kimi-installed-adapter',
    runtime: 'kimi',
    status: 'pass',
    summary: 'Installed Kimi adapter is present and matches when repo copy is available.',
    evidence: [installedAdapter],
    recommendedAction: 'No action needed.',
  }
}

function checkKimiConfig(): QuestRuntimeDoctorCheck {
  const configPath = join(homedir(), '.kimi', 'config.toml')
  const raw = readFileSafe(configPath)
  if (!raw) {
    return {
      id: 'kimi-config',
      runtime: 'kimi',
      status: 'warn',
      summary: 'Kimi config.toml was not found.',
      evidence: [configPath],
      recommendedAction: 'Run Kimi once or configure ~/.kimi/config.toml for max_steps_per_turn and tool timeouts.',
    }
  }
  const maxSteps = raw.match(/max_steps_per_turn\s*=\s*(\d+)/)?.[1]
  const toolTimeout = raw.match(/tool_call_timeout_ms\s*=\s*(\d+)/)?.[1]
  const status = Number(maxSteps ?? 0) >= 100 ? 'pass' : 'warn'
  return {
    id: 'kimi-config',
    runtime: 'kimi',
    status,
    summary: `Kimi config has max_steps_per_turn=${maxSteps ?? 'unknown'} and tool_call_timeout_ms=${toolTimeout ?? 'unknown'}.`,
    evidence: [configPath],
    recommendedAction: status === 'pass'
      ? 'No action needed for step budget; still request timeout_s for long shell commands.'
      : 'Set max_steps_per_turn near 160 for deep QuestMode coding sessions.',
  }
}

function doctorVerdict(checks: QuestRuntimeDoctorCheck[]): QuestReliabilityVerdict {
  if (checks.some((check) => check.status === 'fail')) return 'blocked'
  if (checks.some((check) => check.status === 'warn')) return 'review'
  return 'pass'
}

function buildReplayCommands(options: BuildQuestRuntimeReliabilityOptions): string[] {
  const commands = unique([
    'git diff --check',
    ...options.testRecommendations.map((test) => test.command),
    hasRuntimeSurface(options.files) && options.runtimeParity.kimi
      ? 'RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'
      : '',
    options.runtimeParity.opencode ? 'npm run test:quest-v8:opencode' : '',
    options.runtimeParity.codex ? 'npm run test:quest-v8:codex' : '',
  ]).filter(Boolean)
  return commands.slice(0, 10)
}

function successfulCommands(events: CommandEvent[]): string[] {
  return unique(events.filter((event) => event.ok && event.command !== 'unknown command').map((event) => event.command))
}

function addClaim(claims: QuestEvidenceReplayClaim[], claim: QuestEvidenceReplayClaim): void {
  if (!claims.some((candidate) => candidate.id === claim.id)) claims.push(claim)
}

function runtimeParityEvidence(parity: QuestRuntimeParity): string[] {
  return [
    parity.opencode ? 'runtime-parity:opencode' : '',
    parity.kimi ? 'runtime-parity:kimi' : '',
    parity.codex ? 'runtime-parity:codex' : '',
    parity.claude ? 'runtime-parity:claude' : '',
    parity.reason,
  ].filter(Boolean)
}

function runtimeReplayCommand(parity: QuestRuntimeParity): string | undefined {
  if (parity.kimi) return 'RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'
  if (parity.opencode) return 'npm run test:quest-v8:opencode'
  if (parity.codex) return 'npm run test:quest-v8:codex'
  return undefined
}

function saferCommandFor(
  fingerprint: QuestCommandFailureFingerprint,
  options: BuildQuestRuntimeReliabilityOptions,
): string | undefined {
  if (fingerprint.kind === 'timeout' && fingerprint.command.includes('test:quest-v8:kimi')) {
    return 'RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'
  }
  if (fingerprint.kind === 'timeout') return options.testRecommendations[0]?.command
  if (fingerprint.kind === 'step-limit') return 'oac quest-resume <quest-id> --runtime kimi'
  return fingerprint.command === 'unknown command' ? undefined : fingerprint.command
}

function recommendedFixFor(
  kind: QuestCommandFailureKind,
  command: string,
  options: BuildQuestRuntimeReliabilityOptions,
): string {
  switch (kind) {
    case 'timeout':
      return command.includes('kimi')
        ? 'Rerun with an explicit Kimi shell/task timeout_s of 300-900 and a narrower validation scope.'
        : 'Rerun once with a larger timeout or split the command into smaller replayable checks.'
    case 'step-limit':
      return 'Resume from Quest state with a narrower task slice instead of restarting the entire run.'
    case 'missing-dependency':
      return 'Install or repair the missing dependency, then rerun the smallest affected validation command.'
    case 'flaky':
      return 'Check flaky-command-memory.json and use the known fix before retrying.'
    case 'exit-code':
      return 'Inspect command output, fix the direct failure, then rerun the same focused command once.'
    default:
      return options.testRecommendations[0]?.command
        ? `Run focused validation: ${options.testRecommendations[0].command}`
        : 'Inspect the failure output and add a replay command before completion.'
  }
}

function failureKind(text: string): QuestCommandFailureKind {
  if (/killed by timeout|timed out|timeout\s*\(/i.test(text)) return 'timeout'
  if (/max(?:imum)? number of steps reached|max-steps-per-turn|step limit/i.test(text)) return 'step-limit'
  if (/command not found|no such file|cannot find module|missing dependency|not installed/i.test(text)) return 'missing-dependency'
  if (/flaky|intermittent|retry/i.test(text)) return 'flaky'
  if (/exit code|failed|error/i.test(text)) return 'exit-code'
  return 'unknown'
}

function normalizeCommand(command: string): string {
  return command
    .replace(/\s+/g, ' ')
    .replace(/\/var\/folders\/[^\s]+/g, '<tmp>')
    .replace(/\/tmp\/[^\s]+/g, '<tmp>')
    .trim()
    .slice(0, 180)
}

function runtimeFromText(text: string): QuestRuntimeNameV18 | 'unknown' {
  const lower = text.toLowerCase()
  if (lower.includes('kimi')) return 'kimi'
  if (lower.includes('opencode')) return 'opencode'
  if (lower.includes('codex')) return 'codex'
  if (lower.includes('claude')) return 'claude'
  return 'unknown'
}

function normalizeRuntime(value: string | undefined): QuestRuntimeNameV18 | 'unknown' {
  if (value === 'kimi' || value === 'opencode' || value === 'codex' || value === 'claude') return value
  return 'unknown'
}

function combineVerdicts(verdicts: QuestReliabilityVerdict[]): QuestReliabilityVerdict {
  if (verdicts.includes('blocked')) return 'blocked'
  if (verdicts.includes('review')) return 'review'
  return 'pass'
}

function hasRuntimeSurface(files: string[]): boolean {
  return files.some(
    (file) =>
      file.startsWith('plugins/') ||
      file.includes('runtime') ||
      file.includes('test-kimi-quest') ||
      file.includes('test-opencode-quest') ||
      file.includes('test-codex-quest') ||
      file === 'install.sh' ||
      file === 'update.sh',
  )
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.id, item)
  return [...map.values()]
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'unknown'
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

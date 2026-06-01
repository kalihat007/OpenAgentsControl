/**
 * Quest Coding Execution.
 *
 * Deterministic execution-grade artifacts for acceptance, guarded autofix,
 * contract drift, review patch loops, test gaps, regression snapshots, runtime
 * compatibility, ownership locks, security gates, and PR packaging.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { CodebaseIndex, ImpactAnalysis } from './codebase-indexer.js'
import type {
  QuestCodingAutopilot,
  QuestAutomaticCodeReview,
  QuestFailureMemory,
  QuestPatchLedger,
  QuestPrReadiness,
  QuestRuntimeParityEnforcer,
  QuestSmartTestMatrix,
} from './quest-coding-autopilot.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'

export const QUEST_CODING_EXECUTION_VERSION = '11' as const

export interface QuestExecutableAcceptance {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  doneDefinition: string[]
  checks: Array<{
    id: string
    title: string
    kind: 'command' | 'artifact' | 'review' | 'runtime' | 'manual'
    command?: string
    artifact?: string
    required: boolean
    status: 'pending' | 'passed' | 'failed' | 'not-applicable'
    source: string
  }>
  evidenceRequired: string[]
}

export interface QuestGuardedAutofixRunner {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  enabled: boolean
  maxIterations: number
  queue: Array<{
    id: string
    command: string
    reason: string
    retryOf?: string
    /** Set when the command is a chronic cross-quest failure: escalate, do not auto-retry. */
    escalate?: boolean
  }>
  writableFiles: string[]
  guardrails: string[]
  stopConditions: string[]
}

export interface QuestContractDriftGuard {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  watchedContracts: Array<{
    id: string
    kind: 'api' | 'cli' | 'schema' | 'runtime-prompt' | 'installer' | 'docs' | 'package'
    path: string
    implementationHints: string[]
    status: 'watch' | 'needs-review' | 'covered'
  }>
  driftRisks: QuestReviewSignal[]
  commands: string[]
}

export interface QuestReviewPatchLoop {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  enabled: boolean
  capsules: Array<{
    id: string
    sourceFinding: string
    severity: QuestReviewSignal['severity']
    patchCapsuleId?: string
    files: string[]
    validationCommands: string[]
    status: 'planned' | 'blocked' | 'complete'
  }>
  loop: string[]
  stopConditions: string[]
}

export interface QuestTestGapFinder {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  gaps: Array<{
    id: string
    sourceFile: string
    suggestedTestFile: string
    reason: string
    severity: 'info' | 'warning' | 'error'
  }>
  coverageConfidence: number
  suggestedCommands: string[]
}

export interface QuestRegressionSnapshots {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  snapshots: Array<{
    id: string
    name: string
    kind: 'cli-output' | 'artifact-shape' | 'runtime-prompt' | 'event-stream' | 'docs'
    source: string
    command?: string
    expectedSignals: string[]
  }>
  updatePolicy: string[]
}

export interface QuestRuntimeCompatibilityMatrix {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  runtimes: Array<{
    runtime: 'opencode' | 'kimi' | 'codex' | 'claude'
    promptFiles: string[]
    installedPaths: string[]
    harnessCommand: string
    requiredClauses: string[]
    status: 'covered' | 'needs-test' | 'not-required'
  }>
  allRequiredCovered: boolean
  commands: string[]
}

export interface QuestOwnershipLockPlan {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  owners: Array<{
    owner: string
    files: string[]
    reason: string
  }>
  locks: Array<{
    file: string
    owner: string
    mode: 'read' | 'write'
  }>
  conflicts: Array<{
    file: string
    owners: string[]
    recommendation: string
  }>
  rules: string[]
}

export interface QuestSecuritySecretsGate {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  verdict: 'pass' | 'review' | 'blocked'
  requiresApproval: boolean
  findings: Array<{
    id: string
    severity: 'info' | 'warning' | 'error'
    file: string
    summary: string
    recommendation: string
  }>
  patternsChecked: string[]
  commands: string[]
}

export interface QuestPrAutoPackager {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  ready: boolean
  title: string
  bodyMarkdown: string
  commitGroups: Array<{ title: string; files: string[] }>
  validationEvidence: string[]
  blockers: string[]
}

export interface QuestCodingExecution {
  version: typeof QUEST_CODING_EXECUTION_VERSION
  generatedAt: string
  executableAcceptance: QuestExecutableAcceptance
  guardedAutofixRunner: QuestGuardedAutofixRunner
  contractDriftGuard: QuestContractDriftGuard
  reviewPatchLoop: QuestReviewPatchLoop
  testGapFinder: QuestTestGapFinder
  regressionSnapshots: QuestRegressionSnapshots
  runtimeCompatibilityMatrix: QuestRuntimeCompatibilityMatrix
  ownershipLockPlan: QuestOwnershipLockPlan
  securitySecretsGate: QuestSecuritySecretsGate
  prAutoPackager: QuestPrAutoPackager
}

export interface BuildQuestCodingExecutionOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  /** Commands that are chronic cross-quest failures (from Temporal Memory). */
  chronicCommands?: string[]
}

export async function buildQuestCodingExecution(
  options: BuildQuestCodingExecutionOptions,
): Promise<QuestCodingExecution> {
  const executableAcceptance = buildExecutableAcceptance(
    options.codingAutopilot.smartTestMatrix,
    options.codingAutopilot.patchLedger,
    options.codingAutopilot.runtimeParityEnforcer,
    options.codingAutopilot.automaticCodeReview,
    options.events,
  )
  const guardedAutofixRunner = buildGuardedAutofixRunner(
    options.codingAutopilot.failureMemory,
    options.codingAutopilot.smartTestMatrix,
    options.codingAutopilot.preEditContract.allowedFiles,
    executableAcceptance,
    options.chronicCommands ?? [],
  )
  const contractDriftGuard = buildContractDriftGuard(
    options.files,
    options.testRecommendations,
    options.runtimeParity,
  )
  const reviewPatchLoop = buildReviewPatchLoop(
    options.codingAutopilot.automaticCodeReview,
    options.codingAutopilot.patchLedger,
    options.codingAutopilot.smartTestMatrix,
  )
  const testGapFinder = buildTestGapFinder(options.files, options.index, options.codingAutopilot.smartTestMatrix)
  const regressionSnapshots = buildRegressionSnapshots(options.files, options.runtimeParity, options.codingAutopilot)
  const runtimeCompatibilityMatrix = buildRuntimeCompatibilityMatrix(options.runtimeParity, options.codingAutopilot.runtimeParityEnforcer)
  const ownershipLockPlan = buildOwnershipLockPlan(options.files)
  const securitySecretsGate = await buildSecuritySecretsGate(options.projectRoot, options.files, options.testRecommendations)
  const prAutoPackager = buildPrAutoPackager(
    options.objective,
    options.codingAutopilot.prReadiness,
    executableAcceptance,
    contractDriftGuard,
    testGapFinder,
    runtimeCompatibilityMatrix,
    securitySecretsGate,
  )

  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    generatedAt: new Date().toISOString(),
    executableAcceptance,
    guardedAutofixRunner,
    contractDriftGuard,
    reviewPatchLoop,
    testGapFinder,
    regressionSnapshots,
    runtimeCompatibilityMatrix,
    ownershipLockPlan,
    securitySecretsGate,
    prAutoPackager,
  }
}

export async function writeQuestCodingExecutionArtifacts(
  dir: string,
  execution: QuestCodingExecution,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'coding-execution.json'), execution),
    writeJson(join(dir, 'executable-acceptance.json'), execution.executableAcceptance),
    writeJson(join(dir, 'guarded-autofix-runner.json'), execution.guardedAutofixRunner),
    writeJson(join(dir, 'contract-drift-guard.json'), execution.contractDriftGuard),
    writeJson(join(dir, 'review-patch-loop.json'), execution.reviewPatchLoop),
    writeJson(join(dir, 'test-gap-finder.json'), execution.testGapFinder),
    writeJson(join(dir, 'regression-snapshots.json'), execution.regressionSnapshots),
    writeJson(join(dir, 'runtime-compatibility-matrix.json'), execution.runtimeCompatibilityMatrix),
    writeJson(join(dir, 'ownership-lock-plan.json'), execution.ownershipLockPlan),
    writeJson(join(dir, 'security-secrets-gate.json'), execution.securitySecretsGate),
    writeJson(join(dir, 'pr-auto-packager.json'), execution.prAutoPackager),
    writeFile(join(dir, 'pr-auto-packager.md'), execution.prAutoPackager.bodyMarkdown),
  ])
}

export function formatCodingExecutionSummary(execution: QuestCodingExecution): string {
  const lines = [
    '## Coding Execution',
    '',
    `- Acceptance checks: ${execution.executableAcceptance.checks.length}`,
    `- Guarded autofix: ${execution.guardedAutofixRunner.enabled ? 'enabled' : 'not needed'}`,
    `- Contract drift watchers: ${execution.contractDriftGuard.watchedContracts.length}`,
    `- Review patch capsules: ${execution.reviewPatchLoop.capsules.length}`,
    `- Test gaps: ${execution.testGapFinder.gaps.length}`,
    `- Regression snapshots: ${execution.regressionSnapshots.snapshots.length}`,
    `- Runtime matrix covered: ${execution.runtimeCompatibilityMatrix.allRequiredCovered ? 'yes' : 'no'}`,
    `- Security gate: ${execution.securitySecretsGate.verdict}`,
    `- PR package ready: ${execution.prAutoPackager.ready ? 'yes' : 'no'}`,
    '',
  ]
  return lines.join('\n')
}

function buildExecutableAcceptance(
  matrix: QuestSmartTestMatrix,
  ledger: QuestPatchLedger,
  runtimeParity: QuestRuntimeParityEnforcer,
  review: QuestAutomaticCodeReview,
  events: Array<{ type?: string; data?: Record<string, unknown> }>,
): QuestExecutableAcceptance {
  const validationStatus = validationStatusByCommand(events)
  const commandChecks: QuestExecutableAcceptance['checks'] = matrix.minimumCredibleCommands.map((command, index) => ({
    id: `accept-command-${index + 1}`,
    title: `Run ${command}`,
    kind: 'command' as const,
    command,
    required: true,
    status: validationStatus.get(command) ?? 'pending',
    source: 'smart-test-matrix',
  }))
  const artifactChecks = [
    'coding-intelligence.json',
    'coding-autopilot.json',
    'coding-execution.json',
    'verified-knowledgebase.json',
    'evidence-ledger.json',
    'hallucination-gate.json',
    'coding-review.md',
    'pr-auto-packager.md',
    'verified-knowledgebase.md',
  ].map((artifact, index) => ({
    id: `accept-artifact-${index + 1}`,
    title: `Refresh ${artifact}`,
    kind: 'artifact' as const,
    artifact,
    required: true,
    status: 'pending' as const,
    source: 'quest-coding-execution',
  }))
  const reviewCheck = {
    id: 'accept-review-verdict',
    title: 'Automatic review verdict is not blocked',
    kind: 'review' as const,
    required: true,
    status: review.verdict === 'blocked' ? 'failed' as const : 'pending' as const,
    source: 'automatic-code-review',
  }
  const runtimeCheck = {
    id: 'accept-runtime-parity',
    title: 'Required runtime parity checks are covered',
    kind: 'runtime' as const,
    required: runtimeParity.requiredRuntimes.length > 0,
    status: runtimeParity.requiredRuntimes.length === 0
      ? 'not-applicable' as const
      : runtimeParity.satisfiedBySelectedTests ? 'pending' as const : 'failed' as const,
    source: 'runtime-parity-enforcer',
  }
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    doneDefinition: [
      'All required command checks are run or explicitly reported as blocked.',
      'All patch ledger entries have validation evidence or a documented reason.',
      'Automatic review, security gate, runtime parity, and PR package have no blocking findings.',
      'The user receives suggested next steps and QuestMode waits for a decision.',
    ],
    checks: [
      ...commandChecks,
      ...artifactChecks,
      reviewCheck,
      runtimeCheck,
      ...ledger.entries.map((entry, index) => ({
        id: `accept-ledger-${index + 1}`,
        title: `Patch ledger entry ${entry.id} has validation plan`,
        kind: 'manual' as const,
        required: true,
        status: entry.validationCommands.length > 0 ? 'pending' as const : 'failed' as const,
        source: entry.id,
      })),
    ],
    evidenceRequired: [
      'commands run with pass/fail result',
      'files changed or no-op explanation',
      'runtime parity result when runtime-facing files changed',
      'security/secret gate verdict',
      'PR package summary and blockers',
    ],
  }
}

function buildGuardedAutofixRunner(
  failureMemory: QuestFailureMemory,
  matrix: QuestSmartTestMatrix,
  writableFiles: string[],
  acceptance: QuestExecutableAcceptance,
  chronicCommands: string[],
): QuestGuardedAutofixRunner {
  const failingCommands = acceptance.checks
    .filter((check) => check.kind === 'command' && check.status === 'failed' && check.command)
    .map((check) => check.command as string)
  const commands = unique([
    ...failureMemory.failures.map((failure) => failure.command),
    ...failingCommands,
    ...matrix.minimumCredibleCommands,
  ]).slice(0, 10)
  const chronic = new Set(chronicCommands)
  const hasChronic = commands.some((command) => chronic.has(command))
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    enabled: failureMemory.failures.length > 0 || failingCommands.length > 0,
    maxIterations: 2,
    queue: commands.map((command, index) => {
      const isKnownFailure = failureMemory.failures.some((failure) => failure.command === command)
      const isChronic = chronic.has(command)
      return {
        id: `autofix-${index + 1}`,
        command,
        reason: isChronic
          ? 'Chronic cross-quest failure — escalate and explain instead of auto-retrying.'
          : isKnownFailure
            ? 'Replay a known failure before widening validation.'
            : 'Run the minimum credible check and patch only owned files if it fails.',
        ...(isKnownFailure && { retryOf: command }),
        ...(isChronic && { escalate: true }),
      }
    }),
    writableFiles,
    guardrails: [
      'Patch only files in the pre-edit contract.',
      'Apply one small fix per iteration.',
      'Rerun the same failing command before broader validation.',
      'Do not touch secrets, production configuration, paid services, or destructive operations.',
      ...(hasChronic
        ? ['Do not auto-retry chronic commands; surface the durable failure history and ask for guidance.']
        : []),
    ],
    stopConditions: [
      'The same command fails twice with the same fingerprint.',
      'A chronic cross-quest failure command is queued (escalate immediately).',
      'The fix requires files outside the ownership lock plan.',
      'The security gate becomes blocked.',
      'Runtime parity fails after two attempts.',
    ],
  }
}

function buildContractDriftGuard(
  files: string[],
  tests: QuestTestRecommendation[],
  runtimeParity: QuestRuntimeParity,
): QuestContractDriftGuard {
  const contracts = files.flatMap((file) => {
    const kind = contractKind(file)
    if (!kind) return []
    return [{
      id: `contract-${stableId(file)}`,
      kind,
      path: file,
      implementationHints: implementationHintsForContract(file, kind),
      status: kind === 'runtime-prompt' || kind === 'installer' ? 'needs-review' as const : 'watch' as const,
    }]
  })
  const driftRisks: QuestReviewSignal[] = contracts.map((contract) => ({
    id: `drift-${contract.id}`,
    severity: contract.status === 'needs-review' ? 'warning' : 'info',
    summary: `${contract.kind} contract may drift from implementation.`,
    files: [contract.path, ...contract.implementationHints],
    recommendation: 'Check matching implementation, docs, generated artifacts, and runtime harnesses before completion.',
  }))
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    watchedContracts: contracts,
    driftRisks,
    commands: unique([
      ...tests.filter((test) => test.scope === 'runtime' || test.scope === 'shell').map((test) => test.command),
      ...(runtimeParity.kimi ? ['npm run test:quest-v8:kimi'] : []),
      ...(runtimeParity.opencode ? ['npm run test:quest-v8:opencode'] : []),
      ...(runtimeParity.codex ? ['npm run test:quest-v8:codex'] : []),
    ]),
  }
}

function buildReviewPatchLoop(
  review: QuestAutomaticCodeReview,
  ledger: QuestPatchLedger,
  matrix: QuestSmartTestMatrix,
): QuestReviewPatchLoop {
  const capsules = review.findings.map((finding, index) => {
    const matchingLedger = ledger.entries.find((entry) => entry.files.some((file) => finding.files.includes(file)))
    return {
      id: `review-patch-${index + 1}`,
      sourceFinding: finding.id,
      severity: finding.severity,
      ...(matchingLedger && { patchCapsuleId: matchingLedger.id }),
      files: finding.files,
      validationCommands: matchingLedger?.validationCommands.length
        ? matchingLedger.validationCommands
        : matrix.minimumCredibleCommands.slice(0, 3),
      status: finding.severity === 'error' ? 'blocked' as const : 'planned' as const,
    }
  })
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    enabled: capsules.length > 0,
    capsules,
    loop: [
      'Pick the highest-severity review capsule.',
      'Patch only the listed files.',
      'Run capsule validation commands.',
      'Refresh coding intelligence and continue with the next capsule.',
      'Stop when a capsule is blocked or all findings are resolved.',
    ],
    stopConditions: [
      'A patch requires files outside the pre-edit contract.',
      'A validation command fails twice.',
      'A finding requires user approval or product direction.',
    ],
  }
}

function buildTestGapFinder(
  files: string[],
  index: CodebaseIndex,
  matrix: QuestSmartTestMatrix,
): QuestTestGapFinder {
  const allFiles = new Set([
    ...Object.keys(index.dependencies),
    ...index.modules.map((module) => module.path),
    ...files,
  ])
  const gaps = files
    .filter((file) => isSourceFile(file) && !isTestFile(file))
    .flatMap((file) => {
      if (hasNearbyTest(file, allFiles)) return []
      const suggestedTestFile = suggestedTestPath(file)
      return [{
        id: `test-gap-${stableId(file)}`,
        sourceFile: file,
        suggestedTestFile,
        reason: 'Changed source file has no nearby test file in the indexed codebase.',
        severity: criticalSource(file) ? 'warning' as const : 'info' as const,
      }]
    })
  const confidence = files.length === 0 ? 0.5 : Math.max(0.2, 1 - gaps.length / Math.max(files.length, 1))
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    gaps,
    coverageConfidence: Number(confidence.toFixed(2)),
    suggestedCommands: matrix.minimumCredibleCommands,
  }
}

function buildRegressionSnapshots(
  files: string[],
  parity: QuestRuntimeParity,
  autopilot: QuestCodingAutopilot,
): QuestRegressionSnapshots {
  const snapshots: QuestRegressionSnapshots['snapshots'] = [
    {
      id: 'snapshot-quest-v9-output',
      name: 'quest-v9 sidecar output',
      kind: 'cli-output' as const,
      source: 'oac quest-v9',
      command: 'oac quest-v9 <quest-id>',
      expectedSignals: [
        'coding-intelligence.json',
        'coding-autopilot.json',
        'coding-execution.json',
        'verified-knowledgebase.json',
        'executable-acceptance.json',
        'runtime-compatibility-matrix.json',
      ],
    },
    {
      id: 'snapshot-artifact-shapes',
      name: 'coding artifact JSON versions',
      kind: 'artifact-shape' as const,
      source: '.oac/runs/{quest-id}/',
      expectedSignals: ['version:9', 'codingAutopilot.version:10', 'codingExecution.version:11', 'verifiedKnowledgebase.version:12'],
    },
  ]
  if (parity.kimi || files.some((file) => file.includes('kimi'))) {
    snapshots.push({
      id: 'snapshot-kimi-direct-prompt',
      name: 'Kimi Quest direct prompt',
      kind: 'runtime-prompt',
      source: 'scripts/tests/test-kimi-quest-v8.sh',
      command: 'npm run test:quest-v8:kimi',
      expectedSignals: ['OpenAgent Quest Spec', 'REFLECT', 'coding-execution.json', 'executable-acceptance.json', 'verified-knowledgebase.json'],
    })
  }
  if (autopilot.runtimeParityEnforcer.requiredRuntimes.length > 0) {
    snapshots.push({
      id: 'snapshot-runtime-events',
      name: 'runtime write-back event stream',
      kind: 'event-stream',
      source: 'events.ndjson',
      expectedSignals: ['research.assessed', 'coding.intent', 'tests.selected', 'review.signals'],
    })
  }
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    snapshots,
    updatePolicy: [
      'Update snapshots only after acceptance checks pass.',
      'Keep lifecycle and sidecar names synchronized across OpenCode, Kimi, Codex, and Claude.',
      'Do not treat generated snapshots as product source code.',
    ],
  }
}

function buildRuntimeCompatibilityMatrix(
  parity: QuestRuntimeParity,
  enforcer: QuestRuntimeParityEnforcer,
): QuestRuntimeCompatibilityMatrix {
  const requiredClauses = [
    'OpenAgent Quest Spec',
    'REFLECT',
    'coding-intelligence.json',
    'coding-autopilot.json',
    'coding-execution.json',
    'verified-knowledgebase.json',
    'evidence-ledger.json',
    'hallucination-gate.json',
    'executable-acceptance.json',
    'runtime-compatibility-matrix.json',
  ]
  const runtimes: QuestRuntimeCompatibilityMatrix['runtimes'] = [
    {
      runtime: 'opencode',
      promptFiles: ['.opencode/agent/core/openagent.md', '.opencode/context/core/quest-mode.md'],
      installedPaths: [],
      harnessCommand: 'npm run test:quest-v8:opencode',
      requiredClauses,
      status: runtimeStatus('opencode', parity, enforcer),
    },
    {
      runtime: 'kimi',
      promptFiles: ['plugins/kimi-code/openagent.yaml', 'plugins/kimi-code/openagent-system.md'],
      installedPaths: [
        '~/.kimi/agents/openagents-control/openagent.yaml',
        '~/.kimi/agents/openagents-control/openagent-system.md',
      ],
      harnessCommand: 'npm run test:quest-v8:kimi',
      requiredClauses,
      status: runtimeStatus('kimi', parity, enforcer),
    },
    {
      runtime: 'codex',
      promptFiles: ['plugins/codex-cli/openagent.toml', 'plugins/codex-cli/openagent-system.md'],
      installedPaths: [
        '~/.codex/agents/openagents-control/openagent.toml',
        '~/.codex/agents/openagents-control/openagent-system.md',
      ],
      harnessCommand: 'npm run test:quest-v8:codex',
      requiredClauses,
      status: runtimeStatus('codex', parity, enforcer),
    },
    {
      runtime: 'claude',
      promptFiles: ['plugins/claude-code/openagent-system.md', 'install.sh', 'update.sh'],
      installedPaths: ['~/.claude/plugins/openagents-control-bridge/openagent-system.md'],
      harnessCommand: 'bash -n install.sh update.sh',
      requiredClauses,
      status: runtimeStatus('claude', parity, enforcer),
    },
  ]
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    runtimes,
    allRequiredCovered: runtimes.every((runtime) => runtime.status !== 'needs-test'),
    commands: unique(runtimes.filter((runtime) => runtime.status !== 'not-required').map((runtime) => runtime.harnessCommand)),
  }
}

function buildOwnershipLockPlan(files: string[]): QuestOwnershipLockPlan {
  const grouped = new Map<string, string[]>()
  for (const file of files) {
    const owner = ownerForFile(file)
    grouped.set(owner, [...(grouped.get(owner) ?? []), file])
  }
  const owners = [...grouped.entries()].map(([owner, ownerFiles]) => ({
    owner,
    files: ownerFiles,
    reason: `Owns ${ownerFiles.length} file(s) in ${owner}.`,
  }))
  const locks = owners.flatMap((owner) => owner.files.map((file) => ({
    file,
    owner: owner.owner,
    mode: isGeneratedArtifact(file) ? 'read' as const : 'write' as const,
  })))
  const conflicts = [...new Set(files)]
    .filter((file) => locks.filter((lock) => lock.file === file && lock.mode === 'write').length > 1)
    .map((file) => ({
      file,
      owners: locks.filter((lock) => lock.file === file).map((lock) => lock.owner),
      recommendation: 'Serialize writes to this file and refresh the patch ledger after each write.',
    }))
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    owners,
    locks,
    conflicts,
    rules: [
      'One writer per file at a time.',
      'Generated artifacts are read-only context unless explicitly accepted as output.',
      'Runtime prompt files require parity checks after modification.',
      'Installer/update files require shell syntax checks and install/update smoke validation.',
    ],
  }
}

async function buildSecuritySecretsGate(
  projectRoot: string,
  files: string[],
  tests: QuestTestRecommendation[],
): Promise<QuestSecuritySecretsGate> {
  const patterns = [
    { id: 'private-key', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i, severity: 'error' as const },
    { id: 'api-key-assignment', regex: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"][^'"]{12,}['"]/i, severity: 'error' as const },
    { id: 'env-file', regex: /(^|\/)\.env(?:\.|$)/i, severity: 'warning' as const },
    { id: 'destructive-shell', regex: /\brm\s+-rf\s+(?:\/|\$HOME|~|\*)/i, severity: 'error' as const },
    { id: 'curl-pipe-shell', regex: /\bcurl\b.+\|\s*(?:bash|sh)\b/i, severity: 'warning' as const },
  ]
  const findings: QuestSecuritySecretsGate['findings'] = []
  for (const file of files.filter(isLikelyTextFile).slice(0, 120)) {
    const text = await safeRead(join(projectRoot, file))
    const haystack = text ?? file
    for (const pattern of patterns) {
      if (!pattern.regex.test(haystack)) continue
      findings.push({
        id: `${pattern.id}-${stableId(file)}`,
        severity: pattern.severity,
        file,
        summary: securitySummary(pattern.id),
        recommendation: pattern.severity === 'error'
          ? 'Stop and remove the sensitive or destructive pattern before completion.'
          : 'Review this pattern and document why it is safe in this context.',
      })
    }
  }
  const hasError = findings.some((finding) => finding.severity === 'error')
  const hasWarning = findings.some((finding) => finding.severity === 'warning')
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    verdict: hasError ? 'blocked' : hasWarning ? 'review' : 'pass',
    requiresApproval: hasError || files.some((file) => /auth|secret|credential|payment|deploy|production/i.test(file)),
    findings,
    patternsChecked: patterns.map((pattern) => pattern.id),
    commands: unique([
      'git diff --check',
      ...tests.filter((test) => test.scope === 'shell').map((test) => test.command),
    ]),
  }
}

function buildPrAutoPackager(
  objective: string,
  readiness: QuestPrReadiness,
  acceptance: QuestExecutableAcceptance,
  drift: QuestContractDriftGuard,
  gaps: QuestTestGapFinder,
  runtime: QuestRuntimeCompatibilityMatrix,
  security: QuestSecuritySecretsGate,
): QuestPrAutoPackager {
  const blockers = unique([
    ...readiness.blockers,
    ...(security.verdict === 'blocked' ? ['Security gate is blocked.'] : []),
    ...(runtime.allRequiredCovered ? [] : ['Runtime compatibility matrix has uncovered required runtimes.']),
    ...acceptance.checks.filter((check) => check.required && check.status === 'failed').map((check) => `${check.id} failed.`),
  ])
  const validationEvidence = unique([
    ...acceptance.checks.filter((check) => check.command).map((check) => `${check.command}: ${check.status}`),
    ...runtime.commands.map((command) => `${command}: required when runtime surface changes`),
    ...security.commands.map((command) => `${command}: security gate`),
  ])
  const title = conventionalTitle(objective)
  const body = [
    `# ${title}`,
    '',
    '## Summary',
    '',
    ...readiness.summaryBullets.map((line) => `- ${line}`),
    `- Contract drift watchers: ${drift.watchedContracts.length}`,
    `- Test gaps: ${gaps.gaps.length}`,
    `- Security gate: ${security.verdict}`,
    '',
    '## Validation',
    '',
    ...(validationEvidence.length > 0 ? validationEvidence.map((line) => `- ${line}`) : ['- Validation not recorded yet.']),
    '',
    '## Reviewer Focus',
    '',
    ...(readiness.reviewerFocus.length > 0 ? readiness.reviewerFocus.map((file) => `- ${file}`) : ['- No special focus files detected.']),
    '',
    '## Blockers',
    '',
    ...(blockers.length > 0 ? blockers.map((blocker) => `- ${blocker}`) : ['- No blockers detected.']),
    '',
  ].join('\n')
  return {
    version: QUEST_CODING_EXECUTION_VERSION,
    ready: blockers.length === 0 && readiness.ready && security.verdict !== 'blocked',
    title,
    bodyMarkdown: body,
    commitGroups: readiness.suggestedCommitGroups,
    validationEvidence,
    blockers,
  }
}

function validationStatusByCommand(events: Array<{ type?: string; data?: Record<string, unknown> }>): Map<string, 'passed' | 'failed'> {
  const statuses = new Map<string, 'passed' | 'failed'>()
  for (const event of events) {
    if (event.type !== 'validation') continue
    const result = event.data?.result as { checks?: Array<{ command?: string; passed?: boolean }> } | undefined
    for (const check of result?.checks ?? []) {
      if (!check.command) continue
      statuses.set(check.command, check.passed === false ? 'failed' : 'passed')
    }
  }
  return statuses
}

function contractKind(file: string): QuestContractDriftGuard['watchedContracts'][number]['kind'] | undefined {
  if (/openapi|swagger|schema|graphql|proto/i.test(file)) return 'schema'
  if (/package\.json|tsconfig|eslint|bunfig|package-lock/i.test(file)) return 'package'
  if (/install\.sh|update\.sh/i.test(file)) return 'installer'
  if (/plugins\/|\.opencode\/agent|\.opencode\/context\/core\/quest-mode/i.test(file)) return 'runtime-prompt'
  if (/README|docs\//i.test(file)) return 'docs'
  if (/commands?\//i.test(file) || /src\/commands\//i.test(file)) return 'cli'
  if (/routes?|handlers?|controllers?/i.test(file)) return 'api'
  return undefined
}

function implementationHintsForContract(
  file: string,
  kind: QuestContractDriftGuard['watchedContracts'][number]['kind'],
): string[] {
  if (kind === 'runtime-prompt') {
    return [
      'scripts/tests/test-kimi-quest-v8.sh',
      'scripts/tests/test-opencode-quest-v8.sh',
      'scripts/tests/test-codex-quest-v8.sh',
    ]
  }
  if (kind === 'installer') return ['install.sh', 'update.sh', 'scripts/tests/test-kimi-quest-v8.sh']
  if (kind === 'cli') return ['packages/cli/src/index.ts', 'packages/cli/src/lib/quest-run.ts']
  if (kind === 'docs') return ['README.md', '.opencode/context/core/quest-mode.md']
  if (kind === 'package') return ['package.json', 'packages/cli/package.json']
  return [dirname(file)]
}

function runtimeStatus(
  runtime: QuestRuntimeCompatibilityMatrix['runtimes'][number]['runtime'],
  parity: QuestRuntimeParity,
  enforcer: QuestRuntimeParityEnforcer,
): QuestRuntimeCompatibilityMatrix['runtimes'][number]['status'] {
  const required = parity[runtime]
  if (!required) return 'not-required'
  return enforcer.commands.some((command) => command.includes(runtime)) ? 'covered' : 'needs-test'
}

function hasNearbyTest(file: string, allFiles: Set<string>): boolean {
  const parsed = parseSourceFile(file)
  return [
    `${parsed.dir}/${parsed.stem}.test${parsed.ext}`,
    `${parsed.dir}/${parsed.stem}.spec${parsed.ext}`,
    `${parsed.dir}/__tests__/${parsed.stem}.test${parsed.ext}`,
    `${parsed.dir}/tests/${parsed.stem}.test${parsed.ext}`,
    file.replace('/src/', '/test/').replace(parsed.ext, `.test${parsed.ext}`),
    file.replace('/src/', '/tests/').replace(parsed.ext, `.test${parsed.ext}`),
  ].some((candidate) => allFiles.has(candidate.replace(/^\.\//, '')))
}

function suggestedTestPath(file: string): string {
  const parsed = parseSourceFile(file)
  if (file.includes('/src/')) {
    return file.replace('/src/', '/src/').replace(parsed.ext, `.test${parsed.ext}`)
  }
  return [parsed.dir, `${parsed.stem}.test${parsed.ext}`].filter(Boolean).join('/')
}

function parseSourceFile(file: string): { dir: string; stem: string; ext: string } {
  const ext = extname(file)
  const base = basename(file, ext)
  const dir = dirname(file)
  return { dir: dir === '.' ? '' : dir, stem: base, ext }
}

function isSourceFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|go|py|rs|java|rb)$/i.test(file)
}

function isTestFile(file: string): boolean {
  return /(\.test\.|\.spec\.|\/test\/|\/tests\/|__tests__)/i.test(file)
}

function criticalSource(file: string): boolean {
  return /auth|security|runtime|installer|update|command|bridge|reconciler|quest/i.test(file)
}

function isLikelyTextFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|md|sh|go|py|rs|java|rb|css|html)$/i.test(file) ||
    /(^|\/)(install|update)\.sh$/i.test(file)
}

function isGeneratedArtifact(file: string): boolean {
  return file.startsWith('.oac/') || file.includes('.expert-memory.json') || file.includes('/dist/')
}

function ownerForFile(file: string): string {
  if (file.startsWith('packages/cli/')) return 'cli'
  if (file.startsWith('packages/swarm-runtime/')) return 'swarm-runtime'
  if (file.startsWith('plugins/kimi-code/')) return 'kimi-runtime'
  if (file.startsWith('plugins/codex-cli/')) return 'codex-runtime'
  if (file.startsWith('plugins/claude-code/')) return 'claude-runtime'
  if (file.startsWith('plugins/')) return 'plugins'
  if (file.startsWith('.opencode/')) return 'opencode-runtime'
  if (file.startsWith('scripts/')) return 'scripts'
  if (file.startsWith('docs/') || file === 'README.md') return 'docs'
  if (isGeneratedArtifact(file)) return 'generated-artifacts'
  return file.split('/')[0] ?? 'root'
}

function securitySummary(id: string): string {
  const summaries: Record<string, string> = {
    'private-key': 'Private key material detected.',
    'api-key-assignment': 'Possible hardcoded credential assignment detected.',
    'env-file': 'Environment file path is part of the change set.',
    'destructive-shell': 'Destructive shell command pattern detected.',
    'curl-pipe-shell': 'Remote script execution pattern detected.',
  }
  return summaries[id] ?? 'Security-sensitive pattern detected.'
}

function conventionalTitle(objective: string): string {
  const trimmed = objective.trim().replace(/\s+/g, ' ')
  const title = trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed
  return `feat: ${title || 'update Quest coding execution'}`
}

async function safeRead(path: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path, 'utf-8')
    if (raw.includes('\0')) return undefined
    return raw.slice(0, 250_000)
  } catch {
    return undefined
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

function stableId(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\\/g, '/')).filter(Boolean))].sort()
}

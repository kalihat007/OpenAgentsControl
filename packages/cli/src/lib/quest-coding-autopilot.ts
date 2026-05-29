/**
 * Quest Coding Autopilot.
 *
 * Deterministic coding support layer for symbol awareness, smart test
 * escalation, patch ledgers, edit contracts, review, failure memory, parity,
 * research gates, PR readiness, and bounded autofix planning.
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { CodebaseIndex, ImpactAnalysis } from './codebase-indexer.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'

const execFileAsync = promisify(execFile)

export const QUEST_CODING_AUTOPILOT_VERSION = '10' as const

export interface QuestSymbolNode {
  id: string
  file: string
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'export' | 'shell-function'
  exported: boolean
}

export interface QuestSymbolFile {
  path: string
  language: string
  packageName?: string
  imports: string[]
  exports: string[]
  symbols: QuestSymbolNode[]
}

export interface QuestSymbolGraph {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  generatedAt: string
  files: QuestSymbolFile[]
  edges: Array<{ from: string; to: string; kind: 'imports' | 'imported-by' | 'same-package' }>
  summary: {
    files: number
    symbols: number
    exports: number
    edges: number
    packages: string[]
  }
}

export interface QuestSmartTestMatrix {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  tiers: Array<{
    id: string
    title: string
    commands: string[]
    reason: string
    required: boolean
  }>
  escalationRules: string[]
  minimumCredibleCommands: string[]
}

export interface QuestPatchLedger {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  entries: Array<{
    id: string
    taskId?: string
    summary: string
    files: string[]
    validationCommands: string[]
    status: 'planned' | 'changed' | 'validated' | 'needs-validation'
    rollbackNote: string
    diffStats: Array<{ file: string; added: number | null; deleted: number | null }>
  }>
}

export interface QuestPreEditContract {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  objective: string
  expectedBehavior: string
  allowedFiles: string[]
  nonGoals: string[]
  forbiddenSideEffects: string[]
  acceptanceChecks: string[]
}

export interface QuestAutomaticCodeReview {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  verdict: 'pass' | 'needs-review' | 'blocked'
  findings: QuestReviewSignal[]
  checklist: Array<{ id: string; title: string; passed: boolean; evidence: string }>
  reviewerFocus: string[]
}

export interface QuestFailureMemory {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  failures: Array<{
    id: string
    command: string
    summary: string
    files: string[]
    fingerprint: string
    suggestedFix: string
  }>
  reusableLearnings: Array<{ summary: string; confidence: number; source: string }>
}

export interface QuestRuntimeParityEnforcer {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  requiredRuntimes: Array<'opencode' | 'kimi' | 'codex' | 'claude'>
  commands: string[]
  promptFiles: string[]
  satisfiedBySelectedTests: boolean
}

export interface QuestDependencyResearchGate {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  needed: boolean
  reason: string
  queries: string[]
  localEvidence: string[]
}

export interface QuestPrReadiness {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  ready: boolean
  branch?: string
  changedFiles: string[]
  suggestedCommitGroups: Array<{ title: string; files: string[] }>
  summaryBullets: string[]
  reviewerFocus: string[]
  blockers: string[]
}

export interface QuestAutofixPlan {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  enabled: boolean
  maxIterations: number
  loop: string[]
  commands: string[]
  stopConditions: string[]
  escalation: string
}

export interface QuestCodingAutopilot {
  version: typeof QUEST_CODING_AUTOPILOT_VERSION
  generatedAt: string
  symbolGraph: QuestSymbolGraph
  smartTestMatrix: QuestSmartTestMatrix
  patchLedger: QuestPatchLedger
  preEditContract: QuestPreEditContract
  automaticCodeReview: QuestAutomaticCodeReview
  failureMemory: QuestFailureMemory
  runtimeParityEnforcer: QuestRuntimeParityEnforcer
  dependencyResearchGate: QuestDependencyResearchGate
  prReadiness: QuestPrReadiness
  autofixPlan: QuestAutofixPlan
}

export interface BuildQuestCodingAutopilotOptions {
  projectRoot: string
  objective: string
  files: string[]
  index: CodebaseIndex
  impact: ImpactAnalysis
  patchCapsules: QuestPatchCapsule[]
  testRecommendations: QuestTestRecommendation[]
  reviewSignals: QuestReviewSignal[]
  runtimeParity: QuestRuntimeParity
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
}

export async function buildQuestCodingAutopilot(
  options: BuildQuestCodingAutopilotOptions,
): Promise<QuestCodingAutopilot> {
  const generatedAt = new Date().toISOString()
  const [symbolGraph, diffStats, branch] = await Promise.all([
    buildSymbolGraph(options.projectRoot, options.files, options.index),
    gitDiffStats(options.projectRoot),
    gitBranch(options.projectRoot),
  ])
  const failureMemory = buildFailureMemory(options.events, options.files)
  const smartTestMatrix = buildSmartTestMatrix(options.testRecommendations, options.impact, options.runtimeParity, failureMemory)
  const patchLedger = buildPatchLedger(options.patchCapsules, diffStats, hasPassingValidation(options.events))
  const preEditContract = buildPreEditContract(options.objective, options.files, options.patchCapsules, smartTestMatrix)
  const runtimeParityEnforcer = buildRuntimeParityEnforcer(options.runtimeParity, smartTestMatrix)
  const dependencyResearchGate = buildDependencyResearchGate(options.files, symbolGraph)
  const automaticCodeReview = buildAutomaticCodeReview(options.reviewSignals, preEditContract, runtimeParityEnforcer, failureMemory)
  const prReadiness = buildPrReadiness(branch, options.files, automaticCodeReview, smartTestMatrix)
  const autofixPlan = buildAutofixPlan(smartTestMatrix, failureMemory, automaticCodeReview)

  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    generatedAt,
    symbolGraph,
    smartTestMatrix,
    patchLedger,
    preEditContract,
    automaticCodeReview,
    failureMemory,
    runtimeParityEnforcer,
    dependencyResearchGate,
    prReadiness,
    autofixPlan,
  }
}

export async function writeQuestCodingAutopilotArtifacts(
  dir: string,
  autopilot: QuestCodingAutopilot,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'coding-autopilot.json'), autopilot),
    writeJson(join(dir, 'symbol-graph.json'), autopilot.symbolGraph),
    writeJson(join(dir, 'smart-test-matrix.json'), autopilot.smartTestMatrix),
    writeJson(join(dir, 'patch-ledger.json'), autopilot.patchLedger),
    writeJson(join(dir, 'pre-edit-contract.json'), autopilot.preEditContract),
    writeJson(join(dir, 'automatic-code-review.json'), autopilot.automaticCodeReview),
    writeJson(join(dir, 'failure-memory.json'), autopilot.failureMemory),
    writeJson(join(dir, 'runtime-parity-enforcer.json'), autopilot.runtimeParityEnforcer),
    writeJson(join(dir, 'dependency-research-gate.json'), autopilot.dependencyResearchGate),
    writeJson(join(dir, 'autofix-plan.json'), autopilot.autofixPlan),
    writeFile(join(dir, 'pr-readiness.md'), formatPrReadiness(autopilot.prReadiness)),
  ])
}

export function formatCodingAutopilotSummary(autopilot: QuestCodingAutopilot): string {
  const lines = [
    '## Coding Autopilot',
    '',
    `- Symbols: ${autopilot.symbolGraph.summary.symbols} across ${autopilot.symbolGraph.summary.files} file(s)`,
    `- Smart-test tiers: ${autopilot.smartTestMatrix.tiers.length}`,
    `- Patch ledger entries: ${autopilot.patchLedger.entries.length}`,
    `- Review verdict: ${autopilot.automaticCodeReview.verdict}`,
    `- Dependency research needed: ${autopilot.dependencyResearchGate.needed ? 'yes' : 'no'}`,
    `- PR ready: ${autopilot.prReadiness.ready ? 'yes' : 'no'}`,
    `- Autofix loop: ${autopilot.autofixPlan.enabled ? 'enabled' : 'not needed'}`,
    '',
  ]
  return lines.join('\n')
}

async function buildSymbolGraph(
  projectRoot: string,
  files: string[],
  index: CodebaseIndex,
): Promise<QuestSymbolGraph> {
  const filesToRead = unique(files.filter(isLikelyTextCodeFile)).slice(0, 120)
  const symbolFiles: QuestSymbolFile[] = []

  for (const file of filesToRead) {
    const text = await safeReadText(join(projectRoot, file))
    if (text === undefined) continue
    const indexed = index.modules.find((mod) => mod.path === file)
    const symbols = extractSymbols(file, text, indexed?.exports ?? [])
    const imports = unique([...(index.dependencies[file]?.imports ?? []), ...extractImports(text)])
    symbolFiles.push({
      path: file,
      language: languageForFile(file),
      packageName: packageNameForFile(file),
      imports,
      exports: unique([...(indexed?.exports ?? []), ...symbols.filter((symbol) => symbol.exported).map((symbol) => symbol.name)]),
      symbols,
    })
  }

  const edges = symbolFiles.flatMap((file) => [
    ...file.imports.map((target) => ({ from: file.path, to: target, kind: 'imports' as const })),
    ...(index.dependencies[file.path]?.importedBy ?? []).map((source) => ({ from: source, to: file.path, kind: 'imported-by' as const })),
  ])

  const packages = unique(symbolFiles.map((file) => file.packageName ?? '').filter(Boolean))
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    generatedAt: new Date().toISOString(),
    files: symbolFiles,
    edges,
    summary: {
      files: symbolFiles.length,
      symbols: symbolFiles.reduce((sum, file) => sum + file.symbols.length, 0),
      exports: symbolFiles.reduce((sum, file) => sum + file.exports.length, 0),
      edges: edges.length,
      packages,
    },
  }
}

function buildSmartTestMatrix(
  tests: QuestTestRecommendation[],
  impact: ImpactAnalysis,
  runtimeParity: QuestRuntimeParity,
  failureMemory: QuestFailureMemory,
): QuestSmartTestMatrix {
  const byScope = (scope: QuestTestRecommendation['scope']) => tests.filter((test) => test.scope === scope).map((test) => test.command)
  const runtimeCommands = byScope('runtime')
  const minimum = unique([
    ...byScope('format'),
    ...byScope('unit').slice(0, 1),
    ...byScope('package').slice(0, impact.riskLevel === 'high' ? 3 : 2),
    ...(impact.riskLevel === 'high' ? runtimeCommands : runtimeCommands.slice(0, 1)),
  ])
  const failureCommands = unique(failureMemory.failures.map((failure) => failure.command))
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    tiers: [
      {
        id: 'tier-1-focused',
        title: 'Focused checks',
        commands: unique([...byScope('format'), ...byScope('unit')]),
        reason: 'Fast checks closest to the changed files.',
        required: true,
      },
      {
        id: 'tier-2-package',
        title: 'Package confidence',
        commands: byScope('package'),
        reason: 'Typecheck/build/test the affected package surfaces.',
        required: impact.riskLevel !== 'low',
      },
      {
        id: 'tier-3-runtime-parity',
        title: 'Runtime parity',
        commands: runtimeCommands,
        reason: 'Validate OpenAgent runtime adapters and Quest harnesses touched by the change.',
        required: runtimeCommands.length > 0 || runtimeParity.opencode || runtimeParity.kimi || runtimeParity.codex || runtimeParity.claude,
      },
      {
        id: 'tier-4-regression-replay',
        title: 'Failure replay',
        commands: failureCommands,
        reason: 'Replay commands from recent failed validation events before completion.',
        required: failureCommands.length > 0,
      },
    ].filter((tier) => tier.commands.length > 0 || tier.required),
    escalationRules: [
      'If tier 1 fails, run the autofix loop once before broader tests.',
      'If package checks fail twice, stop and record failure memory.',
      'If runtime-facing files changed, runtime parity tier is required before COMPLETE.',
      'If high-impact or security-sensitive code changed, run all selected package and runtime checks.',
    ],
    minimumCredibleCommands: minimum.length > 0 ? minimum : tests.map((test) => test.command).slice(0, 3),
  }
}

function buildPatchLedger(
  capsules: QuestPatchCapsule[],
  diffStats: Array<{ file: string; added: number | null; deleted: number | null }>,
  hasPassingValidationEvent: boolean,
): QuestPatchLedger {
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    entries: capsules.map((capsule) => {
      const stats = diffStats.filter((stat) => capsule.files.includes(stat.file))
      const changed = capsule.files.some((file) => diffStats.some((stat) => stat.file === file))
      return {
        id: capsule.id,
        taskId: capsule.taskId,
        summary: capsule.summary,
        files: capsule.files,
        validationCommands: capsule.validationCommands,
        status: hasPassingValidationEvent ? 'validated' : changed ? 'changed' : 'planned',
        rollbackNote: capsule.rollbackNote,
        diffStats: stats,
      }
    }),
  }
}

function buildPreEditContract(
  objective: string,
  files: string[],
  capsules: QuestPatchCapsule[],
  matrix: QuestSmartTestMatrix,
): QuestPreEditContract {
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    objective,
    expectedBehavior: capsules[0]?.expectedBehavior ?? `Satisfy: ${objective}`,
    allowedFiles: files,
    nonGoals: [
      'Do not change unrelated files or generated artifacts unless they are explicit validation output.',
      'Do not introduce secrets, credentials, production deploys, or public communications.',
      'Do not start follow-up work after completion; suggest next steps and wait for the user.',
    ],
    forbiddenSideEffects: [
      'destructive deletes',
      'production deployment',
      'credential changes',
      'runtime/model fallback without user request',
    ],
    acceptanceChecks: matrix.minimumCredibleCommands,
  }
}

function buildAutomaticCodeReview(
  reviewSignals: QuestReviewSignal[],
  contract: QuestPreEditContract,
  runtimeParity: QuestRuntimeParityEnforcer,
  failureMemory: QuestFailureMemory,
): QuestAutomaticCodeReview {
  const findings = [...reviewSignals]
  if (contract.allowedFiles.length === 0) {
    findings.push({
      id: 'no-allowed-files',
      severity: 'warning',
      summary: 'No concrete allowed files were identified for this coding request.',
      files: [],
      recommendation: 'Inspect target files and refresh coding intelligence before editing.',
    })
  }
  if (runtimeParity.requiredRuntimes.length > 0 && !runtimeParity.satisfiedBySelectedTests) {
    findings.push({
      id: 'parity-not-covered',
      severity: 'warning',
      summary: 'Runtime parity is required but not fully covered by selected tests.',
      files: runtimeParity.promptFiles,
      recommendation: `Run: ${runtimeParity.commands.join(' && ')}`,
    })
  }
  if (failureMemory.failures.length > 0) {
    findings.push({
      id: 'recent-failures',
      severity: 'error',
      summary: 'Recent failed validation events need replay or explanation.',
      files: failureMemory.failures.flatMap((failure) => failure.files),
      recommendation: 'Run the failure replay tier or record why it is obsolete.',
    })
  }
  const hasError = findings.some((finding) => finding.severity === 'error')
  const hasWarning = findings.some((finding) => finding.severity === 'warning')
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    verdict: hasError ? 'blocked' : hasWarning ? 'needs-review' : 'pass',
    findings,
    checklist: [
      {
        id: 'contract-present',
        title: 'Pre-edit contract exists',
        passed: contract.allowedFiles.length > 0,
        evidence: `${contract.allowedFiles.length} allowed file(s)`,
      },
      {
        id: 'tests-selected',
        title: 'Smart tests selected',
        passed: contract.acceptanceChecks.length > 0,
        evidence: `${contract.acceptanceChecks.length} command(s)`,
      },
      {
        id: 'runtime-parity',
        title: 'Runtime parity covered when required',
        passed: runtimeParity.requiredRuntimes.length === 0 || runtimeParity.satisfiedBySelectedTests,
        evidence: runtimeParity.requiredRuntimes.join(', ') || 'not required',
      },
      {
        id: 'failure-memory-clear',
        title: 'No unresolved failure memory',
        passed: failureMemory.failures.length === 0,
        evidence: `${failureMemory.failures.length} failure(s)`,
      },
    ],
    reviewerFocus: unique([
      ...findings.flatMap((finding) => finding.files),
      ...runtimeParity.promptFiles,
    ]).slice(0, 12),
  }
}

function buildFailureMemory(
  events: Array<{ type?: string; data?: Record<string, unknown> }>,
  files: string[],
): QuestFailureMemory {
  const failures = events.flatMap((event, index) => {
    if (event.type !== 'validation') return []
    const result = event.data?.result as { checks?: Array<{ command?: string; passed?: boolean; output?: string }>; overallPassed?: boolean } | undefined
    const failedChecks = result?.checks?.filter((check) => check.passed === false) ?? []
    if (result?.overallPassed !== false && failedChecks.length === 0) return []
    return failedChecks.map((check, checkIndex) => {
      const command = check.command ?? 'unknown validation command'
      const summary = summarizeOutput(check.output) ?? 'Validation command failed.'
      return {
        id: `failure-${index + 1}-${checkIndex + 1}`,
        command,
        summary,
        files,
        fingerprint: stableId(`${command}:${summary}`),
        suggestedFix: 'Inspect the failing output, make the smallest scoped fix, and rerun this exact command before broader validation.',
      }
    })
  })
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    failures,
    reusableLearnings: failures.map((failure) => ({
      summary: `When ${failure.command} fails with ${failure.fingerprint}, replay it after the smallest scoped fix.`,
      confidence: 0.7,
      source: failure.id,
    })),
  }
}

function buildRuntimeParityEnforcer(
  parity: QuestRuntimeParity,
  matrix: QuestSmartTestMatrix,
): QuestRuntimeParityEnforcer {
  const requiredRuntimes = [
    parity.opencode ? 'opencode' : undefined,
    parity.kimi ? 'kimi' : undefined,
    parity.codex ? 'codex' : undefined,
    parity.claude ? 'claude' : undefined,
  ].filter((runtime): runtime is QuestRuntimeParityEnforcer['requiredRuntimes'][number] => Boolean(runtime))
  const commands = unique([
    ...(parity.kimi ? ['npm run test:quest-v8:kimi'] : []),
    ...(parity.opencode ? ['npm run test:quest-v8:opencode'] : []),
    ...(parity.codex ? ['npm run test:quest-v8:codex'] : []),
    ...(parity.claude ? ['bash -n install.sh update.sh'] : []),
  ])
  const selected = new Set(matrix.tiers.flatMap((tier) => tier.commands))
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    requiredRuntimes,
    commands,
    promptFiles: unique([
      ...(parity.opencode ? ['.opencode/agent/core/openagent.md', '.opencode/context/core/quest-mode.md'] : []),
      ...(parity.kimi ? ['plugins/kimi-code/openagent.yaml', 'plugins/kimi-code/openagent-system.md'] : []),
      ...(parity.codex ? ['plugins/codex-cli/openagent.toml', 'plugins/codex-cli/openagent-system.md'] : []),
      ...(parity.claude ? ['plugins/claude-code/openagent-system.md', 'install.sh', 'update.sh'] : []),
    ]),
    satisfiedBySelectedTests: commands.length === 0 || commands.every((command) => selected.has(command)),
  }
}

function buildDependencyResearchGate(
  files: string[],
  symbolGraph: QuestSymbolGraph,
): QuestDependencyResearchGate {
  const dependencyFiles = files.filter((file) => /(^|\/)(package|bun|pnpm|yarn|package-lock|tsconfig|vite|rollup|eslint|openapi|schema)\./i.test(file))
  const externalImports = unique(symbolGraph.files.flatMap((file) => file.imports).filter((value) => !value.startsWith('.') && !value.startsWith('/')))
  const needed = dependencyFiles.length > 0 || externalImports.length > 0
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    needed,
    reason: needed
      ? 'Dependency, toolchain, schema, or external import surface changed; current official docs may affect correctness.'
      : 'Local repo context is sufficient; no external dependency or API surface detected.',
    queries: needed
      ? unique([
          ...dependencyFiles.map((file) => `${file} current behavior official docs`),
          ...externalImports.slice(0, 5).map((name) => `${name} official documentation current API`),
        ])
      : [],
    localEvidence: unique([...dependencyFiles, ...symbolGraph.files.map((file) => file.path)]).slice(0, 20),
  }
}

function buildPrReadiness(
  branch: string | undefined,
  files: string[],
  review: QuestAutomaticCodeReview,
  matrix: QuestSmartTestMatrix,
): QuestPrReadiness {
  const blockers = [
    ...(review.verdict === 'blocked' ? ['Automatic code review verdict is blocked.'] : []),
    ...(matrix.minimumCredibleCommands.length === 0 ? ['No minimum credible validation commands selected.'] : []),
  ]
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    ready: blockers.length === 0,
    branch,
    changedFiles: files,
    suggestedCommitGroups: groupFilesForCommit(files),
    summaryBullets: [
      `Updated ${files.length} file(s).`,
      `Selected ${matrix.minimumCredibleCommands.length} minimum validation command(s).`,
      `Automatic review verdict: ${review.verdict}.`,
    ],
    reviewerFocus: review.reviewerFocus,
    blockers,
  }
}

function buildAutofixPlan(
  matrix: QuestSmartTestMatrix,
  failureMemory: QuestFailureMemory,
  review: QuestAutomaticCodeReview,
): QuestAutofixPlan {
  const commands = unique([
    ...failureMemory.failures.map((failure) => failure.command),
    ...matrix.minimumCredibleCommands,
  ]).slice(0, 8)
  const enabled = failureMemory.failures.length > 0 || review.verdict !== 'pass'
  return {
    version: QUEST_CODING_AUTOPILOT_VERSION,
    enabled,
    maxIterations: 2,
    loop: [
      'Run the narrowest failing or minimum credible command.',
      'Parse the first actionable failure and identify the smallest owned file set.',
      'Apply one scoped fix without expanding ownership.',
      'Rerun the same command, then the minimum credible matrix.',
      'Stop after two failed fix attempts and record failure memory.',
    ],
    commands,
    stopConditions: [
      'A command fails twice with the same fingerprint.',
      'The fix would touch files outside the pre-edit contract.',
      'The failure points to credentials, production state, paid cloud, or external service limits.',
    ],
    escalation: 'Return to the user with the failure fingerprint, attempted fix, remaining command, and recommended next Quest.',
  }
}

function formatPrReadiness(readiness: QuestPrReadiness): string {
  const lines = [
    '# PR Readiness',
    '',
    `- Ready: ${readiness.ready ? 'yes' : 'no'}`,
    `- Branch: ${readiness.branch ?? 'unknown'}`,
    `- Changed files: ${readiness.changedFiles.length}`,
    '',
    '## Summary',
    '',
    ...readiness.summaryBullets.map((line) => `- ${line}`),
    '',
    '## Commit Groups',
    '',
    ...readiness.suggestedCommitGroups.map((group) => `- **${group.title}:** ${group.files.join(', ')}`),
    '',
    '## Reviewer Focus',
    '',
    ...(readiness.reviewerFocus.length > 0 ? readiness.reviewerFocus.map((file) => `- ${file}`) : ['_No special focus files._']),
    '',
    '## Blockers',
    '',
    ...(readiness.blockers.length > 0 ? readiness.blockers.map((blocker) => `- ${blocker}`) : ['_No blockers detected._']),
    '',
  ]
  return lines.join('\n')
}

async function gitDiffStats(projectRoot: string): Promise<Array<{ file: string; added: number | null; deleted: number | null }>> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'diff', '--numstat'], { maxBuffer: 1024 * 1024 })
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const [addedRaw, deletedRaw, fileRaw] = line.split(/\t/)
        const added = Number.parseInt(addedRaw ?? '', 10)
        const deleted = Number.parseInt(deletedRaw ?? '', 10)
        return {
          file: (fileRaw ?? '').trim(),
          added: Number.isFinite(added) ? added : null,
          deleted: Number.isFinite(deleted) ? deleted : null,
        }
      })
      .filter((stat) => stat.file.length > 0)
  } catch {
    return []
  }
}

async function gitBranch(projectRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'branch', '--show-current'], { maxBuffer: 64 * 1024 })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

async function safeReadText(path: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path, 'utf-8')
    if (raw.includes('\0')) return undefined
    return raw.slice(0, 250_000)
  } catch {
    return undefined
  }
}

function extractSymbols(file: string, text: string, indexedExports: string[]): QuestSymbolNode[] {
  const symbols: QuestSymbolNode[] = []
  const addMatches = (kind: QuestSymbolNode['kind'], regex: RegExp, exported = false) => {
    for (const match of text.matchAll(regex)) {
      const name = match[1]
      if (!name) continue
      symbols.push({
        id: `${file}#${name}`,
        file,
        name,
        kind,
        exported: exported || indexedExports.includes(name),
      })
    }
  }

  addMatches('function', /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, true)
  addMatches('class', /export\s+class\s+([A-Za-z_$][\w$]*)/g, true)
  addMatches('interface', /export\s+interface\s+([A-Za-z_$][\w$]*)/g, true)
  addMatches('type', /export\s+type\s+([A-Za-z_$][\w$]*)/g, true)
  addMatches('const', /export\s+const\s+([A-Za-z_$][\w$]*)/g, true)
  addMatches('function', /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)
  addMatches('const', /(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)\s*=/g)
  addMatches('shell-function', /(?:^|\n)\s*([A-Za-z_][\w-]*)\s*\(\)\s*\{/g, file.endsWith('.sh'))

  for (const name of indexedExports) {
    if (!symbols.some((symbol) => symbol.name === name && symbol.exported)) {
      symbols.push({ id: `${file}#${name}`, file, name, kind: 'export', exported: true })
    }
  }

  return dedupeSymbols(symbols).slice(0, 200)
}

function extractImports(text: string): string[] {
  const imports: string[] = []
  for (const match of text.matchAll(/import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    if (match[1]) imports.push(match[1])
  }
  for (const match of text.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (match[1]) imports.push(match[1])
  }
  return unique(imports)
}

function isLikelyTextCodeFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|md|sh|go|py|rs|java|rb|css|scss|html)$/i.test(file)
}

function languageForFile(file: string): string {
  const ext = extname(file).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.sh': 'shell',
    '.go': 'go',
    '.py': 'python',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
  }
  return map[ext] ?? 'text'
}

function packageNameForFile(file: string): string | undefined {
  const parts = file.split('/')
  if (parts[0] === 'packages' && parts[1]) return `packages/${parts[1]}`
  if (parts[0] === 'plugins' && parts[1]) return `plugins/${parts[1]}`
  if (parts[0] === 'evals' && parts[1]) return `evals/${parts[1]}`
  if (parts[0] === '.opencode') return '.opencode'
  if (parts[0] === 'scripts') return 'scripts'
  return undefined
}

function hasPassingValidation(events: Array<{ type?: string; data?: Record<string, unknown> }>): boolean {
  return events.some((event) => {
    const result = event.data?.result as { overallPassed?: boolean } | undefined
    return event.type === 'validation' && result?.overallPassed === true
  })
}

function groupFilesForCommit(files: string[]): Array<{ title: string; files: string[] }> {
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const title = packageNameForFile(file) ?? file.split('/')[0] ?? 'root'
    groups.set(title, [...(groups.get(title) ?? []), file])
  }
  return [...groups.entries()].map(([title, groupedFiles]) => ({ title, files: groupedFiles }))
}

function summarizeOutput(output: string | undefined): string | undefined {
  if (!output?.trim()) return undefined
  return output.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 240)
}

function stableId(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return `fm-${Math.abs(hash).toString(36)}`
}

function dedupeSymbols(symbols: QuestSymbolNode[]): QuestSymbolNode[] {
  const seen = new Set<string>()
  return symbols.filter((symbol) => {
    const key = `${symbol.file}:${symbol.kind}:${symbol.name}:${symbol.exported}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\\/g, '/')).filter(Boolean))].sort()
}

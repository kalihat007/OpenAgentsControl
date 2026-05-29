/**
 * Quest Verified Knowledgebase.
 *
 * Deterministic v12 evidence layer for evidence-first coding, hallucination
 * gates, source-to-patch traceability, contract facts, stale knowledge checks,
 * dependency research decisions, behavior oracles, and test-authoring plans.
 */

import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { CodebaseIndex, ImpactAnalysis } from './codebase-indexer.js'
import type { QuestCodingAutopilot } from './quest-coding-autopilot.js'
import type { QuestCodingExecution } from './quest-coding-execution.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'
import type { RepoWikiFileEntry, RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_VERIFIED_KNOWLEDGEBASE_VERSION = '12' as const

export type QuestKnowledgeFreshness = 'fresh' | 'recent' | 'stale' | 'missing' | 'unknown'
export type QuestEvidenceStatus = 'verified' | 'assumed' | 'unknown' | 'stale'

export interface QuestKnowledgeEvidenceRef {
  source: string
  path?: string
  command?: string
  detail: string
}

export interface QuestKnowledgebaseIndex {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  generatedAt: string
  summary: {
    sources: number
    files: number
    tests: number
    prompts: number
    packageManifests: number
    confidence: number
  }
  sources: Array<{
    id: string
    kind:
      | 'repo-wiki'
      | 'codebase-index'
      | 'file'
      | 'test-command'
      | 'prompt'
      | 'installer'
      | 'package-manifest'
      | 'event-stream'
      | 'runtime-adapter'
      | 'generated-artifact'
    path?: string
    command?: string
    freshness: QuestKnowledgeFreshness
    confidence: number
    evidence: string[]
  }>
}

export interface QuestEvidenceLedger {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  summary: {
    verified: number
    assumed: number
    unknown: number
    stale: number
    confidence: number
  }
  facts: Array<{
    id: string
    claim: string
    status: QuestEvidenceStatus
    confidence: number
    evidence: QuestKnowledgeEvidenceRef[]
  }>
}

export interface QuestHallucinationGate {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  verdict: 'pass' | 'review' | 'blocked'
  checks: Array<{
    id: string
    title: string
    status: 'pass' | 'review' | 'blocked'
    evidence: string[]
    recommendation: string
  }>
  unknownReferences: Array<{
    kind: 'file' | 'command' | 'symbol' | 'runtime-sidecar' | 'package-script'
    value: string
    source: string
    reason: string
  }>
  rules: string[]
}

export interface QuestContractFacts {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  facts: Array<{
    id: string
    kind: 'api' | 'cli' | 'schema' | 'runtime-prompt' | 'installer' | 'docs' | 'package' | 'test' | 'behavior'
    path?: string
    claim: string
    status: 'active' | 'needs-review' | 'missing-evidence'
    evidence: QuestKnowledgeEvidenceRef[]
    confidence: number
  }>
  commands: string[]
}

export interface QuestSourceToPatchTrace {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  traces: Array<{
    id: string
    patchCapsuleId: string
    requirements: string[]
    files: string[]
    evidenceFactIds: string[]
    validationCommands: string[]
    assumptions: string[]
    status: 'traceable' | 'needs-evidence' | 'blocked'
  }>
}

export interface QuestStaleKnowledgeReport {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  checkedAt: string
  items: Array<{
    id: string
    path: string
    freshness: QuestKnowledgeFreshness
    ageHours?: number
    recommendation: string
  }>
  staleItems: number
  refreshCommands: string[]
}

export interface QuestDependencyResearchCache {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  needed: boolean
  reason: string
  queries: string[]
  localEvidence: string[]
  entries: Array<{
    id: string
    query: string
    status: 'local-evidence-sufficient' | 'requires-official-research'
    evidence: string[]
    cachePolicy: string
  }>
}

export interface QuestBehaviorOracle {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  signals: Array<{
    id: string
    behavior: string
    evidence: QuestKnowledgeEvidenceRef[]
    validation: string[]
    status: 'planned' | 'observed' | 'needs-validation'
  }>
  completionRules: string[]
}

export interface QuestAutonomousTestAuthoringPlan {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  candidates: Array<{
    id: string
    sourceFile: string
    suggestedTestFile: string
    command: string
    reason: string
    priority: 'low' | 'medium' | 'high'
  }>
  commands: string[]
  policy: string[]
}

export interface QuestVerifiedKnowledgebase {
  version: typeof QUEST_VERIFIED_KNOWLEDGEBASE_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  knowledgebaseIndex: QuestKnowledgebaseIndex
  evidenceLedger: QuestEvidenceLedger
  hallucinationGate: QuestHallucinationGate
  contractFacts: QuestContractFacts
  sourceToPatchTrace: QuestSourceToPatchTrace
  staleKnowledgeReport: QuestStaleKnowledgeReport
  dependencyResearchCache: QuestDependencyResearchCache
  behaviorOracle: QuestBehaviorOracle
  testAuthoringPlan: QuestAutonomousTestAuthoringPlan
}

export interface BuildQuestVerifiedKnowledgebaseOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
}

interface PackageScripts {
  path: string
  name?: string
  scripts: string[]
}

export async function buildQuestVerifiedKnowledgebase(
  options: BuildQuestVerifiedKnowledgebaseOptions,
): Promise<QuestVerifiedKnowledgebase> {
  const generatedAt = new Date().toISOString()
  const packageScripts = await loadPackageScripts(options.projectRoot, options.repoWiki)
  const knowledgebaseIndex = await buildKnowledgebaseIndex(options, packageScripts, generatedAt)
  const evidenceLedger = await buildEvidenceLedger(options, packageScripts)
  const hallucinationGate = buildHallucinationGate(options, packageScripts, evidenceLedger)
  const contractFacts = buildContractFacts(options)
  const sourceToPatchTrace = buildSourceToPatchTrace(options.patchCapsules, evidenceLedger)
  const staleKnowledgeReport = await buildStaleKnowledgeReport(options)
  const dependencyResearchCache = buildDependencyResearchCache(options.codingAutopilot)
  const behaviorOracle = buildBehaviorOracle(options)
  const testAuthoringPlan = buildAutonomousTestAuthoringPlan(options)

  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    generatedAt,
    projectRoot: options.projectRoot,
    objective: options.objective,
    knowledgebaseIndex,
    evidenceLedger,
    hallucinationGate,
    contractFacts,
    sourceToPatchTrace,
    staleKnowledgeReport,
    dependencyResearchCache,
    behaviorOracle,
    testAuthoringPlan,
  }
}

export async function writeQuestVerifiedKnowledgebaseArtifacts(
  dir: string,
  knowledgebase: QuestVerifiedKnowledgebase,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'verified-knowledgebase.json'), knowledgebase),
    writeJson(join(dir, 'knowledgebase-index.json'), knowledgebase.knowledgebaseIndex),
    writeJson(join(dir, 'evidence-ledger.json'), knowledgebase.evidenceLedger),
    writeJson(join(dir, 'hallucination-gate.json'), knowledgebase.hallucinationGate),
    writeJson(join(dir, 'contract-facts.json'), knowledgebase.contractFacts),
    writeJson(join(dir, 'source-to-patch-trace.json'), knowledgebase.sourceToPatchTrace),
    writeJson(join(dir, 'stale-knowledge-report.json'), knowledgebase.staleKnowledgeReport),
    writeJson(join(dir, 'dependency-research-cache.json'), knowledgebase.dependencyResearchCache),
    writeJson(join(dir, 'behavior-oracle.json'), knowledgebase.behaviorOracle),
    writeJson(join(dir, 'test-authoring-plan.json'), knowledgebase.testAuthoringPlan),
    writeFile(join(dir, 'verified-knowledgebase.md'), formatVerifiedKnowledgebaseBrief(knowledgebase)),
  ])
}

export function formatVerifiedKnowledgebaseSummary(knowledgebase: QuestVerifiedKnowledgebase): string {
  return [
    '## Verified Knowledgebase',
    '',
    `- Sources: ${knowledgebase.knowledgebaseIndex.summary.sources}`,
    `- Evidence confidence: ${knowledgebase.evidenceLedger.summary.confidence}`,
    `- Hallucination gate: ${knowledgebase.hallucinationGate.verdict}`,
    `- Contract facts: ${knowledgebase.contractFacts.facts.length}`,
    `- Source-to-patch traces: ${knowledgebase.sourceToPatchTrace.traces.length}`,
    `- Stale knowledge items: ${knowledgebase.staleKnowledgeReport.staleItems}`,
    `- Dependency research needed: ${knowledgebase.dependencyResearchCache.needed ? 'yes' : 'no'}`,
    `- Behavior oracle signals: ${knowledgebase.behaviorOracle.signals.length}`,
    `- Test-authoring candidates: ${knowledgebase.testAuthoringPlan.candidates.length}`,
    '',
  ].join('\n')
}

function formatVerifiedKnowledgebaseBrief(knowledgebase: QuestVerifiedKnowledgebase): string {
  const lines = [
    '# Verified Knowledgebase',
    '',
    `- **Objective:** ${knowledgebase.objective}`,
    `- **Generated:** ${knowledgebase.generatedAt}`,
    `- **Hallucination gate:** ${knowledgebase.hallucinationGate.verdict}`,
    `- **Evidence confidence:** ${knowledgebase.evidenceLedger.summary.confidence}`,
    `- **Sources:** ${knowledgebase.knowledgebaseIndex.summary.sources}`,
    `- **Stale items:** ${knowledgebase.staleKnowledgeReport.staleItems}`,
    '',
    '## Evidence Ledger',
    '',
  ]

  for (const fact of knowledgebase.evidenceLedger.facts.slice(0, 12)) {
    lines.push(`- **${fact.status}:** ${fact.claim}`)
  }
  if (knowledgebase.evidenceLedger.facts.length === 0) lines.push('_No evidence facts generated._')

  lines.push('', '## Hallucination Gate', '')
  for (const check of knowledgebase.hallucinationGate.checks) {
    lines.push(`- **${check.status}:** ${check.title}`)
  }

  lines.push('', '## Refresh Commands', '')
  for (const command of knowledgebase.staleKnowledgeReport.refreshCommands) {
    lines.push(`- \`${command}\``)
  }
  if (knowledgebase.staleKnowledgeReport.refreshCommands.length === 0) lines.push('_No refresh commands required._')

  lines.push('')
  return lines.join('\n')
}

async function buildKnowledgebaseIndex(
  options: BuildQuestVerifiedKnowledgebaseOptions,
  packageScripts: PackageScripts[],
  generatedAt: string,
): Promise<QuestKnowledgebaseIndex> {
  const repoFiles = new Map((options.repoWiki?.files ?? []).map((file) => [file.path, file]))
  const fileSources = await Promise.all(unique(options.files).map(async (file) => {
    const repoEntry = repoFiles.get(file)
    return {
      id: `file-${stableId(file)}`,
      kind: sourceKindForFile(file, repoEntry),
      path: file,
      freshness: await pathFreshness(options.projectRoot, file),
      confidence: repoEntry ? 0.95 : 0.75,
      evidence: [
        repoEntry ? `Repo wiki kind: ${repoEntry.kind}` : 'Selected by Quest changed/relevant file analysis.',
        `Impact risk: ${options.impact.riskLevel}`,
      ],
    }
  }))
  const promptFiles = runtimePromptFiles(options.runtimeParity)
  const promptSources = await Promise.all(promptFiles.map(async (file) => ({
    id: `prompt-${stableId(file)}`,
    kind: 'prompt' as const,
    path: file,
    freshness: await pathFreshness(options.projectRoot, file),
    confidence: 0.9,
    evidence: ['Runtime parity prompt surface.'],
  })))
  const installerSources = await Promise.all(['install.sh', 'update.sh'].map(async (file) => ({
    id: `installer-${stableId(file)}`,
    kind: 'installer' as const,
    path: file,
    freshness: await pathFreshness(options.projectRoot, file),
    confidence: 0.85,
    evidence: ['Installer/update surface for runtime adapter propagation.'],
  })))
  const packageSources = packageScripts.map((pkg) => ({
    id: `package-${stableId(pkg.path)}`,
    kind: 'package-manifest' as const,
    path: pkg.path,
    freshness: 'unknown' as const,
    confidence: 0.9,
    evidence: [`Scripts: ${pkg.scripts.length > 0 ? pkg.scripts.join(', ') : 'none'}`],
  }))
  const testSources = options.testRecommendations.map((test) => ({
    id: `test-${stableId(test.command)}`,
    kind: 'test-command' as const,
    command: test.command,
    freshness: 'fresh' as const,
    confidence: test.confidence,
    evidence: [test.reason],
  }))
  const coreSources: QuestKnowledgebaseIndex['sources'] = [
    {
      id: 'repo-wiki',
      kind: 'repo-wiki',
      path: '.oac/repo-wiki/files.json',
      freshness: options.repoWiki ? freshnessForTimestamp(options.repoWiki.generatedAt) : 'missing',
      confidence: options.repoWiki ? 0.95 : 0.2,
      evidence: options.repoWiki
        ? [`${options.repoWiki.summary.files} files, ${options.repoWiki.summary.packages} packages.`]
        : ['Repo wiki snapshot was not found.'],
    },
    {
      id: 'codebase-index',
      kind: 'codebase-index',
      path: '.opencode/.codebase-index.json',
      freshness: freshnessForDate(options.index.indexedAt),
      confidence: 0.9,
      evidence: [`${options.index.modules.length} modules and ${Object.keys(options.index.dependencies).length} dependency entries.`],
    },
    {
      id: 'event-stream',
      kind: 'event-stream',
      path: 'events.ndjson',
      freshness: options.events.length > 0 ? 'fresh' : 'unknown',
      confidence: options.events.length > 0 ? 0.85 : 0.45,
      evidence: [`${options.events.length} Quest event(s) loaded.`],
    },
    {
      id: 'verified-knowledgebase',
      kind: 'generated-artifact',
      path: 'verified-knowledgebase.json',
      freshness: 'fresh',
      confidence: 1,
      evidence: [`Generated at ${generatedAt}.`],
    },
    ...fileSources,
    ...promptSources,
    ...installerSources,
    ...packageSources,
    ...testSources,
  ]
  const sources = uniqueSources(coreSources)
  const confidence = average(sources.map((source) => source.confidence))
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    generatedAt,
    summary: {
      sources: sources.length,
      files: fileSources.length,
      tests: testSources.length,
      prompts: promptSources.length,
      packageManifests: packageSources.length,
      confidence,
    },
    sources,
  }
}

async function buildEvidenceLedger(
  options: BuildQuestVerifiedKnowledgebaseOptions,
  packageScripts: PackageScripts[],
): Promise<QuestEvidenceLedger> {
  const existingFiles = await existingFileSet(options.projectRoot, options.files)
  const facts: QuestEvidenceLedger['facts'] = [
    {
      id: 'objective',
      claim: `User objective is: ${options.objective}`,
      status: 'verified',
      confidence: 1,
      evidence: [{ source: 'quest-objective', detail: 'Objective passed into Quest coding intelligence.' }],
    },
    {
      id: 'cwd',
      claim: `Project root is ${options.projectRoot}`,
      status: 'verified',
      confidence: 1,
      evidence: [{ source: 'process.cwd', detail: 'Quest command executed from this project root.' }],
    },
    {
      id: 'repo-wiki',
      claim: options.repoWiki
        ? `Repo wiki has ${options.repoWiki.summary.files} files and ${options.repoWiki.summary.packages} packages.`
        : 'Repo wiki snapshot is not available for this run.',
      status: options.repoWiki ? evidenceStatusForFreshness(freshnessForTimestamp(options.repoWiki.generatedAt)) : 'unknown',
      confidence: options.repoWiki ? 0.9 : 0.3,
      evidence: [{ source: 'repo-wiki', path: '.oac/repo-wiki/files.json', detail: options.repoWiki ? options.repoWiki.reason : 'Missing snapshot.' }],
    },
    {
      id: 'affected-files',
      claim: options.files.length > 0
        ? `${options.files.length} affected file(s) are in scope.`
        : 'No concrete affected files were detected.',
      status: options.files.length > 0 ? 'verified' : 'unknown',
      confidence: options.files.length > 0 ? 0.85 : 0.4,
      evidence: options.files.slice(0, 40).map((file) => ({
        source: existingFiles.has(file) ? 'filesystem' : 'quest-scope',
        path: file,
        detail: existingFiles.has(file) ? 'File exists locally.' : 'File is referenced by scope but not present yet.',
      })),
    },
    {
      id: 'smart-tests',
      claim: `${options.testRecommendations.length} validation command(s) were selected from local context.`,
      status: options.testRecommendations.length > 0 ? 'verified' : 'unknown',
      confidence: options.testRecommendations.length > 0 ? 0.82 : 0.35,
      evidence: options.testRecommendations.map((test) => ({
        source: 'smart-test-recommendation',
        command: test.command,
        detail: test.reason,
      })),
    },
    {
      id: 'package-scripts',
      claim: `${packageScripts.length} package manifest(s) supply local script evidence.`,
      status: packageScripts.length > 0 ? 'verified' : 'unknown',
      confidence: packageScripts.length > 0 ? 0.8 : 0.25,
      evidence: packageScripts.map((pkg) => ({
        source: 'package.json',
        path: pkg.path,
        detail: `${pkg.scripts.length} script(s).`,
      })),
    },
    {
      id: 'runtime-compatibility',
      claim: options.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered
        ? 'Runtime compatibility matrix is covered for required runtimes.'
        : 'Runtime compatibility matrix still needs validation for at least one runtime.',
      status: options.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered ? 'verified' : 'assumed',
      confidence: options.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered ? 0.82 : 0.55,
      evidence: options.codingExecution.runtimeCompatibilityMatrix.runtimes.map((runtime) => ({
        source: 'runtime-compatibility-matrix',
        command: runtime.harnessCommand,
        detail: `${runtime.runtime}: ${runtime.status}`,
      })),
    },
    {
      id: 'security-gate',
      claim: `Security/secrets gate verdict is ${options.codingExecution.securitySecretsGate.verdict}.`,
      status: options.codingExecution.securitySecretsGate.verdict === 'pass' ? 'verified' : 'assumed',
      confidence: options.codingExecution.securitySecretsGate.verdict === 'pass' ? 0.9 : 0.6,
      evidence: options.codingExecution.securitySecretsGate.findings.map((finding) => ({
        source: 'security-secrets-gate',
        path: finding.file,
        detail: finding.summary,
      })),
    },
  ]
  const summary = summarizeEvidenceFacts(facts)
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    summary,
    facts,
  }
}

function buildHallucinationGate(
  options: BuildQuestVerifiedKnowledgebaseOptions,
  packageScripts: PackageScripts[],
  ledger: QuestEvidenceLedger,
): QuestHallucinationGate {
  const knownFiles = new Set([
    ...Object.keys(options.index.dependencies),
    ...options.index.modules.map((module) => module.path),
    ...(options.repoWiki?.files.map((file) => file.path) ?? []),
  ])
  const patchFiles = unique(options.patchCapsules.flatMap((capsule) => capsule.files))
  const unknownFiles = patchFiles.filter((file) => !knownFiles.has(file) && !options.files.includes(file))
  const scripts = new Set(packageScripts.flatMap((pkg) => pkg.scripts))
  const unknownCommands = options.testRecommendations
    .map((test) => test.command)
    .filter((command) => !commandIsLocallyGrounded(command, scripts))
  const sidecars = requiredV12Sidecars()
  const missingCoreFacts = ledger.facts.filter((fact) => fact.status === 'unknown' || fact.status === 'stale')
  const checks: QuestHallucinationGate['checks'] = [
    {
      id: 'files-grounded',
      title: 'Referenced patch files are present in scope, index, or repo wiki',
      status: unknownFiles.length === 0 ? 'pass' : 'review',
      evidence: unknownFiles.length === 0 ? ['All patch files are locally grounded.'] : unknownFiles,
      recommendation: unknownFiles.length === 0
        ? 'Proceed with scoped edits.'
        : 'Inspect or create missing files intentionally before claiming implementation evidence.',
    },
    {
      id: 'commands-grounded',
      title: 'Validation commands are grounded in known local scripts or shell checks',
      status: unknownCommands.length === 0 ? 'pass' : 'review',
      evidence: unknownCommands.length === 0 ? ['All commands are locally grounded.'] : unknownCommands,
      recommendation: unknownCommands.length === 0
        ? 'Run selected validation commands.'
        : 'Verify package scripts before reporting the commands as executable evidence.',
    },
    {
      id: 'runtime-sidecars-declared',
      title: 'Quest v12 sidecars are declared for runtime handoff',
      status: 'pass',
      evidence: sidecars,
      recommendation: 'Keep runtime prompts, installer/update scripts, and smoke harnesses aligned with these sidecars.',
    },
    {
      id: 'security-not-blocked',
      title: 'Security/secrets gate is not blocked',
      status: options.codingExecution.securitySecretsGate.verdict === 'blocked' ? 'blocked' : 'pass',
      evidence: [`securitySecretsGate.verdict=${options.codingExecution.securitySecretsGate.verdict}`],
      recommendation: options.codingExecution.securitySecretsGate.verdict === 'blocked'
        ? 'Stop and resolve security findings before completion.'
        : 'Continue with normal validation.',
    },
    {
      id: 'stale-or-unknown-facts',
      title: 'Evidence ledger has no stale or unknown core facts',
      status: missingCoreFacts.length === 0 ? 'pass' : 'review',
      evidence: missingCoreFacts.map((fact) => `${fact.id}:${fact.status}`),
      recommendation: missingCoreFacts.length === 0
        ? 'Evidence is sufficient for this scope.'
        : 'Refresh repo wiki, inspect files, or record assumptions before editing.',
    },
  ]
  const unknownReferences: QuestHallucinationGate['unknownReferences'] = [
    ...unknownFiles.map((file) => ({
      kind: 'file' as const,
      value: file,
      source: 'patch-capsules',
      reason: 'File is not in codebase index, repo wiki, or explicit affected-file scope.',
    })),
    ...unknownCommands.map((command) => ({
      kind: 'command' as const,
      value: command,
      source: 'test-recommendations',
      reason: 'Command does not map to a known package script or built-in shell/git check.',
    })),
  ]
  const verdict = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'review')
      ? 'review'
      : 'pass'
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    verdict,
    checks,
    unknownReferences,
    rules: [
      'Do not claim files, symbols, commands, APIs, or test results without local evidence.',
      'Mark uncertain facts as assumed or unknown and refresh evidence before completion.',
      'Use official/current research only when local repository evidence cannot answer a correctness-sensitive question.',
      'Tie every patch capsule to source evidence and validation commands before reporting completion.',
    ],
  }
}

function buildContractFacts(options: BuildQuestVerifiedKnowledgebaseOptions): QuestContractFacts {
  const driftFacts = options.codingExecution.contractDriftGuard.watchedContracts.map((contract) => ({
    id: contract.id,
    kind: contract.kind,
    path: contract.path,
    claim: `${contract.kind} contract ${contract.path} must stay aligned with ${contract.implementationHints.length} implementation hint(s).`,
    status: contract.status === 'needs-review' ? 'needs-review' as const : 'active' as const,
    confidence: contract.status === 'covered' ? 0.9 : 0.72,
    evidence: [
      { source: 'contract-drift-guard', path: contract.path, detail: contract.status },
      ...contract.implementationHints.slice(0, 5).map((path) => ({ source: 'implementation-hint', path, detail: 'Potential matching implementation surface.' })),
    ],
  }))
  const packageFacts = options.codingExecution.runtimeCompatibilityMatrix.runtimes.map((runtime) => ({
    id: `runtime-contract-${runtime.runtime}`,
    kind: 'runtime-prompt' as const,
    claim: `${runtime.runtime} runtime prompt must mention required Quest sidecars and write-back clauses.`,
    status: runtime.status === 'covered' ? 'active' as const : 'needs-review' as const,
    confidence: runtime.status === 'covered' ? 0.85 : 0.65,
    evidence: runtime.promptFiles.map((path) => ({ source: 'runtime-compatibility-matrix', path, command: runtime.harnessCommand, detail: runtime.status })),
  }))
  const behaviorFact = {
    id: 'quest-completion-contract',
    kind: 'behavior' as const,
    claim: 'After finishing the user request, QuestMode suggests next steps and waits for the user decision.',
    status: 'active' as const,
    confidence: 0.9,
    evidence: [{ source: 'coding-execution.doneDefinition', detail: 'User-choice next steps are part of executable acceptance.' }],
  }
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    facts: [...driftFacts, ...packageFacts, behaviorFact],
    commands: unique([
      ...options.codingExecution.contractDriftGuard.commands,
      ...options.codingExecution.runtimeCompatibilityMatrix.commands,
      ...options.testRecommendations.map((test) => test.command),
    ]),
  }
}

function buildSourceToPatchTrace(
  capsules: QuestPatchCapsule[],
  ledger: QuestEvidenceLedger,
): QuestSourceToPatchTrace {
  const factsByFile = new Map<string, string[]>()
  for (const fact of ledger.facts) {
    for (const evidence of fact.evidence) {
      if (!evidence.path) continue
      factsByFile.set(evidence.path, [...(factsByFile.get(evidence.path) ?? []), fact.id])
    }
  }
  const assumptions = ledger.facts
    .filter((fact) => fact.status === 'assumed' || fact.status === 'unknown')
    .map((fact) => `${fact.id}: ${fact.claim}`)
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    traces: capsules.map((capsule) => {
      const evidenceFactIds = unique([
        'objective',
        'affected-files',
        'smart-tests',
        ...capsule.files.flatMap((file) => factsByFile.get(file) ?? []),
      ])
      const status = capsule.validationCommands.length === 0
        ? 'needs-evidence' as const
        : evidenceFactIds.length < 3
          ? 'needs-evidence' as const
          : 'traceable' as const
      return {
        id: `trace-${capsule.id}`,
        patchCapsuleId: capsule.id,
        requirements: [capsule.summary, capsule.expectedBehavior],
        files: capsule.files,
        evidenceFactIds,
        validationCommands: capsule.validationCommands,
        assumptions,
        status,
      }
    }),
  }
}

async function buildStaleKnowledgeReport(
  options: BuildQuestVerifiedKnowledgebaseOptions,
): Promise<QuestStaleKnowledgeReport> {
  const promptFiles = runtimePromptFiles(options.runtimeParity)
  const projectItems = [
    '.oac/repo-wiki/files.json',
    '.oac/repo-wiki/index.md',
    '.opencode/.codebase-index.json',
    'install.sh',
    'update.sh',
    ...promptFiles,
  ]
  const installedKimi = [
    join(homeDir(), '.kimi/agents/openagents-control/openagent.yaml'),
    join(homeDir(), '.kimi/agents/openagents-control/openagent-system.md'),
  ]
  const projectStats = await Promise.all(projectItems.map(async (path) => staleItem(options.projectRoot, path, false)))
  const installedStats = await Promise.all(installedKimi.map(async (path) => staleItem('', path, true)))
  const items = [...projectStats, ...installedStats]
  const staleItems = items.filter((item) => item.freshness === 'stale' || item.freshness === 'missing').length
  const refreshCommands = unique([
    ...(staleItems > 0 ? ['oac repo-wiki', 'oac quest-v9'] : []),
    ...(items.some((item) => item.path.includes('.kimi/') && item.freshness !== 'fresh') ? ['./update.sh --with-kimi'] : []),
    ...(promptFiles.length > 0 ? ['npm run test:quest-v8:kimi', 'npm run test:quest-v8:opencode', 'npm run test:quest-v8:codex'] : []),
  ])
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    checkedAt: new Date().toISOString(),
    items,
    staleItems,
    refreshCommands,
  }
}

function buildDependencyResearchCache(autopilot: QuestCodingAutopilot): QuestDependencyResearchCache {
  const gate = autopilot.dependencyResearchGate
  const entries = (gate.queries.length > 0 ? gate.queries : ['local repository evidence'])
    .map((query) => ({
      id: `research-${stableId(query)}`,
      query,
      status: gate.needed ? 'requires-official-research' as const : 'local-evidence-sufficient' as const,
      evidence: gate.localEvidence,
      cachePolicy: gate.needed
        ? 'Use current official documentation before implementation and record sources in research.performed.'
        : 'Prefer local repository evidence; refresh only if APIs, provider behavior, standards, or package versions matter.',
    }))
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    needed: gate.needed,
    reason: gate.reason,
    queries: gate.queries,
    localEvidence: gate.localEvidence,
    entries,
  }
}

function buildBehaviorOracle(options: BuildQuestVerifiedKnowledgebaseOptions): QuestBehaviorOracle {
  const capsuleSignals = options.patchCapsules.map((capsule) => ({
    id: `behavior-${capsule.id}`,
    behavior: capsule.expectedBehavior,
    evidence: capsule.files.map((path) => ({ source: 'patch-capsule', path, detail: capsule.summary })),
    validation: capsule.validationCommands,
    status: capsule.validationCommands.length > 0 ? 'planned' as const : 'needs-validation' as const,
  }))
  const acceptanceSignals = options.codingExecution.executableAcceptance.doneDefinition.map((definition, index) => ({
    id: `acceptance-behavior-${index + 1}`,
    behavior: definition,
    evidence: [{ source: 'executable-acceptance', detail: definition }],
    validation: options.codingExecution.executableAcceptance.checks
      .filter((check) => check.command)
      .map((check) => check.command as string),
    status: 'planned' as const,
  }))
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    signals: [...capsuleSignals, ...acceptanceSignals],
    completionRules: [
      'The final answer must separate verified results from unrun validation.',
      'A task cannot be marked complete when the hallucination gate is blocked.',
      'A runtime-facing change requires the matching runtime harness or an explicit blocked note.',
      'Next steps are recommendations only; wait for the user before executing follow-ups.',
    ],
  }
}

function buildAutonomousTestAuthoringPlan(
  options: BuildQuestVerifiedKnowledgebaseOptions,
): QuestAutonomousTestAuthoringPlan {
  const fallbackCommand = options.codingExecution.testGapFinder.suggestedCommands[0]
    ?? options.testRecommendations[0]?.command
    ?? 'git diff --check'
  return {
    version: QUEST_VERIFIED_KNOWLEDGEBASE_VERSION,
    candidates: options.codingExecution.testGapFinder.gaps.map((gap) => ({
      id: `author-${gap.id}`,
      sourceFile: gap.sourceFile,
      suggestedTestFile: gap.suggestedTestFile,
      command: fallbackCommand,
      reason: gap.reason,
      priority: gap.severity === 'error' ? 'high' : gap.severity === 'warning' ? 'medium' : 'low',
    })),
    commands: unique([
      fallbackCommand,
      ...options.codingExecution.testGapFinder.suggestedCommands,
      ...options.testRecommendations.map((test) => test.command),
    ]),
    policy: [
      'Suggest tests automatically, but create them only when they are inside the pre-edit contract or clearly required by the user request.',
      'Prefer focused tests next to changed source files before broad integration suites.',
      'After creating tests, rerun the minimum credible commands and refresh Quest v12 sidecars.',
    ],
  }
}

async function loadPackageScripts(projectRoot: string, repoWiki: RepoWikiSnapshot | null): Promise<PackageScripts[]> {
  const packagePaths = unique([
    'package.json',
    ...(repoWiki?.packages.map((pkg) => pkg.path) ?? []),
  ])
  const packages: PackageScripts[] = []
  for (const path of packagePaths) {
    const parsed = await safeJson(join(projectRoot, path))
    if (!isRecord(parsed)) continue
    const scriptsRecord = parsed.scripts
    const scripts = isRecord(scriptsRecord)
      ? Object.keys(scriptsRecord).filter((key) => typeof scriptsRecord[key] === 'string')
      : []
    packages.push({
      path,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      scripts,
    })
  }
  return packages
}

async function existingFileSet(projectRoot: string, files: string[]): Promise<Set<string>> {
  const entries = await Promise.all(files.map(async (file) => [file, await pathExists(join(projectRoot, file))] as const))
  return new Set(entries.filter(([, exists]) => exists).map(([file]) => file))
}

function summarizeEvidenceFacts(facts: QuestEvidenceLedger['facts']): QuestEvidenceLedger['summary'] {
  const verified = facts.filter((fact) => fact.status === 'verified').length
  const assumed = facts.filter((fact) => fact.status === 'assumed').length
  const unknown = facts.filter((fact) => fact.status === 'unknown').length
  const stale = facts.filter((fact) => fact.status === 'stale').length
  return {
    verified,
    assumed,
    unknown,
    stale,
    confidence: average(facts.map((fact) => fact.confidence)),
  }
}

function evidenceStatusForFreshness(freshness: QuestKnowledgeFreshness): QuestEvidenceStatus {
  if (freshness === 'fresh' || freshness === 'recent') return 'verified'
  if (freshness === 'stale') return 'stale'
  return 'unknown'
}

function sourceKindForFile(file: string, repoEntry?: RepoWikiFileEntry): QuestKnowledgebaseIndex['sources'][number]['kind'] {
  if (repoEntry?.kind === 'test' || isTestFile(file)) return 'file'
  if (repoEntry?.kind === 'agent' || repoEntry?.kind === 'context' || isPromptFile(file)) return 'prompt'
  if (repoEntry?.kind === 'plugin' && file.includes('kimi')) return 'runtime-adapter'
  if (repoEntry?.kind === 'package' || file.endsWith('package.json')) return 'package-manifest'
  if (repoEntry?.kind === 'script' || file.endsWith('.sh')) return 'installer'
  return 'file'
}

function runtimePromptFiles(parity: QuestRuntimeParity): string[] {
  return unique([
    ...(parity.opencode ? ['.opencode/agent/core/openagent.md', '.opencode/context/core/quest-mode.md'] : []),
    ...(parity.kimi ? ['plugins/kimi-code/openagent.yaml', 'plugins/kimi-code/openagent-system.md'] : []),
    ...(parity.codex ? ['plugins/codex-cli/openagent.toml', 'plugins/codex-cli/openagent-system.md'] : []),
    ...(parity.claude ? ['plugins/claude-code/openagent-system.md'] : []),
  ])
}

function requiredV12Sidecars(): string[] {
  return [
    'verified-knowledgebase.json',
    'knowledgebase-index.json',
    'evidence-ledger.json',
    'hallucination-gate.json',
    'contract-facts.json',
    'source-to-patch-trace.json',
    'stale-knowledge-report.json',
    'dependency-research-cache.json',
    'behavior-oracle.json',
    'test-authoring-plan.json',
    'verified-knowledgebase.md',
  ]
}

function commandIsLocallyGrounded(command: string, scripts: Set<string>): boolean {
  if (/^(git|bash|bun|node|npm|npx|make)\b/.test(command) && !/\bnpm\s+run\b/.test(command)) return true
  const npmScript = command.match(/\bnpm\s+run\s+([^\s]+)/)
  if (npmScript) return scripts.has(npmScript[1] as string) || isKnownGeneratedScript(npmScript[1] as string)
  const bunScript = command.match(/\bbun\s+run\s+([^\s]+)/)
  if (bunScript) return scripts.has(bunScript[1] as string) || isKnownGeneratedScript(bunScript[1] as string)
  return /^(git diff --check|bash -n|bun test|npx vitest|npm test|npm install|npm ci)\b/.test(command)
}

function isKnownGeneratedScript(script: string): boolean {
  return /^test:quest-v\d+:/.test(script) || [
    'typecheck',
    'build',
    'test',
    'test:all',
    'test:ci',
    'validate:registry',
    'validate:context-links',
  ].includes(script)
}

async function staleItem(projectRoot: string, path: string, absolute: boolean): Promise<QuestStaleKnowledgeReport['items'][number]> {
  const fullPath = absolute ? path : join(projectRoot, path)
  try {
    const info = await stat(fullPath)
    const ageHours = Number(((Date.now() - info.mtimeMs) / (1000 * 60 * 60)).toFixed(1))
    const freshness: QuestKnowledgeFreshness = ageHours <= 24 ? 'fresh' : ageHours <= 168 ? 'recent' : 'stale'
    return {
      id: `stale-${stableId(path)}`,
      path,
      freshness,
      ageHours,
      recommendation: freshness === 'stale' ? refreshRecommendation(path) : 'Use as current local evidence.',
    }
  } catch {
    return {
      id: `stale-${stableId(path)}`,
      path,
      freshness: 'missing',
      recommendation: refreshRecommendation(path),
    }
  }
}

function refreshRecommendation(path: string): string {
  if (path.includes('.kimi/')) return 'Run ./install.sh advanced --with-kimi or ./update.sh --with-kimi.'
  if (path.includes('repo-wiki')) return 'Run oac repo-wiki before planning or completion.'
  if (path.includes('.codebase-index')) return 'Run oac quest-v9 or allow Quest coding intelligence to refresh the index.'
  if (isPromptFile(path)) return 'Run runtime parity harnesses after prompt changes.'
  if (path.endsWith('.sh')) return 'Run bash -n and install/update smoke validation.'
  return 'Refresh this local evidence before relying on it.'
}

function freshnessForDate(date: Date | string | undefined): QuestKnowledgeFreshness {
  if (!date) return 'unknown'
  const time = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  if (Number.isNaN(time)) return 'unknown'
  const ageHours = (Date.now() - time) / (1000 * 60 * 60)
  if (ageHours <= 24) return 'fresh'
  if (ageHours <= 168) return 'recent'
  return 'stale'
}

function freshnessForTimestamp(timestamp: string): QuestKnowledgeFreshness {
  return freshnessForDate(timestamp)
}

async function pathFreshness(projectRoot: string, path: string): Promise<QuestKnowledgeFreshness> {
  try {
    const info = await stat(join(projectRoot, path))
    const ageHours = (Date.now() - info.mtimeMs) / (1000 * 60 * 60)
    if (ageHours <= 24) return 'fresh'
    if (ageHours <= 168) return 'recent'
    return 'stale'
  } catch {
    return 'missing'
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function safeJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPromptFile(file: string): boolean {
  return (
    file.includes('.opencode/agent/') ||
    file.includes('.opencode/context/') ||
    file.includes('plugins/kimi-code/') ||
    file.includes('plugins/codex-cli/') ||
    file.includes('plugins/claude-code/') ||
    /openagent.*\.(md|yaml|toml)$/i.test(file)
  )
}

function isTestFile(file: string): boolean {
  return /(^|\/)(__tests__|tests?)\//i.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file)
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function uniqueSources(sources: QuestKnowledgebaseIndex['sources']): QuestKnowledgebaseIndex['sources'] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const key = `${source.kind}:${source.path ?? source.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((total, value) => total + value, 0)
  return Number((sum / values.length).toFixed(2))
}

function stableId(value: string): string {
  const stem = value
    .replace(extname(value), '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 42)
  const hash = createHash('sha1').update(value).digest('hex').slice(0, 8)
  return `${stem || 'item'}-${hash}`
}

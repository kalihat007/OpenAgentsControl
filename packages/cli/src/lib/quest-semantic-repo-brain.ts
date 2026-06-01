/**
 * Quest Semantic Repo Brain.
 *
 * Deterministic v13 semantic coding layer for AST-style repository facts,
 * confidence scoring, failure-fix memory, and user-approved skill candidates.
 */

import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  flattenFileTree,
  type CodebaseIndex,
  type ImpactAnalysis,
} from './codebase-indexer.js'
import type { QuestCodingAutopilot, QuestSymbolNode } from './quest-coding-autopilot.js'
import type { QuestCodingExecution } from './quest-coding-execution.js'
import type {
  QuestPatchCapsule,
  QuestReviewSignal,
  QuestRuntimeParity,
  QuestTestRecommendation,
} from './quest-coding-intelligence.js'
import { loadMemoryPromotionStore, type MemoryPromotionCandidate } from './quest-memory-promotion.js'
import { empiricalConfidenceAdjustment, type QuestTemporalMemory } from './quest-temporal-memory.js'
import type { QuestVerifiedKnowledgebase } from './quest-verified-knowledgebase.js'
import type { RepoWikiSnapshot } from './repo-wiki.js'

export const QUEST_SEMANTIC_REPO_BRAIN_VERSION = '13' as const

export type QuestSemanticNodeKind =
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'export'
  | 'shell-function'
  | 'cli-command'
  | 'quest-event'
  | 'schema'
  | 'test'
  | 'package-script'
  | 'runtime-prompt'
  | 'owner'

export type QuestKnowledgeConfidenceStatus =
  | 'verified'
  | 'inferred'
  | 'stale'
  | 'missing'
  | 'needs-research'

export interface QuestSemanticRepoNode {
  id: string
  kind: QuestSemanticNodeKind
  name: string
  path?: string
  detail: string
  owner?: string
  confidence: QuestKnowledgeConfidenceStatus
  score: number
  evidence: string[]
}

export interface QuestSemanticRepoEdge {
  from: string
  to: string
  kind:
    | 'contains'
    | 'declares'
    | 'imports'
    | 'imported-by'
    | 'same-package'
    | 'implements-command'
    | 'emits-event'
    | 'validates'
    | 'owns'
    | 'prompts-runtime'
}

export interface QuestSemanticGraph {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  generatedAt: string
  summary: {
    nodes: number
    edges: number
    files: number
    symbols: number
    cliCommands: number
    questEvents: number
    schemas: number
    tests: number
    packageScripts: number
    runtimePrompts: number
    owners: number
  }
  nodes: QuestSemanticRepoNode[]
  edges: QuestSemanticRepoEdge[]
}

export interface QuestKnowledgeConfidenceScore {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  overall: number
  summary: Record<QuestKnowledgeConfidenceStatus, number>
  facts: Array<{
    id: string
    subject: string
    status: QuestKnowledgeConfidenceStatus
    score: number
    evidence: string[]
    action: string
  }>
}

export interface QuestFailureFixMemory {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  fingerprints: Array<{
    id: string
    command: string
    fingerprint: string
    summary: string
    files: string[]
    knownFix: string
    status: 'active' | 'replayed' | 'stale'
    confidence: number
  }>
  reusableFixes: Array<{
    id: string
    summary: string
    source: string
    confidence: number
  }>
  replayCommands: string[]
  policy: string[]
}

export interface QuestAutoSkillBuilder {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  candidates: Array<{
    id: string
    title: string
    summary: string
    sourceCandidateId?: string
    status: 'pending-user-approval' | 'approved-for-build' | 'rejected'
    confidence: number
    occurrenceCount: number
    evidenceCount: number
    suggestedSkillName: string
    approvalCommand?: string
    buildPlan: string[]
  }>
  policy: string[]
}

export interface QuestSemanticCompletionGate {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  verdict: 'pass' | 'review' | 'blocked'
  checks: Array<{
    id: string
    title: string
    status: 'pass' | 'review' | 'blocked'
    evidence: string[]
    recommendation: string
  }>
}

export interface QuestSemanticRepoBrain {
  version: typeof QUEST_SEMANTIC_REPO_BRAIN_VERSION
  generatedAt: string
  projectRoot: string
  objective: string
  semanticGraph: QuestSemanticGraph
  knowledgeConfidenceScore: QuestKnowledgeConfidenceScore
  failureFixMemory: QuestFailureFixMemory
  autoSkillBuilder: QuestAutoSkillBuilder
  completionGate: QuestSemanticCompletionGate
}

export interface BuildQuestSemanticRepoBrainOptions {
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
  events: Array<{ type?: string; data?: Record<string, unknown> }>
  gitStatus: string[]
  repoWiki: RepoWikiSnapshot | null
  temporalMemory?: QuestTemporalMemory
}

interface PackageScriptInfo {
  path: string
  name?: string
  scripts: Array<{ name: string; command: string }>
}

export async function buildQuestSemanticRepoBrain(
  options: BuildQuestSemanticRepoBrainOptions,
): Promise<QuestSemanticRepoBrain> {
  const generatedAt = new Date().toISOString()
  const [packageScripts, runtimePrompts, promotionStore] = await Promise.all([
    loadPackageScripts(options.projectRoot, options.index),
    loadRuntimePromptFiles(options.projectRoot, options.index),
    loadMemoryPromotionStore(options.projectRoot),
  ])
  const semanticGraph = await buildSemanticGraph(options, packageScripts, runtimePrompts, generatedAt)
  const knowledgeConfidenceScore = buildKnowledgeConfidenceScore(options, semanticGraph)
  const failureFixMemory = buildFailureFixMemory(options)
  const autoSkillBuilder = buildAutoSkillBuilder(promotionStore.candidates)
  const completionGate = buildCompletionGate(
    semanticGraph,
    knowledgeConfidenceScore,
    failureFixMemory,
    autoSkillBuilder,
    options.verifiedKnowledgebase,
  )

  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    generatedAt,
    projectRoot: options.projectRoot,
    objective: options.objective,
    semanticGraph,
    knowledgeConfidenceScore,
    failureFixMemory,
    autoSkillBuilder,
    completionGate,
  }
}

export async function writeQuestSemanticRepoBrainArtifacts(
  dir: string,
  brain: QuestSemanticRepoBrain,
): Promise<void> {
  await Promise.all([
    writeJson(join(dir, 'semantic-repo-brain.json'), brain),
    writeJson(join(dir, 'ast-knowledgebase.json'), brain.semanticGraph),
    writeJson(join(dir, 'knowledge-confidence-score.json'), brain.knowledgeConfidenceScore),
    writeJson(join(dir, 'failure-fix-memory.json'), brain.failureFixMemory),
    writeJson(join(dir, 'auto-skill-builder.json'), brain.autoSkillBuilder),
    writeFile(join(dir, 'semantic-repo-brain.md'), formatSemanticRepoBrainBrief(brain)),
  ])
}

export function formatSemanticRepoBrainSummary(brain: QuestSemanticRepoBrain): string {
  return [
    '## Semantic Repo Brain',
    '',
    `- Semantic nodes: ${brain.semanticGraph.summary.nodes}`,
    `- AST-style symbols: ${brain.semanticGraph.summary.symbols}`,
    `- CLI commands: ${brain.semanticGraph.summary.cliCommands}`,
    `- Quest events: ${brain.semanticGraph.summary.questEvents}`,
    `- Package scripts: ${brain.semanticGraph.summary.packageScripts}`,
    `- Runtime prompts: ${brain.semanticGraph.summary.runtimePrompts}`,
    `- Knowledge confidence: ${brain.knowledgeConfidenceScore.overall}`,
    `- Failure fingerprints: ${brain.failureFixMemory.fingerprints.length}`,
    `- Skill candidates: ${brain.autoSkillBuilder.candidates.length}`,
    `- Completion gate: ${brain.completionGate.verdict}`,
    '',
  ].join('\n')
}

function formatSemanticRepoBrainBrief(brain: QuestSemanticRepoBrain): string {
  const lines = [
    '# Semantic Repo Brain',
    '',
    `- Version: ${brain.version}`,
    `- Objective: ${brain.objective}`,
    `- Generated: ${brain.generatedAt}`,
    `- Completion gate: ${brain.completionGate.verdict}`,
    '',
    '## Semantic Graph',
    '',
    `- Nodes: ${brain.semanticGraph.summary.nodes}`,
    `- Edges: ${brain.semanticGraph.summary.edges}`,
    `- Files: ${brain.semanticGraph.summary.files}`,
    `- Symbols: ${brain.semanticGraph.summary.symbols}`,
    `- CLI commands: ${brain.semanticGraph.summary.cliCommands}`,
    `- Quest events: ${brain.semanticGraph.summary.questEvents}`,
    `- Schemas: ${brain.semanticGraph.summary.schemas}`,
    `- Tests: ${brain.semanticGraph.summary.tests}`,
    `- Package scripts: ${brain.semanticGraph.summary.packageScripts}`,
    `- Runtime prompts: ${brain.semanticGraph.summary.runtimePrompts}`,
    '',
    '## Confidence',
    '',
    `- Overall: ${brain.knowledgeConfidenceScore.overall}`,
    ...Object.entries(brain.knowledgeConfidenceScore.summary).map(([status, count]) => `- ${status}: ${count}`),
    '',
    '## Failure Fix Memory',
    '',
    ...(brain.failureFixMemory.fingerprints.length > 0
      ? brain.failureFixMemory.fingerprints.slice(0, 10).map((failure) => `- ${failure.fingerprint}: ${failure.command} - ${failure.knownFix}`)
      : ['_No active failure fingerprints._']),
    '',
    '## Auto Skill Builder',
    '',
    ...(brain.autoSkillBuilder.candidates.length > 0
      ? brain.autoSkillBuilder.candidates.slice(0, 10).map((candidate) => `- ${candidate.suggestedSkillName}: ${candidate.status} - ${candidate.summary}`)
      : ['_No repeated approved or approval-ready skill candidates._']),
    '',
    '## Gate Checks',
    '',
    ...brain.completionGate.checks.map((check) => `- **${check.status}:** ${check.title} - ${check.recommendation}`),
    '',
  ]
  return lines.join('\n')
}

async function buildSemanticGraph(
  options: BuildQuestSemanticRepoBrainOptions,
  packageScripts: PackageScriptInfo[],
  runtimePrompts: string[],
  generatedAt: string,
): Promise<QuestSemanticGraph> {
  const nodes: QuestSemanticRepoNode[] = []
  const edges: QuestSemanticRepoEdge[] = []
  const addNode = (node: QuestSemanticRepoNode): void => {
    if (!nodes.some((candidate) => candidate.id === node.id)) nodes.push(node)
  }
  const addEdge = (edge: QuestSemanticRepoEdge): void => {
    if (!edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.kind === edge.kind)) {
      edges.push(edge)
    }
  }

  // Prefer blame-based ownership from Temporal Memory; fall back to path convention.
  const ownership = options.temporalMemory?.history.ownership ?? {}
  const resolveOwner = (path: string): string =>
    ownership[path.replace(/\\/g, '/')]?.topAuthor || ownerForPath(path)

  const symbolFiles = options.codingAutopilot.symbolGraph.files
  for (const file of symbolFiles) {
    const fileId = fileNodeId(file.path)
    addNode({
      id: fileId,
      kind: isTestFile(file.path) ? 'test' : 'file',
      name: basename(file.path),
      path: file.path,
      detail: `${file.language} file with ${file.symbols.length} symbol(s)`,
      owner: resolveOwner(file.path),
      confidence: 'verified',
      score: 0.9,
      evidence: [`symbol-graph:${file.path}`],
    })
    for (const symbol of file.symbols) {
      const node = symbolToNode(symbol, resolveOwner)
      addNode(node)
      addEdge({ from: fileId, to: node.id, kind: 'declares' })
    }
  }

  for (const edge of options.codingAutopilot.symbolGraph.edges) {
    addEdge({ from: fileNodeId(edge.from), to: fileNodeId(edge.to), kind: edge.kind })
  }

  const commandFiles = options.index.modules.filter((mod) => mod.path.startsWith('packages/cli/src/commands/'))
  for (const mod of commandFiles) {
    const commands = await extractCliCommands(options.projectRoot, mod.path)
    for (const command of commands) {
      const id = semanticId('cli-command', `${mod.path}:${command}`)
      addNode({
        id,
        kind: 'cli-command',
        name: command,
        path: mod.path,
        detail: `Commander CLI command registered in ${mod.path}`,
        owner: resolveOwner(mod.path),
        confidence: 'verified',
        score: 0.86,
        evidence: [`${mod.path}: .command("${command}")`],
      })
      addEdge({ from: fileNodeId(mod.path), to: id, kind: 'implements-command' })
    }
  }

  const eventTypes = await extractQuestEventTypes(options.projectRoot, options.events)
  for (const eventType of eventTypes) {
    addNode({
      id: semanticId('quest-event', eventType),
      kind: 'quest-event',
      name: eventType,
      detail: 'Quest append-only event type',
      confidence: 'verified',
      score: 0.84,
      evidence: ['quest-run.ts or event stream'],
    })
  }

  for (const mod of options.index.modules) {
    if (!isSchemaModule(mod.path, mod.exports)) continue
    const id = semanticId('schema', mod.path)
    addNode({
      id,
      kind: 'schema',
      name: basename(mod.path),
      path: mod.path,
      detail: `Schema/model surface with ${mod.exports.length} export(s)`,
      owner: resolveOwner(mod.path),
      confidence: 'inferred',
      score: 0.72,
      evidence: [`codebase-index:${mod.path}`],
    })
    addEdge({ from: fileNodeId(mod.path), to: id, kind: 'contains' })
  }

  for (const pkg of packageScripts) {
    for (const script of pkg.scripts) {
      const id = semanticId('package-script', `${pkg.path}:${script.name}`)
      addNode({
        id,
        kind: 'package-script',
        name: script.name,
        path: pkg.path,
        detail: script.command,
        owner: resolveOwner(pkg.path),
        confidence: 'verified',
        score: 0.9,
        evidence: [`${pkg.path}:scripts.${script.name}`],
      })
    }
  }

  for (const promptPath of runtimePrompts) {
    const id = semanticId('runtime-prompt', promptPath)
    addNode({
      id,
      kind: 'runtime-prompt',
      name: basename(promptPath),
      path: promptPath,
      detail: 'OpenAgent runtime prompt or Quest context surface',
      owner: resolveOwner(promptPath),
      confidence: 'verified',
      score: 0.88,
      evidence: [promptPath],
    })
  }

  for (const owner of unique(nodes.flatMap((node) => node.owner ? [node.owner] : []))) {
    const ownerId = semanticId('owner', owner)
    addNode({
      id: ownerId,
      kind: 'owner',
      name: owner,
      detail: `Ownership group for ${owner}`,
      confidence: 'inferred',
      score: 0.7,
      evidence: ['path ownership convention'],
    })
    for (const node of nodes.filter((candidate) => candidate.owner === owner && candidate.kind !== 'owner')) {
      addEdge({ from: ownerId, to: node.id, kind: 'owns' })
    }
  }

  for (const test of options.testRecommendations) {
    const id = semanticId('test', test.command)
    addNode({
      id,
      kind: 'test',
      name: test.id,
      detail: test.command,
      confidence: test.confidence >= 0.8 ? 'verified' : 'inferred',
      score: round(test.confidence),
      evidence: [test.reason],
    })
    for (const file of options.files.slice(0, 20)) addEdge({ from: id, to: fileNodeId(file), kind: 'validates' })
  }

  const summary = {
    nodes: nodes.length,
    edges: edges.length,
    files: nodes.filter((node) => node.kind === 'file').length,
    symbols: nodes.filter((node) => ['function', 'class', 'interface', 'type', 'const', 'export', 'shell-function'].includes(node.kind)).length,
    cliCommands: nodes.filter((node) => node.kind === 'cli-command').length,
    questEvents: nodes.filter((node) => node.kind === 'quest-event').length,
    schemas: nodes.filter((node) => node.kind === 'schema').length,
    tests: nodes.filter((node) => node.kind === 'test').length,
    packageScripts: nodes.filter((node) => node.kind === 'package-script').length,
    runtimePrompts: nodes.filter((node) => node.kind === 'runtime-prompt').length,
    owners: nodes.filter((node) => node.kind === 'owner').length,
  }
  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    generatedAt,
    summary,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2_000),
    edges: edges.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`)).slice(0, 4_000),
  }
}

function buildKnowledgeConfidenceScore(
  options: BuildQuestSemanticRepoBrainOptions,
  semanticGraph: QuestSemanticGraph,
): QuestKnowledgeConfidenceScore {
  const facts: QuestKnowledgeConfidenceScore['facts'] = []
  const addFact = (
    subject: string,
    status: QuestKnowledgeConfidenceStatus,
    score: number,
    evidence: string[],
    action: string,
  ): void => {
    facts.push({
      id: semanticId('confidence', `${subject}:${status}:${evidence.join('|')}`),
      subject,
      status,
      score: round(score),
      evidence,
      action,
    })
  }

  for (const fact of options.verifiedKnowledgebase.evidenceLedger.facts) {
    const status: QuestKnowledgeConfidenceStatus =
      fact.status === 'verified'
        ? 'verified'
        : fact.status === 'stale'
          ? 'stale'
          : fact.status === 'unknown'
            ? 'missing'
            : 'inferred'
    addFact(
      fact.claim,
      status,
      fact.confidence,
      fact.evidence.map((item) => item.path ?? item.command ?? item.detail),
      status === 'verified' ? 'Use as coding evidence.' : 'Refresh or verify before relying on this fact.',
    )
  }

  for (const ref of options.verifiedKnowledgebase.hallucinationGate.unknownReferences) {
    addFact(
      `${ref.kind}:${ref.value}`,
      ref.kind === 'package-script' ? 'needs-research' : 'missing',
      0.2,
      [ref.source],
      'Resolve this reference from local files or current official docs before claiming it.',
    )
  }

  for (const item of options.verifiedKnowledgebase.staleKnowledgeReport.items) {
    if (item.freshness !== 'stale' && item.freshness !== 'missing') continue
    addFact(
      item.path,
      item.freshness === 'missing' ? 'missing' : 'stale',
      item.freshness === 'missing' ? 0.1 : 0.45,
      [item.path],
      item.recommendation,
    )
  }

  addFact(
    'semantic-repo-graph',
    semanticGraph.summary.nodes > 0 ? 'verified' : 'missing',
    semanticGraph.summary.nodes > 0 ? 0.86 : 0.1,
    [`${semanticGraph.summary.nodes} semantic node(s)`],
    semanticGraph.summary.nodes > 0 ? 'Use graph for file/symbol/test ownership context.' : 'Refresh semantic repo brain before coding.',
  )

  // Empirical confidence: ground changed-file confidence in accumulated outcome
  // and history signals instead of constants. Only surface elevated/high risk.
  if (options.temporalMemory) {
    for (const file of options.files.slice(0, 50)) {
      const adjustment = empiricalConfidenceAdjustment(file, 0.86, options.temporalMemory)
      if (adjustment.risk === 'low') continue
      addFact(
        `empirical:${file}`,
        adjustment.risk === 'high' ? 'needs-research' : 'inferred',
        adjustment.score,
        [adjustment.reason],
        adjustment.risk === 'high'
          ? 'High-risk surface (reverted/hotfixed or bug-prone) — add extra review and tests before changing.'
          : 'Elevated-risk surface — validate carefully and prefer minimal changes.',
      )
    }
  }

  const summary = {
    verified: facts.filter((fact) => fact.status === 'verified').length,
    inferred: facts.filter((fact) => fact.status === 'inferred').length,
    stale: facts.filter((fact) => fact.status === 'stale').length,
    missing: facts.filter((fact) => fact.status === 'missing').length,
    'needs-research': facts.filter((fact) => fact.status === 'needs-research').length,
  }
  const overall = facts.length > 0
    ? round(facts.reduce((sum, fact) => sum + fact.score, 0) / facts.length)
    : 0

  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    overall,
    summary,
    facts: facts.sort((a, b) => a.status.localeCompare(b.status) || a.subject.localeCompare(b.subject)).slice(0, 500),
  }
}

function buildFailureFixMemory(options: BuildQuestSemanticRepoBrainOptions): QuestFailureFixMemory {
  const autopilotFailures = options.codingAutopilot.failureMemory.failures.map((failure) => ({
    id: failure.id,
    command: failure.command,
    fingerprint: stableId(`${failure.command}:${failure.summary}`),
    summary: failure.summary,
    files: failure.files,
    knownFix: failure.suggestedFix,
    status: 'active' as const,
    confidence: 0.72,
  }))
  const eventFailures = options.events.flatMap((event, eventIndex) => {
    if (event.type !== 'validation') return []
    const result = event.data?.result as { checks?: Array<{ command?: string; passed?: boolean; output?: string }> } | undefined
    return (result?.checks ?? [])
      .filter((check) => check.passed === false)
      .map((check, checkIndex) => {
        const command = check.command ?? 'unknown validation command'
        const summary = summarizeOutput(check.output) ?? 'Validation command failed.'
        return {
          id: `event-failure-${eventIndex + 1}-${checkIndex + 1}`,
          command,
          fingerprint: stableId(`${command}:${summary}`),
          summary,
          files: options.files,
          knownFix: 'Replay the exact command, inspect the first actionable error, apply one scoped fix, then rerun the same command.',
          status: 'active' as const,
          confidence: 0.68,
        }
      })
  })
  const fingerprints = dedupeFailures([...autopilotFailures, ...eventFailures])
  const reusableFixes = [
    ...options.codingAutopilot.failureMemory.reusableLearnings.map((learning) => ({
      id: semanticId('fix-learning', learning.source),
      summary: learning.summary,
      source: learning.source,
      confidence: learning.confidence,
    })),
    ...fingerprints.map((failure) => ({
      id: semanticId('fix-fingerprint', failure.fingerprint),
      summary: `${failure.command}: ${failure.knownFix}`,
      source: failure.id,
      confidence: failure.confidence,
    })),
  ]
  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    fingerprints,
    reusableFixes: dedupeById(reusableFixes).slice(0, 100),
    replayCommands: unique(fingerprints.map((failure) => failure.command)).slice(0, 20),
    policy: [
      'Replay exact failed commands before broader validation.',
      'If the same fingerprint fails twice, stop and report the attempted fix.',
      'Do not widen the patch beyond the pre-edit contract to fix a replay failure.',
      'Store durable workflow lessons only through user-approved memory promotion.',
    ],
  }
}

function buildAutoSkillBuilder(candidates: MemoryPromotionCandidate[]): QuestAutoSkillBuilder {
  const skillCandidates = candidates
    .filter((candidate) => isSkillWorthy(candidate))
    .slice(0, 40)
    .map((candidate) => {
      const status: QuestAutoSkillBuilder['candidates'][number]['status'] = candidate.status === 'approved'
        ? 'approved-for-build'
        : candidate.status === 'rejected'
          ? 'rejected'
          : 'pending-user-approval'
      const suggestedSkillName = suggestedSkillNameFor(candidate)
      return {
        id: `skill-${candidate.id}`,
        title: titleCase(suggestedSkillName.replace(/-/g, ' ')),
        summary: candidate.summary,
        sourceCandidateId: candidate.id,
        status,
        confidence: candidate.confidence,
        occurrenceCount: candidate.occurrenceCount,
        evidenceCount: candidate.evidence.length,
        suggestedSkillName,
        ...(status === 'pending-user-approval' && { approvalCommand: `oac memory-promote --approve ${candidate.id}` }),
        buildPlan: [
          'Wait for explicit user approval of the memory promotion candidate.',
          'Create a focused skill with trigger rules, evidence sources, and validation commands.',
          'Link the skill to approved repo memory and keep examples minimal.',
          'Validate the skill package before exposing it as durable guidance.',
        ],
      }
    })

  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    candidates: skillCandidates,
    policy: [
      'Never create or install a skill from one Quest event.',
      'Repeated successful workflows become candidates only.',
      'User approval through oac memory-promote is required before durable skill creation.',
      'Rejected candidates must not be used as future skill-building input.',
    ],
  }
}

function buildCompletionGate(
  graph: QuestSemanticGraph,
  confidence: QuestKnowledgeConfidenceScore,
  failureFixMemory: QuestFailureFixMemory,
  skillBuilder: QuestAutoSkillBuilder,
  verifiedKnowledgebase: QuestVerifiedKnowledgebase,
): QuestSemanticCompletionGate {
  const checks: QuestSemanticCompletionGate['checks'] = [
    {
      id: 'semantic-graph-present',
      title: 'Semantic repo brain has graph nodes',
      status: graph.summary.nodes > 0 ? 'pass' : 'blocked',
      evidence: [`nodes=${graph.summary.nodes}`, `edges=${graph.summary.edges}`],
      recommendation: graph.summary.nodes > 0 ? 'Use semantic graph for coding context.' : 'Refresh semantic repo brain before editing.',
    },
    {
      id: 'knowledge-confidence',
      title: 'Knowledge confidence is usable',
      status: confidence.overall >= 0.6 ? 'pass' : confidence.overall >= 0.4 ? 'review' : 'blocked',
      evidence: [`overall=${confidence.overall}`],
      recommendation: confidence.overall >= 0.6 ? 'Proceed with evidence-backed coding.' : 'Refresh missing or stale knowledge before coding.',
    },
    {
      id: 'hallucination-gate',
      title: 'Hallucination gate is not blocked',
      status: verifiedKnowledgebase.hallucinationGate.verdict === 'blocked' ? 'blocked' : verifiedKnowledgebase.hallucinationGate.verdict,
      evidence: [`verdict=${verifiedKnowledgebase.hallucinationGate.verdict}`],
      recommendation: verifiedKnowledgebase.hallucinationGate.verdict === 'blocked'
        ? 'Resolve unknown or unsupported references before completion.'
        : 'Use hallucination gate evidence in final review.',
    },
    {
      id: 'failure-fix-memory',
      title: 'Failure-fix memory is explicit',
      status: failureFixMemory.fingerprints.length > 0 ? 'review' : 'pass',
      evidence: [`fingerprints=${failureFixMemory.fingerprints.length}`],
      recommendation: failureFixMemory.fingerprints.length > 0
        ? 'Replay or explain active failure fingerprints before marking tested.'
        : 'No active failure fingerprints require replay.',
    },
    {
      id: 'skill-builder-approval',
      title: 'Skill candidates require user approval',
      status: skillBuilder.candidates.some((candidate) => candidate.status === 'pending-user-approval') ? 'review' : 'pass',
      evidence: [`candidates=${skillBuilder.candidates.length}`],
      recommendation: 'Suggest approval commands, but do not create durable skills without user approval.',
    },
  ]
  const verdict = checks.some((check) => check.status === 'blocked')
    ? 'blocked'
    : checks.some((check) => check.status === 'review')
      ? 'review'
      : 'pass'
  return {
    version: QUEST_SEMANTIC_REPO_BRAIN_VERSION,
    verdict,
    checks,
  }
}

async function loadPackageScripts(projectRoot: string, index: CodebaseIndex): Promise<PackageScriptInfo[]> {
  const packagePaths = flattenFileTree(index.fileTree).filter((file) => file.endsWith('package.json')).slice(0, 80)
  const scripts: PackageScriptInfo[] = []
  for (const path of packagePaths) {
    try {
      const parsed = JSON.parse(await readFile(join(projectRoot, path), 'utf-8')) as {
        name?: string
        scripts?: Record<string, string>
      }
      scripts.push({
        path,
        name: parsed.name,
        scripts: Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({ name, command })),
      })
    } catch {
      // Ignore malformed package files; the confidence gate will rely on verified artifacts.
    }
  }
  return scripts
}

async function loadRuntimePromptFiles(projectRoot: string, index: CodebaseIndex): Promise<string[]> {
  const candidates = flattenFileTree(index.fileTree).filter((file) =>
    file === '.opencode/agent/core/openagent.md' ||
    file === '.opencode/context/core/quest-mode.md' ||
    /^plugins\/(kimi-code|codex-cli|claude-code)\//.test(file) ||
    /openagent.*\.(md|yaml|toml)$/i.test(file),
  )
  const existing: string[] = []
  for (const file of candidates.slice(0, 120)) {
    try {
      const fileStat = await stat(join(projectRoot, file))
      if (fileStat.isFile()) existing.push(file)
    } catch {
      // skip
    }
  }
  return unique(existing)
}

async function extractCliCommands(projectRoot: string, file: string): Promise<string[]> {
  try {
    const text = await readFile(join(projectRoot, file), 'utf-8')
    const commands: string[] = []
    for (const match of text.matchAll(/\.command\(\s*['"`]([^'"` <]+)(?:\s+[^'"`]*)?['"`]/g)) {
      if (match[1]) commands.push(match[1])
    }
    return unique(commands)
  } catch {
    return []
  }
}

async function extractQuestEventTypes(
  projectRoot: string,
  events: Array<{ type?: string }>,
): Promise<string[]> {
  const fromStream = events.flatMap((event) => event.type ? [event.type] : [])
  const fromSource: string[] = []
  for (const file of ['packages/cli/src/lib/quest-run.ts', 'packages/cli/src/lib/quest-reconciler.ts']) {
    try {
      const text = await readFile(join(projectRoot, file), 'utf-8')
      for (const match of text.matchAll(/\|\s*'([^']+)'/g)) {
        const value = match[1]
        if (value?.includes('.') || value === 'task_update' || value === 'state_change' || value === 'validation') {
          fromSource.push(value)
        }
      }
    } catch {
      // skip
    }
  }
  return unique([...fromSource, ...fromStream]).slice(0, 120)
}

function symbolToNode(
  symbol: QuestSymbolNode,
  resolveOwner: (path: string) => string,
): QuestSemanticRepoNode {
  return {
    id: semanticId(symbol.kind, `${symbol.file}:${symbol.name}:${symbol.exported}`),
    kind: symbol.kind,
    name: symbol.name,
    path: symbol.file,
    detail: symbol.exported ? 'Exported symbol from syntax scan' : 'Local symbol from syntax scan',
    owner: resolveOwner(symbol.file),
    confidence: symbol.exported ? 'verified' : 'inferred',
    score: symbol.exported ? 0.86 : 0.68,
    evidence: [`symbol-graph:${symbol.file}#${symbol.name}`],
  }
}

function isSchemaModule(file: string, exports: string[]): boolean {
  return /schema|model|contract|types?|zod|config/i.test(file) ||
    exports.some((name) => /schema|model|contract|type|config/i.test(name))
}

function isTestFile(file: string): boolean {
  return /(\.test\.|\.spec\.|\/test\/|\/tests\/|__tests__)/i.test(file)
}

function ownerForPath(path: string): string {
  const parts = path.split('/')
  if (parts[0] === 'packages' && parts[1]) return `packages/${parts[1]}`
  if (parts[0] === 'plugins' && parts[1]) return `plugins/${parts[1]}`
  if (parts[0] === 'scripts') return 'scripts'
  if (parts[0] === '.opencode') return '.opencode'
  if (parts[0] === 'evals' && parts[1]) return `evals/${parts[1]}`
  return parts[0] ?? 'root'
}

function fileNodeId(path: string): string {
  return semanticId('file', path)
}

function isSkillWorthy(candidate: MemoryPromotionCandidate): boolean {
  if (candidate.status === 'rejected') return true
  if (candidate.occurrenceCount < 2 || candidate.confidence < 0.65) return false
  return /workflow|command|pattern|convention|decision|knowledge/i.test(candidate.kind)
}

function suggestedSkillNameFor(candidate: MemoryPromotionCandidate): string {
  const words = candidate.summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 5)
  return words.length > 0 ? words.join('-') : `skill-${candidate.id}`
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function summarizeOutput(output: string | undefined): string | undefined {
  if (!output?.trim()) return undefined
  return output.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 240)
}

function dedupeFailures(
  failures: QuestFailureFixMemory['fingerprints'],
): QuestFailureFixMemory['fingerprints'] {
  const byFingerprint = new Map<string, QuestFailureFixMemory['fingerprints'][number]>()
  for (const failure of failures) {
    if (!byFingerprint.has(failure.fingerprint)) byFingerprint.set(failure.fingerprint, failure)
  }
  return [...byFingerprint.values()].sort((a, b) => a.command.localeCompare(b.command))
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function semanticId(kind: string, value: string): string {
  return `${kind}-${createHash('sha1').update(value).digest('hex').slice(0, 12)}`
}

function stableId(input: string): string {
  return `ff-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\\/g, '/')).filter(Boolean))].sort()
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'when',
  'then',
  'into',
  'quest',
  'openagent',
  'should',
])

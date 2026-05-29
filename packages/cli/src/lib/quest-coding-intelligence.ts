/**
 * Quest v9 Coding Intelligence Loop.
 *
 * Builds deterministic coding intent, impact, patch capsule, smart-test, and
 * review-signal artifacts for a Quest without requiring an external model.
 */

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  getRelevantFiles,
  getScopeImpact,
  indexCodebase,
  loadIndex,
  isIndexStale,
  type CodebaseIndex,
  type ImpactAnalysis,
} from './codebase-indexer.js'
import {
  buildQuestCodingAutopilot,
  formatCodingAutopilotSummary,
  writeQuestCodingAutopilotArtifacts,
  type QuestCodingAutopilot,
} from './quest-coding-autopilot.js'
import {
  buildQuestCodingExecution,
  formatCodingExecutionSummary,
  writeQuestCodingExecutionArtifacts,
  type QuestCodingExecution,
} from './quest-coding-execution.js'
import { loadRepoWikiSnapshot } from './repo-wiki.js'

const execFileAsync = promisify(execFile)

export const QUEST_CODING_INTELLIGENCE_VERSION = '9' as const

export interface QuestCodingIntent {
  objective: string
  behaviorChange: string
  nonGoals: string[]
  affectedFiles: string[]
  affectedModules: string[]
  riskLevel: 'low' | 'medium' | 'high'
  likelyTests: string[]
  rollbackPlan: string
}

export interface QuestPatchCapsule {
  id: string
  taskId?: string
  summary: string
  files: string[]
  expectedBehavior: string
  validationCommands: string[]
  rollbackNote: string
}

export interface QuestTestRecommendation {
  id: string
  command: string
  reason: string
  scope: 'format' | 'unit' | 'package' | 'runtime' | 'shell' | 'full'
  confidence: number
}

export interface QuestReviewSignal {
  id: string
  severity: 'info' | 'warning' | 'error'
  summary: string
  files: string[]
  recommendation: string
}

export interface QuestRuntimeParity {
  opencode: boolean
  kimi: boolean
  codex: boolean
  claude: boolean
  reason: string
}

export interface QuestCodingIntelligence {
  version: typeof QUEST_CODING_INTELLIGENCE_VERSION
  generatedAt: string
  projectRoot: string
  questId?: string
  objective: string
  reason: string
  intent: QuestCodingIntent
  impact: ImpactAnalysis
  patchCapsules: QuestPatchCapsule[]
  testRecommendations: QuestTestRecommendation[]
  reviewSignals: QuestReviewSignal[]
  runtimeParity: QuestRuntimeParity
  codingAutopilot: QuestCodingAutopilot
  codingExecution: QuestCodingExecution
}

export interface RefreshQuestCodingIntelligenceOptions {
  questId?: string
  objective?: string
  reason?: string
  changedFiles?: string[]
}

interface MinimalQuest {
  questId?: string
  objective?: string
  tasks?: Array<{ id?: string; title?: string; status?: string }>
}

interface MinimalEvent {
  timestamp?: string
  type?: string
  data?: Record<string, unknown>
}

export async function refreshQuestCodingIntelligence(
  projectRoot: string,
  options: RefreshQuestCodingIntelligenceOptions = {},
): Promise<QuestCodingIntelligence> {
  const quest = options.questId ? await loadMinimalQuest(projectRoot, options.questId) : null
  const events = options.questId ? await loadMinimalEvents(projectRoot, options.questId) : []
  const objective = options.objective ?? quest?.objective ?? 'Current coding changes'
  const changedFiles = unique([
    ...(options.changedFiles ?? []),
    ...changedFilesFromEvents(events),
    ...await gitChangedFiles(projectRoot),
  ])

  const index = await resolveCodebaseIndex(projectRoot)
  const repoWiki = await loadRepoWikiSnapshot(projectRoot)
  const relevantFiles = changedFiles.length > 0
    ? changedFiles
    : getRelevantFiles(index, objective).slice(0, 12)
  const impact = getScopeImpact(index, relevantFiles)
  const testRecommendations = buildTestRecommendations(projectRoot, index, relevantFiles)
  const patchCapsules = buildPatchCapsules(objective, quest, events, relevantFiles, testRecommendations)
  const reviewSignals = buildReviewSignals(relevantFiles, impact, testRecommendations, repoWiki?.changes.gitStatus ?? [])
  const runtimeParity = buildRuntimeParity(relevantFiles)
  const codingAutopilot = await buildQuestCodingAutopilot({
    projectRoot,
    objective,
    files: relevantFiles,
    index,
    impact,
    patchCapsules,
    testRecommendations,
    reviewSignals,
    runtimeParity,
    events,
    gitStatus: repoWiki?.changes.gitStatus ?? [],
  })
  const codingExecution = await buildQuestCodingExecution({
    projectRoot,
    objective,
    files: relevantFiles,
    index,
    impact,
    patchCapsules,
    testRecommendations,
    reviewSignals,
    runtimeParity,
    codingAutopilot,
    events,
    gitStatus: repoWiki?.changes.gitStatus ?? [],
  })

  const intelligence: QuestCodingIntelligence = {
    version: QUEST_CODING_INTELLIGENCE_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    ...(options.questId && { questId: options.questId }),
    objective,
    reason: options.reason ?? 'manual',
    intent: buildCodingIntent(objective, relevantFiles, index, impact, testRecommendations),
    impact,
    patchCapsules,
    testRecommendations,
    reviewSignals,
    runtimeParity,
    codingAutopilot,
    codingExecution,
  }

  await writeQuestCodingIntelligence(projectRoot, options.questId, intelligence)
  return intelligence
}

export async function writeQuestCodingIntelligence(
  projectRoot: string,
  questId: string | undefined,
  intelligence: QuestCodingIntelligence,
): Promise<void> {
  const dir = questId
    ? join(projectRoot, '.oac', 'runs', questId)
    : join(projectRoot, '.oac', 'coding-intelligence')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'coding-intelligence.json'), JSON.stringify(intelligence, null, 2) + '\n')
  await writeFile(join(dir, 'patch-capsules.json'), JSON.stringify(intelligence.patchCapsules, null, 2) + '\n')
  await writeFile(join(dir, 'coding-review.md'), formatCodingReview(intelligence))
  await writeQuestCodingAutopilotArtifacts(dir, intelligence.codingAutopilot)
  await writeQuestCodingExecutionArtifacts(dir, intelligence.codingExecution)
}

export function formatCodingReview(intelligence: QuestCodingIntelligence): string {
  const lines: string[] = [
    '# Quest v9 Coding Intelligence',
    '',
    `- **Objective:** ${intelligence.objective}`,
    `- **Risk:** ${intelligence.intent.riskLevel}`,
    `- **Reason:** ${intelligence.reason}`,
    `- **Generated:** ${intelligence.generatedAt}`,
    '',
    '## Intent',
    '',
    `- Behavior change: ${intelligence.intent.behaviorChange}`,
    `- Rollback: ${intelligence.intent.rollbackPlan}`,
    '',
    '## Impact',
    '',
    `- ${intelligence.impact.summary}`,
    `- Direct dependents: ${intelligence.impact.directlyAffected.length}`,
    `- Transitive dependents: ${intelligence.impact.transitivelyAffected.length}`,
    '',
    '## Smart Tests',
    '',
  ]

  for (const test of intelligence.testRecommendations) {
    lines.push(`- \`${test.command}\` - ${test.reason}`)
  }
  if (intelligence.testRecommendations.length === 0) lines.push('_No test recommendations generated._')

  lines.push('', '## Patch Capsules', '')
  for (const capsule of intelligence.patchCapsules) {
    lines.push(`- **${capsule.id}:** ${capsule.summary}`)
    if (capsule.files.length > 0) lines.push(`  - Files: ${capsule.files.map((file) => `\`${file}\``).join(', ')}`)
  }
  if (intelligence.patchCapsules.length === 0) lines.push('_No patch capsules generated._')

  lines.push('', '## Review Signals', '')
  for (const signal of intelligence.reviewSignals) {
    lines.push(`- **${signal.severity}:** ${signal.summary}`)
    lines.push(`  - ${signal.recommendation}`)
  }
  if (intelligence.reviewSignals.length === 0) lines.push('_No review signals._')

  lines.push('', '## Runtime Parity', '')
  lines.push(`- OpenCode: ${yesNo(intelligence.runtimeParity.opencode)}`)
  lines.push(`- Kimi: ${yesNo(intelligence.runtimeParity.kimi)}`)
  lines.push(`- Codex: ${yesNo(intelligence.runtimeParity.codex)}`)
  lines.push(`- Claude: ${yesNo(intelligence.runtimeParity.claude)}`)
  lines.push(`- Reason: ${intelligence.runtimeParity.reason}`)
  lines.push('')
  lines.push(formatCodingAutopilotSummary(intelligence.codingAutopilot))
  lines.push(formatCodingExecutionSummary(intelligence.codingExecution))
  return lines.join('\n')
}

async function resolveCodebaseIndex(projectRoot: string): Promise<CodebaseIndex> {
  const cached = await loadIndex(projectRoot)
  if (cached && !isIndexStale(cached, projectRoot)) return cached
  return indexCodebase(projectRoot)
}

function buildCodingIntent(
  objective: string,
  files: string[],
  index: CodebaseIndex,
  impact: ImpactAnalysis,
  tests: QuestTestRecommendation[],
): QuestCodingIntent {
  const lower = objective.toLowerCase()
  const riskyKeywords = ['auth', 'security', 'delete', 'migration', 'payment', 'credential', 'release', 'runtime', 'installer']
  const riskLevel = impact.riskLevel === 'high' || riskyKeywords.some((keyword) => lower.includes(keyword))
    ? 'high'
    : impact.riskLevel
  const modules = files
    .map((file) => index.modules.find((mod) => mod.path === file || mod.path.endsWith(file)))
    .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod))

  return {
    objective,
    behaviorChange: inferBehaviorChange(objective, files),
    nonGoals: inferNonGoals(objective),
    affectedFiles: files,
    affectedModules: unique(modules.map((mod) => `${mod.type}:${mod.path}`)).slice(0, 20),
    riskLevel,
    likelyTests: tests.map((test) => test.command).slice(0, 8),
    rollbackPlan: files.length > 0
      ? 'Revert the patch capsule files for the failing change set and rerun the selected smart tests.'
      : 'No concrete file changes detected; rollback is to discard the generated Quest artifacts only.',
  }
}

function buildPatchCapsules(
  objective: string,
  quest: MinimalQuest | null,
  events: MinimalEvent[],
  files: string[],
  tests: QuestTestRecommendation[],
): QuestPatchCapsule[] {
  const taskEvents = events.filter((event) => event.type === 'file_change' || event.type === 'action.summary')
  if (taskEvents.length === 0) {
    return [{
      id: 'patch-001',
      summary: files.length > 0 ? `Implement requested coding change for: ${objective}` : `Plan coding work for: ${objective}`,
      files,
      expectedBehavior: inferBehaviorChange(objective, files),
      validationCommands: tests.map((test) => test.command).slice(0, 5),
      rollbackNote: files.length > 0 ? 'Revert the listed files if this capsule fails validation.' : 'No product files listed for rollback.',
    }]
  }

  const capsules = new Map<string, QuestPatchCapsule>()
  taskEvents.forEach((event, index) => {
    const taskId = asString(event.data?.taskId ?? event.data?.task_id)
    const eventFiles = unique([
      ...strings(event.data?.path),
      ...strings(event.data?.added),
      ...strings(event.data?.changedFiles),
      ...strings(event.data?.files),
    ])
    const key = taskId ?? `event-${index + 1}`
    const current = capsules.get(key)
    const title = quest?.tasks?.find((task) => task.id === taskId)?.title
    const summary = asString(event.data?.summary ?? event.data?.message) ?? title ?? `Patch work for ${key}`
    if (!current) {
      capsules.set(key, {
        id: `patch-${String(capsules.size + 1).padStart(3, '0')}`,
        ...(taskId && { taskId }),
        summary,
        files: eventFiles,
        expectedBehavior: inferBehaviorChange(objective, eventFiles),
        validationCommands: tests.map((test) => test.command).slice(0, 5),
        rollbackNote: eventFiles.length > 0 ? 'Revert these files if this capsule introduces regression.' : 'No file-specific rollback detected.',
      })
      return
    }
    current.files = unique([...current.files, ...eventFiles])
  })

  return [...capsules.values()]
}

function buildTestRecommendations(
  projectRoot: string,
  index: CodebaseIndex,
  files: string[],
): QuestTestRecommendation[] {
  const recommendations: QuestTestRecommendation[] = []
  const add = (id: string, command: string, reason: string, scope: QuestTestRecommendation['scope'], confidence: number) => {
    if (!recommendations.some((test) => test.command === command)) {
      recommendations.push({ id, command, reason, scope, confidence })
    }
  }

  add('diff-check', 'git diff --check', 'Catch whitespace and conflict-marker issues before deeper tests.', 'format', 0.9)

  const hasCli = files.some((file) => file.startsWith('packages/cli/'))
  const hasSwarm = files.some((file) => file.startsWith('packages/swarm-runtime/'))
  const hasPlugin = files.some((file) => file.startsWith('plugins/'))
  const hasKimi = files.some((file) => file.includes('kimi-code') || file.includes('test-kimi-quest'))
  const hasCodex = files.some((file) => file.includes('codex-cli') || file.includes('test-codex-quest'))
  const hasOpenCode = files.some((file) => file.includes('.opencode/') || file.includes('test-opencode-quest'))
  const hasShell = files.some((file) => file.endsWith('.sh') || file === 'install.sh' || file === 'update.sh')
  const testFiles = findLikelyTestFiles(index, files)

  if (testFiles.length > 0) {
    add('focused-tests', `bun test ${testFiles.slice(0, 8).join(' ')}`, 'Run the nearest focused tests for changed or impacted source files.', 'unit', 0.85)
  }
  if (hasCli || files.some((file) => file.startsWith('packages/cli/src/'))) {
    add('cli-typecheck', 'npm run typecheck -w packages/cli', 'CLI TypeScript surfaces changed.', 'package', 0.9)
    add('cli-build', 'npm run build -w packages/cli', 'CLI command or library code changed.', 'package', 0.8)
  }
  if (hasSwarm) {
    add('swarm-typecheck', 'npm run typecheck -w packages/swarm-runtime', 'Swarm runtime types or scheduler code changed.', 'package', 0.85)
    add('swarm-tests', 'cd packages/swarm-runtime && bun test', 'Swarm runtime behavior changed.', 'package', 0.8)
  }
  if (hasShell) {
    const shellFiles = files.filter((file) => file.endsWith('.sh') || file === 'install.sh' || file === 'update.sh')
    add('shell-syntax', `bash -n ${shellFiles.join(' ')}`, 'Shell installer or harness files changed.', 'shell', 0.9)
  }
  if (hasKimi || hasPlugin) {
    add('kimi-v8', 'npm run test:quest-v8:kimi', 'Kimi/OpenAgent adapter or Quest harness surfaces changed.', 'runtime', 0.85)
  }
  if (hasOpenCode) {
    add('opencode-v8', 'npm run test:quest-v8:opencode', 'OpenCode/OpenAgent prompt or Quest harness surfaces changed.', 'runtime', 0.8)
  }
  if (hasCodex || hasPlugin) {
    add('codex-v8', 'npm run test:quest-v8:codex', 'Codex adapter or Quest harness surfaces changed.', 'runtime', 0.8)
  }

  if (recommendations.length === 1 && packageHasScript(projectRoot, 'test')) {
    add('project-test', 'npm test', 'Fallback project test script is available.', 'full', 0.55)
  }

  return recommendations
}

function buildReviewSignals(
  files: string[],
  impact: ImpactAnalysis,
  tests: QuestTestRecommendation[],
  gitStatus: string[],
): QuestReviewSignal[] {
  const signals: QuestReviewSignal[] = []
  if (impact.riskLevel === 'high') {
    signals.push({
      id: 'high-impact',
      severity: 'warning',
      summary: 'High impact change set detected.',
      files,
      recommendation: 'Run package-level tests plus runtime parity checks before completion.',
    })
  }
  if (tests.length <= 1) {
    signals.push({
      id: 'thin-tests',
      severity: 'warning',
      summary: 'Only minimal validation was selected.',
      files,
      recommendation: 'Add or run focused tests for the affected package before marking the Quest tested.',
    })
  }
  const generatedDirty = gitStatus.filter((line) => line.includes('.expert-memory.json') || line.includes('.oac/repo-wiki/'))
  if (generatedDirty.length > 0) {
    signals.push({
      id: 'generated-artifacts',
      severity: 'info',
      summary: 'Generated memory/wiki artifacts are dirty.',
      files: generatedDirty,
      recommendation: 'Decide whether these generated artifacts should be committed or cleaned before PR/commit.',
    })
  }
  if (runtimeSurfaceChanged(files) && !tests.some((test) => test.scope === 'runtime')) {
    signals.push({
      id: 'runtime-parity-missing',
      severity: 'warning',
      summary: 'Runtime-facing files changed without runtime parity tests.',
      files,
      recommendation: 'Run the matching Kimi/OpenCode/Codex Quest harness before completion.',
    })
  }
  return signals
}

function buildRuntimeParity(files: string[]): QuestRuntimeParity {
  const kimi = files.some((file) => file.includes('kimi') || file.includes('plugins/'))
  const codex = files.some((file) => file.includes('codex') || file.includes('plugins/'))
  const opencode = files.some((file) => file.startsWith('.opencode/') || file.includes('opencode') || file.includes('scripts/tests/test-opencode'))
  const claude = files.some((file) => file.includes('claude') || file.includes('install.sh') || file.includes('update.sh'))
  const any = kimi || codex || opencode || claude
  return {
    opencode,
    kimi,
    codex,
    claude,
    reason: any
      ? 'Runtime-facing files changed; validate the marked adapters/harnesses.'
      : 'No runtime adapter surface detected in the current coding impact set.',
  }
}

function findLikelyTestFiles(index: CodebaseIndex, files: string[]): string[] {
  const allFiles = flattenDependencyFiles(index)
  const candidates = new Set<string>()
  for (const file of files) {
    if (isTestFile(file) && allFiles.has(file)) candidates.add(file)
    const stem = file
      .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, '')
      .replace(/^src\//, '')
      .replace(/^packages\/([^/]+)\/src\//, 'packages/$1/src/')
    for (const candidate of allFiles) {
      if (!isTestFile(candidate)) continue
      if (candidate.includes(stem) || candidate.includes(stem.split('/').at(-1) ?? stem)) {
        candidates.add(candidate)
      }
    }
  }
  return [...candidates].sort().slice(0, 12)
}

function flattenDependencyFiles(index: CodebaseIndex): Set<string> {
  return new Set([
    ...Object.keys(index.dependencies),
    ...index.modules.map((module) => module.path),
  ])
}

function inferBehaviorChange(objective: string, files: string[]): string {
  if (files.length === 0) return `Plan or inspect coding work for: ${objective}`
  return `Change ${files.length} file(s) to satisfy: ${objective}`
}

function inferNonGoals(objective: string): string[] {
  const lower = objective.toLowerCase()
  const nonGoals = ['Do not change unrelated files or generated artifacts unless needed for validation.']
  if (!lower.includes('deploy')) nonGoals.push('Do not deploy or perform production actions.')
  if (!lower.includes('secret') && !lower.includes('credential')) nonGoals.push('Do not introduce secrets or credentials.')
  return nonGoals
}

async function loadMinimalQuest(projectRoot: string, questId: string): Promise<MinimalQuest | null> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'quest.json'), 'utf-8')
    return JSON.parse(raw) as MinimalQuest
  } catch {
    return null
  }
}

async function loadMinimalEvents(projectRoot: string, questId: string): Promise<MinimalEvent[]> {
  try {
    const raw = await readFile(join(projectRoot, '.oac', 'runs', questId, 'events.ndjson'), 'utf-8')
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as MinimalEvent)
  } catch {
    return []
  }
}

async function gitChangedFiles(projectRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'status', '--short'], { maxBuffer: 1024 * 1024 })
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.replace(/^.{2}\s*/, '').trim())
      .filter((file) => file && !file.startsWith('.oac/runs/'))
  } catch {
    return []
  }
}

function changedFilesFromEvents(events: MinimalEvent[]): string[] {
  return unique(events.flatMap((event) => [
    ...strings(event.data?.path),
    ...strings(event.data?.added),
    ...strings(event.data?.removed),
    ...strings(event.data?.file),
    ...strings(event.data?.files),
    ...strings(event.data?.changedFiles),
    ...strings(event.data?.contextPath),
    ...strings(event.data?.contextPaths),
  ]))
}

function packageHasScript(projectRoot: string, script: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    return Boolean(pkg.scripts?.[script])
  } catch {
    return false
  }
}

function isTestFile(file: string): boolean {
  return /(\.test\.|\.spec\.|\/test\/|\/tests\/|__tests__)/i.test(file)
}

function runtimeSurfaceChanged(files: string[]): boolean {
  return files.some((file) =>
    file.includes('plugins/') ||
    file.includes('.opencode/') ||
    file.includes('runtime-bridge') ||
    file.includes('scripts/tests/test-') ||
    file === 'install.sh' ||
    file === 'update.sh',
  )
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\\/g, '/')).filter(Boolean))].sort()
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return []
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

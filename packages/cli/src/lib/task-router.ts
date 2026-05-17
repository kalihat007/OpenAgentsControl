/**
 * Dynamic Task Router — automatically selects experts based on task content.
 *
 * Analyzes the user's objective and returns a ranked list of recommended
 * experts/agents for the swarm. No manual selection needed.
 *
 * Features:
 * - Fast keyword-based scoring (sync, always available)
 * - Confidence scoring (0-1) with configurable threshold
 * - Ambiguity detection when multiple experts score similarly
 * - Clarification question generation for ambiguous/low-confidence routing
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('task-router')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpertProfile {
  id: string
  name: string
  description: string
  category: string
  keywords: string[]
  filePatterns: string[]
  score: number
}

export interface RoutingConfidence {
  /** Normalized confidence score from 0 (no signal) to 1 (strong match). */
  score: number
  /** True when confidence falls below the configured threshold. */
  isLowConfidence: boolean
  /** True when the top candidates scored within the ambiguity margin. */
  isAmbiguous: boolean
  /** Experts that scored within the ambiguity margin of the top match. */
  ambiguousExperts: ExpertProfile[]
}

export interface ClarificationInfo {
  /** Whether the user should be prompted for more context. */
  needed: boolean
  /** Suggested questions to resolve the ambiguity. */
  questions: string[]
}

export type QuestScenario =
  | 'direct'
  | 'code_with_spec'
  | 'prototype_demo'
  | 'create_tool'
  | 'research_plan'

export interface RouterResult {
  objective: string
  scenario: QuestScenario
  primaryExperts: ExpertProfile[]
  secondaryExperts: ExpertProfile[]
  reasoning: string[]
  estimatedChunks: number
  /** Confidence assessment of the routing decision. */
  confidence: RoutingConfidence
  /** Suggested clarification when routing is uncertain. */
  clarification: ClarificationInfo
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface RouterConfig {
  /**
   * Confidence threshold (0-1). Scores below this trigger low-confidence
   * flagging and clarification hints. Default: 0.4
   */
  confidenceThreshold?: number
  /**
   * Ambiguity margin (0-1). When the ratio of the second-best score to the
   * best score exceeds (1 - margin), results are flagged ambiguous. Default: 0.15
   */
  ambiguityMargin?: number
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.4
const DEFAULT_AMBIGUITY_MARGIN = 0.15

/**
 * Raw score at which keyword matching reaches full confidence.
 * 10 points ≈ 5 exact keyword matches — a strong unambiguous signal.
 */
const MAX_RAW_SCORE_FOR_FULL_CONFIDENCE = 10

const SCENARIO_KEYWORDS: Record<QuestScenario, string[]> = {
  direct: ['explain', 'what is', 'where is', 'list', 'show', 'read', 'fix typo', 'small change'],
  code_with_spec: ['full-stack', 'feature', 'refactor', 'migration', 'auth', 'database', 'strict', 'acceptance criteria', 'test coverage'],
  prototype_demo: ['prototype', 'demo', 'landing page', 'website', 'mockup', 'preview', 'quick app'],
  create_tool: ['tool', 'cli', 'script', 'automation', 'generator', 'utility', 'command'],
  research_plan: ['research', 'compare', 'architecture', 'tradeoff', 'plan', 'design', 'proposal', 'compliance', 'hardware bom'],
}

// ── Keyword → Expert mappings ─────────────────────────────────────────────────

const EXPERT_KEYWORDS: Record<string, { keywords: string[]; filePatterns: string[] }> = {
  CoderAgent: {
    keywords: ['implement', 'code', 'write', 'create', 'build', 'function', 'class', 'refactor', 'fix bug', 'feature', 'development', 'programming', 'script'],
    filePatterns: ['*.ts', '*.js', '*.go', '*.rs', '*.py', '*.java', '*.cpp', '*.c'],
  },
  OpenFrontendSpecialist: {
    keywords: ['ui', 'ux', 'frontend', 'react', 'vue', 'angular', 'css', 'html', 'component', 'page', 'screen', 'layout', 'styling', 'dom', 'browser'],
    filePatterns: ['*.tsx', '*.jsx', '*.css', '*.scss', '*.html', '*.vue'],
  },
  BackendDeveloperAgent: {
    keywords: ['api', 'backend', 'server', 'database', 'sql', 'nosql', 'rest', 'graphql', 'endpoint', 'service', 'microservice', 'auth', 'session', 'middleware'],
    filePatterns: ['*.go', '*.rs', '*.py', '*.ts', '*.js', '*.java', '*.rb'],
  },
  TestEngineer: {
    keywords: ['test', 'testing', 'tdd', 'unit test', 'integration test', 'e2e', 'coverage', 'vitest', 'jest', 'pytest', 'cypress', 'playwright', 'spec'],
    filePatterns: ['*.test.*', '*.spec.*', 'test/**', 'tests/**', '__tests__/**'],
  },
  CodeReviewer: {
    keywords: ['review', 'audit', 'quality', 'maintainability', 'clean code', 'code smell', 'refactor review', 'peer review'],
    filePatterns: [],
  },
  SecurityAgent: {
    keywords: ['security', 'auth', 'oauth', 'jwt', 'encrypt', 'vulnerability', 'pentest', 'injection', 'xss', 'csrf', 'secret', 'permission', 'rbac', 'compliance', 'iso 21434', 'un r155', 'ais-189'],
    filePatterns: ['*.key', '*.pem', '*auth*', '*security*'],
  },
  SystemArchitectAgent: {
    keywords: ['architecture', 'design', 'system', 'microservices', 'monolith', 'contract', 'schema', 'data model', 'api design', 'event-driven', 'bounded context', 'ddd'],
    filePatterns: ['*.proto', '*.graphql', 'openapi*', 'architecture*'],
  },
  TechLeadAgent: {
    keywords: ['tech lead', 'stack', 'decision', 'pattern', 'convention', 'standards', 'arbitrate', 'integration', 'orchestration', 'coordination'],
    filePatterns: [],
  },
  OpenDevopsSpecialist: {
    keywords: ['deploy', 'ci/cd', 'docker', 'kubernetes', 'k8s', 'terraform', 'infrastructure', 'pipeline', 'github actions', 'release', 'monitoring', 'logging'],
    filePatterns: ['Dockerfile', '*.yml', '*.yaml', '*.tf', '*.hcl', '.github/**'],
  },
  DocWriter: {
    keywords: ['document', 'readme', 'docs', 'guide', 'tutorial', 'specification', 'api doc', 'changelog', 'wiki'],
    filePatterns: ['*.md', 'docs/**', 'README*'],
  },
  DebugAgent: {
    keywords: ['debug', 'fix', 'error', 'crash', 'failure', 'broken', 'not working', 'issue', 'troubleshoot', 'investigate', 'root cause', 'incident'],
    filePatterns: [],
  },
  ProductManagerAgent: {
    keywords: ['product', 'requirement', 'user story', 'epic', 'roadmap', 'feature request', 'scope', 'acceptance criteria', 'persona', 'jtbd'],
    filePatterns: [],
  },
  HardwareArchitectAgent: {
    keywords: ['hardware', 'pcb', 'schematic', 'fpga', 'asic', 'embedded', 'firmware', 'mcu', 'soc', 'sensor', 'actuator', 'can', 'lin', 'ethernet', 'automotive'],
    filePatterns: ['*.sch', '*.brd', '*.v', '*.vhdl', '*.sv', '*.c', '*.cpp'],
  },
  EmbeddedCPPCodingAgent: {
    keywords: ['embedded c', 'embedded c++', 'firmware', 'driver', 'bare metal', 'rtos', 'mcu', 'autosar', 'misra'],
    filePatterns: ['*.c', '*.cpp', '*.h', '*.hpp'],
  },
  PenetrationTestAgent: {
    keywords: ['pentest', 'fuzzing', 'reverse engineering', 'side channel', 'fault injection', 'wireless', 'vapt', 'exploit', 'cve', 'threat'],
    filePatterns: [],
  },
  TechnicalComplianceVVAgent: {
    keywords: ['compliance', 'iso 21434', 'iso 24089', 'un r155', 'un r156', 'ais-189', 'ais-190', 'gb 44495', 'certification', 'homologation', 'csms', 'tara', 'audit'],
    filePatterns: [],
  },
  ContentSwarmAgent: {
    keywords: ['content', 'blog', 'article', 'copy', 'social media', 'linkedin', 'twitter', 'campaign', 'marketing copy', 'whitepaper', 'case study'],
    filePatterns: [],
  },
  InvestorNarrativeAgent: {
    keywords: ['investor', 'pitch', 'deck', 'funding', 'vc', 'series', 'valuation', 'term sheet', 'data room', 'demo day', 'narrative'],
    filePatterns: [],
  },
}

// Human-readable category labels for clarification generation.
const EXPERT_DOMAIN_LABELS: Record<string, string> = {
  CoderAgent: 'general coding/implementation',
  OpenFrontendSpecialist: 'frontend/UI development',
  BackendDeveloperAgent: 'backend/API development',
  TestEngineer: 'testing',
  CodeReviewer: 'code review/quality',
  SecurityAgent: 'security',
  SystemArchitectAgent: 'system architecture/design',
  TechLeadAgent: 'technical leadership/coordination',
  OpenDevopsSpecialist: 'DevOps/infrastructure',
  DocWriter: 'documentation',
  DebugAgent: 'debugging/troubleshooting',
  ProductManagerAgent: 'product management',
  HardwareArchitectAgent: 'hardware/embedded architecture',
  EmbeddedCPPCodingAgent: 'embedded C/C++ development',
  PenetrationTestAgent: 'penetration testing',
  TechnicalComplianceVVAgent: 'regulatory compliance',
  ContentSwarmAgent: 'content/marketing',
  InvestorNarrativeAgent: 'investor relations/fundraising',
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreObjective(objective: string): Map<string, number> {
  const lower = objective.toLowerCase()
  const scores = new Map<string, number>()

  for (const [expert, config] of Object.entries(EXPERT_KEYWORDS)) {
    let score = 0
    for (const kw of config.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(lower)) {
        score += 2
      } else if (lower.includes(kw.toLowerCase())) {
        score += 1
      }
    }
    if (score > 0) scores.set(expert, score)
  }

  return scores
}

function scoreFilePatterns(objective: string): Map<string, number> {
  const scores = new Map<string, number>()
  const lower = objective.toLowerCase()

  for (const [expert, config] of Object.entries(EXPERT_KEYWORDS)) {
    let score = 0
    for (const pattern of config.filePatterns) {
      if (objectiveMentionsPattern(lower, pattern)) {
        score += 1
      }
    }
    if (score > 0) scores.set(expert, (scores.get(expert) ?? 0) + score)
  }

  return scores
}

function objectiveMentionsPattern(lowerObjective: string, pattern: string): boolean {
  const lowerPattern = pattern.toLowerCase()

  if (lowerPattern.startsWith('*.')) {
    const ext = lowerPattern.slice(2)
    return lowerObjective.includes(`.${ext}`) || new RegExp(`\\b${escapeRegex(ext)}\\b`).test(lowerObjective)
  }

  if (lowerPattern.endsWith('/**')) {
    const dir = lowerPattern.slice(0, -3)
    return lowerObjective.includes(`${dir}/`) || new RegExp(`\\b${escapeRegex(dir)}\\b`).test(lowerObjective)
  }

  const token = lowerPattern.replace(/\*/g, '')
  return token.length > 0 && lowerObjective.includes(token)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Confidence & ambiguity ────────────────────────────────────────────────────

function computeConfidence(
  sortedProfiles: ExpertProfile[],
  config: RouterConfig,
): RoutingConfidence {
  const threshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const margin = config.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN

  if (sortedProfiles.length === 0) {
    return { score: 0, isLowConfidence: true, isAmbiguous: false, ambiguousExperts: [] }
  }

  const topScore = sortedProfiles[0].score
  const normalizedConfidence = Math.min(1, topScore / MAX_RAW_SCORE_FOR_FULL_CONFIDENCE)

  const isLowConfidence = normalizedConfidence < threshold

  // Ambiguity: collect all experts whose score is within the margin of the top
  const ambiguityThreshold = topScore * (1 - margin)
  const ambiguousExperts = sortedProfiles.filter(
    (p, i) => i > 0 && p.score >= ambiguityThreshold,
  )
  const isAmbiguous = ambiguousExperts.length > 0

  return {
    score: Math.round(normalizedConfidence * 1000) / 1000,
    isLowConfidence,
    isAmbiguous,
    ambiguousExperts,
  }
}

// ── Clarification generation ──────────────────────────────────────────────────

function generateClarification(
  confidence: RoutingConfidence,
  topExperts: ExpertProfile[],
): ClarificationInfo {
  if (!confidence.isLowConfidence && !confidence.isAmbiguous) {
    return { needed: false, questions: [] }
  }

  const questions: string[] = []

  if (confidence.isAmbiguous && topExperts.length > 0) {
    const contenders = [topExperts[0], ...confidence.ambiguousExperts]
    const domainLabels = contenders
      .map((e) => EXPERT_DOMAIN_LABELS[e.name])
      .filter(Boolean)

    if (domainLabels.length >= 2) {
      questions.push(
        `Is this primarily a ${domainLabels[0]} task or a ${domainLabels[1]} task?`,
      )
    }

    if (domainLabels.length > 2) {
      questions.push(
        `Which area best describes your goal: ${domainLabels.join(', ')}?`,
      )
    }
  }

  if (confidence.isLowConfidence) {
    questions.push('Could you provide more details about what you want to accomplish?')
    questions.push(
      'What kind of expert would be most helpful — coding, testing, security, architecture, or something else?',
    )
  }

  return { needed: true, questions }
}

function scoreScenario(objective: string, scenario: QuestScenario): number {
  const text = objective.toLowerCase()
  return SCENARIO_KEYWORDS[scenario].reduce(
    (score, keyword) => score + (text.includes(keyword) ? 1 : 0),
    0,
  )
}

function selectQuestScenario(objective: string, estimatedChunks: number): QuestScenario {
  const scenarioScores = (Object.keys(SCENARIO_KEYWORDS) as QuestScenario[])
    .map((scenario) => ({ scenario, score: scoreScenario(objective, scenario) }))
    .sort((a, b) => b.score - a.score)

  const top = scenarioScores[0]
  if (top && top.score > 0) return top.scenario

  if (estimatedChunks <= 2) return 'direct'
  return 'code_with_spec'
}

// ── Agent discovery ───────────────────────────────────────────────────────────

export interface DiscoveredAgent {
  id: string
  name: string
  description: string
  category: string
  path: string
}

export function discoverAgents(projectRoot: string): DiscoveredAgent[] {
  const agentDir = join(projectRoot, '.opencode', 'agent')
  if (!existsSync(agentDir)) return []

  const agents: DiscoveredAgent[] = []

  function scanDir(dir: string, category: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath, entry.name)
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        const content = readFileSync(fullPath, 'utf-8')
        const nameMatch = content.match(/^name:\s*(.+)$/m)
        const descMatch = content.match(/^description:\s*(.+)$/m)
        const id = entry.name.replace(/\.md$/, '')
        agents.push({
          id,
          name: nameMatch?.[1]?.trim() ?? id,
          description: descMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '',
          category,
          path: fullPath,
        })
      }
    }
  }

  scanDir(agentDir, 'core')
  return agents
}

// ── Core routing logic (shared by sync & async paths) ─────────────────────────

function buildRouterResult(
  objective: string,
  projectRoot: string,
  config: RouterConfig,
): RouterResult {
  log.debug('Routing objective', { objective: objective.slice(0, 120) })

  const keywordScores = scoreObjective(objective)
  const patternScores = scoreFilePatterns(objective)

  const merged = new Map<string, number>()
  for (const [k, v] of keywordScores) merged.set(k, (merged.get(k) ?? 0) + v)
  for (const [k, v] of patternScores) merged.set(k, (merged.get(k) ?? 0) + v)

  merged.set('TechLeadAgent', (merged.get('TechLeadAgent') ?? 0) + 1)

  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1])

  log.trace('Expert scores', {
    scores: Object.fromEntries(sorted.slice(0, 8)),
    keywordMatches: keywordScores.size,
    patternMatches: patternScores.size,
  })

  const discovered = discoverAgents(projectRoot)
  const byName = new Map(discovered.map((a) => [a.name, a]))
  log.trace('Discovered agents', { count: discovered.length })

  const profiles: ExpertProfile[] = sorted.map(([name, score]) => {
    const disc = byName.get(name)
    const kwConfig = EXPERT_KEYWORDS[name]
    return {
      id: disc?.id ?? name.toLowerCase().replace(/agent$/, ''),
      name,
      description: disc?.description ?? kwConfig?.keywords.slice(0, 3).join(', ') ?? '',
      category: disc?.category ?? 'general',
      keywords: kwConfig?.keywords ?? [],
      filePatterns: kwConfig?.filePatterns ?? [],
      score,
    }
  })

  const primary = profiles.filter((p) => p.score >= 3)
  const secondary = profiles.filter((p) => p.score >= 1 && p.score < 3)

  const confidence = computeConfidence(profiles, config)
  const clarification = generateClarification(confidence, profiles)

  const reasoning: string[] = []
  if (primary.length > 0) {
    reasoning.push(`Primary experts (${primary.length}): ${primary.map((p) => p.name).join(', ')}`)
  }
  if (secondary.length > 0) {
    reasoning.push(`Secondary experts (${secondary.length}): ${secondary.map((p) => p.name).join(', ')}`)
  }
  reasoning.push(`Confidence: ${confidence.score} (threshold: ${config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD})`)
  if (confidence.isAmbiguous) {
    reasoning.push(`Ambiguous — close matches: ${confidence.ambiguousExperts.map((e) => e.name).join(', ')}`)
  }
  if (confidence.isLowConfidence) {
    reasoning.push('Low confidence — consider providing more context')
  }

  const complexity =
    (objective.match(/and|plus|also|additionally/gi)?.length ?? 0) +
    (objective.match(/implement|build|create|write/gi)?.length ?? 0)
  const estimatedChunks = Math.max(2, Math.min(12, 2 + complexity))
  const scenario = selectQuestScenario(objective, estimatedChunks)
  reasoning.unshift(`Quest scenario: ${scenario}`)

  log.debug('Routing complete', {
    scenario,
    primary: primary.map((p) => p.name),
    secondary: secondary.map((p) => p.name),
    confidence: confidence.score,
    isAmbiguous: confidence.isAmbiguous,
    estimatedChunks,
  })

  return {
    objective,
    scenario,
    primaryExperts: primary,
    secondaryExperts: secondary,
    reasoning,
    estimatedChunks,
    confidence,
    clarification,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Routes a task objective to the best expert swarm using deterministic keyword rules.
 *
 * Backward-compatible: the third `config` parameter is optional.
 */
export function routeTask(
  objective: string,
  projectRoot: string,
  config: RouterConfig = {},
): RouterResult {
  return buildRouterResult(objective, projectRoot, config)
}

export async function routeTaskAsync(
  objective: string,
  projectRoot: string,
  config: RouterConfig = {},
): Promise<RouterResult> {
  // v8: attempt to load feedback corpus and boost expert scores
  let boostedResult = buildRouterResult(objective, projectRoot, config)
  try {
    const { findSimilarPatterns, boostExpertsFromPatterns } = await import('./quest-feedback.js')
    const patterns = await findSimilarPatterns(projectRoot, objective, { maxResults: 5 })
    if (patterns.length > 0) {
      const scoreMap = new Map<string, number>()
      for (const expert of [...boostedResult.primaryExperts, ...boostedResult.secondaryExperts]) {
        scoreMap.set(expert.name, expert.score)
      }
      const boostedScores = boostExpertsFromPatterns(scoreMap, patterns)
      // Rebuild result with boosted scores
      boostedResult = buildRouterResult(objective, projectRoot, config)
      // Apply boosts to profiles
      const allExperts = [...boostedResult.primaryExperts, ...boostedResult.secondaryExperts]
      for (const expert of allExperts) {
        const boosted = boostedScores.get(expert.name)
        if (boosted !== undefined) {
          expert.score = boosted
        }
      }
      // Re-sort and re-filter
      const allProfiles = allExperts.sort((a, b) => b.score - a.score)
      const primary = allProfiles.filter((p) => p.score >= 3)
      const secondary = allProfiles.filter((p) => p.score >= 1 && p.score < 3)
      boostedResult.primaryExperts = primary
      boostedResult.secondaryExperts = secondary
      boostedResult.reasoning.push(`Feedback corpus: ${patterns.length} similar pattern(s) applied`)
    }
  } catch {
    // Corpus not available or quest-feedback not loadable — fall back to base routing
  }
  return boostedResult
}

/**
 * Quick check: returns just the expert names for a given objective.
 */
export function suggestExperts(objective: string, projectRoot: string): string[] {
  const result = routeTask(objective, projectRoot)
  return [...result.primaryExperts, ...result.secondaryExperts].map((e) => e.name)
}

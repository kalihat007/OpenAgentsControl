/**
 * Multi-Intent Task Decomposition Engine
 *
 * Breaks complex user objectives into expert-specific sub-tasks.
 * When a user says "Build a login page with OAuth and rate limiting,"
 * that's actually 3+ sub-tasks for different experts. This engine
 * detects those intents, assigns sub-tasks to the right experts,
 * infers dependencies between them, and produces a parallelizable
 * execution plan.
 *
 * Features:
 * - Intent extraction with domain/action/scope signal detection
 * - Four decomposition strategies: by_domain, by_layer, by_feature, by_phase
 * - Automatic strategy selection based on detected intents
 * - Dependency inference with cycle detection and validation
 * - Parallel execution ordering (topological sort into batches)
 * - Complexity & effort estimation
 * - Codebase-aware file scoping
 * - Artifact identification across sub-tasks
 */

import type { ExpertDefinition } from './expert-definitions.js'
import type { CodebaseIndex } from './codebase-indexer.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubTask {
  id: string
  objective: string
  parentId: string
  expertId: string
  priority: number
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large'
  requiredContext: string[]
  producesArtifacts: string[]
  fileScope: string[]
}

export interface TaskDependency {
  from: string
  to: string
  type: 'blocks' | 'informs' | 'requires_artifact'
}

export interface DecomposedTask {
  id: string
  originalObjective: string
  subTasks: SubTask[]
  dependencies: TaskDependency[]
  estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'epic'
  decompositionConfidence: number
}

export interface IntentSignal {
  keyword: string
  category: string
  confidence: number
}

export type DecompositionStrategy = 'by_domain' | 'by_layer' | 'by_feature' | 'by_phase'

export interface DecomposerConfig {
  maxSubTasks: number
  minConfidence: number
  strategy: DecompositionStrategy
  useCodebaseContext: boolean
}

// ── Signal dictionaries ───────────────────────────────────────────────────────

const DOMAIN_SIGNALS: Record<string, string[]> = {
  frontend: ['ui', 'ux', 'frontend', 'react', 'vue', 'angular', 'component', 'page', 'screen', 'layout', 'css', 'html', 'styling', 'dom', 'browser', 'responsive', 'form', 'modal', 'sidebar', 'navbar', 'header', 'footer'],
  backend: ['api', 'backend', 'server', 'endpoint', 'rest', 'graphql', 'service', 'microservice', 'middleware', 'controller', 'route', 'handler'],
  database: ['database', 'sql', 'nosql', 'migration', 'schema', 'model', 'query', 'orm', 'prisma', 'sequelize', 'mongoose', 'postgres', 'mysql', 'mongo', 'redis', 'table', 'index'],
  auth: ['auth', 'authentication', 'authorization', 'oauth', 'jwt', 'login', 'signup', 'register', 'password', 'session', 'token', 'sso', 'rbac', 'permission', 'role'],
  api: ['api', 'endpoint', 'rest', 'graphql', 'websocket', 'grpc', 'openapi', 'swagger', 'request', 'response'],
  testing: ['test', 'testing', 'spec', 'tdd', 'unit test', 'integration test', 'e2e', 'coverage', 'mock', 'stub', 'fixture'],
  styling: ['css', 'scss', 'sass', 'tailwind', 'styled-components', 'theme', 'dark mode', 'responsive', 'animation', 'transition'],
  deployment: ['deploy', 'ci/cd', 'docker', 'kubernetes', 'terraform', 'pipeline', 'release', 'staging', 'production', 'infrastructure'],
  security: ['security', 'vulnerability', 'xss', 'csrf', 'injection', 'encrypt', 'sanitize', 'rate limit', 'firewall', 'cors', 'helmet', 'pentest'],
  performance: ['performance', 'optimize', 'cache', 'lazy load', 'bundle size', 'lighthouse', 'profiling', 'memory leak', 'latency', 'throughput'],
}

const ACTION_SIGNALS: Record<string, string[]> = {
  build: ['build', 'create', 'implement', 'develop', 'make', 'add', 'setup', 'scaffold', 'generate', 'construct'],
  fix: ['fix', 'debug', 'repair', 'resolve', 'patch', 'hotfix', 'correct', 'troubleshoot'],
  refactor: ['refactor', 'restructure', 'reorganize', 'clean up', 'simplify', 'modernize', 'decouple', 'extract'],
  add: ['add', 'include', 'integrate', 'incorporate', 'attach', 'embed', 'inject'],
  remove: ['remove', 'delete', 'strip', 'eliminate', 'drop', 'deprecate', 'disable'],
  update: ['update', 'upgrade', 'modify', 'change', 'alter', 'adjust', 'revise', 'enhance'],
  optimize: ['optimize', 'improve', 'speed up', 'reduce', 'minimize', 'compress', 'streamline'],
  test: ['test', 'verify', 'validate', 'assert', 'check', 'audit', 'review'],
  deploy: ['deploy', 'release', 'ship', 'publish', 'launch', 'push', 'roll out'],
}

const SCOPE_SIGNALS: Record<string, string[]> = {
  page: ['page', 'screen', 'view', 'route', 'landing page', 'dashboard'],
  component: ['component', 'widget', 'element', 'button', 'form', 'modal', 'card', 'table', 'list', 'dropdown', 'input', 'navbar', 'sidebar'],
  endpoint: ['endpoint', 'api route', 'handler', 'controller', 'resolver'],
  model: ['model', 'schema', 'entity', 'table', 'collection', 'type', 'interface'],
  migration: ['migration', 'seed', 'alter table', 'create table'],
  config: ['config', 'configuration', 'environment', 'env', 'settings', 'dotenv'],
}

// Maps domain signals to expert roles for matching
const DOMAIN_TO_EXPERT_ROLE: Record<string, string[]> = {
  frontend: ['frontend-developer', 'developer'],
  backend: ['backend-developer', 'developer'],
  database: ['backend-developer', 'developer'],
  auth: ['security-engineer', 'backend-developer'],
  api: ['backend-developer', 'architect'],
  testing: ['test-engineer'],
  styling: ['frontend-developer'],
  deployment: ['devops-engineer'],
  security: ['security-engineer', 'pentester'],
  performance: ['developer', 'architect'],
}

// Architectural layers for by_layer strategy (order matters: top → bottom)
const ARCHITECTURAL_LAYERS = [
  { name: 'ui', label: 'UI Layer', roles: ['frontend-developer'], domains: ['frontend', 'styling'] },
  { name: 'api', label: 'API Layer', roles: ['backend-developer', 'architect'], domains: ['api', 'backend'] },
  { name: 'business', label: 'Business Logic', roles: ['developer', 'backend-developer'], domains: ['auth', 'security'] },
  { name: 'data', label: 'Data Layer', roles: ['backend-developer', 'developer'], domains: ['database'] },
  { name: 'infra', label: 'Infrastructure', roles: ['devops-engineer'], domains: ['deployment'] },
  { name: 'quality', label: 'Quality Assurance', roles: ['test-engineer'], domains: ['testing'] },
] as const

// Development phases for by_phase strategy
const DEVELOPMENT_PHASES = [
  { name: 'design', label: 'Design & Architecture', roles: ['architect', 'tech-lead'] },
  { name: 'implement', label: 'Implementation', roles: ['developer', 'frontend-developer', 'backend-developer'] },
  { name: 'test', label: 'Testing', roles: ['test-engineer'] },
  { name: 'deploy', label: 'Deployment', roles: ['devops-engineer'] },
] as const

// Dependency ordering rules: domains in `dependsOn` should be completed first
const DOMAIN_DEPENDENCY_ORDER: Record<string, string[]> = {
  frontend: ['backend', 'api', 'auth'],
  backend: ['database'],
  api: ['database', 'auth'],
  testing: ['frontend', 'backend', 'api', 'auth', 'database'],
  deployment: ['frontend', 'backend', 'testing'],
  styling: ['frontend'],
  security: ['auth', 'backend'],
  performance: ['frontend', 'backend'],
}

// ── ID generation ─────────────────────────────────────────────────────────────

let idCounter = 0

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`
}

export function resetIdCounter(): void {
  idCounter = 0
}

// ── Intent extraction ─────────────────────────────────────────────────────────

export function extractIntents(objective: string): IntentSignal[] {
  const lower = objective.toLowerCase()
  const signals: IntentSignal[] = []

  const matchSignals = (dictionary: Record<string, string[]>, categoryPrefix: string) => {
    for (const [category, keywords] of Object.entries(dictionary)) {
      for (const kw of keywords) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escaped}\\b`, 'i')
        if (regex.test(lower)) {
          const existing = signals.find(s => s.keyword === kw && s.category === `${categoryPrefix}:${category}`)
          if (!existing) {
            signals.push({
              keyword: kw,
              category: `${categoryPrefix}:${category}`,
              confidence: computeKeywordConfidence(kw, lower),
            })
          }
        }
      }
    }
  }

  matchSignals(DOMAIN_SIGNALS, 'domain')
  matchSignals(ACTION_SIGNALS, 'action')
  matchSignals(SCOPE_SIGNALS, 'scope')

  return signals.sort((a, b) => b.confidence - a.confidence)
}

function computeKeywordConfidence(keyword: string, text: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const wordBoundary = new RegExp(`\\b${escaped}\\b`, 'gi')
  const matches = text.match(wordBoundary)
  const count = matches?.length ?? 0

  let base = 0.6
  if (keyword.length > 6) base = 0.7
  if (keyword.includes(' ')) base = 0.8

  return Math.min(1.0, base + count * 0.1)
}

// ── Strategy selection ────────────────────────────────────────────────────────

export function autoSelectStrategy(intents: IntentSignal[]): DecompositionStrategy {
  const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
  const actionIntents = intents.filter(i => i.category.startsWith('action:'))
  const scopeIntents = intents.filter(i => i.category.startsWith('scope:'))

  const uniqueDomains = new Set(domainIntents.map(i => i.category.split(':')[1]))
  const uniqueScopes = new Set(scopeIntents.map(i => i.category.split(':')[1]))

  // If many distinct features/scopes are mentioned, split by feature
  if (uniqueScopes.size >= 3) return 'by_feature'

  // If domains span multiple architectural layers, split by layer
  const hasUI = uniqueDomains.has('frontend') || uniqueDomains.has('styling')
  const hasBackend = uniqueDomains.has('backend') || uniqueDomains.has('api') || uniqueDomains.has('database')
  const hasInfra = uniqueDomains.has('deployment')
  const layerCount = [hasUI, hasBackend, hasInfra].filter(Boolean).length
  if (layerCount >= 2) return 'by_layer'

  // If deploy/test actions are present alongside build, use phased approach
  const actionCategories = new Set(actionIntents.map(i => i.category.split(':')[1]))
  const hasLifecycleActions = actionCategories.has('deploy') || actionCategories.has('test')
  const hasBuildActions = actionCategories.has('build') || actionCategories.has('add')
  if (hasLifecycleActions && hasBuildActions) return 'by_phase'

  // Default: split by domain
  return 'by_domain'
}

// ── Complexity estimation ─────────────────────────────────────────────────────

export function estimateComplexity(
  objective: string,
  intents: IntentSignal[],
): 'simple' | 'moderate' | 'complex' | 'epic' {
  const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
  const uniqueDomains = new Set(domainIntents.map(i => i.category.split(':')[1]))

  const conjunctions = (objective.match(/\band\b|\bplus\b|\balso\b|\bwith\b|\bthen\b/gi) ?? []).length
  const wordCount = objective.split(/\s+/).length

  const score = uniqueDomains.size * 2 + conjunctions + wordCount / 15

  if (score <= 2) return 'simple'
  if (score <= 5) return 'moderate'
  if (score <= 10) return 'complex'
  return 'epic'
}

export function shouldDecompose(objective: string): boolean {
  const intents = extractIntents(objective)
  const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
  const uniqueDomains = new Set(domainIntents.map(i => i.category.split(':')[1]))

  if (uniqueDomains.size <= 1 && objective.split(/\s+/).length <= 8) return false

  const conjunctions = (objective.match(/\band\b|\bplus\b|\balso\b|\bwith\b|\bthen\b/gi) ?? []).length
  return uniqueDomains.size >= 2 || conjunctions >= 1
}

export function estimateSubTaskEffort(subTask: SubTask): 'trivial' | 'small' | 'medium' | 'large' {
  const words = subTask.objective.split(/\s+/).length
  const artifactCount = subTask.producesArtifacts.length
  const contextCount = subTask.requiredContext.length

  const score = words / 8 + artifactCount + contextCount * 0.5

  if (score <= 1) return 'trivial'
  if (score <= 2.5) return 'small'
  if (score <= 5) return 'medium'
  return 'large'
}

// ── Expert matching ───────────────────────────────────────────────────────────

function findBestExpert(
  domain: string,
  experts: ExpertDefinition[],
): ExpertDefinition | undefined {
  const targetRoles = DOMAIN_TO_EXPERT_ROLE[domain] ?? []
  const enabledExperts = experts.filter(e => e.enabled)

  // First try matching by role
  for (const role of targetRoles) {
    const match = enabledExperts.find(e => e.role === role)
    if (match) return match
  }

  // Fallback: match by keyword overlap
  const domainKeywords = DOMAIN_SIGNALS[domain] ?? []
  let bestMatch: ExpertDefinition | undefined
  let bestScore = 0

  for (const expert of enabledExperts) {
    let score = 0
    for (const kw of expert.keywords) {
      if (domainKeywords.includes(kw.toLowerCase())) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = expert
    }
  }

  return bestMatch
}

// ── Decomposition strategies ──────────────────────────────────────────────────

function decomposeByDomain(
  objective: string,
  parentId: string,
  intents: IntentSignal[],
  experts: ExpertDefinition[],
  config: DecomposerConfig,
): SubTask[] {
  const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
  const domainGroups = new Map<string, IntentSignal[]>()

  for (const intent of domainIntents) {
    const domain = intent.category.split(':')[1]!
    const group = domainGroups.get(domain) ?? []
    group.push(intent)
    domainGroups.set(domain, group)
  }

  if (domainGroups.size === 0) {
    domainGroups.set('backend', [{ keyword: 'general', category: 'domain:backend', confidence: 0.3 }])
  }

  const subTasks: SubTask[] = []
  let priority = 1

  for (const [domain, signals] of domainGroups) {
    if (subTasks.length >= config.maxSubTasks) break

    const expert = findBestExpert(domain, experts)
    if (!expert) continue

    const keywords = signals.map(s => s.keyword).join(', ')
    const subTask: SubTask = {
      id: nextId('st'),
      objective: `Handle ${domain} aspects: ${keywords} — from "${objective}"`,
      parentId,
      expertId: expert.id,
      priority: priority++,
      estimatedEffort: 'medium',
      requiredContext: buildRequiredContext(domain),
      producesArtifacts: buildProducedArtifacts(domain),
      fileScope: [],
    }
    subTask.estimatedEffort = estimateSubTaskEffort(subTask)
    subTasks.push(subTask)
  }

  return subTasks
}

function decomposeByLayer(
  objective: string,
  parentId: string,
  intents: IntentSignal[],
  experts: ExpertDefinition[],
  config: DecomposerConfig,
): SubTask[] {
  const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
  const activeDomains = new Set(domainIntents.map(i => i.category.split(':')[1]))

  const subTasks: SubTask[] = []
  let priority = 1

  for (const layer of ARCHITECTURAL_LAYERS) {
    if (subTasks.length >= config.maxSubTasks) break

    const relevantDomains = layer.domains.filter(d => activeDomains.has(d))
    if (relevantDomains.length === 0) continue

    const layerRoles: readonly string[] = layer.roles
    const expert = experts.filter(e => e.enabled).find(e => layerRoles.includes(e.role))
    if (!expert) continue

    const subTask: SubTask = {
      id: nextId('st'),
      objective: `${layer.label}: implement ${relevantDomains.join(', ')} concerns — from "${objective}"`,
      parentId,
      expertId: expert.id,
      priority: priority++,
      estimatedEffort: 'medium',
      requiredContext: relevantDomains.flatMap(d => buildRequiredContext(d)),
      producesArtifacts: relevantDomains.flatMap(d => buildProducedArtifacts(d)),
      fileScope: [],
    }
    subTask.estimatedEffort = estimateSubTaskEffort(subTask)
    subTasks.push(subTask)
  }

  return subTasks
}

function decomposeByFeature(
  objective: string,
  parentId: string,
  intents: IntentSignal[],
  experts: ExpertDefinition[],
  config: DecomposerConfig,
): SubTask[] {
  const scopeIntents = intents.filter(i => i.category.startsWith('scope:'))
  const features = new Map<string, IntentSignal[]>()

  for (const intent of scopeIntents) {
    const scope = intent.category.split(':')[1]!
    const group = features.get(scope) ?? []
    group.push(intent)
    features.set(scope, group)
  }

  // If no scope signals, fall back to domain-based features
  if (features.size === 0) {
    return decomposeByDomain(objective, parentId, intents, experts, config)
  }

  const subTasks: SubTask[] = []
  let priority = 1

  for (const [feature, signals] of features) {
    if (subTasks.length >= config.maxSubTasks) break

    const keywords = signals.map(s => s.keyword)
    const domainIntents = intents.filter(i => i.category.startsWith('domain:'))
    const primaryDomain = domainIntents[0]?.category.split(':')[1] ?? 'backend'
    const expert = findBestExpert(primaryDomain, experts)
    if (!expert) continue

    const subTask: SubTask = {
      id: nextId('st'),
      objective: `Implement ${feature} feature (${keywords.join(', ')}) — from "${objective}"`,
      parentId,
      expertId: expert.id,
      priority: priority++,
      estimatedEffort: 'medium',
      requiredContext: buildRequiredContext(primaryDomain),
      producesArtifacts: [`${feature}-implementation`],
      fileScope: [],
    }
    subTask.estimatedEffort = estimateSubTaskEffort(subTask)
    subTasks.push(subTask)
  }

  return subTasks
}

function decomposeByPhase(
  objective: string,
  parentId: string,
  intents: IntentSignal[],
  experts: ExpertDefinition[],
  config: DecomposerConfig,
): SubTask[] {
  const actionIntents = intents.filter(i => i.category.startsWith('action:'))
  const activeActions = new Set(actionIntents.map(i => i.category.split(':')[1]))

  const subTasks: SubTask[] = []
  let priority = 1

  for (const phase of DEVELOPMENT_PHASES) {
    if (subTasks.length >= config.maxSubTasks) break

    // Include phase if relevant actions are detected or if it's an implementation-heavy request
    const phaseRelevant =
      (phase.name === 'implement' && (activeActions.has('build') || activeActions.has('add') || activeActions.has('fix') || activeActions.has('refactor'))) ||
      (phase.name === 'test' && activeActions.has('test')) ||
      (phase.name === 'deploy' && activeActions.has('deploy')) ||
      (phase.name === 'design' && intents.length > 4)

    if (!phaseRelevant) continue

    const phaseRoles: readonly string[] = phase.roles
    const expert = experts.filter(e => e.enabled).find(e => phaseRoles.includes(e.role))
    if (!expert) continue

    const subTask: SubTask = {
      id: nextId('st'),
      objective: `${phase.label} phase — from "${objective}"`,
      parentId,
      expertId: expert.id,
      priority: priority++,
      estimatedEffort: 'medium',
      requiredContext: phase.name === 'implement' ? ['codebase-structure', 'tech-stack'] : [`${phase.name}-requirements`],
      producesArtifacts: [`${phase.name}-output`],
      fileScope: [],
    }
    subTask.estimatedEffort = estimateSubTaskEffort(subTask)
    subTasks.push(subTask)
  }

  if (subTasks.length === 0) {
    return decomposeByDomain(objective, parentId, intents, experts, config)
  }

  return subTasks
}

// ── Context & artifact helpers ────────────────────────────────────────────────

function buildRequiredContext(domain: string): string[] {
  const contextMap: Record<string, string[]> = {
    frontend: ['component-structure', 'design-system', 'routing'],
    backend: ['api-schema', 'service-layer', 'middleware-chain'],
    database: ['data-model', 'migration-history', 'indexes'],
    auth: ['auth-flow', 'token-strategy', 'permission-model'],
    api: ['api-schema', 'endpoint-registry', 'validation-rules'],
    testing: ['test-infrastructure', 'coverage-report', 'fixture-data'],
    styling: ['design-tokens', 'theme-config', 'responsive-breakpoints'],
    deployment: ['infra-config', 'env-variables', 'ci-pipeline'],
    security: ['threat-model', 'auth-flow', 'input-validation'],
    performance: ['performance-baseline', 'bundle-analysis', 'profiling-data'],
  }
  return contextMap[domain] ?? ['codebase-structure']
}

function buildProducedArtifacts(domain: string): string[] {
  const artifactMap: Record<string, string[]> = {
    frontend: ['ui-components', 'page-layouts'],
    backend: ['api-endpoints', 'service-implementations'],
    database: ['db-schema', 'migrations'],
    auth: ['auth-middleware', 'token-handlers'],
    api: ['api-routes', 'api-schema'],
    testing: ['test-suites', 'coverage-report'],
    styling: ['stylesheets', 'theme-config'],
    deployment: ['deploy-config', 'ci-pipeline'],
    security: ['security-middleware', 'validation-rules'],
    performance: ['optimized-bundles', 'caching-layer'],
  }
  return artifactMap[domain] ?? ['implementation']
}

// ── Dependency analysis ───────────────────────────────────────────────────────

export function inferDependencies(subTasks: SubTask[]): TaskDependency[] {
  const deps: TaskDependency[] = []

  for (const task of subTasks) {
    for (const other of subTasks) {
      if (task.id === other.id) continue

      // Check if `task` produces artifacts that `other` requires
      const artifactOverlap = task.producesArtifacts.some(a =>
        other.requiredContext.some(c => a.includes(c) || c.includes(a)),
      )
      if (artifactOverlap) {
        deps.push({ from: task.id, to: other.id, type: 'requires_artifact' })
        continue
      }

      // Check domain dependency ordering
      const taskDomain = extractDomainFromExpertId(task.expertId)
      const otherDomain = extractDomainFromExpertId(other.expertId)

      if (taskDomain && otherDomain) {
        const otherDependsOn = DOMAIN_DEPENDENCY_ORDER[otherDomain] ?? []
        if (otherDependsOn.includes(taskDomain)) {
          const exists = deps.some(d => d.from === task.id && d.to === other.id)
          if (!exists) {
            deps.push({ from: task.id, to: other.id, type: 'blocks' })
          }
        }

        // Informational dependency: same-layer tasks inform each other
        if (taskDomain !== otherDomain && task.priority < other.priority) {
          const existsAlready = deps.some(d =>
            (d.from === task.id && d.to === other.id) ||
            (d.from === other.id && d.to === task.id),
          )
          if (!existsAlready) {
            deps.push({ from: task.id, to: other.id, type: 'informs' })
          }
        }
      }
    }
  }

  return deps
}

function extractDomainFromExpertId(expertId: string): string | undefined {
  const mapping: Record<string, string> = {
    'open-frontend-specialist': 'frontend',
    'backend-developer': 'backend',
    'security': 'security',
    'test-engineer': 'testing',
    'open-devops-specialist': 'deployment',
    'system-architect': 'api',
    'coder': 'backend',
    'doc-writer': 'frontend',
    'debug': 'backend',
  }

  for (const [idFragment, domain] of Object.entries(mapping)) {
    if (expertId.includes(idFragment)) return domain
  }
  return undefined
}

export function validateDependencies(
  deps: TaskDependency[],
  subTasks: SubTask[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = []
  const taskIds = new Set(subTasks.map(t => t.id))

  // Check for references to non-existent tasks
  for (const dep of deps) {
    if (!taskIds.has(dep.from)) {
      issues.push(`Dependency references unknown task: ${dep.from}`)
    }
    if (!taskIds.has(dep.to)) {
      issues.push(`Dependency references unknown task: ${dep.to}`)
    }
  }

  // Check for self-references
  for (const dep of deps) {
    if (dep.from === dep.to) {
      issues.push(`Self-dependency detected: ${dep.from}`)
    }
  }

  // Check for cycles (only among blocking/requires_artifact deps)
  const blockingDeps = deps.filter(d => d.type === 'blocks' || d.type === 'requires_artifact')
  const cycleResult = detectCycles(blockingDeps, taskIds)
  if (cycleResult) {
    issues.push(cycleResult)
  }

  return { valid: issues.length === 0, issues }
}

function detectCycles(deps: TaskDependency[], taskIds: Set<string>): string | null {
  const adjacency = new Map<string, string[]>()
  for (const id of taskIds) {
    adjacency.set(id, [])
  }
  for (const dep of deps) {
    if (adjacency.has(dep.from)) {
      adjacency.get(dep.from)!.push(dep.to)
    }
  }

  const WHITE = 0
  const color = new Map<string, number>()
  for (const id of taskIds) color.set(id, WHITE)

  for (const id of taskIds) {
    if (color.get(id) === WHITE) {
      if (dfsHasCycle(id, adjacency, color)) {
        return `Circular dependency detected involving task: ${id}`
      }
    }
  }

  return null
}

function dfsHasCycle(
  node: string,
  adjacency: Map<string, string[]>,
  color: Map<string, number>,
): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2
  color.set(node, GRAY)

  for (const neighbor of adjacency.get(node) ?? []) {
    if (color.get(neighbor) === GRAY) return true
    if (color.get(neighbor) === WHITE && dfsHasCycle(neighbor, adjacency, color)) return true
  }

  color.set(node, BLACK)
  return false
}

// ── Execution ordering ────────────────────────────────────────────────────────

export function getExecutionOrder(
  subTasks: SubTask[],
  deps: TaskDependency[],
): SubTask[][] {
  const blockingDeps = deps.filter(d => d.type === 'blocks' || d.type === 'requires_artifact')

  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  const taskMap = new Map<string, SubTask>()

  for (const task of subTasks) {
    inDegree.set(task.id, 0)
    adjacency.set(task.id, [])
    taskMap.set(task.id, task)
  }

  for (const dep of blockingDeps) {
    if (!adjacency.has(dep.from) || !inDegree.has(dep.to)) continue
    adjacency.get(dep.from)!.push(dep.to)
    inDegree.set(dep.to, (inDegree.get(dep.to) ?? 0) + 1)
  }

  const batches: SubTask[][] = []
  const remaining = new Set(subTasks.map(t => t.id))

  while (remaining.size > 0) {
    const batch: SubTask[] = []
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        const task = taskMap.get(id)
        if (task) batch.push(task)
      }
    }

    if (batch.length === 0) {
      // Remaining tasks form a cycle; add them all as a final batch
      const fallback: SubTask[] = []
      for (const id of remaining) {
        const task = taskMap.get(id)
        if (task) fallback.push(task)
      }
      batches.push(fallback)
      break
    }

    batch.sort((a, b) => a.priority - b.priority)
    batches.push(batch)

    for (const task of batch) {
      remaining.delete(task.id)
      for (const neighbor of adjacency.get(task.id) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1)
      }
    }
  }

  return batches
}

// ── File scoping ──────────────────────────────────────────────────────────────

export function scopeFilesForSubTask(
  subTask: SubTask,
  codebaseIndex?: CodebaseIndex,
): string[] {
  if (!codebaseIndex) return subTask.fileScope

  const allFiles = flattenTree(codebaseIndex.fileTree)

  const domainPatterns = getDomainFilePatterns(subTask.expertId)
  const matched = allFiles.filter(file =>
    domainPatterns.some(pattern => pattern.test(file)),
  )

  return matched.slice(0, 50)
}

function flattenTree(nodes: CodebaseIndex['fileTree']): string[] {
  const files: string[] = []
  for (const node of nodes) {
    if (node.type === 'file') files.push(node.path)
    if (node.children) files.push(...flattenTree(node.children))
  }
  return files
}

function getDomainFilePatterns(expertId: string): RegExp[] {
  if (expertId.includes('frontend')) {
    return [/\.(tsx|jsx|css|scss|html|vue|svelte)$/i, /components?\//i, /pages?\//i]
  }
  if (expertId.includes('backend') || expertId.includes('coder')) {
    return [/\.(ts|js|go|rs|py|java)$/i, /(api|server|routes|controllers|services)\//i]
  }
  if (expertId.includes('test')) {
    return [/\.(test|spec)\./i, /(__tests__|test|tests)\//i]
  }
  if (expertId.includes('security')) {
    return [/auth/i, /security/i, /middleware/i, /permission/i]
  }
  if (expertId.includes('devops')) {
    return [/Dockerfile/i, /docker-compose/i, /\.ya?ml$/i, /\.tf$/i, /\.github\//i]
  }
  return [/\.(ts|js|py|go|rs)$/i]
}

// ── Artifact identification ───────────────────────────────────────────────────

export function identifyArtifacts(subTasks: SubTask[]): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  for (const task of subTasks) {
    if (task.producesArtifacts.length > 0) {
      result[task.id] = [...task.producesArtifacts]
    }
  }

  return result
}

// ── Main decomposition ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: DecomposerConfig = {
  maxSubTasks: 10,
  minConfidence: 0.3,
  strategy: 'by_domain',
  useCodebaseContext: false,
}

export function decomposeTask(
  objective: string,
  experts: ExpertDefinition[],
  config?: Partial<DecomposerConfig>,
): DecomposedTask {
  const mergedConfig: DecomposerConfig = { ...DEFAULT_CONFIG, ...config }

  const taskId = nextId('task')
  const intents = extractIntents(objective)
  const complexity = estimateComplexity(objective, intents)
  const strategy = mergedConfig.strategy === DEFAULT_CONFIG.strategy && !config?.strategy
    ? autoSelectStrategy(intents)
    : mergedConfig.strategy

  let subTasks: SubTask[]

  switch (strategy) {
    case 'by_domain':
      subTasks = decomposeByDomain(objective, taskId, intents, experts, mergedConfig)
      break
    case 'by_layer':
      subTasks = decomposeByLayer(objective, taskId, intents, experts, mergedConfig)
      break
    case 'by_feature':
      subTasks = decomposeByFeature(objective, taskId, intents, experts, mergedConfig)
      break
    case 'by_phase':
      subTasks = decomposeByPhase(objective, taskId, intents, experts, mergedConfig)
      break
  }

  // Filter by confidence
  const confidentIntents = intents.filter(i => i.confidence >= mergedConfig.minConfidence)
  const decompositionConfidence = confidentIntents.length > 0
    ? confidentIntents.reduce((sum, i) => sum + i.confidence, 0) / confidentIntents.length
    : 0.3

  const dependencies = inferDependencies(subTasks)

  return {
    id: taskId,
    originalObjective: objective,
    subTasks,
    dependencies,
    estimatedComplexity: complexity,
    decompositionConfidence: Math.round(decompositionConfidence * 1000) / 1000,
  }
}

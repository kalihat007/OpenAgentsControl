/**
 * Custom Expert Definition System
 *
 * Allows users to define, extend, and share expert profiles.
 * Built-in experts are derived from the task-router's EXPERT_KEYWORDS.
 * Custom experts live in `.opencode/experts.json` per project.
 *
 * Supports:
 * - Inheritance (child experts extend parent via `extends` field)
 * - Validation (required fields, circular inheritance, ID conflicts)
 * - CRUD operations on custom experts
 * - Scaffolding for new projects
 * - Export for sharing
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('expert-definitions')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpertDefinition {
  id: string
  name: string
  description: string
  role: string
  capabilities: string[]
  keywords: string[]
  filePatterns: string[]
  instructions?: string
  extends?: string
  priority?: number
  enabled: boolean
}

export interface ExpertRegistry {
  builtIn: ExpertDefinition[]
  custom: ExpertDefinition[]
  merged: ExpertDefinition[]
}

export interface ExpertDefinitionFile {
  version: string
  experts: ExpertDefinition[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ── Built-in expert data ──────────────────────────────────────────────────────

interface BuiltInExpertConfig {
  name: string
  description: string
  role: string
  capabilities: string[]
  keywords: string[]
  filePatterns: string[]
}

const BUILT_IN_EXPERTS: BuiltInExpertConfig[] = [
  {
    name: 'CoderAgent',
    description: 'General-purpose coding and implementation',
    role: 'developer',
    capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
    keywords: ['implement', 'code', 'write', 'create', 'build', 'function', 'class', 'refactor', 'fix bug', 'feature', 'development', 'programming', 'script'],
    filePatterns: ['*.ts', '*.js', '*.go', '*.rs', '*.py', '*.java', '*.cpp', '*.c'],
  },
  {
    name: 'OpenFrontendSpecialist',
    description: 'Frontend and UI development',
    role: 'frontend-developer',
    capabilities: ['ui-development', 'component-design', 'styling', 'responsive-design'],
    keywords: ['ui', 'ux', 'frontend', 'react', 'vue', 'angular', 'css', 'html', 'component', 'page', 'screen', 'layout', 'styling', 'dom', 'browser'],
    filePatterns: ['*.tsx', '*.jsx', '*.css', '*.scss', '*.html', '*.vue'],
  },
  {
    name: 'BackendDeveloperAgent',
    description: 'Backend and API development',
    role: 'backend-developer',
    capabilities: ['api-design', 'database-management', 'server-architecture'],
    keywords: ['api', 'backend', 'server', 'database', 'sql', 'nosql', 'rest', 'graphql', 'endpoint', 'service', 'microservice', 'auth', 'session', 'middleware'],
    filePatterns: ['*.go', '*.rs', '*.py', '*.ts', '*.js', '*.java', '*.rb'],
  },
  {
    name: 'TestEngineer',
    description: 'Testing and quality assurance',
    role: 'test-engineer',
    capabilities: ['unit-testing', 'integration-testing', 'e2e-testing', 'coverage-analysis'],
    keywords: ['test', 'testing', 'tdd', 'unit test', 'integration test', 'e2e', 'coverage', 'vitest', 'jest', 'pytest', 'cypress', 'playwright', 'spec'],
    filePatterns: ['*.test.*', '*.spec.*', 'test/**', 'tests/**', '__tests__/**'],
  },
  {
    name: 'CodeReviewer',
    description: 'Code review and quality auditing',
    role: 'reviewer',
    capabilities: ['code-review', 'quality-analysis', 'maintainability-assessment'],
    keywords: ['review', 'audit', 'quality', 'maintainability', 'clean code', 'code smell', 'refactor review', 'peer review'],
    filePatterns: [],
  },
  {
    name: 'SecurityAgent',
    description: 'Security analysis and vulnerability assessment',
    role: 'security-engineer',
    capabilities: ['vulnerability-scanning', 'auth-review', 'compliance-checking'],
    keywords: ['security', 'auth', 'oauth', 'jwt', 'encrypt', 'vulnerability', 'pentest', 'injection', 'xss', 'csrf', 'secret', 'permission', 'rbac', 'compliance', 'iso 21434', 'un r155', 'ais-189'],
    filePatterns: ['*.key', '*.pem', '*auth*', '*security*'],
  },
  {
    name: 'SystemArchitectAgent',
    description: 'System architecture and design',
    role: 'architect',
    capabilities: ['system-design', 'api-architecture', 'data-modeling'],
    keywords: ['architecture', 'design', 'system', 'microservices', 'monolith', 'contract', 'schema', 'data model', 'api design', 'event-driven', 'bounded context', 'ddd'],
    filePatterns: ['*.proto', '*.graphql', 'openapi*', 'architecture*'],
  },
  {
    name: 'TechLeadAgent',
    description: 'Technical leadership and coordination',
    role: 'tech-lead',
    capabilities: ['decision-making', 'coordination', 'standards-enforcement'],
    keywords: ['tech lead', 'stack', 'decision', 'pattern', 'convention', 'standards', 'arbitrate', 'integration', 'orchestration', 'coordination'],
    filePatterns: [],
  },
  {
    name: 'OpenDevopsSpecialist',
    description: 'DevOps, CI/CD, and infrastructure',
    role: 'devops-engineer',
    capabilities: ['deployment', 'ci-cd', 'infrastructure-management', 'monitoring'],
    keywords: ['deploy', 'ci/cd', 'docker', 'kubernetes', 'k8s', 'terraform', 'infrastructure', 'pipeline', 'github actions', 'release', 'monitoring', 'logging'],
    filePatterns: ['Dockerfile', '*.yml', '*.yaml', '*.tf', '*.hcl', '.github/**'],
  },
  {
    name: 'DocWriter',
    description: 'Documentation and technical writing',
    role: 'technical-writer',
    capabilities: ['documentation', 'api-docs', 'guides', 'changelogs'],
    keywords: ['document', 'readme', 'docs', 'guide', 'tutorial', 'specification', 'api doc', 'changelog', 'wiki'],
    filePatterns: ['*.md', 'docs/**', 'README*'],
  },
  {
    name: 'DebugAgent',
    description: 'Debugging and troubleshooting',
    role: 'debugger',
    capabilities: ['root-cause-analysis', 'error-diagnosis', 'incident-response'],
    keywords: ['debug', 'fix', 'error', 'crash', 'failure', 'broken', 'not working', 'issue', 'troubleshoot', 'investigate', 'root cause', 'incident'],
    filePatterns: [],
  },
  {
    name: 'ProductManagerAgent',
    description: 'Product management and requirements',
    role: 'product-manager',
    capabilities: ['requirement-analysis', 'user-stories', 'roadmap-planning'],
    keywords: ['product', 'requirement', 'user story', 'epic', 'roadmap', 'feature request', 'scope', 'acceptance criteria', 'persona', 'jtbd'],
    filePatterns: [],
  },
  {
    name: 'HardwareArchitectAgent',
    description: 'Hardware and embedded architecture',
    role: 'hardware-architect',
    capabilities: ['pcb-design', 'firmware-architecture', 'protocol-design'],
    keywords: ['hardware', 'pcb', 'schematic', 'fpga', 'asic', 'embedded', 'firmware', 'mcu', 'soc', 'sensor', 'actuator', 'can', 'lin', 'ethernet', 'automotive'],
    filePatterns: ['*.sch', '*.brd', '*.v', '*.vhdl', '*.sv', '*.c', '*.cpp'],
  },
  {
    name: 'EmbeddedCPPCodingAgent',
    description: 'Embedded C/C++ development',
    role: 'embedded-developer',
    capabilities: ['firmware-development', 'driver-development', 'rtos-programming'],
    keywords: ['embedded c', 'embedded c++', 'firmware', 'driver', 'bare metal', 'rtos', 'mcu', 'autosar', 'misra'],
    filePatterns: ['*.c', '*.cpp', '*.h', '*.hpp'],
  },
  {
    name: 'PenetrationTestAgent',
    description: 'Penetration testing and security assessment',
    role: 'pentester',
    capabilities: ['vulnerability-assessment', 'exploit-development', 'threat-analysis'],
    keywords: ['pentest', 'fuzzing', 'reverse engineering', 'side channel', 'fault injection', 'wireless', 'vapt', 'exploit', 'cve', 'threat'],
    filePatterns: [],
  },
  {
    name: 'TechnicalComplianceVVAgent',
    description: 'Technical compliance and verification/validation',
    role: 'compliance-engineer',
    capabilities: ['regulatory-compliance', 'certification', 'audit-preparation'],
    keywords: ['compliance', 'iso 21434', 'iso 24089', 'un r155', 'un r156', 'ais-189', 'ais-190', 'gb 44495', 'certification', 'homologation', 'csms', 'tara', 'audit'],
    filePatterns: [],
  },
  {
    name: 'ContentSwarmAgent',
    description: 'Content creation and marketing',
    role: 'content-creator',
    capabilities: ['copywriting', 'content-strategy', 'social-media'],
    keywords: ['content', 'blog', 'article', 'copy', 'social media', 'linkedin', 'twitter', 'campaign', 'marketing copy', 'whitepaper', 'case study'],
    filePatterns: [],
  },
  {
    name: 'InvestorNarrativeAgent',
    description: 'Investor relations and fundraising',
    role: 'investor-relations',
    capabilities: ['pitch-deck-creation', 'financial-narrative', 'fundraising-strategy'],
    keywords: ['investor', 'pitch', 'deck', 'funding', 'vc', 'series', 'valuation', 'term sheet', 'data room', 'demo day', 'narrative'],
    filePatterns: [],
  },
]

// ── Definition management ─────────────────────────────────────────────────────

export function loadBuiltInExperts(): ExpertDefinition[] {
  return BUILT_IN_EXPERTS.map((config) => ({
    id: config.name
      .replace(/Agent$/, '')
      .replace(/([A-Z])/g, '-$1')
      .replace(/^-/, '')
      .toLowerCase(),
    name: config.name,
    description: config.description,
    role: config.role,
    capabilities: [...config.capabilities],
    keywords: [...config.keywords],
    filePatterns: [...config.filePatterns],
    enabled: true,
  }))
}

function getExpertsFilePath(projectRoot: string): string {
  return join(projectRoot, '.opencode', 'experts.json')
}

export async function loadCustomExperts(projectRoot: string): Promise<ExpertDefinition[]> {
  const filePath = getExpertsFilePath(projectRoot)

  if (!existsSync(filePath)) {
    log.debug('No custom experts file found', { path: filePath })
    return []
  }

  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    log.warn('Failed to read custom experts file', {
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }

  if (!raw.trim()) {
    log.debug('Custom experts file is empty', { path: filePath })
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    log.warn('Invalid JSON in custom experts file', { path: filePath })
    return []
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('experts' in parsed)
  ) {
    log.warn('Invalid experts file structure — expected { version, experts }', { path: filePath })
    return []
  }

  const file = parsed as ExpertDefinitionFile
  if (!Array.isArray(file.experts)) {
    log.warn('experts field is not an array', { path: filePath })
    return []
  }

  return file.experts
}

export async function saveCustomExperts(
  projectRoot: string,
  experts: ExpertDefinition[],
): Promise<void> {
  const filePath = getExpertsFilePath(projectRoot)
  const dir = dirname(filePath)

  await mkdir(dir, { recursive: true })

  const file: ExpertDefinitionFile = {
    version: '1',
    experts,
  }

  await writeFile(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8')
  log.debug('Saved custom experts', { path: filePath, count: experts.length })
}

export async function createExpertRegistry(projectRoot: string): Promise<ExpertRegistry> {
  const builtIn = loadBuiltInExperts()
  const custom = await loadCustomExperts(projectRoot)
  const merged = mergeExperts(builtIn, custom)

  return { builtIn, custom, merged }
}

function mergeExperts(
  builtIn: ExpertDefinition[],
  custom: ExpertDefinition[],
): ExpertDefinition[] {
  const byId = new Map<string, ExpertDefinition>()

  for (const expert of builtIn) {
    byId.set(expert.id, { ...expert })
  }

  for (const expert of custom) {
    byId.set(expert.id, { ...expert })
  }

  return [...byId.values()]
}

// ── Expert inheritance ────────────────────────────────────────────────────────

export function resolveInheritance(
  expert: ExpertDefinition,
  registry: ExpertDefinition[],
): ExpertDefinition {
  if (!expert.extends) return { ...expert }

  const visited = new Set<string>()
  return resolveInheritanceChain(expert, registry, visited)
}

function resolveInheritanceChain(
  expert: ExpertDefinition,
  registry: ExpertDefinition[],
  visited: Set<string>,
): ExpertDefinition {
  if (!expert.extends) return { ...expert }

  if (visited.has(expert.id)) {
    throw new Error(`Circular inheritance detected: ${[...visited, expert.id].join(' -> ')}`)
  }
  visited.add(expert.id)

  const parent = registry.find((e) => e.id === expert.extends)
  if (!parent) {
    throw new Error(`Parent expert '${expert.extends}' not found for '${expert.id}'`)
  }

  const resolvedParent = resolveInheritanceChain(parent, registry, visited)

  return {
    id: expert.id,
    name: expert.name,
    // Child replaces parent description/instructions
    description: expert.description || resolvedParent.description,
    role: expert.role || resolvedParent.role,
    instructions: expert.instructions ?? resolvedParent.instructions,
    // Additive: union of parent + child
    capabilities: uniqueArray([...resolvedParent.capabilities, ...expert.capabilities]),
    keywords: uniqueArray([...resolvedParent.keywords, ...expert.keywords]),
    filePatterns: uniqueArray([...resolvedParent.filePatterns, ...expert.filePatterns]),
    extends: expert.extends,
    priority: expert.priority ?? resolvedParent.priority,
    enabled: expert.enabled,
  }
}

function uniqueArray(arr: string[]): string[] {
  return [...new Set(arr)]
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateExpertDefinition(expert: ExpertDefinition): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!expert.id || typeof expert.id !== 'string') {
    errors.push('id is required and must be a non-empty string')
  } else if (!/^[a-z0-9-]+$/.test(expert.id)) {
    errors.push('id must contain only lowercase alphanumeric characters and hyphens')
  }

  if (!expert.name || typeof expert.name !== 'string') {
    errors.push('name is required and must be a non-empty string')
  }

  if (!expert.description || typeof expert.description !== 'string') {
    errors.push('description is required and must be a non-empty string')
  }

  if (!expert.role || typeof expert.role !== 'string') {
    errors.push('role is required and must be a non-empty string')
  }

  if (!Array.isArray(expert.capabilities)) {
    errors.push('capabilities must be an array')
  } else if (expert.capabilities.length === 0) {
    warnings.push('capabilities array is empty — consider adding at least one capability')
  }

  if (!Array.isArray(expert.keywords)) {
    errors.push('keywords must be an array')
  } else if (expert.keywords.length === 0) {
    warnings.push('keywords array is empty — expert will never be matched by keyword routing')
  }

  if (!Array.isArray(expert.filePatterns)) {
    errors.push('filePatterns must be an array')
  }

  if (typeof expert.enabled !== 'boolean') {
    errors.push('enabled must be a boolean')
  }

  if (expert.extends !== undefined && typeof expert.extends !== 'string') {
    errors.push('extends must be a string when provided')
  }

  if (expert.priority !== undefined && (typeof expert.priority !== 'number' || !Number.isFinite(expert.priority))) {
    errors.push('priority must be a finite number when provided')
  }

  if (expert.instructions !== undefined && typeof expert.instructions !== 'string') {
    errors.push('instructions must be a string when provided')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateRegistry(registry: ExpertRegistry): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check for ID conflicts between custom experts
  const customIds = new Set<string>()
  for (const expert of registry.custom) {
    if (customIds.has(expert.id)) {
      errors.push(`Duplicate custom expert ID: '${expert.id}'`)
    }
    customIds.add(expert.id)
  }

  // Validate each custom expert definition
  for (const expert of registry.custom) {
    const result = validateExpertDefinition(expert)
    for (const err of result.errors) {
      errors.push(`[${expert.id || 'unknown'}] ${err}`)
    }
    for (const warn of result.warnings) {
      warnings.push(`[${expert.id || 'unknown'}] ${warn}`)
    }
  }

  // Check for circular extends chains and orphan references
  const allMergedIds = new Set(registry.merged.map((e) => e.id))
  for (const expert of registry.custom) {
    if (expert.extends) {
      if (!allMergedIds.has(expert.extends)) {
        errors.push(`Expert '${expert.id}' extends unknown expert '${expert.extends}'`)
      }

      // Check circular inheritance
      const circularResult = detectCircularInheritance(expert, registry.merged)
      if (circularResult) {
        errors.push(circularResult)
      }
    }
  }

  // Warn about custom experts that shadow built-in ones
  const builtInIds = new Set(registry.builtIn.map((e) => e.id))
  for (const expert of registry.custom) {
    if (builtInIds.has(expert.id)) {
      warnings.push(`Custom expert '${expert.id}' overrides a built-in expert`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function detectCircularInheritance(
  expert: ExpertDefinition,
  allExperts: ExpertDefinition[],
): string | null {
  const visited = new Set<string>()
  let current: ExpertDefinition | undefined = expert

  while (current?.extends) {
    if (visited.has(current.id)) {
      return `Circular inheritance chain detected involving '${current.id}'`
    }
    visited.add(current.id)
    current = allExperts.find((e) => e.id === current!.extends)
  }

  return null
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export async function addCustomExpert(
  projectRoot: string,
  expert: ExpertDefinition,
): Promise<ExpertRegistry> {
  const existing = await loadCustomExperts(projectRoot)

  if (existing.some((e) => e.id === expert.id)) {
    throw new Error(`Expert with ID '${expert.id}' already exists. Use updateCustomExpert instead.`)
  }

  const validation = validateExpertDefinition(expert)
  if (!validation.valid) {
    throw new Error(`Invalid expert definition: ${validation.errors.join('; ')}`)
  }

  const updated = [...existing, expert]
  await saveCustomExperts(projectRoot, updated)

  return createExpertRegistry(projectRoot)
}

export async function updateCustomExpert(
  projectRoot: string,
  id: string,
  updates: Partial<ExpertDefinition>,
): Promise<ExpertRegistry> {
  const existing = await loadCustomExperts(projectRoot)
  const index = existing.findIndex((e) => e.id === id)

  if (index === -1) {
    throw new Error(`Custom expert '${id}' not found`)
  }

  const merged = { ...existing[index]!, ...updates, id }
  const validation = validateExpertDefinition(merged)
  if (!validation.valid) {
    throw new Error(`Invalid expert definition after update: ${validation.errors.join('; ')}`)
  }

  existing[index] = merged
  await saveCustomExperts(projectRoot, existing)

  return createExpertRegistry(projectRoot)
}

export async function removeCustomExpert(
  projectRoot: string,
  id: string,
): Promise<ExpertRegistry> {
  const existing = await loadCustomExperts(projectRoot)
  const filtered = existing.filter((e) => e.id !== id)

  if (filtered.length === existing.length) {
    throw new Error(`Custom expert '${id}' not found`)
  }

  await saveCustomExperts(projectRoot, filtered)
  return createExpertRegistry(projectRoot)
}

export function enableExpert(registry: ExpertRegistry, id: string): ExpertRegistry {
  return setExpertEnabled(registry, id, true)
}

export function disableExpert(registry: ExpertRegistry, id: string): ExpertRegistry {
  return setExpertEnabled(registry, id, false)
}

function setExpertEnabled(registry: ExpertRegistry, id: string, enabled: boolean): ExpertRegistry {
  const expert = registry.merged.find((e) => e.id === id)
  if (!expert) {
    throw new Error(`Expert '${id}' not found in registry`)
  }

  const updatedMerged = registry.merged.map((e) =>
    e.id === id ? { ...e, enabled } : e,
  )
  const updatedCustom = registry.custom.map((e) =>
    e.id === id ? { ...e, enabled } : e,
  )
  const updatedBuiltIn = registry.builtIn.map((e) =>
    e.id === id ? { ...e, enabled } : e,
  )

  return {
    builtIn: updatedBuiltIn,
    custom: updatedCustom,
    merged: updatedMerged,
  }
}

// ── Scaffolding ───────────────────────────────────────────────────────────────

export async function scaffoldExpertFile(projectRoot: string): Promise<void> {
  const filePath = getExpertsFilePath(projectRoot)

  if (existsSync(filePath)) {
    log.debug('Expert file already exists, skipping scaffold', { path: filePath })
    return
  }

  const exampleFile: ExpertDefinitionFile = {
    version: '1',
    experts: [
      {
        id: 'my-custom-expert',
        name: 'MyCustomExpert',
        description: 'A custom expert for project-specific tasks',
        role: 'specialist',
        capabilities: ['custom-analysis'],
        keywords: ['custom', 'specific'],
        filePatterns: ['*.custom'],
        instructions: 'Focus on project-specific patterns and conventions.',
        enabled: true,
      },
    ],
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(exampleFile, null, 2) + '\n', 'utf-8')
  log.debug('Scaffolded expert file', { path: filePath })
}

export function exportExpert(registry: ExpertRegistry, id: string): ExpertDefinition {
  const expert = registry.merged.find((e) => e.id === id)
  if (!expert) {
    throw new Error(`Expert '${id}' not found in registry`)
  }
  return { ...expert }
}

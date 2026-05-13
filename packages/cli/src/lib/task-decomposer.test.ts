import { describe, it, expect, beforeEach } from 'bun:test'
import {
  extractIntents,
  autoSelectStrategy,
  estimateComplexity,
  shouldDecompose,
  estimateSubTaskEffort,
  decomposeTask,
  inferDependencies,
  validateDependencies,
  getExecutionOrder,
  scopeFilesForSubTask,
  identifyArtifacts,
  resetIdCounter,
  type SubTask,
  type TaskDependency,
  type DecomposedTask,
  type IntentSignal,
  type DecomposerConfig,
} from './task-decomposer.js'
import { loadBuiltInExperts, type ExpertDefinition } from './expert-definitions.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let experts: ExpertDefinition[]

beforeEach(() => {
  resetIdCounter()
  experts = loadBuiltInExperts()
})

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: overrides.id ?? 'st-1',
    objective: overrides.objective ?? 'Do something',
    parentId: overrides.parentId ?? 'task-1',
    expertId: overrides.expertId ?? 'coder',
    priority: overrides.priority ?? 1,
    estimatedEffort: overrides.estimatedEffort ?? 'medium',
    requiredContext: overrides.requiredContext ?? [],
    producesArtifacts: overrides.producesArtifacts ?? [],
    fileScope: overrides.fileScope ?? [],
  }
}

// ── Intent extraction ─────────────────────────────────────────────────────────

describe('extractIntents', () => {
  it('extracts a single domain intent', () => {
    const intents = extractIntents('build a React component')
    const domains = intents.filter(i => i.category.startsWith('domain:'))
    expect(domains.length).toBeGreaterThan(0)
    expect(domains.some(i => i.category === 'domain:frontend')).toBe(true)
  })

  it('extracts multiple domain intents', () => {
    const intents = extractIntents('Build a login page with OAuth and rate limiting')
    const domains = intents.filter(i => i.category.startsWith('domain:'))
    const categories = new Set(domains.map(i => i.category))
    expect(categories.size).toBeGreaterThanOrEqual(2)
    expect(categories.has('domain:frontend')).toBe(true)
    expect(categories.has('domain:auth')).toBe(true)
  })

  it('extracts action intents', () => {
    const intents = extractIntents('refactor the authentication module and deploy')
    const actions = intents.filter(i => i.category.startsWith('action:'))
    const categories = new Set(actions.map(i => i.category))
    expect(categories.has('action:refactor')).toBe(true)
    expect(categories.has('action:deploy')).toBe(true)
  })

  it('extracts scope intents', () => {
    const intents = extractIntents('create a login page with a form component and API endpoint')
    const scopes = intents.filter(i => i.category.startsWith('scope:'))
    const categories = new Set(scopes.map(i => i.category))
    expect(categories.has('scope:page')).toBe(true)
    expect(categories.has('scope:component')).toBe(true)
    expect(categories.has('scope:endpoint')).toBe(true)
  })

  it('handles ambiguous objectives', () => {
    const intents = extractIntents('make things better')
    expect(intents.length).toBeGreaterThanOrEqual(0)
  })

  it('returns sorted intents by confidence (descending)', () => {
    const intents = extractIntents('Build a React login page with OAuth, database schema, and API endpoint')
    for (let i = 1; i < intents.length; i++) {
      expect(intents[i]!.confidence).toBeLessThanOrEqual(intents[i - 1]!.confidence)
    }
  })

  it('returns empty array for empty objective', () => {
    const intents = extractIntents('')
    expect(intents).toEqual([])
  })

  it('handles single-word objectives', () => {
    const intents = extractIntents('deploy')
    expect(intents.length).toBeGreaterThan(0)
    const actions = intents.filter(i => i.category.startsWith('action:'))
    expect(actions.some(i => i.category === 'action:deploy')).toBe(true)
  })

  it('assigns higher confidence to multi-word keywords', () => {
    const intents = extractIntents('write a unit test for the rate limit module')
    const unitTestSignal = intents.find(i => i.keyword === 'unit test')
    const testSignal = intents.find(i => i.keyword === 'test')
    if (unitTestSignal && testSignal) {
      expect(unitTestSignal.confidence).toBeGreaterThanOrEqual(testSignal.confidence)
    }
  })
})

// ── Auto strategy selection ───────────────────────────────────────────────────

describe('autoSelectStrategy', () => {
  it('selects by_feature when many scopes are present', () => {
    const intents: IntentSignal[] = [
      { keyword: 'page', category: 'scope:page', confidence: 0.8 },
      { keyword: 'component', category: 'scope:component', confidence: 0.8 },
      { keyword: 'endpoint', category: 'scope:endpoint', confidence: 0.8 },
    ]
    expect(autoSelectStrategy(intents)).toBe('by_feature')
  })

  it('selects by_layer when domains span multiple layers', () => {
    const intents: IntentSignal[] = [
      { keyword: 'react', category: 'domain:frontend', confidence: 0.8 },
      { keyword: 'api', category: 'domain:api', confidence: 0.8 },
      { keyword: 'database', category: 'domain:database', confidence: 0.8 },
    ]
    expect(autoSelectStrategy(intents)).toBe('by_layer')
  })

  it('selects by_phase when build + deploy actions are present', () => {
    const intents: IntentSignal[] = [
      { keyword: 'build', category: 'action:build', confidence: 0.8 },
      { keyword: 'deploy', category: 'action:deploy', confidence: 0.8 },
    ]
    expect(autoSelectStrategy(intents)).toBe('by_phase')
  })

  it('defaults to by_domain for single-domain intents', () => {
    const intents: IntentSignal[] = [
      { keyword: 'api', category: 'domain:api', confidence: 0.8 },
    ]
    expect(autoSelectStrategy(intents)).toBe('by_domain')
  })

  it('defaults to by_domain for empty intents', () => {
    expect(autoSelectStrategy([])).toBe('by_domain')
  })
})

// ── Decomposition ─────────────────────────────────────────────────────────────

describe('decomposeTask', () => {
  it('decomposes a multi-intent objective into sub-tasks', () => {
    const result = decomposeTask(
      'Build a login page with OAuth and rate limiting',
      experts,
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(2)
    expect(result.originalObjective).toBe('Build a login page with OAuth and rate limiting')
    expect(result.id).toBeTruthy()
  })

  it('assigns different experts to different sub-tasks when appropriate', () => {
    const result = decomposeTask(
      'Build a React dashboard with REST API, database migrations, and deploy to production',
      experts,
    )
    const expertIds = new Set(result.subTasks.map(t => t.expertId))
    expect(expertIds.size).toBeGreaterThanOrEqual(2)
  })

  it('respects maxSubTasks config', () => {
    const result = decomposeTask(
      'Build a full-stack app with auth, payments, analytics, search, notifications, rate limiting, caching, and deploy',
      experts,
      { maxSubTasks: 3 },
    )
    expect(result.subTasks.length).toBeLessThanOrEqual(3)
  })

  it('produces sub-tasks with parent IDs matching the decomposed task', () => {
    const result = decomposeTask('Build a React page with an API', experts)
    for (const sub of result.subTasks) {
      expect(sub.parentId).toBe(result.id)
    }
  })

  it('decomposes with by_domain strategy', () => {
    const result = decomposeTask(
      'Build a React page with OAuth authentication',
      experts,
      { strategy: 'by_domain' },
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('decomposes with by_layer strategy', () => {
    const result = decomposeTask(
      'Build a React dashboard with REST API and database',
      experts,
      { strategy: 'by_layer' },
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('decomposes with by_feature strategy', () => {
    const result = decomposeTask(
      'Create a login page with a form component and API endpoint',
      experts,
      { strategy: 'by_feature' },
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('decomposes with by_phase strategy', () => {
    const result = decomposeTask(
      'Build the authentication module then test and deploy it',
      experts,
      { strategy: 'by_phase' },
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty objective gracefully', () => {
    const result = decomposeTask('', experts)
    expect(result.originalObjective).toBe('')
    expect(result.id).toBeTruthy()
  })

  it('handles very complex multi-intent objective', () => {
    const result = decomposeTask(
      'Build a full-stack e-commerce app with React frontend, Node.js API, PostgreSQL database, ' +
      'OAuth authentication, Stripe payments, ElasticSearch, Redis caching, Docker deployment, ' +
      'unit tests, integration tests, and comprehensive documentation',
      experts,
    )
    expect(result.subTasks.length).toBeGreaterThanOrEqual(2)
    expect(result.estimatedComplexity).toBe('epic')
  })

  it('sets decompositionConfidence between 0 and 1', () => {
    const result = decomposeTask('Build a React login page with OAuth', experts)
    expect(result.decompositionConfidence).toBeGreaterThan(0)
    expect(result.decompositionConfidence).toBeLessThanOrEqual(1)
  })

  it('includes dependencies in the decomposed task', () => {
    const result = decomposeTask(
      'Build a React dashboard with REST API and database migrations',
      experts,
    )
    expect(Array.isArray(result.dependencies)).toBe(true)
  })
})

// ── Dependency inference ──────────────────────────────────────────────────────

describe('inferDependencies', () => {
  it('infers dependencies between backend and frontend tasks', () => {
    const subTasks: SubTask[] = [
      makeSubTask({ id: 'st-1', expertId: 'backend-developer', producesArtifacts: ['api-endpoints'], priority: 1 }),
      makeSubTask({ id: 'st-2', expertId: 'open-frontend-specialist', requiredContext: ['api-schema'], priority: 2 }),
    ]
    const deps = inferDependencies(subTasks)
    expect(deps.length).toBeGreaterThan(0)
    const blocking = deps.filter(d => d.type === 'blocks' || d.type === 'requires_artifact')
    expect(blocking.some(d => d.from === 'st-1' && d.to === 'st-2')).toBe(true)
  })

  it('returns empty for independent tasks', () => {
    const subTasks: SubTask[] = [
      makeSubTask({ id: 'st-1', expertId: 'doc-writer', priority: 1 }),
      makeSubTask({ id: 'st-2', expertId: 'doc-writer', priority: 2 }),
    ]
    const deps = inferDependencies(subTasks)
    const blocking = deps.filter(d => d.type === 'blocks' || d.type === 'requires_artifact')
    expect(blocking.length).toBe(0)
  })

  it('handles single sub-task', () => {
    const deps = inferDependencies([makeSubTask()])
    expect(deps).toEqual([])
  })

  it('handles empty sub-task list', () => {
    const deps = inferDependencies([])
    expect(deps).toEqual([])
  })
})

// ── Dependency validation ─────────────────────────────────────────────────────

describe('validateDependencies', () => {
  it('validates correct dependencies', () => {
    const subTasks = [makeSubTask({ id: 'st-1' }), makeSubTask({ id: 'st-2' })]
    const deps: TaskDependency[] = [{ from: 'st-1', to: 'st-2', type: 'blocks' }]
    const result = validateDependencies(deps, subTasks)
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('detects references to unknown tasks', () => {
    const subTasks = [makeSubTask({ id: 'st-1' })]
    const deps: TaskDependency[] = [{ from: 'st-1', to: 'st-999', type: 'blocks' }]
    const result = validateDependencies(deps, subTasks)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.includes('unknown task'))).toBe(true)
  })

  it('detects self-dependencies', () => {
    const subTasks = [makeSubTask({ id: 'st-1' })]
    const deps: TaskDependency[] = [{ from: 'st-1', to: 'st-1', type: 'blocks' }]
    const result = validateDependencies(deps, subTasks)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.includes('Self-dependency'))).toBe(true)
  })

  it('detects circular dependencies', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1' }),
      makeSubTask({ id: 'st-2' }),
      makeSubTask({ id: 'st-3' }),
    ]
    const deps: TaskDependency[] = [
      { from: 'st-1', to: 'st-2', type: 'blocks' },
      { from: 'st-2', to: 'st-3', type: 'blocks' },
      { from: 'st-3', to: 'st-1', type: 'blocks' },
    ]
    const result = validateDependencies(deps, subTasks)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.includes('Circular'))).toBe(true)
  })

  it('passes validation for empty dependencies', () => {
    const subTasks = [makeSubTask({ id: 'st-1' })]
    const result = validateDependencies([], subTasks)
    expect(result.valid).toBe(true)
  })

  it('does not flag informational deps as cycles', () => {
    const subTasks = [makeSubTask({ id: 'st-1' }), makeSubTask({ id: 'st-2' })]
    const deps: TaskDependency[] = [
      { from: 'st-1', to: 'st-2', type: 'informs' },
      { from: 'st-2', to: 'st-1', type: 'informs' },
    ]
    const result = validateDependencies(deps, subTasks)
    expect(result.valid).toBe(true)
  })
})

// ── Execution order ───────────────────────────────────────────────────────────

describe('getExecutionOrder', () => {
  it('returns tasks in dependency order', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1', priority: 1 }),
      makeSubTask({ id: 'st-2', priority: 2 }),
      makeSubTask({ id: 'st-3', priority: 3 }),
    ]
    const deps: TaskDependency[] = [
      { from: 'st-1', to: 'st-2', type: 'blocks' },
      { from: 'st-2', to: 'st-3', type: 'blocks' },
    ]
    const batches = getExecutionOrder(subTasks, deps)

    expect(batches.length).toBe(3)
    expect(batches[0]![0]!.id).toBe('st-1')
    expect(batches[1]![0]!.id).toBe('st-2')
    expect(batches[2]![0]!.id).toBe('st-3')
  })

  it('groups independent tasks into parallel batches', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1', priority: 1 }),
      makeSubTask({ id: 'st-2', priority: 2 }),
      makeSubTask({ id: 'st-3', priority: 3 }),
    ]
    const deps: TaskDependency[] = [
      { from: 'st-1', to: 'st-3', type: 'blocks' },
      { from: 'st-2', to: 'st-3', type: 'blocks' },
    ]
    const batches = getExecutionOrder(subTasks, deps)

    expect(batches.length).toBe(2)
    // First batch has st-1 and st-2 (parallel)
    const firstBatchIds = batches[0]!.map(t => t.id).sort()
    expect(firstBatchIds).toEqual(['st-1', 'st-2'])
    // Second batch has st-3
    expect(batches[1]![0]!.id).toBe('st-3')
  })

  it('handles no dependencies (all parallel)', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1', priority: 1 }),
      makeSubTask({ id: 'st-2', priority: 2 }),
    ]
    const batches = getExecutionOrder(subTasks, [])

    expect(batches.length).toBe(1)
    expect(batches[0]!.length).toBe(2)
  })

  it('handles empty task list', () => {
    const batches = getExecutionOrder([], [])
    expect(batches).toEqual([])
  })

  it('ignores informs dependencies for ordering', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1', priority: 1 }),
      makeSubTask({ id: 'st-2', priority: 2 }),
    ]
    const deps: TaskDependency[] = [{ from: 'st-1', to: 'st-2', type: 'informs' }]
    const batches = getExecutionOrder(subTasks, deps)

    expect(batches.length).toBe(1)
    expect(batches[0]!.length).toBe(2)
  })
})

// ── Complexity estimation ─────────────────────────────────────────────────────

describe('estimateComplexity', () => {
  it('estimates simple tasks', () => {
    const intents = extractIntents('fix a typo')
    expect(estimateComplexity('fix a typo', intents)).toBe('simple')
  })

  it('estimates moderate tasks', () => {
    const intents = extractIntents('Build a React login page')
    expect(estimateComplexity('Build a React login page', intents)).toBe('moderate')
  })

  it('estimates complex tasks', () => {
    const objective = 'Build a React dashboard with REST API and database migrations and deploy'
    const intents = extractIntents(objective)
    const complexity = estimateComplexity(objective, intents)
    expect(['complex', 'epic']).toContain(complexity)
  })

  it('estimates epic tasks', () => {
    const objective = 'Build a full-stack e-commerce app with React frontend, Node.js API, PostgreSQL database, ' +
      'OAuth authentication, Stripe payments, ElasticSearch, Redis caching, Docker deployment, and tests'
    const intents = extractIntents(objective)
    expect(estimateComplexity(objective, intents)).toBe('epic')
  })
})

// ── shouldDecompose ───────────────────────────────────────────────────────────

describe('shouldDecompose', () => {
  it('returns false for simple single-intent tasks', () => {
    expect(shouldDecompose('fix a typo')).toBe(false)
  })

  it('returns true for multi-domain tasks', () => {
    expect(shouldDecompose('Build a login page with OAuth and database migration')).toBe(true)
  })

  it('returns true when conjunctions indicate multiple concerns', () => {
    expect(shouldDecompose('add authentication and database caching')).toBe(true)
  })

  it('returns false for short single-domain tasks', () => {
    expect(shouldDecompose('fix a typo in readme')).toBe(false)
  })
})

// ── estimateSubTaskEffort ─────────────────────────────────────────────────────

describe('estimateSubTaskEffort', () => {
  it('estimates trivial effort for simple sub-tasks', () => {
    const task = makeSubTask({ objective: 'update config', producesArtifacts: [], requiredContext: [] })
    expect(estimateSubTaskEffort(task)).toBe('trivial')
  })

  it('estimates larger effort for complex sub-tasks', () => {
    const task = makeSubTask({
      objective: 'Implement complete authentication flow with OAuth, JWT token management, session handling, and role-based access control',
      producesArtifacts: ['auth-middleware', 'token-handlers', 'session-store', 'rbac-config'],
      requiredContext: ['auth-flow', 'token-strategy', 'permission-model'],
    })
    expect(estimateSubTaskEffort(task)).toBe('large')
  })
})

// ── File scoping ──────────────────────────────────────────────────────────────

describe('scopeFilesForSubTask', () => {
  it('returns existing fileScope when no index is provided', () => {
    const task = makeSubTask({ fileScope: ['src/app.ts'] })
    const result = scopeFilesForSubTask(task)
    expect(result).toEqual(['src/app.ts'])
  })

  it('scopes frontend files for frontend expert', () => {
    const mockIndex = {
      root: '/project',
      techStack: { languages: [], frameworks: [], buildTools: [], testFrameworks: [], packageManager: 'npm' },
      modules: [],
      dependencies: {},
      fileTree: [
        { name: 'components', path: 'src/components', type: 'directory' as const, children: [
          { name: 'Button.tsx', path: 'src/components/Button.tsx', type: 'file' as const, language: 'typescript' },
          { name: 'Form.tsx', path: 'src/components/Form.tsx', type: 'file' as const, language: 'typescript' },
        ] },
        { name: 'api', path: 'src/api', type: 'directory' as const, children: [
          { name: 'routes.ts', path: 'src/api/routes.ts', type: 'file' as const, language: 'typescript' },
        ] },
      ],
      conventions: { fileNaming: 'PascalCase', testPattern: '*.test.*', componentPattern: 'PascalCase', stateManagement: 'none', errorHandling: 'try-catch', importStyle: 'esm' },
      indexedAt: new Date(),
    }

    const task = makeSubTask({ expertId: 'open-frontend-specialist' })
    const files = scopeFilesForSubTask(task, mockIndex)
    expect(files.some(f => f.includes('.tsx'))).toBe(true)
    expect(files.every(f => !f.includes('routes.ts'))).toBe(true)
  })
})

// ── Artifact identification ───────────────────────────────────────────────────

describe('identifyArtifacts', () => {
  it('maps sub-task IDs to their produced artifacts', () => {
    const subTasks = [
      makeSubTask({ id: 'st-1', producesArtifacts: ['api-schema', 'db-migration'] }),
      makeSubTask({ id: 'st-2', producesArtifacts: ['ui-components'] }),
      makeSubTask({ id: 'st-3', producesArtifacts: [] }),
    ]
    const result = identifyArtifacts(subTasks)

    expect(result['st-1']).toEqual(['api-schema', 'db-migration'])
    expect(result['st-2']).toEqual(['ui-components'])
    expect(result['st-3']).toBeUndefined()
  })

  it('returns empty record for empty sub-tasks', () => {
    expect(identifyArtifacts([])).toEqual({})
  })
})

// ── Integration: full decomposition pipeline ──────────────────────────────────

describe('integration: full decomposition pipeline', () => {
  it('decomposes, validates, and orders "Build a login page with OAuth and rate limiting"', () => {
    const result = decomposeTask(
      'Build a login page with OAuth and rate limiting',
      experts,
    )

    expect(result.subTasks.length).toBeGreaterThanOrEqual(2)
    expect(result.estimatedComplexity).not.toBe('simple')
    expect(result.decompositionConfidence).toBeGreaterThan(0)

    const validation = validateDependencies(result.dependencies, result.subTasks)
    expect(validation.valid).toBe(true)

    const batches = getExecutionOrder(result.subTasks, result.dependencies)
    expect(batches.length).toBeGreaterThanOrEqual(1)

    // All sub-tasks should appear exactly once across all batches
    const allIds = batches.flatMap(b => b.map(t => t.id))
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(result.subTasks.length)
    expect(allIds.length).toBe(result.subTasks.length)
  })

  it('decomposes a full-stack objective end-to-end', () => {
    const result = decomposeTask(
      'Build a React dashboard with REST API, PostgreSQL database, OAuth auth, and Docker deployment',
      experts,
    )

    expect(result.subTasks.length).toBeGreaterThanOrEqual(3)

    const artifacts = identifyArtifacts(result.subTasks)
    expect(Object.keys(artifacts).length).toBeGreaterThanOrEqual(1)

    const batches = getExecutionOrder(result.subTasks, result.dependencies)
    const totalTasksInBatches = batches.reduce((sum, b) => sum + b.length, 0)
    expect(totalTasksInBatches).toBe(result.subTasks.length)
  })
})

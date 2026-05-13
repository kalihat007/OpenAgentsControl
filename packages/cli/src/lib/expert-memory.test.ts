import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  initializeMemory,
  loadMemory,
  saveMemory,
  recordDecision,
  getDecisionsByExpert,
  getDecisionsByOutcome,
  getRecentDecisions,
  recordRouting,
  recordUserOverride,
  getRoutingAccuracy,
  getLearnedWeights,
  suggestRoutingAdjustments,
  updatePreference,
  boostExpert,
  disableExpert,
  addCustomKeywords,
  learnConvention,
  getConventions,
  mergeWithDetected,
  type ExpertMemory,
  type Decision,
  type RoutingRecord,
  type ProjectConventions,
} from './expert-memory.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'expert-memory-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ── Memory initialization and persistence ─────────────────────────────────────

describe('memory initialization', () => {
  it('initializes with correct defaults', () => {
    const memory = initializeMemory(tempDir)

    expect(memory.projectRoot).toBe(tempDir)
    expect(memory.decisions).toEqual([])
    expect(memory.routingHistory).toEqual([])
    expect(memory.userPreferences.preferredExperts).toEqual({})
    expect(memory.userPreferences.disabledExperts).toEqual([])
    expect(memory.userPreferences.confidenceThreshold).toBe(0.4)
    expect(memory.userPreferences.autoApprove).toBe(false)
    expect(memory.userPreferences.customKeywords).toEqual({})
    expect(memory.projectConventions).toEqual([])
    expect(memory.lastUpdated).toBeTruthy()
  })

  it('sets a valid ISO timestamp on lastUpdated', () => {
    const memory = initializeMemory(tempDir)
    const date = new Date(memory.lastUpdated)
    expect(date.getTime()).not.toBeNaN()
  })
})

describe('memory persistence (save/load round-trip)', () => {
  it('saves and loads memory correctly', async () => {
    let memory = initializeMemory(tempDir)
    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'implement auth',
      approach: 'JWT-based',
      outcome: 'success',
      context: { framework: 'express' },
      learnings: ['Use refresh tokens'],
    })

    await saveMemory(memory)
    const loaded = await loadMemory(tempDir)

    expect(loaded.projectRoot).toBe(tempDir)
    expect(loaded.decisions).toHaveLength(1)
    expect(loaded.decisions[0].expertId).toBe('CoderAgent')
    expect(loaded.decisions[0].objective).toBe('implement auth')
    expect(loaded.decisions[0].learnings).toEqual(['Use refresh tokens'])
  })

  it('creates .opencode directory if missing', async () => {
    const memory = initializeMemory(tempDir)
    await saveMemory(memory)

    const raw = await readFile(join(tempDir, '.opencode', '.expert-memory.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.projectRoot).toBe(tempDir)
  })

  it('saves as pretty-printed JSON', async () => {
    const memory = initializeMemory(tempDir)
    await saveMemory(memory)

    const raw = await readFile(join(tempDir, '.opencode', '.expert-memory.json'), 'utf-8')
    expect(raw).toContain('\n')
    expect(raw).toContain('  ')
  })

  it('updates lastUpdated on save', async () => {
    const memory = initializeMemory(tempDir)
    const originalTimestamp = memory.lastUpdated

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10))
    await saveMemory(memory)

    const loaded = await loadMemory(tempDir)
    expect(loaded.lastUpdated).not.toBe(originalTimestamp)
  })

  it('preserves all data through save/load cycle', async () => {
    let memory = initializeMemory(tempDir)

    memory = recordDecision(memory, {
      expertId: 'SecurityAgent',
      objective: 'audit auth',
      approach: 'static analysis',
      outcome: 'partial',
      context: {},
      learnings: ['Check for XSS', 'Validate inputs'],
    })

    memory = recordRouting(memory, {
      objective: 'build API',
      routedTo: 'BackendDeveloperAgent',
      confidence: 0.85,
      wasCorrect: true,
    })

    memory = boostExpert(memory, 'CoderAgent', 3)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')

    await saveMemory(memory)
    const loaded = await loadMemory(tempDir)

    expect(loaded.decisions).toHaveLength(1)
    expect(loaded.routingHistory).toHaveLength(1)
    expect(loaded.userPreferences.preferredExperts['CoderAgent']).toBe(3)
    expect(loaded.projectConventions).toHaveLength(1)
    expect(loaded.projectConventions[0].convention).toBe('kebab-case')
  })
})

// ── Decision recording and querying ───────────────────────────────────────────

describe('decision recording', () => {
  it('records a decision with auto-generated id and timestamp', () => {
    const memory = initializeMemory(tempDir)
    const updated = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'build login page',
      approach: 'React with hooks',
      outcome: 'success',
      context: { component: 'LoginPage' },
      learnings: ['Use useForm hook'],
    })

    expect(updated.decisions).toHaveLength(1)
    expect(updated.decisions[0].id).toBeTruthy()
    expect(updated.decisions[0].timestamp).toBeTruthy()
    expect(updated.decisions[0].expertId).toBe('CoderAgent')
    expect(updated.decisions[0].outcome).toBe('success')
  })

  it('does not mutate the original memory', () => {
    const memory = initializeMemory(tempDir)
    const updated = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'test',
      approach: 'direct',
      outcome: 'success',
      context: {},
      learnings: [],
    })

    expect(memory.decisions).toHaveLength(0)
    expect(updated.decisions).toHaveLength(1)
  })

  it('records multiple decisions', () => {
    let memory = initializeMemory(tempDir)

    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'task 1',
      approach: 'a',
      outcome: 'success',
      context: {},
      learnings: [],
    })
    memory = recordDecision(memory, {
      expertId: 'SecurityAgent',
      objective: 'task 2',
      approach: 'b',
      outcome: 'failure',
      context: {},
      learnings: ['need more testing'],
    })
    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'task 3',
      approach: 'c',
      outcome: 'partial',
      context: {},
      learnings: [],
    })

    expect(memory.decisions).toHaveLength(3)
  })
})

describe('decision querying', () => {
  let memory: ExpertMemory

  beforeEach(() => {
    memory = initializeMemory(tempDir)
    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'task 1',
      approach: 'a',
      outcome: 'success',
      context: {},
      learnings: [],
    })
    memory = recordDecision(memory, {
      expertId: 'SecurityAgent',
      objective: 'task 2',
      approach: 'b',
      outcome: 'failure',
      context: {},
      learnings: [],
    })
    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'task 3',
      approach: 'c',
      outcome: 'success',
      context: {},
      learnings: [],
    })
    memory = recordDecision(memory, {
      expertId: 'TestEngineer',
      objective: 'task 4',
      approach: 'd',
      outcome: 'partial',
      context: {},
      learnings: [],
    })
  })

  it('filters decisions by expert', () => {
    const coderDecisions = getDecisionsByExpert(memory, 'CoderAgent')
    expect(coderDecisions).toHaveLength(2)
    expect(coderDecisions.every((d) => d.expertId === 'CoderAgent')).toBe(true)
  })

  it('returns empty for unknown expert', () => {
    expect(getDecisionsByExpert(memory, 'UnknownAgent')).toHaveLength(0)
  })

  it('filters decisions by outcome', () => {
    const successes = getDecisionsByOutcome(memory, 'success')
    expect(successes).toHaveLength(2)
    expect(successes.every((d) => d.outcome === 'success')).toBe(true)

    const failures = getDecisionsByOutcome(memory, 'failure')
    expect(failures).toHaveLength(1)

    const partials = getDecisionsByOutcome(memory, 'partial')
    expect(partials).toHaveLength(1)
  })

  it('returns recent decisions in reverse chronological order', () => {
    const recent = getRecentDecisions(memory, 2)
    expect(recent).toHaveLength(2)
    expect(recent[0].objective).toBe('task 4')
    expect(recent[1].objective).toBe('task 3')
  })

  it('limits recent decisions correctly', () => {
    expect(getRecentDecisions(memory, 1)).toHaveLength(1)
    expect(getRecentDecisions(memory, 10)).toHaveLength(4)
  })
})

// ── Routing history and accuracy ──────────────────────────────────────────────

describe('routing recording', () => {
  it('records a routing entry with auto-generated timestamp', () => {
    const memory = initializeMemory(tempDir)
    const updated = recordRouting(memory, {
      objective: 'build API',
      routedTo: 'BackendDeveloperAgent',
      confidence: 0.85,
    })

    expect(updated.routingHistory).toHaveLength(1)
    expect(updated.routingHistory[0].timestamp).toBeTruthy()
    expect(updated.routingHistory[0].routedTo).toBe('BackendDeveloperAgent')
    expect(updated.routingHistory[0].confidence).toBe(0.85)
  })

  it('does not mutate the original memory', () => {
    const memory = initializeMemory(tempDir)
    const updated = recordRouting(memory, {
      objective: 'test',
      routedTo: 'CoderAgent',
      confidence: 0.5,
    })

    expect(memory.routingHistory).toHaveLength(0)
    expect(updated.routingHistory).toHaveLength(1)
  })
})

describe('user override recording', () => {
  it('marks the matching routing record as incorrect and boosts overridden-to expert', () => {
    let memory = initializeMemory(tempDir)
    memory = recordRouting(memory, {
      objective: 'fix auth bug',
      routedTo: 'CoderAgent',
      confidence: 0.6,
    })

    memory = recordUserOverride(memory, 'fix auth bug', 'SecurityAgent')

    expect(memory.routingHistory[0].userOverride).toBe('SecurityAgent')
    expect(memory.routingHistory[0].wasCorrect).toBe(false)
    expect(memory.userPreferences.preferredExperts['SecurityAgent']).toBe(1)
  })

  it('handles override when no matching record exists (no-op on history)', () => {
    let memory = initializeMemory(tempDir)
    memory = recordRouting(memory, {
      objective: 'task A',
      routedTo: 'CoderAgent',
      confidence: 0.5,
    })

    memory = recordUserOverride(memory, 'non-existent task', 'SecurityAgent')

    // History unchanged for the existing record
    expect(memory.routingHistory[0].userOverride).toBeUndefined()
    // But preference still gets boosted
    expect(memory.userPreferences.preferredExperts['SecurityAgent']).toBe(1)
  })
})

describe('routing accuracy', () => {
  let memory: ExpertMemory

  beforeEach(() => {
    memory = initializeMemory(tempDir)

    // BackendDeveloperAgent: 3 correct, 1 incorrect = 75%
    memory = recordRouting(memory, { objective: 'a', routedTo: 'BackendDeveloperAgent', confidence: 0.8, wasCorrect: true })
    memory = recordRouting(memory, { objective: 'b', routedTo: 'BackendDeveloperAgent', confidence: 0.7, wasCorrect: true })
    memory = recordRouting(memory, { objective: 'c', routedTo: 'BackendDeveloperAgent', confidence: 0.6, wasCorrect: true })
    memory = recordRouting(memory, { objective: 'd', routedTo: 'BackendDeveloperAgent', confidence: 0.5, wasCorrect: false })

    // SecurityAgent: 1 correct, 1 not evaluated
    memory = recordRouting(memory, { objective: 'e', routedTo: 'SecurityAgent', confidence: 0.9, wasCorrect: true })
    memory = recordRouting(memory, { objective: 'f', routedTo: 'SecurityAgent', confidence: 0.4 })
  })

  it('calculates overall routing accuracy', () => {
    const result = getRoutingAccuracy(memory)
    expect(result.total).toBe(5) // 5 evaluated records
    expect(result.correct).toBe(4)
    expect(result.accuracy).toBe(0.8)
  })

  it('calculates per-expert accuracy', () => {
    const backend = getRoutingAccuracy(memory, 'BackendDeveloperAgent')
    expect(backend.total).toBe(4)
    expect(backend.correct).toBe(3)
    expect(backend.accuracy).toBe(0.75)
  })

  it('returns accuracy of 1 when no records are evaluated', () => {
    const empty = initializeMemory(tempDir)
    const result = getRoutingAccuracy(empty)
    expect(result.total).toBe(0)
    expect(result.accuracy).toBe(1)
  })

  it('excludes unevaluated records from totals', () => {
    const security = getRoutingAccuracy(memory, 'SecurityAgent')
    expect(security.total).toBe(1) // only the one with wasCorrect: true
    expect(security.correct).toBe(1)
    expect(security.accuracy).toBe(1)
  })
})

// ── Learned weights ───────────────────────────────────────────────────────────

describe('learned weights', () => {
  it('computes weights from routing history', () => {
    let memory = initializeMemory(tempDir)
    memory = recordRouting(memory, { objective: 'a', routedTo: 'CoderAgent', confidence: 0.8, wasCorrect: true })
    memory = recordRouting(memory, { objective: 'b', routedTo: 'CoderAgent', confidence: 0.7, wasCorrect: true })

    const weights = getLearnedWeights(memory)
    expect(weights['CoderAgent']).toBeGreaterThan(1.0)
  })

  it('penalizes experts with user overrides', () => {
    let memory = initializeMemory(tempDir)
    memory = recordRouting(memory, { objective: 'a', routedTo: 'CoderAgent', confidence: 0.8 })
    memory = recordUserOverride(memory, 'a', 'SecurityAgent')

    const weights = getLearnedWeights(memory)
    // CoderAgent should have reduced weight due to override
    expect(weights['CoderAgent']).toBeLessThan(1.0)
  })

  it('includes preference-only experts', () => {
    let memory = initializeMemory(tempDir)
    memory = boostExpert(memory, 'DocWriter', 5)

    const weights = getLearnedWeights(memory)
    expect(weights['DocWriter']).toBeGreaterThan(1.0)
  })

  it('returns empty object for empty history', () => {
    const memory = initializeMemory(tempDir)
    const weights = getLearnedWeights(memory)
    expect(Object.keys(weights)).toHaveLength(0)
  })

  it('weight never goes below 0.1', () => {
    let memory = initializeMemory(tempDir)
    // Create many overrides to heavily penalize
    for (let i = 0; i < 10; i++) {
      memory = recordRouting(memory, { objective: `task-${i}`, routedTo: 'BadAgent', confidence: 0.3 })
      memory = recordUserOverride(memory, `task-${i}`, 'GoodAgent')
    }

    const weights = getLearnedWeights(memory)
    expect(weights['BadAgent']).toBeGreaterThanOrEqual(0.1)
  })
})

// ── Routing adjustment suggestions ────────────────────────────────────────────

describe('routing adjustments', () => {
  it('suggests reducing weight for low-accuracy experts', () => {
    let memory = initializeMemory(tempDir)

    for (let i = 0; i < 5; i++) {
      memory = recordRouting(memory, {
        objective: `task-${i}`,
        routedTo: 'BadExpert',
        confidence: 0.5,
        wasCorrect: i === 0, // only 1/5 correct = 20%
      })
    }

    const adjustments = suggestRoutingAdjustments(memory)
    const badAdj = adjustments.find((a) => a.expertId === 'BadExpert')
    expect(badAdj).toBeDefined()
    expect(badAdj!.suggestedWeight).toBeLessThan(badAdj!.currentWeight)
    expect(badAdj!.reason).toContain('Low accuracy')
  })

  it('suggests increasing weight for high-accuracy experts', () => {
    let memory = initializeMemory(tempDir)

    for (let i = 0; i < 6; i++) {
      memory = recordRouting(memory, {
        objective: `task-${i}`,
        routedTo: 'GoodExpert',
        confidence: 0.9,
        wasCorrect: true,
      })
    }

    const adjustments = suggestRoutingAdjustments(memory)
    const goodAdj = adjustments.find((a) => a.expertId === 'GoodExpert')
    expect(goodAdj).toBeDefined()
    expect(goodAdj!.suggestedWeight).toBeGreaterThan(goodAdj!.currentWeight)
    expect(goodAdj!.reason).toContain('High accuracy')
  })

  it('returns empty adjustments for new system with few records', () => {
    let memory = initializeMemory(tempDir)
    memory = recordRouting(memory, {
      objective: 'task',
      routedTo: 'CoderAgent',
      confidence: 0.5,
      wasCorrect: true,
    })

    const adjustments = suggestRoutingAdjustments(memory)
    expect(adjustments).toHaveLength(0)
  })

  it('suggests reducing weight for frequently-overridden experts', () => {
    let memory = initializeMemory(tempDir)

    for (let i = 0; i < 5; i++) {
      memory = recordRouting(memory, {
        objective: `task-${i}`,
        routedTo: 'OverriddenExpert',
        confidence: 0.5,
      })
      memory = recordUserOverride(memory, `task-${i}`, 'BetterExpert')
    }

    const adjustments = suggestRoutingAdjustments(memory)
    const adj = adjustments.find((a) => a.expertId === 'OverriddenExpert')
    expect(adj).toBeDefined()
    expect(adj!.reason).toContain('Overridden')
  })
})

// ── User preferences ──────────────────────────────────────────────────────────

describe('user preferences', () => {
  it('updates a preference value', () => {
    const memory = initializeMemory(tempDir)
    const updated = updatePreference(memory, 'autoApprove', true)
    expect(updated.userPreferences.autoApprove).toBe(true)
    expect(memory.userPreferences.autoApprove).toBe(false) // original unchanged
  })

  it('updates confidence threshold', () => {
    const memory = initializeMemory(tempDir)
    const updated = updatePreference(memory, 'confidenceThreshold', 0.8)
    expect(updated.userPreferences.confidenceThreshold).toBe(0.8)
  })

  it('boosts an expert', () => {
    let memory = initializeMemory(tempDir)
    memory = boostExpert(memory, 'CoderAgent', 3)
    expect(memory.userPreferences.preferredExperts['CoderAgent']).toBe(3)

    memory = boostExpert(memory, 'CoderAgent', 2)
    expect(memory.userPreferences.preferredExperts['CoderAgent']).toBe(5)
  })

  it('disables an expert', () => {
    let memory = initializeMemory(tempDir)
    memory = disableExpert(memory, 'DocWriter')
    expect(memory.userPreferences.disabledExperts).toContain('DocWriter')
  })

  it('does not duplicate disabled experts', () => {
    let memory = initializeMemory(tempDir)
    memory = disableExpert(memory, 'DocWriter')
    memory = disableExpert(memory, 'DocWriter')
    expect(memory.userPreferences.disabledExperts.filter((e) => e === 'DocWriter')).toHaveLength(1)
  })

  it('adds custom keywords', () => {
    let memory = initializeMemory(tempDir)
    memory = addCustomKeywords(memory, 'CoderAgent', ['golang', 'grpc'])
    expect(memory.userPreferences.customKeywords['CoderAgent']).toEqual(['golang', 'grpc'])
  })

  it('merges custom keywords without duplicates', () => {
    let memory = initializeMemory(tempDir)
    memory = addCustomKeywords(memory, 'CoderAgent', ['golang', 'grpc'])
    memory = addCustomKeywords(memory, 'CoderAgent', ['grpc', 'protobuf'])
    expect(memory.userPreferences.customKeywords['CoderAgent']).toEqual(['golang', 'grpc', 'protobuf'])
  })
})

// ── Convention learning and merging ───────────────────────────────────────────

describe('convention learning', () => {
  it('learns a new convention', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')

    expect(memory.projectConventions).toHaveLength(1)
    expect(memory.projectConventions[0]).toEqual({
      pattern: 'fileNaming',
      convention: 'kebab-case',
      confidence: 1.0,
      source: 'user',
    })
  })

  it('user conventions override detected ones for same pattern', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'camelCase', 'detected')
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')

    expect(memory.projectConventions).toHaveLength(1)
    expect(memory.projectConventions[0].convention).toBe('kebab-case')
    expect(memory.projectConventions[0].source).toBe('user')
  })

  it('detected conventions do not override user-set conventions', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')
    memory = learnConvention(memory, 'fileNaming', 'camelCase', 'detected')

    expect(memory.projectConventions[0].convention).toBe('kebab-case')
  })

  it('learned conventions override detected ones', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'testPattern', '*.spec.*', 'detected')
    memory = learnConvention(memory, 'testPattern', '*.test.*', 'learned')

    expect(memory.projectConventions[0].convention).toBe('*.test.*')
  })

  it('assigns correct confidence by source', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'a', 'v1', 'user')
    memory = learnConvention(memory, 'b', 'v2', 'learned')
    memory = learnConvention(memory, 'c', 'v3', 'detected')

    const byPattern = (p: string) => memory.projectConventions.find((c) => c.pattern === p)
    expect(byPattern('a')!.confidence).toBe(1.0)
    expect(byPattern('b')!.confidence).toBe(0.7)
    expect(byPattern('c')!.confidence).toBe(0.5)
  })
})

describe('convention querying', () => {
  it('returns all conventions when no pattern specified', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')
    memory = learnConvention(memory, 'testPattern', '*.test.*', 'learned')

    expect(getConventions(memory)).toHaveLength(2)
  })

  it('filters conventions by pattern', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')
    memory = learnConvention(memory, 'testPattern', '*.test.*', 'learned')

    const naming = getConventions(memory, 'fileNaming')
    expect(naming).toHaveLength(1)
    expect(naming[0].convention).toBe('kebab-case')
  })

  it('returns empty for unknown pattern', () => {
    const memory = initializeMemory(tempDir)
    expect(getConventions(memory, 'nonexistent')).toHaveLength(0)
  })
})

describe('convention merging with detected', () => {
  it('overlays learned conventions on detected ones', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')
    memory = learnConvention(memory, 'testPattern', '*.test.*', 'learned')

    const detected: ProjectConventions = {
      fileNaming: 'camelCase',
      testPattern: '*.spec.*',
      componentPattern: 'PascalCase',
      stateManagement: 'redux',
      errorHandling: 'try-catch',
      importStyle: 'esm',
    }

    const merged = mergeWithDetected(memory, detected)

    expect(merged.fileNaming).toBe('kebab-case') // overridden by user
    expect(merged.testPattern).toBe('*.test.*') // overridden by learned
    expect(merged.componentPattern).toBe('PascalCase') // unchanged
    expect(merged.stateManagement).toBe('redux') // unchanged
  })

  it('does not modify the original detected conventions', () => {
    let memory = initializeMemory(tempDir)
    memory = learnConvention(memory, 'fileNaming', 'kebab-case', 'user')

    const detected: ProjectConventions = {
      fileNaming: 'camelCase',
      testPattern: '*.spec.*',
      componentPattern: 'PascalCase',
      stateManagement: 'redux',
      errorHandling: 'try-catch',
      importStyle: 'esm',
    }

    mergeWithDetected(memory, detected)
    expect(detected.fileNaming).toBe('camelCase')
  })

  it('does not merge when no conventions are learned', () => {
    const memory = initializeMemory(tempDir)
    const detected: ProjectConventions = {
      fileNaming: 'camelCase',
      testPattern: '*.spec.*',
      componentPattern: 'PascalCase',
      stateManagement: 'redux',
      errorHandling: 'try-catch',
      importStyle: 'esm',
    }

    const merged = mergeWithDetected(memory, detected)
    expect(merged).toEqual(detected)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty memory gracefully', () => {
    const memory = initializeMemory(tempDir)

    expect(getDecisionsByExpert(memory, 'any')).toEqual([])
    expect(getDecisionsByOutcome(memory, 'success')).toEqual([])
    expect(getRecentDecisions(memory, 5)).toEqual([])
    expect(getRoutingAccuracy(memory)).toEqual({ total: 0, correct: 0, accuracy: 1 })
    expect(getLearnedWeights(memory)).toEqual({})
    expect(suggestRoutingAdjustments(memory)).toEqual([])
    expect(getConventions(memory)).toEqual([])
  })

  it('loads fresh memory when file does not exist', async () => {
    const memory = await loadMemory(tempDir)
    expect(memory.projectRoot).toBe(tempDir)
    expect(memory.decisions).toEqual([])
  })

  it('handles corrupt JSON gracefully', async () => {
    const dir = join(tempDir, '.opencode')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '.expert-memory.json'), '{ not valid json !!!', 'utf-8')

    const memory = await loadMemory(tempDir)
    expect(memory.projectRoot).toBe(tempDir)
    expect(memory.decisions).toEqual([])
  })

  it('handles empty JSON file gracefully', async () => {
    const dir = join(tempDir, '.opencode')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '.expert-memory.json'), '', 'utf-8')

    const memory = await loadMemory(tempDir)
    expect(memory.projectRoot).toBe(tempDir)
    expect(memory.decisions).toEqual([])
  })

  it('generates unique decision IDs', () => {
    let memory = initializeMemory(tempDir)
    const ids = new Set<string>()

    for (let i = 0; i < 50; i++) {
      memory = recordDecision(memory, {
        expertId: 'CoderAgent',
        objective: `task-${i}`,
        approach: 'approach',
        outcome: 'success',
        context: {},
        learnings: [],
      })
      ids.add(memory.decisions[memory.decisions.length - 1].id)
    }

    expect(ids.size).toBe(50)
  })

  it('handles special characters in objectives and learnings', () => {
    let memory = initializeMemory(tempDir)
    memory = recordDecision(memory, {
      expertId: 'CoderAgent',
      objective: 'handle "quotes" and <angle> & ampersands',
      approach: 'escape them with \\backslash',
      outcome: 'success',
      context: { path: 'src/utils/🚀.ts' },
      learnings: ['Use JSON.stringify for special chars', 'Handle unicode: àéîõü'],
    })

    expect(memory.decisions[0].objective).toContain('"quotes"')
    expect(memory.decisions[0].context['path']).toBe('src/utils/🚀.ts')
  })

  it('handles large memory structures', () => {
    let memory = initializeMemory(tempDir)

    for (let i = 0; i < 100; i++) {
      memory = recordDecision(memory, {
        expertId: `Expert${i % 5}`,
        objective: `objective-${i}`,
        approach: `approach-${i}`,
        outcome: i % 3 === 0 ? 'success' : i % 3 === 1 ? 'failure' : 'partial',
        context: {},
        learnings: [`learning-${i}`],
      })
      memory = recordRouting(memory, {
        objective: `objective-${i}`,
        routedTo: `Expert${i % 5}`,
        confidence: 0.5 + (i % 50) / 100,
        wasCorrect: i % 4 !== 0,
      })
    }

    expect(memory.decisions).toHaveLength(100)
    expect(memory.routingHistory).toHaveLength(100)

    const recent = getRecentDecisions(memory, 5)
    expect(recent).toHaveLength(5)

    const weights = getLearnedWeights(memory)
    expect(Object.keys(weights).length).toBeGreaterThan(0)
  })
})

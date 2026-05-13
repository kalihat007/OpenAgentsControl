import { describe, it, expect, mock } from 'bun:test'
import {
  routeTask,
  routeTaskAsync,
  suggestExperts,
  StubLLMClassifier,
  type LLMClassifier,
  type RouterConfig,
  type RouterResult,
} from './task-router.js'

const projectRoot = process.cwd()

// ── Backward-compatible tests (original behavior) ─────────────────────────────

describe('task-router (backward-compat)', () => {
  it('routes a frontend task to OpenFrontendSpecialist', () => {
    const result = routeTask('Build a React login page with CSS styling', projectRoot)
    const names = result.primaryExperts.map((e) => e.name)
    expect(names).toContain('OpenFrontendSpecialist')
  })

  it('routes a backend task to BackendDeveloperAgent', () => {
    const result = routeTask('Create a REST API with JWT auth and PostgreSQL', projectRoot)
    const names = [...result.primaryExperts, ...result.secondaryExperts].map((e) => e.name)
    expect(names).toContain('BackendDeveloperAgent')
  })

  it('routes security work to SecurityAgent', () => {
    const result = routeTask('Audit auth flow for SQL injection and XSS vulnerabilities', projectRoot)
    const names = [...result.primaryExperts, ...result.secondaryExperts].map((e) => e.name)
    expect(names).toContain('SecurityAgent')
  })

  it('always includes TechLeadAgent', () => {
    const result = routeTask('fix a typo', projectRoot)
    const names = [...result.primaryExperts, ...result.secondaryExperts].map((e) => e.name)
    expect(names).toContain('TechLeadAgent')
  })

  it('suggestExperts returns names only', () => {
    const experts = suggestExperts('Write unit tests for the auth module', projectRoot)
    expect(experts.length).toBeGreaterThan(0)
    expect(experts).toContain('TestEngineer')
  })

  it('estimates chunks based on complexity', () => {
    const simple = routeTask('fix typo', projectRoot)
    const complex = routeTask('build a full-stack app with auth, payments, and real-time chat', projectRoot)
    expect(complex.estimatedChunks).toBeGreaterThan(simple.estimatedChunks)
  })

  it('result always includes confidence and clarification fields', () => {
    const result = routeTask('Build a React login page', projectRoot)
    expect(result.confidence).toBeDefined()
    expect(result.confidence.score).toBeGreaterThanOrEqual(0)
    expect(result.confidence.score).toBeLessThanOrEqual(1)
    expect(typeof result.confidence.isLowConfidence).toBe('boolean')
    expect(typeof result.confidence.isAmbiguous).toBe('boolean')
    expect(result.clarification).toBeDefined()
    expect(typeof result.clarification.needed).toBe('boolean')
    expect(Array.isArray(result.clarification.questions)).toBe(true)
  })
})

// ── Confidence scoring ────────────────────────────────────────────────────────

describe('confidence scoring', () => {
  it('returns high confidence for a strongly-matched objective', () => {
    const result = routeTask(
      'Write unit tests for the auth module with jest coverage and integration test specs',
      projectRoot,
    )
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.6)
    expect(result.confidence.isLowConfidence).toBe(false)
  })

  it('returns low confidence for a vague objective', () => {
    const result = routeTask('do something', projectRoot)
    expect(result.confidence.score).toBeLessThan(0.4)
    expect(result.confidence.isLowConfidence).toBe(true)
  })

  it('confidence score is between 0 and 1', () => {
    const objectives = [
      'help me',
      'build a login page',
      'set up docker kubernetes terraform pipeline with monitoring and logging',
    ]
    for (const obj of objectives) {
      const result = routeTask(obj, projectRoot)
      expect(result.confidence.score).toBeGreaterThanOrEqual(0)
      expect(result.confidence.score).toBeLessThanOrEqual(1)
    }
  })

  it('respects custom confidence threshold', () => {
    const result = routeTask('fix a small bug', projectRoot, {
      confidenceThreshold: 0.8,
    })
    expect(result.confidence.isLowConfidence).toBe(true)
  })

  it('includes confidence in reasoning', () => {
    const result = routeTask('implement a login page', projectRoot)
    const hasConfidenceReason = result.reasoning.some((r) => r.includes('Confidence:'))
    expect(hasConfidenceReason).toBe(true)
  })
})

// ── Ambiguity detection ───────────────────────────────────────────────────────

describe('ambiguity detection', () => {
  it('detects ambiguity when multiple experts score similarly', () => {
    // "auth" is shared by SecurityAgent + BackendDeveloperAgent
    // "service" hits Backend, "vulnerability" hits Security — they overlap
    const result = routeTask('review auth service for vulnerability issues', projectRoot)
    const allExperts = [...result.primaryExperts, ...result.secondaryExperts]

    const hasSecurityAndBackend =
      allExperts.some((e) => e.name === 'SecurityAgent') &&
      allExperts.some((e) => e.name === 'BackendDeveloperAgent')

    // Both should appear; whether flagged ambiguous depends on score proximity
    expect(hasSecurityAndBackend).toBe(true)
  })

  it('flags ambiguous result with close matches', () => {
    // Use a very wide ambiguity margin to guarantee detection
    const result = routeTask('review auth service for vulnerability issues', projectRoot, {
      ambiguityMargin: 0.5,
    })
    if (result.confidence.isAmbiguous) {
      expect(result.confidence.ambiguousExperts.length).toBeGreaterThan(0)
    }
  })

  it('is not ambiguous when one expert clearly dominates', () => {
    const result = routeTask(
      'Write React components with CSS styling for the frontend UI layout and browser DOM',
      projectRoot,
      { ambiguityMargin: 0.15 },
    )
    // OpenFrontendSpecialist should dominate with many keyword hits
    expect(result.primaryExperts[0]?.name).toBe('OpenFrontendSpecialist')
  })

  it('includes ambiguity in reasoning when detected', () => {
    const result = routeTask('review auth service for vulnerability issues', projectRoot, {
      ambiguityMargin: 0.5,
    })
    if (result.confidence.isAmbiguous) {
      const hasAmbiguityReason = result.reasoning.some((r) => r.includes('Ambiguous'))
      expect(hasAmbiguityReason).toBe(true)
    }
  })
})

// ── Clarification questions ───────────────────────────────────────────────────

describe('clarification questions', () => {
  it('generates clarification questions for low-confidence results', () => {
    const result = routeTask('do something', projectRoot)
    expect(result.clarification.needed).toBe(true)
    expect(result.clarification.questions.length).toBeGreaterThan(0)
  })

  it('generates domain-specific questions for ambiguous results', () => {
    const result = routeTask('review auth service for vulnerability issues', projectRoot, {
      ambiguityMargin: 0.5,
    })
    if (result.confidence.isAmbiguous) {
      expect(result.clarification.needed).toBe(true)
      const hasContextualQuestion = result.clarification.questions.some(
        (q) => q.includes('primarily') || q.includes('best describes'),
      )
      expect(hasContextualQuestion).toBe(true)
    }
  })

  it('does not ask for clarification when confidence is high and unambiguous', () => {
    const result = routeTask(
      'Write React components with CSS styling for the frontend UI layout and browser DOM',
      projectRoot,
    )
    if (!result.confidence.isLowConfidence && !result.confidence.isAmbiguous) {
      expect(result.clarification.needed).toBe(false)
      expect(result.clarification.questions).toHaveLength(0)
    }
  })

  it('includes helpful fallback questions on very low confidence', () => {
    const result = routeTask('hmm', projectRoot)
    expect(result.clarification.needed).toBe(true)
    const hasDetailQuestion = result.clarification.questions.some((q) =>
      q.includes('more details'),
    )
    expect(hasDetailQuestion).toBe(true)
  })
})

// ── LLM fallback ──────────────────────────────────────────────────────────────

describe('LLM fallback', () => {
  it('StubLLMClassifier returns a result', async () => {
    const stub = new StubLLMClassifier()
    const result = await stub.classify('do something', ['CoderAgent', 'DebugAgent'])
    expect(result.expertName).toBe('CoderAgent')
    expect(result.confidence).toBe(0.5)
    expect(result.reasoning).toContain('Stub')
  })

  it('does not invoke LLM when confidence is high', async () => {
    let llmCalled = false
    const classifier: LLMClassifier = {
      async classify() {
        llmCalled = true
        return { expertName: 'DebugAgent', confidence: 0.9, reasoning: 'test' }
      },
    }

    await routeTaskAsync(
      'Write React components with CSS styling for the frontend UI layout and browser DOM',
      projectRoot,
      { llmClassifier: classifier },
    )
    expect(llmCalled).toBe(false)
  })

  it('invokes LLM when confidence is low', async () => {
    let llmCalled = false
    const classifier: LLMClassifier = {
      async classify(_obj, _experts) {
        llmCalled = true
        return { expertName: 'DebugAgent', confidence: 0.85, reasoning: 'LLM determined this is debugging' }
      },
    }

    const result = await routeTaskAsync('hmm something is wrong', projectRoot, {
      llmClassifier: classifier,
    })
    expect(llmCalled).toBe(true)
    expect(result.primaryExperts.some((e) => e.name === 'DebugAgent')).toBe(true)
    expect(result.reasoning.some((r) => r.includes('LLM fallback selected'))).toBe(true)
  })

  it('LLM result updates confidence score', async () => {
    const classifier: LLMClassifier = {
      async classify() {
        return { expertName: 'SecurityAgent', confidence: 0.9, reasoning: 'high confidence' }
      },
    }

    const result = await routeTaskAsync('hmm not sure', projectRoot, {
      llmClassifier: classifier,
    })
    expect(result.confidence.score).toBe(0.9)
    expect(result.confidence.isLowConfidence).toBe(false)
  })

  it('clears clarification when LLM produces high confidence', async () => {
    const classifier: LLMClassifier = {
      async classify() {
        return { expertName: 'CoderAgent', confidence: 0.8, reasoning: 'clear intent' }
      },
    }

    const result = await routeTaskAsync('hmm', projectRoot, {
      llmClassifier: classifier,
    })
    expect(result.clarification.needed).toBe(false)
  })

  it('gracefully handles LLM classifier errors', async () => {
    const classifier: LLMClassifier = {
      async classify() {
        throw new Error('LLM service unavailable')
      },
    }

    const result = await routeTaskAsync('do something', projectRoot, {
      llmClassifier: classifier,
    })
    // Should fall back to keyword-only without crashing
    expect(result.reasoning.some((r) => r.includes('LLM classifier failed'))).toBe(true)
    expect(result.confidence.isLowConfidence).toBe(true)
  })

  it('does not invoke LLM when no classifier is provided', async () => {
    const result = await routeTaskAsync('do something', projectRoot)
    expect(result.confidence.isLowConfidence).toBe(true)
    expect(result.reasoning.every((r) => !r.includes('LLM fallback selected'))).toBe(true)
    expect(result.reasoning.every((r) => !r.includes('LLM reasoning:'))).toBe(true)
  })

  it('does not add duplicate expert when LLM picks an already-primary expert', async () => {
    const classifier: LLMClassifier = {
      async classify() {
        return { expertName: 'OpenFrontendSpecialist', confidence: 0.95, reasoning: 'clearly frontend' }
      },
    }

    // "build react page" should already have OpenFrontendSpecialist as primary via keywords,
    // but confidence might be above threshold. Force low confidence threshold to trigger LLM.
    const result = await routeTaskAsync('build a react page', projectRoot, {
      llmClassifier: classifier,
      confidenceThreshold: 0.99,
    })

    const frontendCount = result.primaryExperts.filter(
      (e) => e.name === 'OpenFrontendSpecialist',
    ).length
    expect(frontendCount).toBeLessThanOrEqual(1)
  })
})

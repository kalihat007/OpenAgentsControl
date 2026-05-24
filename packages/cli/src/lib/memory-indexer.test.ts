import { describe, it, expect } from 'bun:test'
import {
  tokenize,
  extractKeywords,
  buildMemoryIndex,
  retrieveRelevantMemory,
  saveMemoryIndex,
  loadMemoryIndex,
} from './memory-indexer.js'
import type { TeamMemory } from './team-memory.js'
import type { QuestPattern } from './quest-feedback.js'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('tokenize / extractKeywords', () => {
  it('tokenizes and removes stopwords', () => {
    const text = 'The quick brown fox jumps over the a an and or but'
    const keywords = extractKeywords(text)
    expect(keywords).toContain('quick')
    expect(keywords).toContain('brown')
    expect(keywords).not.toContain('the')
    expect(keywords).not.toContain('and')
    expect(keywords).not.toContain('or')
  })

  it('handles kebab-case and snake_case', () => {
    const text = 'refactor user-auth-module and update_test_runner'
    const keywords = extractKeywords(text)
    expect(keywords.some((k) => k.includes('user'))).toBe(true)
    expect(keywords.some((k) => k.includes('auth'))).toBe(true)
    expect(keywords.some((k) => k.includes('runner'))).toBe(true)
  })

  it('deduplicates while preserving order', () => {
    const text = 'hello world hello world hello world'
    const keywords = extractKeywords(text)
    expect(keywords.filter((k) => k === 'hello').length).toBe(1)
    expect(keywords[0]).toBe('hello')
    expect(keywords[1]).toBe('world')
  })
})

describe('buildMemoryIndex', () => {
  function makeTeamMemory(): TeamMemory {
    return {
      version: '1',
      projectRoot: '/test',
      lessons: [
        {
          id: 'lesson-1',
          timestamp: '2026-01-01T00:00:00Z',
          category: 'convention',
          lesson: 'Always run tests before committing',
          verified: true,
          verificationCount: 3,
          lastConfirmed: '2026-01-02T00:00:00Z',
        },
      ],
      conventions: [
        {
          pattern: 'kebab-case-files',
          convention: 'Use kebab-case for file names',
          source: 'detected',
          confidence: 0.95,
          firstSeen: '2026-01-01T00:00:00Z',
          lastConfirmed: '2026-01-02T00:00:00Z',
        },
      ],
      validatedCommands: [],
      preferredWorkflows: [],
      recurringFailures: [
        {
          id: 'failure-1',
          pattern: 'missing await',
          failureSummary: 'Async functions called without await',
          occurrenceCount: 5,
          firstSeen: '2026-01-01T00:00:00Z',
          lastSeen: '2026-01-05T00:00:00Z',
          resolved: false,
          sourceQuestIds: ['q1'],
        },
      ],
      lastUpdated: '2026-01-01T00:00:00Z',
    }
  }

  function makePatterns(): QuestPattern[] {
    return [
      {
        patternId: 'pattern-1',
        objectiveKeywords: ['refactor', 'auth', 'module'],
        scenario: 'code_with_spec',
        expertSequence: ['CoderAgent'],
        taskCount: 1,
        outcome: 'success',
        durationMs: 120000,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]
  }

  it('indexes lessons, conventions, failures, and patterns', () => {
    const index = buildMemoryIndex('/test', makeTeamMemory(), makePatterns())
    expect(index.version).toBe('1')
    expect(index.entries.length).toBe(4)
    expect(index.entries.some((e) => e.type === 'lesson')).toBe(true)
    expect(index.entries.some((e) => e.type === 'convention')).toBe(true)
    expect(index.entries.some((e) => e.type === 'failure')).toBe(true)
    expect(index.entries.some((e) => e.type === 'pattern')).toBe(true)
  })

  it('builds keyword map for fast lookup', () => {
    const index = buildMemoryIndex('/test', makeTeamMemory(), makePatterns())
    expect(Object.keys(index.keywordMap).length).toBeGreaterThan(0)
    // 'tests' should appear in keyword map from the lesson
    expect(index.keywordMap['tests']?.length).toBeGreaterThan(0)
  })
})

describe('retrieveRelevantMemory', () => {
  function makeIndex() {
    const teamMemory: TeamMemory = {
      version: '1',
      projectRoot: '/test',
      lessons: [
        {
          id: 'lesson-1',
          timestamp: '2026-01-01T00:00:00Z',
          category: 'convention',
          lesson: 'Always run tests before committing',
          verified: true,
          verificationCount: 5,
          lastConfirmed: '2026-01-02T00:00:00Z',
        },
        {
          id: 'lesson-2',
          timestamp: '2026-01-01T00:00:00Z',
          category: 'risk',
          lesson: 'Check for missing await in async functions',
          verified: true,
          verificationCount: 3,
          lastConfirmed: '2026-01-03T00:00:00Z',
        },
      ],
      conventions: [],
      validatedCommands: [],
      preferredWorkflows: [],
      recurringFailures: [
        {
          id: 'failure-1',
          pattern: 'missing await',
          failureSummary: 'Async functions called without await',
          occurrenceCount: 5,
          firstSeen: '2026-01-01T00:00:00Z',
          lastSeen: '2026-01-05T00:00:00Z',
          resolved: false,
          sourceQuestIds: ['q1'],
        },
      ],
      lastUpdated: '2026-01-01T00:00:00Z',
    }
    return buildMemoryIndex('/test', teamMemory, [])
  }

  it('retrieves relevant lessons by keyword overlap', () => {
    const index = makeIndex()
    const result = retrieveRelevantMemory(index, 'How do I handle async functions?', { maxResults: 3 })
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.entries.some((e) => e.source.includes('risk') || e.source.includes('failure'))).toBe(true)
  })

  it('filters by type', () => {
    const index = makeIndex()
    const result = retrieveRelevantMemory(index, 'tests and commits', { maxResults: 5, typeFilter: ['lesson'] })
    expect(result.entries.every((e) => e.type === 'lesson')).toBe(true)
  })

  it('returns empty for no match', () => {
    const index = makeIndex()
    const result = retrieveRelevantMemory(index, 'quantum physics mars rover', { maxResults: 5 })
    expect(result.entries.length).toBe(0)
  })

  it('returns empty for empty query', () => {
    const index = makeIndex()
    const result = retrieveRelevantMemory(index, 'the a an')
    expect(result.entries.length).toBe(0)
  })
})

describe('saveMemoryIndex / loadMemoryIndex', () => {
  const testDir = join(tmpdir(), 'oac-memory-index-test-' + Date.now())

  it('round-trips index to disk', async () => {
    await mkdir(testDir, { recursive: true })
    const teamMemory: TeamMemory = {
      version: '1',
      projectRoot: testDir,
      lessons: [],
      conventions: [],
      validatedCommands: [],
      preferredWorkflows: [],
      recurringFailures: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    }
    const index = buildMemoryIndex(testDir, teamMemory, [])
    await saveMemoryIndex(testDir, index)

    const loaded = await loadMemoryIndex(testDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe('1')
    expect(loaded!.entries.length).toBe(index.entries.length)
  })

  it('returns null for missing index', async () => {
    const loaded = await loadMemoryIndex(join(testDir, 'nonexistent'))
    expect(loaded).toBeNull()
  })
})

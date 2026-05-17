import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { extractMemoryFromEvents, extractQuestMemory, mergeExtractedMemory } from './memory-extraction.js'
import { appendQuestEvent, persistQuestRun } from './quest-run.js'
import { loadTeamMemory } from './team-memory.js'
import type { ReconciledQuestRun } from './quest-reconciler.js'

describe('memory-extraction', () => {
  describe('extractMemoryFromEvents', () => {
    it('extracts validated commands from passing validation events', () => {
      const events = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'validation' as const,
          data: {
            passed: true,
            checks: [
              { name: 'test', passed: true, command: 'bun test' },
              { name: 'build', passed: true, command: 'bun run build' },
            ],
          },
        },
      ]
      const memory = extractMemoryFromEvents(events, 'q1')
      expect(memory.validatedCommands).toHaveLength(2)
      expect(memory.validatedCommands[0]).toMatchObject({ command: 'bun test', name: 'test' })
    })

    it('ignores failed checks', () => {
      const events = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'validation' as const,
          data: {
            passed: false,
            checks: [
              { name: 'test', passed: false, command: 'bun test' },
            ],
          },
        },
      ]
      const memory = extractMemoryFromEvents(events, 'q1')
      expect(memory.validatedCommands).toHaveLength(0)
    })

    it('extracts validated commands from reconciler validation result shape', () => {
      const events = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'validation' as const,
          data: {
            result: {
              overallPassed: true,
              checks: [
                { name: 'typecheck', passed: true, command: 'npm run typecheck' },
              ],
            },
          },
        },
      ]
      const memory = extractMemoryFromEvents(events, 'q1')
      expect(memory.validatedCommands[0]).toMatchObject({ command: 'npm run typecheck' })
    })

    it('extracts import style conventions from file_change events', () => {
      const events = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'file_change' as const,
          data: {
            path: 'src/lib/utils.ts',
            content: 'import { foo } from "./foo"\nimport { bar } from "./bar"',
          },
        },
      ]
      const memory = extractMemoryFromEvents(events, 'q1')
      expect(memory.conventions).toHaveLength(2) // import_style + file_naming
      const importConv = memory.conventions.find((c) => c.category === 'import_style')
      expect(importConv?.pattern).toBe('named')
    })

    it('extracts failure patterns from incidents', () => {
      const events = [
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'incident.created' as const,
          data: { category: 'runtime_crash', severity: 'high' },
        },
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'incident.created' as const,
          data: { category: 'runtime_crash', severity: 'high' },
        },
        {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'incident.created' as const,
          data: { category: 'verification_failure', severity: 'high' },
        },
      ]
      const memory = extractMemoryFromEvents(events, 'q1')
      expect(memory.failurePatterns).toHaveLength(2)
      const crashPattern = memory.failurePatterns.find((p) => p.category === 'runtime_crash')
      expect(crashPattern?.count).toBe(2)
    })
  })

  describe('mergeExtractedMemory', () => {
    it('deduplicates validated commands', () => {
      const existing = {
        validatedCommands: [{ command: 'bun test', name: 'test' }],
      }
      const extracted = {
        validatedCommands: [
          { command: 'bun test', name: 'test', sourceQuestId: 'q1', extractedAt: '2026-01-01' },
          { command: 'bun run build', name: 'build', sourceQuestId: 'q1', extractedAt: '2026-01-01' },
        ],
        conventions: [],
        failurePatterns: [],
      }
      const merged = mergeExtractedMemory(existing, extracted)
      expect(merged.validatedCommands).toHaveLength(2)
    })

    it('merges failure pattern counts', () => {
      const existing = {
        recurringFailures: [{ pattern: 'Incident category "runtime_crash" observed 1 time(s)', count: 1 }],
      }
      const extracted = {
        validatedCommands: [],
        conventions: [],
        failurePatterns: [
          { category: 'runtime_crash', pattern: 'Incident category "runtime_crash" observed 2 time(s)', count: 2, sourceQuestId: 'q2', extractedAt: '2026-01-01' },
        ],
      }
      const merged = mergeExtractedMemory(existing, extracted)
      expect(merged.recurringFailures).toHaveLength(1)
      expect(merged.recurringFailures[0].count).toBe(3)
    })
  })

  describe('extractQuestMemory', () => {
    it('promotes verified commands and keeps conventions as candidates', async () => {
      const projectRoot = await mkdtemp(join(tmpdir(), 'oac-memory-wrapper-'))
      try {
        const quest = baseQuest()
        await persistQuestRun(projectRoot, quest)
        await appendQuestEvent(projectRoot, quest.questId, {
          timestamp: '2026-01-01T00:00:00Z',
          type: 'validation',
          data: {
            result: {
              timestamp: '2026-01-01T00:00:00Z',
              checks: [{ name: 'test', command: 'bun test', passed: true }],
              overallPassed: true,
              summary: '1/1 checks passed',
            },
          },
        })
        await appendQuestEvent(projectRoot, quest.questId, {
          timestamp: '2026-01-01T00:00:01Z',
          type: 'file_change',
          data: {
            path: 'src/sample-file.ts',
            content: 'import { sample } from "./sample"',
          },
        })

        const result = await extractQuestMemory(projectRoot, quest)
        const memory = await loadTeamMemory(projectRoot)
        const candidates = await readFile(join(projectRoot, '.oac', 'runs', quest.questId, 'memory-candidates.jsonl'), 'utf-8')

        expect(result.promotedCommands).toBe(1)
        expect(memory.validatedCommands[0]?.command).toBe('bun test')
        expect(memory.lessons[0]?.verified).toBe(true)
        expect(candidates).toContain('"verified":false')
      } finally {
        await rm(projectRoot, { recursive: true, force: true })
      }
    })
  })
})

function baseQuest(): ReconciledQuestRun {
  return {
    version: '8',
    questId: 'quest-memory-wrapper',
    runId: 'quest-memory-wrapper',
    objective: 'memory wrapper',
    scenario: 'code_with_spec',
    state: 'COMPLETE',
    intensity: 'standard',
    trustLabel: 'tested',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    experts: [],
    tasks: [],
    acceptanceCriteria: [],
    artifacts: {
      runDir: '.oac/runs/quest-memory-wrapper',
      quest: 'quest.json',
      spec: 'spec.json',
    },
    nextSuggestedAction: 'complete',
    runtimes: {
      opencode: { command: 'opencode', resumePrompt: 'resume' },
      kimi: { command: 'kimi', resumePrompt: 'resume' },
      claude: { command: 'claude', resumePrompt: 'resume' },
    },
    changedFiles: [],
    amendments: [],
    handoffs: [],
    runtimeProgress: {},
    incidents: [],
  }
}

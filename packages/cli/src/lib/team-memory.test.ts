import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureTeamMemory,
  getRelevantLessons,
  initializeTeamMemory,
  loadTeamMemory,
  recordLesson,
  recordRecurringFailure,
  recordValidatedCommand,
  recordWorkflowUsage,
  saveTeamMemory,
} from './team-memory.js'

describe('team-memory', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-team-memory-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('creates and persists durable team memory', async () => {
    let memory = initializeTeamMemory(projectRoot)
    memory = recordLesson(memory, {
      category: 'workflow',
      lesson: 'Run bun test from packages/cli for CLI changes',
      sourceQuestId: 'quest-test',
      verified: true,
    })

    await saveTeamMemory(memory)
    const loaded = await loadTeamMemory(projectRoot)

    expect(loaded.version).toBe('1')
    expect(loaded.lessons[0]?.lesson).toContain('bun test')
  })

  it('deduplicates repeated lessons and increments verification count', () => {
    let memory = initializeTeamMemory(projectRoot)
    memory = recordLesson(memory, {
      category: 'command',
      lesson: 'Use bun run typecheck before release',
      verified: true,
    })
    const first = memory.lessons[0]!
    memory = recordLesson(memory, {
      category: 'command',
      lesson: 'Use bun run typecheck before release',
      verified: true,
    })
    const second = memory.lessons[0]!

    expect(memory.lessons).toHaveLength(1)
    expect(second.id).toBe(first.id)
    expect(second.verificationCount).toBe(2)
  })

  it('records validated commands across working directories', () => {
    let memory = initializeTeamMemory(projectRoot)
    memory = recordValidatedCommand(memory, 'bun test', 'CLI package', ['packages/cli'], 'quest-a')
    memory = recordValidatedCommand(memory, 'bun test', 'CLI package', ['packages/cli', 'packages/runtime'], 'quest-b')
    const command = memory.validatedCommands[0]!

    expect(memory.validatedCommands).toHaveLength(1)
    expect(command.worksIn).toEqual(['packages/cli', 'packages/runtime'])
    expect(command.verifiedByQuestId).toBe('quest-b')
  })

  it('tracks recurring failures by pattern', () => {
    let memory = initializeTeamMemory(projectRoot)
    memory = recordRecurringFailure(memory, 'typecheck import error', 'Missing export', 'quest-a')
    memory = recordRecurringFailure(memory, 'typecheck import error', 'Missing export again', 'quest-b')
    const failure = memory.recurringFailures[0]!

    expect(memory.recurringFailures).toHaveLength(1)
    expect(failure.occurrenceCount).toBe(2)
    expect(failure.sourceQuestIds).toEqual(['quest-a', 'quest-b'])
  })

  it('retrieves relevant lessons and workflows with deterministic keyword matching', () => {
    let memory = initializeTeamMemory(projectRoot)
    memory = recordLesson(memory, {
      category: 'workflow',
      lesson: 'For quest status work, verify JSON output with bun test',
      verified: true,
    })
    memory = recordWorkflowUsage(memory, 'wf-status', 'Quest status release workflow', [
      'Add JSON tests',
      'Run typecheck',
    ])

    expect(getRelevantLessons(memory, 'add quest status json')[0]?.lesson).toContain('JSON output')
    expect(memory.preferredWorkflows[0]?.id).toBe('wf-status')
  })

  it('ensures a team memory file exists', async () => {
    await ensureTeamMemory(projectRoot)
    const loaded = await loadTeamMemory(projectRoot)

    expect(loaded.projectRoot).toBe(projectRoot)
  })
})

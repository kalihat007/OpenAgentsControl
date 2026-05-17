import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addAgentBlocker,
  addAgentDecision,
  addAgentDiscovery,
  addAgentNote,
  createAgentMemoryBundle,
  ensureAgentMemory,
  formatAllAgentMemoryForPrompt,
  formatAgentMemoryForPrompt,
  loadAgentMemory,
  resolveAgentBlocker,
  saveAgentMemory,
} from './agent-memory.js'
import type { QuestRunTask } from './quest-run.js'

const tasks: QuestRunTask[] = [
  {
    id: 'task-001',
    title: 'Plan work',
    status: 'pending',
    expert: 'TechLeadAgent',
    dependsOn: [],
    acceptanceCriteria: [],
  },
  {
    id: 'task-002',
    title: 'Implement work',
    status: 'pending',
    expert: 'DeveloperAgent',
    dependsOn: ['task-001'],
    acceptanceCriteria: [],
  },
]

describe('agent-memory', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-agent-memory-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('creates one memory record per assigned expert', () => {
    const bundle = createAgentMemoryBundle('quest-test', tasks)

    expect(Object.keys(bundle.agents).sort()).toEqual(['DeveloperAgent', 'TechLeadAgent'])
    expect(bundle.agents.TechLeadAgent?.taskIds).toEqual(['task-001'])
    expect(bundle.agents.DeveloperAgent?.taskIds).toEqual(['task-002'])
  })

  it('saves, loads, and preserves memory records', async () => {
    let bundle = createAgentMemoryBundle('quest-test', tasks)
    bundle = addAgentNote(bundle, 'TechLeadAgent', 'Use bounded chunks', 'task-001')
    bundle = addAgentDecision(bundle, 'TechLeadAgent', 'Keep v6 additive', 'Avoid breaking v5', 'task-001')
    bundle = addAgentDiscovery(
      bundle,
      'DeveloperAgent',
      'quest-status already exists',
      'task-002',
      'packages/cli/src/commands/quest-status.ts',
    )

    await saveAgentMemory(projectRoot, bundle)
    const loaded = await loadAgentMemory(projectRoot, 'quest-test')

    expect(loaded.agents.TechLeadAgent?.notes[0]?.text).toBe('Use bounded chunks')
    expect(loaded.agents.DeveloperAgent?.filesTouched).toContain('packages/cli/src/commands/quest-status.ts')
  })

  it('ensures missing memory and merges new task assignments', async () => {
    await ensureAgentMemory(projectRoot, 'quest-test', tasks.slice(0, 1))
    await ensureAgentMemory(projectRoot, 'quest-test', tasks)

    const raw = await readFile(join(projectRoot, '.oac', 'runs', 'quest-test', 'agent-memory.json'), 'utf-8')
    const loaded = JSON.parse(raw)

    expect(Object.keys(loaded.agents).sort()).toEqual(['DeveloperAgent', 'TechLeadAgent'])
  })

  it('tracks and resolves blockers', () => {
    let bundle = createAgentMemoryBundle('quest-test', tasks)
    bundle = addAgentBlocker(bundle, 'DeveloperAgent', 'Need test command', 'task-002')

    bundle = resolveAgentBlocker(bundle, 'DeveloperAgent', 0, 'Use bun test')
    const resolved = bundle.agents.DeveloperAgent?.blockers[0]

    expect(resolved?.resolved).toBe(true)
    expect(resolved?.resolution).toBe('Use bun test')
  })

  it('formats memory for runtime prompt continuity without LLM routing', () => {
    let bundle = createAgentMemoryBundle('quest-test', tasks)
    bundle = addAgentNote(bundle, 'TechLeadAgent', 'Continue from status JSON', 'task-001')

    const prompt = formatAllAgentMemoryForPrompt(bundle)

    expect(prompt).toContain('Agent Memory Snapshot')
    expect(prompt).toContain('Continue from status JSON')
    expect(prompt).toContain('do not route to another LLM')
    expect(formatAgentMemoryForPrompt(bundle, 'TechLeadAgent')).toContain('Continue from status JSON')
  })
})

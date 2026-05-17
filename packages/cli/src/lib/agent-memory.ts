/**
 * Agent Memory — per-expert task-local context for a single Quest.
 *
 * Persisted to `.oac/runs/{quest-id}/agent-memory.json`.
 * Each runtime reads this on resume and writes updates on completion.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createLogger } from './logger.js'
import type { RuntimeType } from './runtime-bridge.js'
import type { QuestRunTask } from './quest-run.js'

const log = createLogger('agent-memory')
const AGENT_MEMORY_FILENAME = 'agent-memory.json'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentNote {
  timestamp: string
  text: string
  taskId?: string
}

export interface AgentDecision {
  timestamp: string
  decision: string
  rationale: string
  taskId?: string
  outcome?: 'pending' | 'validated' | 'reverted'
}

export interface AgentBlocker {
  timestamp: string
  description: string
  taskId?: string
  resolved: boolean
  resolution?: string
}

export interface AgentDiscovery {
  timestamp: string
  discovery: string
  taskId?: string
  filePath?: string
}

export interface AgentMemory {
  agentId: string
  runtime?: RuntimeType
  taskIds: string[]
  notes: AgentNote[]
  decisions: AgentDecision[]
  blockers: AgentBlocker[]
  discoveries: AgentDiscovery[]
  filesTouched: string[]
  conventionsLearned: string[]
}

export interface AgentMemoryBundle {
  questId: string
  version: '1'
  agents: Record<string, AgentMemory>
  lastUpdated: string
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function initializeAgentMemoryBundle(questId: string): AgentMemoryBundle {
  return {
    questId,
    version: '1',
    agents: {},
    lastUpdated: new Date().toISOString(),
  }
}

export function createAgentMemoryBundle(
  questId: string,
  tasks: QuestRunTask[],
): AgentMemoryBundle {
  const bundle = initializeAgentMemoryBundle(questId)
  for (const task of tasks) {
    const agent = ensureAgentInBundle(bundle, task.expert)
    if (!agent.taskIds.includes(task.id)) {
      agent.taskIds.push(task.id)
    }
  }
  return bundle
}

export async function loadAgentMemory(
  projectRoot: string,
  questId: string,
): Promise<AgentMemoryBundle> {
  const path = join(projectRoot, '.oac', 'runs', questId, AGENT_MEMORY_FILENAME)
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as AgentMemoryBundle
    log.debug('Agent memory loaded', {
      questId,
      agents: Object.keys(parsed.agents).length,
    })
    return parsed
  } catch (err) {
    if (err instanceof SyntaxError) {
      log.warn('Corrupt agent memory — reinitializing', { questId })
    } else {
      log.debug('No existing agent memory — initializing fresh', { questId })
    }
    return initializeAgentMemoryBundle(questId)
  }
}

export async function saveAgentMemory(
  projectRoot: string,
  bundle: AgentMemoryBundle,
): Promise<void> {
  const path = join(projectRoot, '.oac', 'runs', bundle.questId, AGENT_MEMORY_FILENAME)
  await mkdir(dirname(path), { recursive: true })

  const updated: AgentMemoryBundle = {
    ...bundle,
    lastUpdated: new Date().toISOString(),
  }

  await writeFile(path, JSON.stringify(updated, null, 2) + '\n')
  log.debug('Agent memory saved', { questId: bundle.questId })
}

export async function ensureAgentMemory(
  projectRoot: string,
  questId: string,
  tasks: QuestRunTask[],
): Promise<AgentMemoryBundle> {
  const bundle = await loadAgentMemory(projectRoot, questId)
  for (const task of tasks) {
    const agent = ensureAgentInBundle(bundle, task.expert)
    if (!agent.taskIds.includes(task.id)) {
      agent.taskIds.push(task.id)
    }
  }
  await saveAgentMemory(projectRoot, bundle)
  return bundle
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

function ensureAgentInBundle(bundle: AgentMemoryBundle, agentId: string): AgentMemory {
  if (!bundle.agents[agentId]) {
    bundle.agents[agentId] = {
      agentId,
      taskIds: [],
      notes: [],
      decisions: [],
      blockers: [],
      discoveries: [],
      filesTouched: [],
      conventionsLearned: [],
    }
  }
  return bundle.agents[agentId]
}

export function addAgentNote(
  bundle: AgentMemoryBundle,
  agentId: string,
  text: string,
  taskId?: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  const note: AgentNote = {
    timestamp: new Date().toISOString(),
    text,
    taskId,
  }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, notes: [...agent.notes, note] },
    },
  }
}

export function addAgentDecision(
  bundle: AgentMemoryBundle,
  agentId: string,
  decision: string,
  rationale: string,
  taskId?: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  const entry: AgentDecision = {
    timestamp: new Date().toISOString(),
    decision,
    rationale,
    taskId,
    outcome: 'pending',
  }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, decisions: [...agent.decisions, entry] },
    },
  }
}

export function updateDecisionOutcome(
  bundle: AgentMemoryBundle,
  agentId: string,
  decisionIndex: number,
  outcome: AgentDecision['outcome'],
): AgentMemoryBundle {
  const agent = bundle.agents[agentId]
  if (!agent || decisionIndex < 0 || decisionIndex >= agent.decisions.length) {
    return bundle
  }
  const decisions = agent.decisions.slice()
  decisions[decisionIndex] = { ...decisions[decisionIndex], outcome }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, decisions },
    },
  }
}

export function addAgentBlocker(
  bundle: AgentMemoryBundle,
  agentId: string,
  description: string,
  taskId?: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  const blocker: AgentBlocker = {
    timestamp: new Date().toISOString(),
    description,
    taskId,
    resolved: false,
  }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, blockers: [...agent.blockers, blocker] },
    },
  }
}

export function resolveAgentBlocker(
  bundle: AgentMemoryBundle,
  agentId: string,
  blockerIndex: number,
  resolution: string,
): AgentMemoryBundle {
  const agent = bundle.agents[agentId]
  if (!agent || blockerIndex < 0 || blockerIndex >= agent.blockers.length) {
    return bundle
  }
  const blockers = agent.blockers.slice()
  blockers[blockerIndex] = { ...blockers[blockerIndex], resolved: true, resolution }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, blockers },
    },
  }
}

export function addAgentDiscovery(
  bundle: AgentMemoryBundle,
  agentId: string,
  discovery: string,
  taskId?: string,
  filePath?: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  const entry: AgentDiscovery = {
    timestamp: new Date().toISOString(),
    discovery,
    taskId,
    filePath,
  }
  const filesTouched = filePath && !agent.filesTouched.includes(filePath)
    ? [...agent.filesTouched, filePath]
    : agent.filesTouched

  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, discoveries: [...agent.discoveries, entry], filesTouched },
    },
  }
}

export function addAgentFile(
  bundle: AgentMemoryBundle,
  agentId: string,
  filePath: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  if (agent.filesTouched.includes(filePath)) {
    return bundle
  }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, filesTouched: [...agent.filesTouched, filePath] },
    },
  }
}

export function addAgentConvention(
  bundle: AgentMemoryBundle,
  agentId: string,
  convention: string,
): AgentMemoryBundle {
  const agent = ensureAgentInBundle(bundle, agentId)
  if (agent.conventionsLearned.includes(convention)) {
    return bundle
  }
  return {
    ...bundle,
    agents: {
      ...bundle.agents,
      [agentId]: { ...agent, conventionsLearned: [...agent.conventionsLearned, convention] },
    },
  }
}

// ── Formatting for prompts ────────────────────────────────────────────────────

export function formatAgentMemoryForPrompt(
  bundle: AgentMemoryBundle,
  agentId: string,
): string {
  const agent = bundle.agents[agentId]
  if (!agent) {
    return `<!-- No prior memory for ${agentId} -->`
  }

  const lines: string[] = [
    `## Agent Memory — ${agentId}`,
    '',
  ]

  if (agent.taskIds.length > 0) {
    lines.push(`### Task assignments: ${agent.taskIds.join(', ')}`)
    lines.push('')
  }

  if (agent.notes.length > 0) {
    lines.push('### Notes')
    for (const note of agent.notes.slice(-5)) {
      lines.push(`- ${note.text}${note.taskId ? ` (${note.taskId})` : ''}`)
    }
    lines.push('')
  }

  if (agent.decisions.length > 0) {
    lines.push('### Decisions')
    for (const d of agent.decisions.slice(-5)) {
      lines.push(`- ${d.decision} — ${d.rationale} [${d.outcome ?? 'pending'}]`)
    }
    lines.push('')
  }

  const openBlockers = agent.blockers.filter((b) => !b.resolved)
  if (openBlockers.length > 0) {
    lines.push('### Open Blockers')
    for (const b of openBlockers) {
      lines.push(`- ${b.description}${b.taskId ? ` (${b.taskId})` : ''}`)
    }
    lines.push('')
  }

  if (agent.discoveries.length > 0) {
    lines.push('### Recent Discoveries')
    for (const d of agent.discoveries.slice(-3)) {
      lines.push(`- ${d.discovery}${d.filePath ? ` — ${d.filePath}` : ''}`)
    }
    lines.push('')
  }

  if (agent.filesTouched.length > 0) {
    lines.push(`### Files touched: ${agent.filesTouched.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}

export function formatAllAgentMemoryForPrompt(bundle: AgentMemoryBundle): string {
  const agents = Object.values(bundle.agents)
  if (agents.length === 0) return ''

  const lines: string[] = [
    '# Agent Memory Snapshot',
    '',
    '> resume continuity: use the same user-selected runtime/model throughout.',
    '> do not route to another LLM or fallback model.',
    '',
  ]
  for (const agent of agents) {
    lines.push(formatAgentMemoryForPrompt(bundle, agent.agentId))
    lines.push('')
  }
  return lines.join('\n')
}

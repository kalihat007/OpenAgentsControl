/**
 * Expert Dialogue System — enables conversational interaction with individual experts.
 *
 * Developers can chat with a specific expert to refine understanding, ask questions,
 * or give guidance before/during execution. Each dialogue session tracks messages,
 * context, and expert persona, and supports summarization and persistence.
 *
 * All state management is immutable — every mutation returns a new object.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLogger } from './logger.js'
import type { ExpertDefinition } from './expert-definitions.js'

const log = createLogger('expert-dialogue')

const DIALOGUES_DIR = '.opencode/.dialogues'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DialogueMessage {
  id: string
  role: 'user' | 'expert' | 'system'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface DialogueContext {
  objective?: string
  relevantFiles: string[]
  codebaseContext?: string
  previousDecisions: string[]
  constraints: string[]
}

export interface DialogueSession {
  id: string
  expertId: string
  expertName: string
  messages: DialogueMessage[]
  context: DialogueContext
  state: 'active' | 'paused' | 'closed'
  startedAt: string
  lastActivityAt: string
}

export interface ExpertPersona {
  expertId: string
  name: string
  specialization: string
  tone: 'technical' | 'friendly' | 'concise'
  responseStyle: 'detailed' | 'brief' | 'code_focused'
  capabilities: string[]
}

export interface DialogueAction {
  type: 'clarify' | 'suggest' | 'implement' | 'review' | 'defer'
  target?: string
  content: string
}

export interface DialogueSummary {
  sessionId: string
  expertId: string
  keyDecisions: string[]
  agreedApproach?: string
  openQuestions: string[]
  actionItems: DialogueAction[]
}

export interface DialogueConfig {
  maxMessages: number
  autoSummarizeAfter: number
  includeCodeContext: boolean
  persistHistory: boolean
}

function emptyContext(): DialogueContext {
  return {
    relevantFiles: [],
    previousDecisions: [],
    constraints: [],
  }
}

function now(): string {
  return new Date().toISOString()
}

// ── Tone / style mapping ──────────────────────────────────────────────────────

const ROLE_TONE_MAP: Record<string, ExpertPersona['tone']> = {
  'tech-lead': 'concise',
  architect: 'technical',
  'product-manager': 'friendly',
  'content-creator': 'friendly',
  'investor-relations': 'friendly',
  'technical-writer': 'friendly',
  reviewer: 'concise',
}

const ROLE_STYLE_MAP: Record<string, ExpertPersona['responseStyle']> = {
  developer: 'code_focused',
  'frontend-developer': 'code_focused',
  'backend-developer': 'code_focused',
  'embedded-developer': 'code_focused',
  'test-engineer': 'code_focused',
  'devops-engineer': 'code_focused',
  'product-manager': 'brief',
  'technical-writer': 'detailed',
  architect: 'detailed',
  'hardware-architect': 'detailed',
  'compliance-engineer': 'detailed',
}

// ── Session management ────────────────────────────────────────────────────────

export function createDialogueSession(
  expertId: string,
  experts: ExpertDefinition[],
  context?: Partial<DialogueContext>,
  _config?: DialogueConfig,
): DialogueSession {
  const expert = experts.find((e) => e.id === expertId)
  if (!expert) {
    throw new Error(`Expert '${expertId}' not found in provided expert list`)
  }

  const ts = now()
  const session: DialogueSession = {
    id: randomUUID(),
    expertId: expert.id,
    expertName: expert.name,
    messages: [],
    context: { ...emptyContext(), ...context },
    state: 'active',
    startedAt: ts,
    lastActivityAt: ts,
  }

  log.debug('Dialogue session created', { id: session.id, expertId, expertName: expert.name })
  return session
}

export function closeDialogue(session: DialogueSession): DialogueSession {
  if (session.state === 'closed') return session

  return {
    ...session,
    state: 'closed',
    lastActivityAt: now(),
  }
}

export function pauseDialogue(session: DialogueSession): DialogueSession {
  if (session.state !== 'active') return session

  return {
    ...session,
    state: 'paused',
    lastActivityAt: now(),
  }
}

export function resumeDialogue(session: DialogueSession): DialogueSession {
  if (session.state !== 'paused') return session

  return {
    ...session,
    state: 'active',
    lastActivityAt: now(),
  }
}

// ── Messaging ─────────────────────────────────────────────────────────────────

function addMessage(
  session: DialogueSession,
  role: DialogueMessage['role'],
  content: string,
  metadata?: Record<string, unknown>,
): DialogueSession {
  if (session.state === 'closed') {
    log.warn('Attempted to add message to closed dialogue', { sessionId: session.id })
    return session
  }

  const message: DialogueMessage = {
    id: randomUUID(),
    role,
    content,
    timestamp: now(),
    metadata,
  }

  return {
    ...session,
    messages: [...session.messages, message],
    lastActivityAt: message.timestamp,
  }
}

export function addUserMessage(session: DialogueSession, content: string): DialogueSession {
  return addMessage(session, 'user', content)
}

export function addExpertMessage(
  session: DialogueSession,
  content: string,
  metadata?: Record<string, unknown>,
): DialogueSession {
  return addMessage(session, 'expert', content, metadata)
}

export function addSystemMessage(session: DialogueSession, content: string): DialogueSession {
  return addMessage(session, 'system', content)
}

export function getMessageHistory(
  session: DialogueSession,
  limit?: number,
): DialogueMessage[] {
  if (limit === undefined) return [...session.messages]
  return session.messages.slice(-limit)
}

export function getLastMessage(session: DialogueSession): DialogueMessage | undefined {
  return session.messages.length > 0
    ? session.messages[session.messages.length - 1]
    : undefined
}

// ── Expert persona ────────────────────────────────────────────────────────────

export function buildExpertPersona(expert: ExpertDefinition): ExpertPersona {
  const tone = ROLE_TONE_MAP[expert.role] ?? 'technical'
  const responseStyle = ROLE_STYLE_MAP[expert.role] ?? 'detailed'

  return {
    expertId: expert.id,
    name: expert.name,
    specialization: expert.description,
    tone,
    responseStyle,
    capabilities: [...expert.capabilities],
  }
}

export function formatSystemPrompt(
  persona: ExpertPersona,
  context: DialogueContext,
): string {
  const lines: string[] = []

  lines.push(`You are ${persona.name}, a specialized expert in ${persona.specialization}.`)
  lines.push('')

  lines.push('## Capabilities')
  for (const cap of persona.capabilities) {
    lines.push(`- ${cap}`)
  }
  lines.push('')

  lines.push('## Communication Style')
  const toneDesc: Record<ExpertPersona['tone'], string> = {
    technical: 'Use precise technical language. Be thorough and accurate.',
    friendly: 'Be approachable and clear. Explain concepts in accessible terms.',
    concise: 'Be brief and to the point. Minimize unnecessary elaboration.',
  }
  const styleDesc: Record<ExpertPersona['responseStyle'], string> = {
    detailed: 'Provide comprehensive explanations with rationale.',
    brief: 'Keep responses short. Focus on key takeaways.',
    code_focused: 'Lead with code examples. Explain through implementation.',
  }
  lines.push(`- Tone: ${toneDesc[persona.tone]}`)
  lines.push(`- Style: ${styleDesc[persona.responseStyle]}`)
  lines.push('')

  if (context.objective) {
    lines.push(`## Current Objective`)
    lines.push(context.objective)
    lines.push('')
  }

  if (context.relevantFiles.length > 0) {
    lines.push('## Relevant Files')
    for (const file of context.relevantFiles) {
      lines.push(`- ${file}`)
    }
    lines.push('')
  }

  if (context.codebaseContext) {
    lines.push('## Codebase Context')
    lines.push(context.codebaseContext)
    lines.push('')
  }

  if (context.previousDecisions.length > 0) {
    lines.push('## Previous Decisions')
    for (const decision of context.previousDecisions) {
      lines.push(`- ${decision}`)
    }
    lines.push('')
  }

  if (context.constraints.length > 0) {
    lines.push('## Constraints')
    for (const constraint of context.constraints) {
      lines.push(`- ${constraint}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

export function getExpertGreeting(
  persona: ExpertPersona,
  objective?: string,
): string {
  const greeting = `Hello! I'm ${persona.name}, your ${persona.specialization} specialist.`

  if (objective) {
    return `${greeting} I understand you'd like to discuss: ${objective}. How can I help?`
  }

  return `${greeting} What would you like to work on?`
}

// ── Context management ────────────────────────────────────────────────────────

export function updateContext(
  session: DialogueSession,
  updates: Partial<DialogueContext>,
): DialogueSession {
  return {
    ...session,
    context: { ...session.context, ...updates },
    lastActivityAt: now(),
  }
}

export function addRelevantFile(
  session: DialogueSession,
  filePath: string,
): DialogueSession {
  if (session.context.relevantFiles.includes(filePath)) return session

  return {
    ...session,
    context: {
      ...session.context,
      relevantFiles: [...session.context.relevantFiles, filePath],
    },
    lastActivityAt: now(),
  }
}

export function addConstraint(
  session: DialogueSession,
  constraint: string,
): DialogueSession {
  if (session.context.constraints.includes(constraint)) return session

  return {
    ...session,
    context: {
      ...session.context,
      constraints: [...session.context.constraints, constraint],
    },
    lastActivityAt: now(),
  }
}

export function buildContextSummary(context: DialogueContext): string {
  const parts: string[] = []

  if (context.objective) {
    parts.push(`Objective: ${context.objective}`)
  }

  if (context.relevantFiles.length > 0) {
    parts.push(`Files: ${context.relevantFiles.join(', ')}`)
  }

  if (context.constraints.length > 0) {
    parts.push(`Constraints: ${context.constraints.join('; ')}`)
  }

  if (context.previousDecisions.length > 0) {
    parts.push(`Decisions: ${context.previousDecisions.join('; ')}`)
  }

  if (context.codebaseContext) {
    parts.push(`Context: ${context.codebaseContext}`)
  }

  return parts.length > 0 ? parts.join('\n') : 'No context set.'
}

// ── Summarization & actions ───────────────────────────────────────────────────

const DECISION_PATTERNS = [
  /\b(?:decided|agreed|let's go with|we(?:'ll| will) use|the approach (?:is|will be)|choosing)\b/i,
  /\b(?:decision|conclusion|final answer)\b.*?[:—]\s*/i,
]

const ACTION_PATTERNS: { pattern: RegExp; type: DialogueAction['type'] }[] = [
  { pattern: /\b(?:TODO|action item|next step|we need to|should implement|must|please)\b/i, type: 'implement' },
  { pattern: /\b(?:clarify|unclear|what do you mean|could you explain|need more info)\b/i, type: 'clarify' },
  { pattern: /\b(?:suggest|recommend|consider|proposal|how about|what if)\b/i, type: 'suggest' },
  { pattern: /\b(?:review|check|verify|validate|audit|inspect)\b/i, type: 'review' },
  { pattern: /\b(?:later|defer|postpone|backlog|future|not now)\b/i, type: 'defer' },
]

const QUESTION_PATTERN = /[^.!]*\?/g

export function summarizeDialogue(session: DialogueSession): DialogueSummary {
  return {
    sessionId: session.id,
    expertId: session.expertId,
    keyDecisions: extractDecisions(session),
    agreedApproach: getAgreedApproach(session),
    openQuestions: getOpenQuestions(session),
    actionItems: extractActionItems(session),
  }
}

function extractDecisions(session: DialogueSession): string[] {
  const decisions: string[] = []

  for (const msg of session.messages) {
    if (msg.role === 'system') continue

    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(msg.content)) {
        const sentence = extractRelevantSentence(msg.content, pattern)
        if (sentence) decisions.push(sentence)
        break
      }
    }
  }

  return [...new Set(decisions)]
}

function extractRelevantSentence(content: string, pattern: RegExp): string {
  const sentences = content.split(/[.!]\s+/)
  for (const sentence of sentences) {
    if (pattern.test(sentence)) {
      return sentence.trim().replace(/[.!]$/, '')
    }
  }
  return content.slice(0, 120).trim()
}

export function extractActionItems(session: DialogueSession): DialogueAction[] {
  const actions: DialogueAction[] = []

  for (const msg of session.messages) {
    if (msg.role === 'system') continue

    for (const { pattern, type } of ACTION_PATTERNS) {
      if (pattern.test(msg.content)) {
        const sentence = extractRelevantSentence(msg.content, pattern)
        actions.push({ type, content: sentence })
        break
      }
    }
  }

  return actions
}

export function getAgreedApproach(session: DialogueSession): string | undefined {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i]
    if (msg.role === 'system') continue

    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(msg.content)) {
        return extractRelevantSentence(msg.content, pattern)
      }
    }
  }

  return undefined
}

export function getOpenQuestions(session: DialogueSession): string[] {
  const questions: string[] = []
  const answeredPatterns = new Set<string>()

  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i]
    if (msg.role === 'system') continue

    const matches = msg.content.match(QUESTION_PATTERN)
    if (matches) {
      for (const q of matches) {
        const trimmed = q.trim()
        if (trimmed.length < 10) continue

        const isAnswered = session.messages
          .slice(i + 1)
          .some(
            (later) =>
              later.role !== msg.role &&
              later.role !== 'system' &&
              later.content.length > 20,
          )

        if (isAnswered) {
          answeredPatterns.add(trimmed)
        } else {
          questions.push(trimmed)
        }
      }
    }
  }

  return [...new Set(questions)].filter((q) => !answeredPatterns.has(q))
}

// ── Persistence ───────────────────────────────────────────────────────────────

function getDialoguesDir(projectRoot: string): string {
  return join(projectRoot, DIALOGUES_DIR)
}

function getDialoguePath(sessionId: string, projectRoot: string): string {
  return join(getDialoguesDir(projectRoot), `${sessionId}.json`)
}

export async function saveDialogueHistory(
  session: DialogueSession,
  projectRoot: string,
): Promise<void> {
  const filePath = getDialoguePath(session.id, projectRoot)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(session, null, 2) + '\n', 'utf-8')
  log.debug('Dialogue saved', { sessionId: session.id, path: filePath })
}

export async function loadDialogueHistory(
  sessionId: string,
  projectRoot: string,
): Promise<DialogueSession | null> {
  const filePath = getDialoguePath(sessionId, projectRoot)

  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    log.debug('Dialogue file not found', { sessionId, path: filePath })
    return null
  }

  try {
    return JSON.parse(raw) as DialogueSession
  } catch {
    log.warn('Invalid JSON in dialogue file', { sessionId, path: filePath })
    return null
  }
}

export async function listDialogueHistories(
  projectRoot: string,
): Promise<{ id: string; expertId: string; date: Date }[]> {
  const dir = getDialoguesDir(projectRoot)

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const results: { id: string; expertId: string; date: Date }[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue

    const sessionId = entry.replace(/\.json$/, '')
    const filePath = join(dir, entry)

    try {
      const raw = await readFile(filePath, 'utf-8')
      const session = JSON.parse(raw) as DialogueSession
      results.push({
        id: sessionId,
        expertId: session.expertId,
        date: new Date(session.startedAt),
      })
    } catch {
      log.debug('Skipping unreadable dialogue file', { entry })
    }
  }

  return results
}

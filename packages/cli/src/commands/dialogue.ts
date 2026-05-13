/**
 * oac dialogue — Expert dialogue sessions
 *
 * Start conversational sessions with individual experts.
 * Send messages, view history, and resume past sessions.
 *
 * Usage:
 *   oac dialogue <expert-id>                          Start a dialogue with an expert
 *   oac dialogue --list                               List available experts
 *   oac dialogue --history                            List past dialogue sessions
 *   oac dialogue --resume <session-id>                Resume a previous dialogue
 *   oac dialogue <expert-id> --message "text"         Send a message to an expert
 *   oac dialogue <expert-id> --objective "task desc"  Set task context
 */

import type { Command } from 'commander'
import { log, info, success, dim, warn, bold } from '../ui/logger.js'
import { createLogger } from '../lib/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import {
  loadBuiltInExperts,
  loadCustomExperts,
  type ExpertDefinition,
} from '../lib/expert-definitions.js'
import {
  createDialogueSession,
  addUserMessage,
  addExpertMessage,
  buildExpertPersona,
  getExpertGreeting,
  saveDialogueHistory,
  loadDialogueHistory,
  listDialogueHistories,
  resumeDialogue,
  summarizeDialogue,
  getMessageHistory,
  updateContext,
  type DialogueSession,
} from '../lib/expert-dialogue.js'

const cmdLog = createLogger('cmd:dialogue')

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const

// ── Command logic ─────────────────────────────────────────────────────────────

export async function dialogueCommand(
  expertId: string | undefined,
  options: {
    list: boolean
    history: boolean
    resume?: string
    message?: string
    objective?: string
  },
): Promise<void> {
  const projectRoot = process.cwd()
  const allExperts = await getAllExperts(projectRoot)

  cmdLog.debug('Running dialogue command', {
    expertId,
    list: options.list,
    history: options.history,
    resume: options.resume,
    hasMessage: !!options.message,
    hasObjective: !!options.objective,
  })

  // --list mode
  if (options.list) {
    printExpertList(allExperts)
    return
  }

  // --history mode
  if (options.history) {
    await printHistory(projectRoot)
    return
  }

  // --resume mode
  if (options.resume) {
    await resumeSession(projectRoot, options.resume, allExperts, options.message)
    return
  }

  // Start or interact with a new dialogue
  if (!expertId) {
    throw new CommandUsageError(
      'Provide an expert ID, or use --list to see available experts.',
    )
  }

  const expert = allExperts.find((e) => e.id === expertId)
  if (!expert) {
    const suggestions = allExperts
      .filter((e) => e.id.includes(expertId) || e.name.toLowerCase().includes(expertId.toLowerCase()))
      .slice(0, 5)

    let msg = `Expert '${expertId}' not found.`
    if (suggestions.length > 0) {
      msg += ` Did you mean: ${suggestions.map((e) => e.id).join(', ')}?`
    }
    msg += ` Run 'oac dialogue --list' to see all experts.`
    throw new CommandUsageError(msg)
  }

  await startDialogue(projectRoot, expert, allExperts, options.message, options.objective)
}

// ── List experts ──────────────────────────────────────────────────────────────

function printExpertList(experts: ExpertDefinition[]): void {
  log('')
  bold('  Available Experts')
  log('')

  const byRole = new Map<string, ExpertDefinition[]>()
  for (const expert of experts) {
    if (!expert.enabled) continue
    const role = expert.role
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push(expert)
  }

  for (const [role, list] of byRole) {
    dim(`  ${role}`)
    for (const expert of list) {
      const desc = expert.description
        ? ` — ${expert.description.length > 55 ? expert.description.slice(0, 52) + '…' : expert.description}`
        : ''
      log(`    ${ANSI.cyan}${expert.id.padEnd(30)}${ANSI.reset}${desc}`)
    }
    log('')
  }

  dim(`  ${experts.filter((e) => e.enabled).length} expert(s) available.`)
  log('')
  dim('  Usage: oac dialogue <expert-id> --message "your question"')
  log('')
}

// ── History ───────────────────────────────────────────────────────────────────

async function printHistory(projectRoot: string): Promise<void> {
  const histories = await listDialogueHistories(projectRoot)

  log('')
  bold('  Dialogue History')
  log('')

  if (histories.length === 0) {
    dim('  No past dialogue sessions found.')
    log('')
    return
  }

  const sorted = histories.sort((a, b) => b.date.getTime() - a.date.getTime())

  log(`  ${ANSI.gray}${'ID'.padEnd(38)} ${'Expert'.padEnd(25)} Date${ANSI.reset}`)
  log(`  ${'─'.repeat(38)} ${'─'.repeat(25)} ${'─'.repeat(20)}`)

  for (const entry of sorted) {
    const dateStr = entry.date.toLocaleString()
    log(`  ${ANSI.cyan}${entry.id.slice(0, 36).padEnd(38)}${ANSI.reset} ${entry.expertId.padEnd(25)} ${dateStr}`)
  }

  log('')
  dim('  Resume a session: oac dialogue --resume <session-id>')
  log('')
}

// ── Resume session ────────────────────────────────────────────────────────────

async function resumeSession(
  projectRoot: string,
  sessionId: string,
  allExperts: ExpertDefinition[],
  message?: string,
): Promise<void> {
  let session = await loadDialogueHistory(sessionId, projectRoot)
  if (!session) {
    throw new CommandUsageError(
      `Session '${sessionId}' not found. Run 'oac dialogue --history' to see past sessions.`,
    )
  }

  if (session.state === 'paused') {
    session = resumeDialogue(session)
  }

  if (session.state === 'closed') {
    warn(`Session '${sessionId}' is closed. Starting in read-only mode.`)
    printSessionState(session)
    return
  }

  success(`Resumed session with ${session.expertName}`)
  log('')

  if (message) {
    session = addUserMessage(session, message)
    const persona = buildPersonaForSession(session, allExperts)
    const response = generateExpertResponse(persona, session, message)
    session = addExpertMessage(session, response)

    printMessage('You', message)
    printMessage(session.expertName, response)

    await saveDialogueHistory(session, projectRoot)
  }

  printSessionState(session)
}

// ── Start new dialogue ────────────────────────────────────────────────────────

async function startDialogue(
  projectRoot: string,
  expert: ExpertDefinition,
  allExperts: ExpertDefinition[],
  message?: string,
  objective?: string,
): Promise<void> {
  const contextPartial = objective ? { objective } : undefined
  let session = createDialogueSession(expert.id, allExperts, contextPartial)

  if (objective) {
    session = updateContext(session, { objective })
  }

  const persona = buildExpertPersona(expert)
  const greeting = getExpertGreeting(persona, objective)
  session = addExpertMessage(session, greeting)

  log('')
  bold(`  Dialogue with ${expert.name}`)
  if (objective) {
    dim(`  Objective: ${objective}`)
  }
  log('')
  printMessage(expert.name, greeting)

  if (message) {
    session = addUserMessage(session, message)
    const response = generateExpertResponse(persona, session, message)
    session = addExpertMessage(session, response)

    printMessage('You', message)
    printMessage(expert.name, response)
  }

  await saveDialogueHistory(session, projectRoot)

  log('')
  info(`Session: ${session.id}`)
  dim(`  State: ${session.state}`)
  dim(`  Messages: ${session.messages.length}`)
  log('')
  dim('  Continue: oac dialogue --resume ' + session.id + ' --message "..."')
  log('')
}

// ── Expert response generation ────────────────────────────────────────────────

function generateExpertResponse(
  persona: ReturnType<typeof buildExpertPersona>,
  session: DialogueSession,
  userMessage: string,
): string {
  const parts: string[] = []

  if (session.context.objective) {
    parts.push(
      `Regarding "${session.context.objective}": `,
    )
  }

  if (persona.responseStyle === 'code_focused') {
    parts.push(
      `I'll focus on the implementation aspects. ${userMessage.includes('?') ? 'Here\'s my analysis:' : 'Let me think about this:'} `,
    )
    parts.push(
      `Based on my expertise in ${persona.specialization}, I'd suggest starting with the core logic and iterating. `,
    )
  } else if (persona.responseStyle === 'brief') {
    parts.push(
      `Key points: `,
    )
  } else {
    parts.push(
      `Let me provide a detailed perspective on this. `,
    )
  }

  parts.push(
    `As ${persona.name}, my capabilities include ${persona.capabilities.slice(0, 3).join(', ')}. `,
  )

  if (session.context.constraints.length > 0) {
    parts.push(`I'm keeping in mind the constraints: ${session.context.constraints.join('; ')}.`)
  }

  parts.push('What specific aspect would you like me to elaborate on?')

  return parts.join('')
}

// ── Display helpers ───────────────────────────────────────────────────────────

function printMessage(speaker: string, content: string): void {
  const color = speaker === 'You' ? ANSI.green : ANSI.cyan
  log(`  ${color}${ANSI.bold}${speaker}:${ANSI.reset}`)

  const lines = content.split('\n')
  for (const line of lines) {
    log(`    ${line}`)
  }
  log('')
}

function printSessionState(session: DialogueSession): void {
  const summary = summarizeDialogue(session)
  const messages = getMessageHistory(session)

  log('')
  info('Session State:')
  dim(`  ID:       ${session.id}`)
  dim(`  Expert:   ${session.expertName} (${session.expertId})`)
  dim(`  State:    ${session.state}`)
  dim(`  Messages: ${messages.length}`)

  if (session.context.objective) {
    dim(`  Objective: ${session.context.objective}`)
  }

  if (summary.keyDecisions.length > 0) {
    log('')
    info('Key decisions:')
    for (const decision of summary.keyDecisions) {
      log(`    • ${decision}`)
    }
  }

  if (summary.openQuestions.length > 0) {
    log('')
    info('Open questions:')
    for (const question of summary.openQuestions) {
      log(`    ? ${question}`)
    }
  }

  if (summary.actionItems.length > 0) {
    log('')
    info('Action items:')
    for (const item of summary.actionItems) {
      log(`    [${item.type}] ${item.content}`)
    }
  }

  log('')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAllExperts(projectRoot: string): Promise<ExpertDefinition[]> {
  const builtIn = loadBuiltInExperts()
  const custom = await loadCustomExperts(projectRoot)

  const byId = new Map<string, ExpertDefinition>()
  for (const e of builtIn) byId.set(e.id, e)
  for (const e of custom) byId.set(e.id, e)
  return [...byId.values()]
}

function buildPersonaForSession(
  session: DialogueSession,
  allExperts: ExpertDefinition[],
): ReturnType<typeof buildExpertPersona> {
  const expert = allExperts.find((e) => e.id === session.expertId)
  if (!expert) {
    return {
      expertId: session.expertId,
      name: session.expertName,
      specialization: 'general assistance',
      tone: 'technical',
      responseStyle: 'detailed',
      capabilities: [],
    }
  }
  return buildExpertPersona(expert)
}

// ── Commander registration ────────────────────────────────────────────────────

export function registerDialogueCommand(program: Command): void {
  program
    .command('dialogue [expert-id]')
    .description('Start or continue a dialogue session with an expert')
    .option('--list', 'List all available experts', false)
    .option('--history', 'List past dialogue sessions', false)
    .option('--resume <session-id>', 'Resume a previous dialogue session')
    .option('--message <text>', 'Send a message to the expert')
    .option('--objective <text>', 'Set task context for the dialogue')
    .addHelpText(
      'after',
      `
Examples:
  oac dialogue --list                                   List available experts
  oac dialogue coder --message "How should I structure the API?"
  oac dialogue security --objective "audit auth module"
  oac dialogue --history                                List past sessions
  oac dialogue --resume <id> --message "continue here"  Resume a session
`,
    )
    .action(async (expertId: string | undefined, opts: Record<string, unknown>) => {
      await dialogueCommand(expertId, {
        list: Boolean(opts['list']),
        history: Boolean(opts['history']),
        resume: typeof opts['resume'] === 'string' ? opts['resume'] : undefined,
        message: typeof opts['message'] === 'string' ? opts['message'] : undefined,
        objective: typeof opts['objective'] === 'string' ? opts['objective'] : undefined,
      })
    })
}

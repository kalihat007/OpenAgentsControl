import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'node:path'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { ExpertDefinition } from './expert-definitions.js'
import {
  createDialogueSession,
  closeDialogue,
  pauseDialogue,
  resumeDialogue,
  addUserMessage,
  addExpertMessage,
  addSystemMessage,
  getMessageHistory,
  getLastMessage,
  buildExpertPersona,
  formatSystemPrompt,
  getExpertGreeting,
  updateContext,
  addRelevantFile,
  addConstraint,
  buildContextSummary,
  summarizeDialogue,
  extractActionItems,
  getAgreedApproach,
  getOpenQuestions,
  saveDialogueHistory,
  loadDialogueHistory,
  listDialogueHistories,
  type DialogueSession,
  type DialogueContext,
  type ExpertPersona,
} from './expert-dialogue.js'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_EXPERTS: ExpertDefinition[] = [
  {
    id: 'coder',
    name: 'CoderAgent',
    description: 'General-purpose coding and implementation',
    role: 'developer',
    capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
    keywords: ['implement', 'code', 'write'],
    filePatterns: ['*.ts', '*.js'],
    enabled: true,
  },
  {
    id: 'security',
    name: 'SecurityAgent',
    description: 'Security analysis and vulnerability assessment',
    role: 'security-engineer',
    capabilities: ['vulnerability-scanning', 'auth-review', 'compliance-checking'],
    keywords: ['security', 'auth', 'vulnerability'],
    filePatterns: [],
    enabled: true,
  },
  {
    id: 'architect',
    name: 'SystemArchitectAgent',
    description: 'System architecture and design',
    role: 'architect',
    capabilities: ['system-design', 'api-architecture', 'data-modeling'],
    keywords: ['architecture', 'design', 'system'],
    filePatterns: ['*.proto', '*.graphql'],
    enabled: true,
  },
  {
    id: 'product-manager',
    name: 'ProductManagerAgent',
    description: 'Product management and requirements',
    role: 'product-manager',
    capabilities: ['requirement-analysis', 'user-stories', 'roadmap-planning'],
    keywords: ['product', 'requirement', 'roadmap'],
    filePatterns: [],
    enabled: true,
  },
  {
    id: 'tech-lead',
    name: 'TechLeadAgent',
    description: 'Technical leadership and coordination',
    role: 'tech-lead',
    capabilities: ['decision-making', 'coordination', 'standards-enforcement'],
    keywords: ['tech lead', 'standards'],
    filePatterns: [],
    enabled: true,
  },
]

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'expert-dialogue-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ── Session lifecycle ─────────────────────────────────────────────────────────

describe('session lifecycle', () => {
  it('creates a session with correct defaults', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)

    expect(session.id).toBeTruthy()
    expect(session.expertId).toBe('coder')
    expect(session.expertName).toBe('CoderAgent')
    expect(session.messages).toEqual([])
    expect(session.state).toBe('active')
    expect(session.startedAt).toBeTruthy()
    expect(session.lastActivityAt).toBeTruthy()
    expect(session.context.relevantFiles).toEqual([])
    expect(session.context.previousDecisions).toEqual([])
    expect(session.context.constraints).toEqual([])
  })

  it('creates a session with provided context', () => {
    const ctx = {
      objective: 'Build auth system',
      relevantFiles: ['src/auth.ts'],
      constraints: ['Must use JWT'],
    }
    const session = createDialogueSession('coder', MOCK_EXPERTS, ctx)

    expect(session.context.objective).toBe('Build auth system')
    expect(session.context.relevantFiles).toEqual(['src/auth.ts'])
    expect(session.context.constraints).toEqual(['Must use JWT'])
    expect(session.context.previousDecisions).toEqual([])
  })

  it('throws when expert not found', () => {
    expect(() => createDialogueSession('nonexistent', MOCK_EXPERTS)).toThrow(
      "Expert 'nonexistent' not found",
    )
  })

  it('generates unique session IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const session = createDialogueSession('coder', MOCK_EXPERTS)
      ids.add(session.id)
    }
    expect(ids.size).toBe(20)
  })

  it('pauses an active session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const paused = pauseDialogue(session)

    expect(paused.state).toBe('paused')
    expect(session.state).toBe('active')
  })

  it('pausing a non-active session is a no-op', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const closed = closeDialogue(session)
    const result = pauseDialogue(closed)

    expect(result.state).toBe('closed')
  })

  it('resumes a paused session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const paused = pauseDialogue(session)
    const resumed = resumeDialogue(paused)

    expect(resumed.state).toBe('active')
  })

  it('resuming a non-paused session is a no-op', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const result = resumeDialogue(session)

    expect(result.state).toBe('active')
    expect(result).toBe(session)
  })

  it('closes a session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const closed = closeDialogue(session)

    expect(closed.state).toBe('closed')
    expect(session.state).toBe('active')
  })

  it('closing an already closed session is a no-op', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const closed = closeDialogue(session)
    const result = closeDialogue(closed)

    expect(result).toBe(closed)
  })

  it('full lifecycle: create → pause → resume → close', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    expect(session.state).toBe('active')

    session = pauseDialogue(session)
    expect(session.state).toBe('paused')

    session = resumeDialogue(session)
    expect(session.state).toBe('active')

    session = closeDialogue(session)
    expect(session.state).toBe('closed')
  })
})

// ── Message management ────────────────────────────────────────────────────────

describe('message management', () => {
  it('adds a user message', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'How should I structure this?')

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].role).toBe('user')
    expect(session.messages[0].content).toBe('How should I structure this?')
    expect(session.messages[0].id).toBeTruthy()
    expect(session.messages[0].timestamp).toBeTruthy()
  })

  it('adds an expert message with metadata', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addExpertMessage(session, 'Use a repository pattern.', { confidence: 0.9 })

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].role).toBe('expert')
    expect(session.messages[0].metadata).toEqual({ confidence: 0.9 })
  })

  it('adds a system message', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addSystemMessage(session, 'Context updated.')

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].role).toBe('system')
  })

  it('does not mutate the original session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const updated = addUserMessage(session, 'Hello')

    expect(session.messages).toHaveLength(0)
    expect(updated.messages).toHaveLength(1)
  })

  it('updates lastActivityAt on new message', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const before = session.lastActivityAt
    const updated = addUserMessage(session, 'Hello')

    expect(updated.lastActivityAt).toBeTruthy()
    expect(new Date(updated.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    )
  })

  it('prevents messages on closed sessions', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = closeDialogue(session)
    const result = addUserMessage(session, 'This should not be added')

    expect(result.messages).toHaveLength(0)
  })

  it('builds a conversation with multiple messages', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'How to handle auth?')
    session = addExpertMessage(session, 'Use JWT with refresh tokens.')
    session = addUserMessage(session, 'What about session management?')
    session = addExpertMessage(session, 'Store refresh tokens in HTTP-only cookies.')

    expect(session.messages).toHaveLength(4)
    expect(session.messages.map((m) => m.role)).toEqual(['user', 'expert', 'user', 'expert'])
  })

  it('retrieves full message history', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'msg1')
    session = addExpertMessage(session, 'msg2')
    session = addUserMessage(session, 'msg3')

    const history = getMessageHistory(session)
    expect(history).toHaveLength(3)
    expect(history[0].content).toBe('msg1')
    expect(history[2].content).toBe('msg3')
  })

  it('retrieves limited message history (most recent)', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'msg1')
    session = addExpertMessage(session, 'msg2')
    session = addUserMessage(session, 'msg3')
    session = addExpertMessage(session, 'msg4')

    const history = getMessageHistory(session, 2)
    expect(history).toHaveLength(2)
    expect(history[0].content).toBe('msg3')
    expect(history[1].content).toBe('msg4')
  })

  it('returns full history when limit exceeds length', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'msg1')

    const history = getMessageHistory(session, 100)
    expect(history).toHaveLength(1)
  })

  it('gets the last message', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'first')
    session = addExpertMessage(session, 'last')

    const last = getLastMessage(session)
    expect(last).toBeDefined()
    expect(last!.content).toBe('last')
    expect(last!.role).toBe('expert')
  })

  it('returns undefined for empty session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    expect(getLastMessage(session)).toBeUndefined()
  })

  it('generates unique message IDs', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    const ids = new Set<string>()
    for (let i = 0; i < 30; i++) {
      session = addUserMessage(session, `message ${i}`)
      ids.add(session.messages[session.messages.length - 1].id)
    }
    expect(ids.size).toBe(30)
  })
})

// ── Expert persona building ───────────────────────────────────────────────────

describe('expert persona', () => {
  it('builds a persona from a developer expert', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[0])

    expect(persona.expertId).toBe('coder')
    expect(persona.name).toBe('CoderAgent')
    expect(persona.specialization).toBe('General-purpose coding and implementation')
    expect(persona.tone).toBe('technical')
    expect(persona.responseStyle).toBe('code_focused')
    expect(persona.capabilities).toEqual(['code-generation', 'refactoring', 'bug-fixing'])
  })

  it('builds a persona from an architect expert', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[2])

    expect(persona.tone).toBe('technical')
    expect(persona.responseStyle).toBe('detailed')
  })

  it('builds a persona from a product manager', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[3])

    expect(persona.tone).toBe('friendly')
    expect(persona.responseStyle).toBe('brief')
  })

  it('builds a persona from a tech lead', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[4])

    expect(persona.tone).toBe('concise')
    expect(persona.responseStyle).toBe('detailed')
  })

  it('does not share capability array reference with the expert definition', () => {
    const expert = MOCK_EXPERTS[0]
    const persona = buildExpertPersona(expert)

    persona.capabilities.push('new-capability')
    expect(expert.capabilities).not.toContain('new-capability')
  })
})

// ── System prompt generation ──────────────────────────────────────────────────

describe('system prompt generation', () => {
  let persona: ExpertPersona

  beforeEach(() => {
    persona = buildExpertPersona(MOCK_EXPERTS[0])
  })

  it('generates a prompt with expert identity', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('CoderAgent')
    expect(prompt).toContain('General-purpose coding and implementation')
  })

  it('includes capabilities', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('code-generation')
    expect(prompt).toContain('refactoring')
    expect(prompt).toContain('bug-fixing')
  })

  it('includes communication style', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Tone:')
    expect(prompt).toContain('Style:')
  })

  it('includes objective when provided', () => {
    const ctx: DialogueContext = {
      objective: 'Implement user authentication',
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Current Objective')
    expect(prompt).toContain('Implement user authentication')
  })

  it('includes relevant files', () => {
    const ctx: DialogueContext = {
      relevantFiles: ['src/auth.ts', 'src/middleware.ts'],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Relevant Files')
    expect(prompt).toContain('src/auth.ts')
    expect(prompt).toContain('src/middleware.ts')
  })

  it('includes constraints', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: ['Must use TypeScript', 'No external dependencies'],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Constraints')
    expect(prompt).toContain('Must use TypeScript')
    expect(prompt).toContain('No external dependencies')
  })

  it('includes previous decisions', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: ['Use JWT for auth', 'PostgreSQL for storage'],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Previous Decisions')
    expect(prompt).toContain('Use JWT for auth')
  })

  it('includes codebase context', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
      codebaseContext: 'TypeScript monorepo with Bun runtime',
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).toContain('Codebase Context')
    expect(prompt).toContain('TypeScript monorepo with Bun runtime')
  })

  it('omits sections when context is empty', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const prompt = formatSystemPrompt(persona, ctx)

    expect(prompt).not.toContain('Current Objective')
    expect(prompt).not.toContain('Relevant Files')
    expect(prompt).not.toContain('Constraints')
    expect(prompt).not.toContain('Previous Decisions')
    expect(prompt).not.toContain('Codebase Context')
  })
})

// ── Expert greeting ───────────────────────────────────────────────────────────

describe('expert greeting', () => {
  it('generates a greeting without objective', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[0])
    const greeting = getExpertGreeting(persona)

    expect(greeting).toContain('CoderAgent')
    expect(greeting).toContain('What would you like to work on?')
  })

  it('generates a greeting with objective', () => {
    const persona = buildExpertPersona(MOCK_EXPERTS[0])
    const greeting = getExpertGreeting(persona, 'Build auth system')

    expect(greeting).toContain('CoderAgent')
    expect(greeting).toContain('Build auth system')
    expect(greeting).toContain('How can I help?')
  })
})

// ── Context management ────────────────────────────────────────────────────────

describe('context management', () => {
  it('updates context with partial updates', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = updateContext(session, { objective: 'Build a REST API' })

    expect(session.context.objective).toBe('Build a REST API')
    expect(session.context.relevantFiles).toEqual([])
  })

  it('preserves existing context on partial update', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS, {
      objective: 'Original objective',
      constraints: ['constraint1'],
    })
    session = updateContext(session, { codebaseContext: 'Node.js project' })

    expect(session.context.objective).toBe('Original objective')
    expect(session.context.constraints).toEqual(['constraint1'])
    expect(session.context.codebaseContext).toBe('Node.js project')
  })

  it('does not mutate the original session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const updated = updateContext(session, { objective: 'New' })

    expect(session.context.objective).toBeUndefined()
    expect(updated.context.objective).toBe('New')
  })

  it('adds a relevant file', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addRelevantFile(session, 'src/index.ts')

    expect(session.context.relevantFiles).toEqual(['src/index.ts'])
  })

  it('does not duplicate relevant files', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addRelevantFile(session, 'src/index.ts')
    session = addRelevantFile(session, 'src/index.ts')

    expect(session.context.relevantFiles).toEqual(['src/index.ts'])
  })

  it('adds multiple unique files', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addRelevantFile(session, 'src/a.ts')
    session = addRelevantFile(session, 'src/b.ts')
    session = addRelevantFile(session, 'src/c.ts')

    expect(session.context.relevantFiles).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('adds a constraint', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addConstraint(session, 'Must be backward compatible')

    expect(session.context.constraints).toEqual(['Must be backward compatible'])
  })

  it('does not duplicate constraints', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addConstraint(session, 'No breaking changes')
    session = addConstraint(session, 'No breaking changes')

    expect(session.context.constraints).toEqual(['No breaking changes'])
  })

  it('builds a human-readable context summary', () => {
    const ctx: DialogueContext = {
      objective: 'Build auth',
      relevantFiles: ['src/auth.ts', 'src/jwt.ts'],
      constraints: ['Use JWT', 'No cookies'],
      previousDecisions: ['Chose Argon2 for hashing'],
      codebaseContext: 'Express.js API',
    }
    const summary = buildContextSummary(ctx)

    expect(summary).toContain('Objective: Build auth')
    expect(summary).toContain('Files: src/auth.ts, src/jwt.ts')
    expect(summary).toContain('Constraints: Use JWT; No cookies')
    expect(summary).toContain('Decisions: Chose Argon2 for hashing')
    expect(summary).toContain('Context: Express.js API')
  })

  it('returns "No context set." for empty context', () => {
    const ctx: DialogueContext = {
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    expect(buildContextSummary(ctx)).toBe('No context set.')
  })
})

// ── Dialogue summarization ────────────────────────────────────────────────────

describe('dialogue summarization', () => {
  it('summarizes a dialogue with decisions', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'Should we use REST or GraphQL?')
    session = addExpertMessage(session, "Let's go with REST for this project since the API is straightforward.")
    session = addUserMessage(session, 'OK, agreed. What about the database?')
    session = addExpertMessage(session, "We decided on PostgreSQL for reliable ACID transactions.")

    const summary = summarizeDialogue(session)

    expect(summary.sessionId).toBe(session.id)
    expect(summary.expertId).toBe('coder')
    expect(summary.keyDecisions.length).toBeGreaterThan(0)
  })

  it('extracts action items from conversation', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'We need to implement the login flow.')
    session = addExpertMessage(session, 'I suggest using passport.js for the authentication middleware.')
    session = addUserMessage(session, 'Please review the existing auth code first.')

    const actions = extractActionItems(session)
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.some((a) => a.type === 'implement' || a.type === 'suggest' || a.type === 'review')).toBe(true)
  })

  it('finds the agreed approach', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'How should we handle caching?')
    session = addExpertMessage(session, 'We could use Redis or in-memory caching.')
    session = addUserMessage(session, "Let's go with Redis.")

    const approach = getAgreedApproach(session)
    expect(approach).toBeDefined()
    expect(approach).toContain('Redis')
  })

  it('returns undefined when no approach agreed', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'Just exploring options')
    session = addExpertMessage(session, 'There are many ways to go about this')

    const approach = getAgreedApproach(session)
    expect(approach).toBeUndefined()
  })

  it('finds open questions', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'What database should we use?')
    session = addExpertMessage(session, 'PostgreSQL is a good choice.')
    session = addUserMessage(session, 'What about the caching strategy?')

    const questions = getOpenQuestions(session)
    expect(questions.some((q) => q.includes('caching'))).toBe(true)
  })

  it('does not include answered questions in open list', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'What database should we use for this project?')
    session = addExpertMessage(session, 'PostgreSQL is a solid choice for this use case because of its ACID compliance and extensibility.')

    const questions = getOpenQuestions(session)
    const hasDbQuestion = questions.some((q) => q.includes('database'))
    expect(hasDbQuestion).toBe(false)
  })

  it('returns empty results for empty session', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    const summary = summarizeDialogue(session)

    expect(summary.keyDecisions).toEqual([])
    expect(summary.openQuestions).toEqual([])
    expect(summary.actionItems).toEqual([])
    expect(summary.agreedApproach).toBeUndefined()
  })

  it('skips system messages for summarization', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addSystemMessage(session, 'TODO: implement this feature and review the code.')
    session = addSystemMessage(session, 'What should we do about security?')

    const actions = extractActionItems(session)
    const questions = getOpenQuestions(session)

    expect(actions).toEqual([])
    expect(questions).toEqual([])
  })
})

// ── Persistence ───────────────────────────────────────────────────────────────

describe('persistence', () => {
  it('saves and loads a dialogue session', async () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS, {
      objective: 'Build API',
    })
    session = addUserMessage(session, 'How to structure endpoints?')
    session = addExpertMessage(session, 'Use resource-based routing.')

    await saveDialogueHistory(session, tempDir)
    const loaded = await loadDialogueHistory(session.id, tempDir)

    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(session.id)
    expect(loaded!.expertId).toBe('coder')
    expect(loaded!.expertName).toBe('CoderAgent')
    expect(loaded!.messages).toHaveLength(2)
    expect(loaded!.context.objective).toBe('Build API')
    expect(loaded!.state).toBe('active')
  })

  it('creates the .dialogues directory if missing', async () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    await saveDialogueHistory(session, tempDir)

    const raw = await readFile(
      join(tempDir, '.opencode', '.dialogues', `${session.id}.json`),
      'utf-8',
    )
    expect(JSON.parse(raw).id).toBe(session.id)
  })

  it('saves as pretty-printed JSON', async () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)
    await saveDialogueHistory(session, tempDir)

    const raw = await readFile(
      join(tempDir, '.opencode', '.dialogues', `${session.id}.json`),
      'utf-8',
    )
    expect(raw).toContain('\n')
    expect(raw).toContain('  ')
  })

  it('returns null for nonexistent session', async () => {
    const loaded = await loadDialogueHistory('nonexistent-id', tempDir)
    expect(loaded).toBeNull()
  })

  it('handles corrupt JSON gracefully', async () => {
    const dir = join(tempDir, '.opencode', '.dialogues')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'bad-session.json'), '{ not valid json !!!', 'utf-8')

    const loaded = await loadDialogueHistory('bad-session', tempDir)
    expect(loaded).toBeNull()
  })

  it('preserves all data through save/load cycle', async () => {
    let session = createDialogueSession('security', MOCK_EXPERTS, {
      objective: 'Audit auth',
      relevantFiles: ['src/auth.ts'],
      constraints: ['Must pass OWASP checks'],
      previousDecisions: ['Use Argon2'],
    })
    session = addUserMessage(session, 'Check XSS vulnerabilities')
    session = addExpertMessage(session, 'I found 3 potential issues.', { issueCount: 3 })
    session = addSystemMessage(session, 'Scan complete.')
    session = pauseDialogue(session)

    await saveDialogueHistory(session, tempDir)
    const loaded = await loadDialogueHistory(session.id, tempDir)

    expect(loaded!.expertId).toBe('security')
    expect(loaded!.expertName).toBe('SecurityAgent')
    expect(loaded!.messages).toHaveLength(3)
    expect(loaded!.messages[1].metadata).toEqual({ issueCount: 3 })
    expect(loaded!.context.objective).toBe('Audit auth')
    expect(loaded!.context.relevantFiles).toEqual(['src/auth.ts'])
    expect(loaded!.context.constraints).toEqual(['Must pass OWASP checks'])
    expect(loaded!.context.previousDecisions).toEqual(['Use Argon2'])
    expect(loaded!.state).toBe('paused')
  })

  it('lists dialogue histories', async () => {
    const s1 = createDialogueSession('coder', MOCK_EXPERTS)
    const s2 = createDialogueSession('security', MOCK_EXPERTS)

    await saveDialogueHistory(s1, tempDir)
    await saveDialogueHistory(s2, tempDir)

    const list = await listDialogueHistories(tempDir)
    expect(list).toHaveLength(2)

    const ids = list.map((l) => l.id)
    expect(ids).toContain(s1.id)
    expect(ids).toContain(s2.id)

    const expertIds = list.map((l) => l.expertId)
    expect(expertIds).toContain('coder')
    expect(expertIds).toContain('security')

    for (const entry of list) {
      expect(entry.date).toBeInstanceOf(Date)
      expect(entry.date.getTime()).not.toBeNaN()
    }
  })

  it('returns empty list when no dialogues directory exists', async () => {
    const list = await listDialogueHistories(tempDir)
    expect(list).toEqual([])
  })

  it('skips non-JSON files in the dialogues directory', async () => {
    const dir = join(tempDir, '.opencode', '.dialogues')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'notes.txt'), 'not a dialogue', 'utf-8')

    const session = createDialogueSession('coder', MOCK_EXPERTS)
    await saveDialogueHistory(session, tempDir)

    const list = await listDialogueHistories(tempDir)
    expect(list).toHaveLength(1)
  })

  it('skips unreadable JSON files in listing', async () => {
    const dir = join(tempDir, '.opencode', '.dialogues')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'corrupt.json'), '<<< invalid >>>', 'utf-8')

    const session = createDialogueSession('coder', MOCK_EXPERTS)
    await saveDialogueHistory(session, tempDir)

    const list = await listDialogueHistories(tempDir)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(session.id)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty sessions gracefully', () => {
    const session = createDialogueSession('coder', MOCK_EXPERTS)

    expect(getMessageHistory(session)).toEqual([])
    expect(getLastMessage(session)).toBeUndefined()
    expect(getAgreedApproach(session)).toBeUndefined()
    expect(getOpenQuestions(session)).toEqual([])
    expect(extractActionItems(session)).toEqual([])
  })

  it('handles messages with special characters', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'Handle "quotes" and <angle> & ampersands')
    session = addExpertMessage(session, 'Use template literals: `${value}`')

    expect(session.messages[0].content).toContain('"quotes"')
    expect(session.messages[1].content).toContain('`${value}`')
  })

  it('handles very long messages', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    const longContent = 'x'.repeat(10_000)
    session = addUserMessage(session, longContent)

    expect(session.messages[0].content).toHaveLength(10_000)
  })

  it('handles empty string messages', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, '')

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].content).toBe('')
  })

  it('context summary handles partial context', () => {
    const ctx: DialogueContext = {
      objective: 'Only objective set',
      relevantFiles: [],
      previousDecisions: [],
      constraints: [],
    }
    const summary = buildContextSummary(ctx)
    expect(summary).toBe('Objective: Only objective set')
    expect(summary).not.toContain('Files:')
  })

  it('allows messages on paused sessions', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = pauseDialogue(session)
    session = addUserMessage(session, 'I have a thought while paused')

    expect(session.messages).toHaveLength(1)
  })

  it('immutability: modifying returned history does not affect session', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)
    session = addUserMessage(session, 'original')

    const history = getMessageHistory(session)
    history.push({
      id: 'fake',
      role: 'user',
      content: 'injected',
      timestamp: new Date().toISOString(),
    })

    expect(session.messages).toHaveLength(1)
    expect(getMessageHistory(session)).toHaveLength(1)
  })

  it('immutability: modifying context does not affect the session', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS, {
      relevantFiles: ['src/a.ts'],
    })
    const files = session.context.relevantFiles
    files.push('injected.ts')

    expect(session.context.relevantFiles).toContain('injected.ts')

    const session2 = addRelevantFile(session, 'src/b.ts')
    expect(session.context.relevantFiles).not.toContain('src/b.ts')
    expect(session2.context.relevantFiles).toContain('src/b.ts')
  })

  it('handles rapid state transitions', () => {
    let session = createDialogueSession('coder', MOCK_EXPERTS)

    session = pauseDialogue(session)
    expect(session.state).toBe('paused')

    session = resumeDialogue(session)
    expect(session.state).toBe('active')

    session = pauseDialogue(session)
    session = closeDialogue(session)
    expect(session.state).toBe('closed')

    session = resumeDialogue(session)
    expect(session.state).toBe('closed')

    session = pauseDialogue(session)
    expect(session.state).toBe('closed')
  })
})

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dialogueCommand } from './dialogue.js'
import {
  createDialogueSession,
  addUserMessage,
  addExpertMessage,
  saveDialogueHistory,
} from '../lib/expert-dialogue.js'
import { loadBuiltInExperts, type ExpertDefinition } from '../lib/expert-definitions.js'

// ── Capture console output ────────────────────────────────────────────────────

let captured: string[]
const origLog = console.log
const origError = console.error

function startCapture() {
  captured = []
  console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { captured.push(args.map(String).join(' ')) }
}

function stopCapture(): string[] {
  console.log = origLog
  console.error = origError
  return captured
}

// ── Temp project helper ───────────────────────────────────────────────────────

let tmpDir: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'oac-dialogue-cmd-test-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function createTempProject(name: string, files: Record<string, string> = {}): Promise<string> {
  const root = join(tmpDir, name)
  await mkdir(root, { recursive: true })
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath)
    await mkdir(join(absPath, '..'), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
  }
  return root
}

// ── dialogueCommand tests ─────────────────────────────────────────────────────

describe('dialogueCommand', () => {
  test('--list shows available experts', async () => {
    const root = await createTempProject('dlg-list')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand(undefined, { list: true, history: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Available Experts')
      expect(joined).toContain('coder')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--history shows empty history', async () => {
    const root = await createTempProject('dlg-history-empty')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand(undefined, { list: false, history: true })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Dialogue History')
      expect(joined).toContain('No past dialogue sessions')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--history shows saved sessions', async () => {
    const root = await createTempProject('dlg-history-saved')
    const experts = loadBuiltInExperts()
    const session = createDialogueSession('coder', experts)
    await saveDialogueHistory(session, root)

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand(undefined, { list: false, history: true })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Dialogue History')
      expect(joined).toContain('coder')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('starts a new dialogue with an expert', async () => {
    const root = await createTempProject('dlg-start')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand('coder', { list: false, history: false })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Dialogue with CoderAgent')
      expect(joined).toContain('Session:')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('starts dialogue with --objective', async () => {
    const root = await createTempProject('dlg-objective')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand('coder', {
        list: false,
        history: false,
        objective: 'build an auth API',
      })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('build an auth API')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('sends a message to an expert', async () => {
    const root = await createTempProject('dlg-message')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand('coder', {
        list: false,
        history: false,
        message: 'How should I structure the API?',
      })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('You:')
      expect(joined).toContain('How should I structure the API?')
      expect(joined).toContain('CoderAgent:')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--resume works for saved sessions', async () => {
    const root = await createTempProject('dlg-resume')
    const experts = loadBuiltInExperts()
    let session = createDialogueSession('coder', experts)
    session = addExpertMessage(session, 'Hello! How can I help?')
    await saveDialogueHistory(session, root)

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await dialogueCommand(undefined, {
        list: false,
        history: false,
        resume: session.id,
        message: 'Tell me about refactoring',
      })
      const output = stopCapture()

      const joined = output.join('\n')
      expect(joined).toContain('Resumed session')
      expect(joined).toContain('Tell me about refactoring')
    } finally {
      process.chdir(origCwd)
    }
  })

  test('--resume throws for missing session', async () => {
    const root = await createTempProject('dlg-resume-missing')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await expect(
        dialogueCommand(undefined, {
          list: false,
          history: false,
          resume: 'nonexistent-id',
        })
      ).rejects.toThrow('not found')
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })

  test('throws for missing expert ID without flags', async () => {
    const root = await createTempProject('dlg-no-expert')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await expect(
        dialogueCommand(undefined, { list: false, history: false })
      ).rejects.toThrow('Provide an expert ID')
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })

  test('throws for unknown expert ID', async () => {
    const root = await createTempProject('dlg-unknown')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await expect(
        dialogueCommand('nonexistent-expert-xyz', { list: false, history: false })
      ).rejects.toThrow('not found')
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })

  test('suggests similar expert IDs on mismatch', async () => {
    const root = await createTempProject('dlg-suggest')

    const origCwd = process.cwd()
    process.chdir(root)
    try {
      startCapture()
      await expect(
        dialogueCommand('code', { list: false, history: false })
      ).rejects.toThrow('Did you mean')
    } finally {
      stopCapture()
      process.chdir(origCwd)
    }
  })
})

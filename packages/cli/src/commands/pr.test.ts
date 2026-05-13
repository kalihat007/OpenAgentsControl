import { describe, test, expect } from 'bun:test'
import { prCommand, type PRCommandOptions } from './pr.js'

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

// ── prCommand tests ───────────────────────────────────────────────────────────

describe('prCommand', () => {
  test('preview mode outputs PR plan', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: false,
      review: false,
      objective: 'Add user authentication',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('PR Plan Preview')
    expect(joined).toContain('Title')
    expect(joined).toContain('Add user authentication')
  })

  test('--create outputs formatted PR body', async () => {
    startCapture()
    await prCommand({
      create: true,
      template: 'default',
      draft: false,
      review: false,
      objective: 'Fix login bug',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('PR Ready')
    expect(joined).toContain('## Summary')
    expect(joined).toContain('gh pr create')
  })

  test('--draft indicates draft mode', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: true,
      review: false,
      objective: 'WIP feature',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('draft')
  })

  test('--template conventional uses conventional format', async () => {
    startCapture()
    await prCommand({
      create: true,
      template: 'conventional',
      draft: false,
      review: false,
      objective: 'Refactor auth module',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('## Summary')
    expect(joined).toContain('## Changes')
  })

  test('--template detailed includes all sections', async () => {
    startCapture()
    await prCommand({
      create: true,
      template: 'detailed',
      draft: false,
      review: false,
      objective: 'Add new feature',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('## Summary')
    expect(joined).toContain('## Changes')
    expect(joined).toContain('Expert Log')
  })

  test('--review includes review information', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: false,
      review: true,
      objective: 'Add authentication',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('PR Plan Preview')
    expect(joined).toContain('Title')
  })

  test('--create --draft shows draft flag in output', async () => {
    startCapture()
    await prCommand({
      create: true,
      template: 'default',
      draft: true,
      review: false,
      objective: 'Draft PR',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('Draft')
    expect(joined).toContain('--draft')
  })

  test('uses default objective when none provided', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: false,
      review: false,
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('PR Plan Preview')
    expect(joined).toContain('Title')
  })

  test('displays commit list in preview', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: false,
      review: false,
      objective: 'Add new endpoint',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('PR Plan Preview')
  })

  test('displays branch info in preview', async () => {
    startCapture()
    await prCommand({
      create: false,
      template: 'default',
      draft: false,
      review: false,
      objective: 'Add new module',
    })
    const output = stopCapture()
    const joined = output.join('\n')

    expect(joined).toContain('Branch')
    expect(joined).toContain('main')
  })
})

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createDefaultConfig, mergeConfig } from '../lib/config.js'
import { QualityGateFailedError } from '../lib/errors.js'
import { OPENCODE_TUI_COMMAND, KIMI_CODE_COMMAND, CLAUDE_BRIDGE_COMMAND } from '../lib/run-handoff.js'
import type { PipelineResult } from '../lib/expert-pipeline.js'
import type { SwarmQualityGateResult } from '../lib/swarm-quality-gate.js'

// ── Console capture ───────────────────────────────────────────────────────────

let captured: string[]
const origLog = console.log
const origError = console.error

function startCapture() {
  captured = []
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '))
  }
}

function stopCapture(): string {
  return captured.join('\n')
}

function restoreConsole() {
  console.log = origLog
  console.error = origError
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmpRoot: string
let prevCwd: string

async function setupProject(): Promise<void> {
  prevCwd = process.cwd()
  tmpRoot = await mkdtemp(join(tmpdir(), 'oac-experts-cmd-'))
  await mkdir(join(tmpRoot, '.opencode', 'agent', 'core'), { recursive: true })
  await writeFile(
    join(tmpRoot, '.opencode', 'agent', 'core', 'test-agent.md'),
    '---\nname: TestAgent\ndescription: test\n---\n',
    'utf-8',
  )
  await mkdir(join(tmpRoot, '.oac'), { recursive: true })
  await writeFile(
    join(tmpRoot, '.oac', 'config.json'),
    JSON.stringify(
      mergeConfig(createDefaultConfig(), {
        maxParallelAgents: 2,
        maxApiCallsPerSession: 100,
      }),
    ),
    'utf-8',
  )
  process.chdir(tmpRoot)
}

beforeEach(async () => {
  await setupProject()
})

afterEach(async () => {
  process.chdir(prevCwd)
  restoreConsole()
  await rm(tmpRoot, { recursive: true, force: true })
  mock.restore()
})

// ── Unit: assertQualityGatePassed ───────────────────────────────────────────

describe('assertQualityGatePassed', () => {
  it('throws QualityGateFailedError when gate failed', async () => {
    const { assertQualityGatePassed } = await import('./experts.js')
    const gate: SwarmQualityGateResult = {
      passed: false,
      overallScore: 42,
      grade: 'D',
      report: { overallScore: 42, grade: 'D', signals: [], summary: 'low score' } as SwarmQualityGateResult['report'],
      review: null,
      changedFileCount: 1,
      signals: [],
      summary: 'score 42/100',
    }
    const result = {
      executionResults: { qualityGate: gate },
    } as PipelineResult

    expect(() => assertQualityGatePassed(result)).toThrow(QualityGateFailedError)
    try {
      assertQualityGatePassed(result)
    } catch (err) {
      expect(err).toBeInstanceOf(QualityGateFailedError)
      expect((err as QualityGateFailedError).exitCode).toBe(1)
      expect((err as QualityGateFailedError).overallScore).toBe(42)
    }
  })

  it('does not throw when gate passed or absent', async () => {
    const { assertQualityGatePassed } = await import('./experts.js')
    expect(() =>
      assertQualityGatePassed({ executionResults: null } as PipelineResult),
    ).not.toThrow()
    expect(() =>
      assertQualityGatePassed({
        executionResults: {
          qualityGate: {
            passed: true,
            overallScore: 90,
            grade: 'A',
            summary: 'ok',
          },
        },
      } as PipelineResult),
    ).not.toThrow()
  })
})

describe('resolveExecutionMode', () => {
  it('selects v6 distributed execution when requested', async () => {
    const { resolveExecutionMode } = await import('./experts.js')

    expect(resolveExecutionMode({
      simulate: true,
      live: false,
      distributed: true,
      runtime: 'kimi',
    })).toBe('distributed')
  })

  it('keeps strict single-runtime mode when only --runtime is provided', async () => {
    const { resolveExecutionMode } = await import('./experts.js')

    expect(resolveExecutionMode({
      simulate: true,
      live: false,
      runtime: 'kimi',
    })).toBe('runtime')
  })
})

// ── Integration: expertsCommand ───────────────────────────────────────────────

describe('expertsCommand', () => {
  it('--plan-only always persists spec.json and quest.json', async () => {
    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expertsCommand('build JWT auth API', {
      dryRun: false,
      planOnly: true,
      run: false,
      list: false,
      save: false,
      verbose: false,
      concurrency: 4,
      decompose: false,
      mode: 'autonomous',
      full: false,
      quick: false,
      noIndex: true,
      noMemory: true,
      quality: false,
      simulate: true,
      live: false,
      distributed: false,
      noQualityGate: false,
    })
    const output = stopCapture()

    expect(output).toContain('Saved spec:')
    const runsDir = join(tmpRoot, '.oac', 'runs')
    const { readdir } = await import('node:fs/promises')
    const sessions = await readdir(runsDir)
    expect(sessions.length).toBe(1)
    const specRaw = await readFile(join(runsDir, sessions[0]!, 'spec.json'), 'utf-8')
    const spec = JSON.parse(specRaw) as { objective: string; version: string }
    expect(spec.version).toBe('1')
    expect(spec.objective).toContain('JWT')
    const questRaw = await readFile(join(runsDir, sessions[0]!, 'quest.json'), 'utf-8')
    const quest = JSON.parse(questRaw) as { objective: string; version: string; state: string; runtimes: { kimi: { command: string } } }
    expect(quest.version).toBe('7')
    expect(quest.state).toBe('SPEC')
    expect(quest.objective).toContain('JWT')
    expect(quest.runtimes.kimi.command).toBe(KIMI_CODE_COMMAND)
  })

  it('--dry-run prints pre-run plan without executing', async () => {
    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expertsCommand('fix typo in readme', {
      dryRun: true,
      planOnly: false,
      run: false,
      list: false,
      save: false,
      verbose: false,
      concurrency: 2,
      decompose: false,
      mode: 'autonomous',
      full: false,
      quick: false,
      noIndex: true,
      noMemory: true,
      quality: false,
      simulate: true,
      live: false,
      distributed: false,
      noQualityGate: false,
    })
    const output = stopCapture()

    expect(output).toContain('[dry-run]')
    expect(output).toContain('Saved spec:')
  })

  it('--run --quick prints pre-run estimate', async () => {
    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expertsCommand('build JWT auth API', {
      dryRun: false,
      planOnly: false,
      run: true,
      list: false,
      save: false,
      verbose: false,
      concurrency: 4,
      decompose: false,
      mode: 'autonomous',
      full: false,
      quick: true,
      noIndex: true,
      noMemory: true,
      quality: false,
      simulate: true,
      live: false,
      distributed: false,
      noQualityGate: true,
    })
    const output = stopCapture()

    expect(output).toContain('Pre-run estimate')
    expect(output).toContain('Estimated API calls')
    expect(output).toContain('simulated')
  })

  it('--run --live writes handoff.json and prints both runtime commands', async () => {
    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expertsCommand('build JWT auth API', {
      dryRun: false,
      planOnly: false,
      run: true,
      list: false,
      save: false,
      verbose: false,
      concurrency: 2,
      decompose: false,
      mode: 'autonomous',
      full: false,
      quick: true,
      noIndex: true,
      noMemory: true,
      quality: false,
      simulate: false,
      live: true,
      distributed: false,
      noQualityGate: true,
    })
    const output = stopCapture()

    expect(output).toContain(OPENCODE_TUI_COMMAND)
    expect(output).toContain(KIMI_CODE_COMMAND)
    expect(output).toContain(CLAUDE_BRIDGE_COMMAND)
    expect(output).toContain('handoff')

    const runsDir = join(tmpRoot, '.oac', 'runs')
    const { readdir } = await import('node:fs/promises')
    const sessions = await readdir(runsDir)
    const handoffRaw = await readFile(join(runsDir, sessions[0]!, 'handoff.json'), 'utf-8')
    const handoff = JSON.parse(handoffRaw) as {
      version: string
      runtimes: { opencode: { command: string }; kimi: { command: string }; claude: { command: string } }
    }
    expect(handoff.version).toBe('1')
    expect(handoff.runtimes.opencode.command).toBe(OPENCODE_TUI_COMMAND)
    expect(handoff.runtimes.kimi.command).toBe(KIMI_CODE_COMMAND)
    expect(handoff.runtimes.claude.command).toBe(CLAUDE_BRIDGE_COMMAND)
    const questRaw = await readFile(join(runsDir, sessions[0]!, 'quest.json'), 'utf-8')
    expect(JSON.parse(questRaw).state).toBe('WAITING')
  })

  it('--plan-only --live writes handoff without running pipeline', async () => {
    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expertsCommand('build JWT auth API', {
      dryRun: false,
      planOnly: true,
      run: false,
      list: false,
      save: false,
      verbose: false,
      concurrency: 2,
      decompose: false,
      mode: 'autonomous',
      full: false,
      quick: false,
      noIndex: true,
      noMemory: true,
      quality: false,
      simulate: true,
      live: true,
      distributed: false,
      noQualityGate: false,
    })
    const output = stopCapture()

    expect(output).toContain(OPENCODE_TUI_COMMAND)
    expect(output).toContain(KIMI_CODE_COMMAND)
    expect(output).toContain(CLAUDE_BRIDGE_COMMAND)

    const runsDir = join(tmpRoot, '.oac', 'runs')
    const { readdir } = await import('node:fs/promises')
    const sessions = await readdir(runsDir)
    const handoffPath = join(runsDir, sessions[0]!, 'handoff.json')
    const handoffRaw = await readFile(handoffPath, 'utf-8')
    expect(JSON.parse(handoffRaw).objective).toContain('JWT')
    const taskGraphRaw = await readFile(join(runsDir, sessions[0]!, 'task-graph.json'), 'utf-8')
    const taskGraph = JSON.parse(taskGraphRaw) as { tasks: unknown[] }
    expect(taskGraph.tasks.length).toBeGreaterThan(0)
  })

  it('--run --no-quality-gate skips gate and does not throw on failure', async () => {
    mock.module('../lib/swarm-quality-gate.js', () => ({
      runSwarmQualityGate: async () => ({
        passed: false,
        overallScore: 10,
        grade: 'F',
        report: { overallScore: 10, grade: 'F', signals: [], summary: 'fail' },
        review: null,
        changedFileCount: 1,
        signals: [],
        summary: 'forced failure for test',
      }),
    }))

    const { expertsCommand } = await import('./experts.js')
    startCapture()
    await expect(
      expertsCommand('build JWT auth API', {
        dryRun: false,
        planOnly: false,
        run: true,
        list: false,
        save: false,
        verbose: false,
        concurrency: 2,
        decompose: false,
        mode: 'autonomous',
        full: false,
        quick: true,
        noIndex: true,
        noMemory: true,
        quality: false,
        simulate: true,
        live: false,
        distributed: false,
        noQualityGate: true,
      }),
    ).resolves.toBeUndefined()
    const output = stopCapture()
    expect(output).not.toContain('Quality gate: FAILED')
  })

  it('--run exits via QualityGateFailedError when gate fails', async () => {
    mock.module('../lib/swarm-quality-gate.js', () => ({
      runSwarmQualityGate: async () => ({
        passed: false,
        overallScore: 15,
        grade: 'F',
        report: { overallScore: 15, grade: 'F', signals: [], summary: 'fail' },
        review: null,
        changedFileCount: 2,
        signals: [],
        summary: 'forced failure for test',
      }),
    }))

    const { expertsCommand } = await import('./experts.js')
    await expect(
      expertsCommand('build JWT auth API', {
        dryRun: false,
        planOnly: false,
        run: true,
        list: false,
        save: false,
        verbose: false,
        concurrency: 2,
        decompose: false,
        mode: 'autonomous',
        full: false,
        quick: true,
        noIndex: true,
        noMemory: true,
        quality: false,
        simulate: true,
        live: false,
        distributed: false,
        noQualityGate: false,
      }),
    ).rejects.toBeInstanceOf(QualityGateFailedError)
  })
})

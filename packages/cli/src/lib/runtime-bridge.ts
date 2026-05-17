/**
 * Runtime Bridge v5 — unified interface for spawning real execution
 * in OpenCode, Kimi, or Claude runtimes.
 *
 * Each runtime receives a prompt that loads the quest artifacts
 * and follows the v5 write-back contract (append-only events.ndjson).
 */

import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { appendQuestEvent, writeRunPid } from './quest-run.js'

const log = createLogger('runtime-bridge')

export type RuntimeType = 'opencode' | 'kimi' | 'claude'

export interface RuntimeBridgeOptions {
  questId: string
  objective: string
  projectRoot: string
  runDir: string
  runtime: RuntimeType
  tasks?: Array<{
    id: string
    title: string
    agent: string
  }>
  timeoutMs?: number
  background?: boolean
}

export interface RuntimeBridgeResult {
  ok: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
  errorMessage?: string
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

// ── Availability checks ───────────────────────────────────────────────────────

export function isRuntimeAvailable(runtime: RuntimeType): boolean {
  switch (runtime) {
    case 'opencode':
      return isOpencodeAvailable()
    case 'kimi':
      return isKimiAvailable()
    case 'claude':
      return isClaudeAvailable()
    default:
      return false
  }
}

function isOpencodeAvailable(): boolean {
  try {
    const result = spawnSync('opencode', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

function isKimiAvailable(): boolean {
  try {
    const result = spawnSync('kimi', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

function isClaudeAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function runtimeUnavailableMessage(runtime: RuntimeType): string {
  const installHints: Record<RuntimeType, string> = {
    opencode: 'Install the OpenCode CLI (npm install -g opencode-ai).',
    kimi: 'Install the Kimi CLI (see https://kimi.com).',
    claude: 'Install Claude Code (npm install -g @anthropics/claude-code).',
  }
  return `${runtime} CLI is not available. ${installHints[runtime]}`
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildRuntimePrompt(options: RuntimeBridgeOptions): string {
  const { questId, objective, runDir } = options
  const tasks = options.tasks ?? []
  return [
    `Execute this OpenAgent Quest v5: ${objective}`,
    `Quest ID: ${questId}`,
    `Load the run artifacts from ${runDir}:\n`,
    `  - spec.json (execution spec)`,
    `  - plan.json (task plan)`,
    `  - quest.json (quest state)`,
    ``,
    `Follow Quest Mode + Experts Mode. Execute all tasks in the plan.`,
    tasks.length > 0 ? `Task write-back requirements:` : `Task write-back requirements: load task IDs from plan.json.`,
    ...tasks.map((task) => `  - ${task.id}: ${task.title} (${task.agent})`),
    `For every listed task, append one task_update event with status "in_progress" before work and one task_update event with status "completed", "failed", or "blocked" after work.`,
    `Use this exact task update JSON shape: {"timestamp":"<ISO time>","type":"task_update","data":{"taskId":"task-001","status":"completed","expert":"TechLeadAgent","title":"..."}}`,
    `Append events to ${runDir}/events.ndjson for every task start, completion, file change, and validation.`,
    `Each JSONL event must include timestamp, type, and data. Use task IDs exactly as listed.`,
    `Do not rewrite quest.json. Use append-only events.`,
    `If no file change is required, still append task_update completion events and a note event explaining that the task was a no-op.`,
    `After finishing, mark the quest state as COMPLETE or BLOCKED via a state_change event.`,
  ].join('\n')
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function spawnRuntime(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  if (!isRuntimeAvailable(options.runtime)) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      errorMessage: runtimeUnavailableMessage(options.runtime),
    }
  }

  log.info('Spawning runtime', {
    runtime: options.runtime,
    questId: options.questId,
    background: options.background,
  })

  // Append state_change EXECUTE before spawning
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'state_change',
    data: { from: 'SPEC', to: 'EXECUTE' },
  })

  const result = await dispatchSpawn(options)

  // If the runtime process itself failed, record an error event
  if (!result.ok) {
    await appendQuestEvent(options.projectRoot, options.questId, {
      timestamp: new Date().toISOString(),
      type: 'error',
      data: {
        message: result.errorMessage ?? `Runtime ${options.runtime} exited with code ${result.exitCode}`,
        critical: true,
      },
    })
  }

  log.info('Runtime finished', {
    runtime: options.runtime,
    questId: options.questId,
    ok: result.ok,
    durationMs: result.durationMs,
  })

  return result
}

function dispatchSpawn(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  switch (options.runtime) {
    case 'opencode':
      return spawnOpencode(options)
    case 'kimi':
      return spawnKimi(options)
    case 'claude':
      return spawnClaude(options)
  }
}

// ── OpenCode bridge ───────────────────────────────────────────────────────────

function spawnOpencode(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)

  const args = [
    'run',
    '--agent', 'OpenAgent',
    '--dir', options.projectRoot,
    '--format', 'json',
    '--dangerously-skip-permissions',
    prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: options.projectRoot,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('opencode', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      child.unref()
      writeRunPid(options.projectRoot, options.questId, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `opencode run timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok ? undefined : stderr.trim() || stdout.trim() || `opencode run exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

// ── Kimi bridge ───────────────────────────────────────────────────────────────

function getKimiAgentFile(): string {
  return process.env.KIMI_OPENAGENT_FILE ?? join(homedir(), '.kimi', 'agents', 'openagents-control', 'openagent.yaml')
}

function spawnKimi(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)

  const args = [
    '--work-dir', options.projectRoot,
    '--agent-file', getKimiAgentFile(),
    '--print',
    '--final-message-only',
    '--yolo',
    '--afk',
    '--max-steps-per-turn', '12',
    '--prompt', prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: options.projectRoot,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('kimi', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      child.unref()
      writeRunPid(options.projectRoot, options.questId, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `kimi timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok ? undefined : stderr.trim() || stdout.trim() || `kimi exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

// ── Claude bridge ─────────────────────────────────────────────────────────────

function getClaudePluginDir(): string {
  return process.env.CLAUDE_PLUGIN_DIR ?? join(homedir(), '.claude', 'plugins', 'openagents-control-bridge')
}

function spawnClaude(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)

  const args = [
    '--plugin-dir', getClaudePluginDir(),
    '--print',
    prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: options.projectRoot,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('claude', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      child.unref()
      writeRunPid(options.projectRoot, options.questId, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `claude timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok ? undefined : stderr.trim() || stdout.trim() || `claude exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

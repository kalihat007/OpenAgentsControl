/**
 * Runtime Bridge v5/v6 — unified interface for spawning real execution
 * in OpenCode, Kimi, or Claude runtimes.
 *
 * Each runtime receives a prompt that loads the quest artifacts
 * and follows the append-only write-back contract (events.ndjson).
 */

import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { appendQuestEvent, writeRunPid, writeRuntimePid } from './quest-run.js'

const log = createLogger('runtime-bridge')

export type RuntimeType = 'opencode' | 'kimi' | 'claude' | 'local'

export interface RuntimeBridgeOptions {
  questId: string
  objective: string
  projectRoot: string
  runDir: string
  runtime: RuntimeType
  workDir?: string
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
    local: 'Local runtime requires no external CLI.',
  }
  return `${runtime} CLI is not available. ${installHints[runtime]}`
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildRuntimePrompt(options: RuntimeBridgeOptions): string {
  const { questId, objective, runDir } = options
  const tasks = options.tasks ?? []
  return [
    `Execute this OpenAgent Quest v8: ${objective}`,
    `Quest ID: ${questId}`,
    `Load the run artifacts from ${runDir}:\n`,
    `  - spec.json (execution spec)`,
    `  - plan.json (task plan)`,
    `  - quest.json (quest state)`,
    `  - agent-memory.json when present (continuity context only)`,
    ``,
    `Follow Quest Mode + Experts Mode. Execute all tasks in the plan.`,
    `Use the currently selected ${options.runtime} runtime/model throughout. Do not route work to a hidden LLM or fallback model.`,
    tasks.length > 0 ? `Task write-back requirements:` : `Task write-back requirements: load task IDs from plan.json.`,
    ...tasks.map((task) => `  - ${task.id}: ${task.title} (${task.agent})`),
    `For every listed task, append one task_update event with status "in_progress" before work and one task_update event with status "completed", "failed", or "blocked" after work.`,
    `Use this exact task update JSON shape: {"timestamp":"<ISO time>","type":"task_update","data":{"taskId":"task-001","status":"completed","expert":"TechLeadAgent","title":"..."}}`,
    `Append events to ${runDir}/events.ndjson for every task start, completion, file change, and validation.`,
    `The append-only writes under ${runDir} are required control-plane artifacts; they are allowed even when the user objective says not to modify product files.`,
    `Each JSONL event must include timestamp, type, and data. Use task IDs exactly as listed.`,
    `Do not rewrite quest.json. Use append-only events.`,
    `Quest v8 also supports review.started, review.approved, review.rejected, task.injected, and priority.changed events. Use task.injected for dynamic replanning and priority.changed when task urgency changes.`,
    `Use this exact v8 injection JSON shape when adding a task: {"timestamp":"<ISO time>","type":"task.injected","data":{"taskId":"new-task-id","title":"...","status":"completed","expert":"...","priority":1,"dependsOn":["task-001"],"acceptanceCriteria":["..."]}}`,
    `Use this exact priority JSON shape when reprioritizing: {"timestamp":"<ISO time>","type":"priority.changed","data":{"taskId":"task-001","priority":1}}`,
    `If no file change is required, still append task_update completion events and a note event explaining that the task was a no-op.`,
    `After finishing, mark the quest state as COMPLETE or BLOCKED via a state_change event.`,
  ].join('\n')
}

// ── Distributed runtime spawning ──────────────────────────────────────────────

export interface DistributedRuntimeBatch {
  runtime: RuntimeType
  tasks: Array<{ id: string; title: string; agent: string }>
  background?: boolean
  workDir?: string
}

export interface DistributedRuntimeOptions {
  questId: string
  objective: string
  projectRoot: string
  runDir: string
  batches: DistributedRuntimeBatch[]
  timeoutMs?: number
}

export interface DistributedRuntimeResult {
  results: Array<{
    runtime: RuntimeType
    ok: boolean
    exitCode: number | null
    errorMessage?: string
    durationMs: number
  }>
  overallOk: boolean
}

export async function spawnDistributedRuntimes(
  options: DistributedRuntimeOptions,
): Promise<DistributedRuntimeResult> {
  const { batches, questId, projectRoot } = options

  log.info('Spawning distributed runtimes', {
    questId,
    runtimeCount: batches.length,
    runtimes: batches.map((b) => b.runtime),
  })

  const spawnPromises = batches.map(async (batch) => {
    const result = await spawnRuntime({
      questId: options.questId,
      objective: options.objective,
      projectRoot: options.projectRoot,
      workDir: batch.workDir,
      runDir: options.runDir,
      runtime: batch.runtime,
      tasks: batch.tasks,
      timeoutMs: options.timeoutMs,
      background: batch.background ?? false,
    })

    if (!batch.background) {
      await appendQuestEvent(projectRoot, questId, {
        timestamp: new Date().toISOString(),
        type: 'runtime.completed',
        data: {
          runtime: batch.runtime,
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          taskIds: batch.tasks.map((task) => task.id),
        },
      })
    }

    return {
      runtime: batch.runtime,
      ok: result.ok,
      exitCode: result.exitCode,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    }
  })

  const results = await Promise.all(spawnPromises)
  const overallOk = results.every((r) => r.ok)

  log.info('Distributed runtimes finished', {
    questId,
    overallOk,
    results: results.map((r) => ({ runtime: r.runtime, ok: r.ok })),
  })

  return { results, overallOk }
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

async function recordRuntimeSpawned(
  options: RuntimeBridgeOptions,
  pid: number | undefined,
): Promise<void> {
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'runtime.spawned',
    data: {
      runtime: options.runtime,
      ...(pid !== undefined && { pid }),
      background: options.background ?? false,
      workDir: options.workDir ?? options.projectRoot,
      taskIds: options.tasks?.map((task) => task.id) ?? [],
    },
  })

  if (options.background && pid !== undefined) {
    await Promise.all([
      writeRunPid(options.projectRoot, options.questId, pid),
      writeRuntimePid(options.projectRoot, options.questId, options.runtime, pid),
    ])
  }
}

function dispatchSpawn(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  switch (options.runtime) {
    case 'opencode':
      return spawnOpencode(options)
    case 'kimi':
      return spawnKimi(options)
    case 'claude':
      return spawnClaude(options)
    case 'local':
      return Promise.resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        errorMessage: 'Local runtime is reserved for future in-process execution.',
      })
  }
}

// ── OpenCode bridge ───────────────────────────────────────────────────────────

function spawnOpencode(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    'run',
    '--agent', 'OpenAgent',
    '--dir', workDir,
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
      cwd: workDir,
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
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

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
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    '--work-dir', workDir,
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
      cwd: workDir,
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
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

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

function getClaudeOpenAgentSystemPrompt(): string | undefined {
  const pluginDir = getClaudePluginDir()
  for (const promptPath of [
    join(pluginDir, 'openagent-system.md'),
    join(pluginDir, 'agents', 'core', 'openagent.md'),
  ]) {
    if (!existsSync(promptPath)) continue
    try {
      return readFileSync(promptPath, 'utf8')
    } catch {
      return undefined
    }
  }
  return undefined
}

function spawnClaude(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    '--plugin-dir', getClaudePluginDir(),
    '--permission-mode', 'acceptEdits',
    ...(() => {
      const systemPrompt = getClaudeOpenAgentSystemPrompt()
      return systemPrompt ? ['--append-system-prompt', systemPrompt] : []
    })(),
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
      cwd: workDir,
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
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

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

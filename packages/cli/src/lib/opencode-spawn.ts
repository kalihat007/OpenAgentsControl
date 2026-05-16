/**
 * Headless OpenCode spawn bridge — **not** used by `oac experts --live`.
 *
 * Default experts execution is IDE handoff (OpenCode TUI or Claude plugin).
 * This module remains for eval harnesses, integration tests, and optional
 * headless automation that explicitly injects `runOpencodeTask`.
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { createLogger } from './logger.js'

const log = createLogger('opencode-spawn')

export interface OpencodeSpawnOptions {
  agent: string
  objective: string
  cwd: string
  /** Wall-clock timeout for the opencode process (default 5 minutes). */
  timeoutMs?: number
}

export interface OpencodeSpawnResult {
  ok: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  errorMessage?: string
  durationMs: number
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

export type SpawnSyncFn = typeof spawnSync

export interface SpawnDeps {
  spawn?: SpawnFn
  spawnSync?: SpawnSyncFn
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

const OPENCODE_INSTALL_HINT =
  'Install the OpenCode CLI (e.g. npm install -g opencode-ai) and ensure `opencode` is on PATH.'

/**
 * Returns true when the `opencode` binary responds to `--version`.
 */
export function isOpencodeAvailable(deps: SpawnDeps = {}): boolean {
  const spawnSyncFn = deps.spawnSync ?? spawnSync
  try {
    const result = spawnSyncFn('opencode', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Human-readable error when opencode is missing (for CLI / swarm executor).
 */
export function opencodeUnavailableMessage(): string {
  return `OpenCode CLI is not available. ${OPENCODE_INSTALL_HINT}`
}

/**
 * Run one task through `opencode run --agent … --dir … --format json <objective>`.
 */
export function runOpencodeTask(
  options: OpencodeSpawnOptions,
  deps: SpawnDeps = {},
): Promise<OpencodeSpawnResult> {
  const spawnFn = deps.spawn ?? spawn
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()

  const args = [
    'run',
    '--agent',
    options.agent,
    '--dir',
    options.cwd,
    '--format',
    'json',
    options.objective,
  ]

  log.debug('Spawning opencode run', {
    agent: options.agent,
    cwd: options.cwd,
    objectivePreview: options.objective.slice(0, 80),
  })

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (partial: Partial<OpencodeSpawnResult>): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
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

    let child: ChildProcess
    try {
      child = spawnFn('opencode', args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })
    } catch (err) {
      finish({
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      return
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({
        signal: 'SIGTERM',
        errorMessage: `opencode run timed out after ${timeoutMs}ms`,
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      finish({ errorMessage: err.message })
    })

    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok
          ? undefined
          : stderr.trim() || stdout.trim() || `opencode run exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

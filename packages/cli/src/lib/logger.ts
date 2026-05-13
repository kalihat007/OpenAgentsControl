/**
 * Structured Logger — provides leveled, structured logging for CLI observability.
 *
 * Separate from ui/logger.ts (user-facing display output). This module is for
 * diagnostic logging with levels, timestamps, component tags, and optional JSON mode.
 *
 * Usage:
 *   import { createLogger, setGlobalLogLevel } from '../lib/logger.js'
 *   const log = createLogger('task-router')
 *   log.info('Routing objective', { objective, expertCount: 5 })
 *   log.debug('Score details', { scores })
 */

// ── Log Levels ────────────────────────────────────────────────────────────────

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const

export type LogLevel = keyof typeof LOG_LEVELS

const LEVEL_NAMES: Record<number, LogLevel> = Object.fromEntries(
  Object.entries(LOG_LEVELS).map(([name, value]) => [value, name as LogLevel]),
)

// ── ANSI Colors (no external deps) ────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
} as const

const LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: ANSI.red,
  WARN: ANSI.yellow,
  INFO: ANSI.blue,
  DEBUG: ANSI.cyan,
  TRACE: ANSI.gray,
}

// ── Global State ──────────────────────────────────────────────────────────────

let globalLogLevel: number = LOG_LEVELS.INFO
let jsonMode = false

/**
 * Set the global log level. All loggers respect this threshold.
 * Accepts a LogLevel string or numeric value.
 */
export function setGlobalLogLevel(level: LogLevel | number): void {
  if (typeof level === 'number') {
    globalLogLevel = level
  } else {
    const numeric = LOG_LEVELS[level]
    if (numeric === undefined) return
    globalLogLevel = numeric
  }
}

/** Returns the current global log level as a numeric value. */
export function getGlobalLogLevel(): number {
  return globalLogLevel
}

/** Returns the current global log level name. */
export function getGlobalLogLevelName(): LogLevel {
  return LEVEL_NAMES[globalLogLevel] ?? 'INFO'
}

/** Enable or disable JSON output mode. */
export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled
}

/** Returns whether JSON mode is currently enabled. */
export function isJsonMode(): boolean {
  return jsonMode
}

/**
 * Parse a log level from a string (case-insensitive).
 * Returns undefined for invalid input.
 */
export function parseLogLevel(input: string): LogLevel | undefined {
  const upper = input.toUpperCase()
  if (upper in LOG_LEVELS) return upper as LogLevel
  return undefined
}

/**
 * Configure logging from environment and CLI flags.
 * Call once at startup. CLI flags take precedence over env vars.
 */
export function configureFromFlags(flags: {
  verbose?: boolean
  debug?: boolean
}): void {
  const envLevel = process.env['LOG_LEVEL']
  if (envLevel) {
    const parsed = parseLogLevel(envLevel)
    if (parsed) setGlobalLogLevel(parsed)
  }

  if (process.env['LOG_JSON'] === '1' || process.env['LOG_JSON'] === 'true') {
    setJsonMode(true)
  }

  if (flags.verbose) setGlobalLogLevel(LOG_LEVELS.DEBUG)
  if (flags.debug) setGlobalLogLevel(LOG_LEVELS.TRACE)
}

// ── Structured Log Entry ──────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: Record<string, unknown>
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatTimestamp(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function formatHumanEntry(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level]
  const ts = `${ANSI.dim}${entry.timestamp}${ANSI.reset}`
  const lvl = `${color}${entry.level.padEnd(5)}${ANSI.reset}`
  const comp = `${ANSI.dim}[${entry.component}]${ANSI.reset}`

  let line = `${ts} ${lvl} ${comp} ${entry.message}`

  if (entry.data && Object.keys(entry.data).length > 0) {
    const pairs = Object.entries(entry.data)
      .map(([k, v]) => `${ANSI.dim}${k}=${ANSI.reset}${formatValue(v)}`)
      .join(' ')
    line += ` ${pairs}`
  }

  return line
}

function formatJsonEntry(entry: LogEntry): string {
  return JSON.stringify({
    ts: entry.timestamp,
    level: entry.level,
    component: entry.component,
    msg: entry.message,
    ...(entry.data && Object.keys(entry.data).length > 0 ? { data: entry.data } : {}),
  })
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return String(v)
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.map(formatValue).join(',')}]`
  return JSON.stringify(v)
}

// ── Logger Interface ──────────────────────────────────────────────────────────

export interface StructuredLogger {
  error(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
  trace(message: string, data?: Record<string, unknown>): void
  /** Create a child logger with a more specific component tag. */
  child(subComponent: string): StructuredLogger
}

// ── Output sink (overridable for testing) ─────────────────────────────────────

export type LogSink = (entry: LogEntry, formatted: string) => void

const defaultSink: LogSink = (entry, formatted) => {
  if (entry.level === 'ERROR') {
    process.stderr.write(formatted + '\n')
  } else {
    process.stderr.write(formatted + '\n')
  }
}

let activeSink: LogSink = defaultSink

/** Override the log output sink (useful for testing). */
export function setLogSink(sink: LogSink): void {
  activeSink = sink
}

/** Restore the default stderr sink. */
export function resetLogSink(): void {
  activeSink = defaultSink
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a structured logger for a specific component.
 *
 * @param component - Tag identifying the source (e.g. 'task-router', 'swarm-executor')
 */
export function createLogger(component: string): StructuredLogger {
  function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const numericLevel = LOG_LEVELS[level]
    if (numericLevel > globalLogLevel) return

    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      component,
      message,
      ...(data ? { data } : {}),
    }

    const formatted = jsonMode ? formatJsonEntry(entry) : formatHumanEntry(entry)
    activeSink(entry, formatted)
  }

  return {
    error: (msg, data) => emit('ERROR', msg, data),
    warn: (msg, data) => emit('WARN', msg, data),
    info: (msg, data) => emit('INFO', msg, data),
    debug: (msg, data) => emit('DEBUG', msg, data),
    trace: (msg, data) => emit('TRACE', msg, data),
    child(subComponent: string): StructuredLogger {
      return createLogger(`${component}:${subComponent}`)
    },
  }
}

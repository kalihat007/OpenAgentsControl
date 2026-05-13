import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  createLogger,
  setGlobalLogLevel,
  getGlobalLogLevel,
  getGlobalLogLevelName,
  setJsonMode,
  isJsonMode,
  parseLogLevel,
  configureFromFlags,
  setLogSink,
  resetLogSink,
  LOG_LEVELS,
  type LogEntry,
  type LogLevel,
} from './logger.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function collectLogs(): { entries: LogEntry[]; lines: string[] } {
  const entries: LogEntry[] = []
  const lines: string[] = []
  setLogSink((entry, formatted) => {
    entries.push(entry)
    lines.push(formatted)
  })
  return { entries, lines }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  setGlobalLogLevel('INFO')
  setJsonMode(false)
  resetLogSink()
})

afterEach(() => {
  setGlobalLogLevel('INFO')
  setJsonMode(false)
  resetLogSink()
  delete process.env['LOG_LEVEL']
  delete process.env['LOG_JSON']
})

// ── Log level filtering ───────────────────────────────────────────────────────

describe('log level filtering', () => {
  it('filters out messages below the current level', () => {
    setGlobalLogLevel('WARN')
    const { entries } = collectLogs()
    const log = createLogger('test')

    log.error('visible error')
    log.warn('visible warn')
    log.info('filtered info')
    log.debug('filtered debug')
    log.trace('filtered trace')

    expect(entries).toHaveLength(2)
    expect(entries[0]!.level).toBe('ERROR')
    expect(entries[1]!.level).toBe('WARN')
  })

  it('shows all levels at TRACE', () => {
    setGlobalLogLevel('TRACE')
    const { entries } = collectLogs()
    const log = createLogger('test')

    log.error('e')
    log.warn('w')
    log.info('i')
    log.debug('d')
    log.trace('t')

    expect(entries).toHaveLength(5)
    const levels = entries.map((e) => e.level)
    expect(levels).toEqual(['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'])
  })

  it('only shows ERROR at ERROR level', () => {
    setGlobalLogLevel('ERROR')
    const { entries } = collectLogs()
    const log = createLogger('test')

    log.error('visible')
    log.warn('filtered')
    log.info('filtered')

    expect(entries).toHaveLength(1)
    expect(entries[0]!.level).toBe('ERROR')
  })

  it('accepts numeric level values', () => {
    setGlobalLogLevel(LOG_LEVELS.DEBUG)
    const { entries } = collectLogs()
    const log = createLogger('test')

    log.debug('visible')
    log.trace('filtered')

    expect(entries).toHaveLength(1)
  })
})

// ── Structured output format ──────────────────────────────────────────────────

describe('structured output format', () => {
  it('includes timestamp, level, component, and message in entries', () => {
    const { entries } = collectLogs()
    const log = createLogger('my-component')

    log.info('hello world')

    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.timestamp).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)
    expect(entry.level).toBe('INFO')
    expect(entry.component).toBe('my-component')
    expect(entry.message).toBe('hello world')
  })

  it('includes structured data when provided', () => {
    const { entries } = collectLogs()
    const log = createLogger('router')

    log.info('Scored experts', { count: 5, topExpert: 'CoderAgent' })

    const entry = entries[0]!
    expect(entry.data).toEqual({ count: 5, topExpert: 'CoderAgent' })
  })

  it('omits data field when no data provided', () => {
    const { entries } = collectLogs()
    const log = createLogger('test')

    log.info('no data')

    expect(entries[0]!.data).toBeUndefined()
  })

  it('formats human-readable output with ANSI codes', () => {
    const { lines } = collectLogs()
    const log = createLogger('test-comp')

    log.info('hello')

    expect(lines[0]).toContain('INFO')
    expect(lines[0]).toContain('[test-comp]')
    expect(lines[0]).toContain('hello')
  })

  it('includes key=value pairs for data in human mode', () => {
    const { lines } = collectLogs()
    const log = createLogger('test')

    log.info('result', { score: 42 })

    expect(lines[0]).toContain('score=')
    expect(lines[0]).toContain('42')
  })
})

// ── JSON mode ─────────────────────────────────────────────────────────────────

describe('JSON output mode', () => {
  it('outputs valid JSON when json mode is enabled', () => {
    setJsonMode(true)
    const { lines } = collectLogs()
    const log = createLogger('json-test')

    log.info('test message', { key: 'value' })

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.level).toBe('INFO')
    expect(parsed.component).toBe('json-test')
    expect(parsed.msg).toBe('test message')
    expect(parsed.data).toEqual({ key: 'value' })
    expect(parsed.ts).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)
  })

  it('omits data key in JSON when no data provided', () => {
    setJsonMode(true)
    const { lines } = collectLogs()
    const log = createLogger('test')

    log.warn('no data')

    const parsed = JSON.parse(lines[0]!)
    expect(parsed.data).toBeUndefined()
    expect(parsed.level).toBe('WARN')
  })

  it('tracks json mode state correctly', () => {
    expect(isJsonMode()).toBe(false)
    setJsonMode(true)
    expect(isJsonMode()).toBe(true)
    setJsonMode(false)
    expect(isJsonMode()).toBe(false)
  })
})

// ── Factory function ──────────────────────────────────────────────────────────

describe('createLogger factory', () => {
  it('tags entries with the component name', () => {
    const { entries } = collectLogs()
    const log = createLogger('swarm-executor')

    log.info('session created')

    expect(entries[0]!.component).toBe('swarm-executor')
  })

  it('child loggers use parent:child component format', () => {
    const { entries } = collectLogs()
    const parent = createLogger('scheduler')
    const child = parent.child('batch')

    child.info('batch planned')

    expect(entries[0]!.component).toBe('scheduler:batch')
  })

  it('multiple loggers use independent component tags', () => {
    const { entries } = collectLogs()
    const logA = createLogger('module-a')
    const logB = createLogger('module-b')

    logA.info('from a')
    logB.info('from b')

    expect(entries[0]!.component).toBe('module-a')
    expect(entries[1]!.component).toBe('module-b')
  })
})

// ── parseLogLevel ─────────────────────────────────────────────────────────────

describe('parseLogLevel', () => {
  it('parses valid level names (case-insensitive)', () => {
    expect(parseLogLevel('error')).toBe('ERROR')
    expect(parseLogLevel('WARN')).toBe('WARN')
    expect(parseLogLevel('Info')).toBe('INFO')
    expect(parseLogLevel('debug')).toBe('DEBUG')
    expect(parseLogLevel('TRACE')).toBe('TRACE')
  })

  it('returns undefined for invalid input', () => {
    expect(parseLogLevel('verbose')).toBeUndefined()
    expect(parseLogLevel('')).toBeUndefined()
    expect(parseLogLevel('42')).toBeUndefined()
  })
})

// ── getGlobalLogLevel / getGlobalLogLevelName ─────────────────────────────────

describe('global log level accessors', () => {
  it('returns the current level as a number', () => {
    setGlobalLogLevel('DEBUG')
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.DEBUG)
  })

  it('returns the current level as a name', () => {
    setGlobalLogLevel('WARN')
    expect(getGlobalLogLevelName()).toBe('WARN')
  })
})

// ── configureFromFlags ────────────────────────────────────────────────────────

describe('configureFromFlags', () => {
  it('--verbose sets level to DEBUG', () => {
    configureFromFlags({ verbose: true })
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.DEBUG)
  })

  it('--debug sets level to TRACE', () => {
    configureFromFlags({ debug: true })
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.TRACE)
  })

  it('--debug takes precedence over --verbose', () => {
    configureFromFlags({ verbose: true, debug: true })
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.TRACE)
  })

  it('respects LOG_LEVEL env var', () => {
    process.env['LOG_LEVEL'] = 'WARN'
    configureFromFlags({})
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.WARN)
  })

  it('CLI flags override LOG_LEVEL env var', () => {
    process.env['LOG_LEVEL'] = 'ERROR'
    configureFromFlags({ verbose: true })
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.DEBUG)
  })

  it('LOG_JSON env var enables JSON mode', () => {
    process.env['LOG_JSON'] = '1'
    configureFromFlags({})
    expect(isJsonMode()).toBe(true)
  })

  it('LOG_JSON=true enables JSON mode', () => {
    process.env['LOG_JSON'] = 'true'
    configureFromFlags({})
    expect(isJsonMode()).toBe(true)
  })

  it('ignores invalid LOG_LEVEL values', () => {
    process.env['LOG_LEVEL'] = 'BANANA'
    configureFromFlags({})
    expect(getGlobalLogLevel()).toBe(LOG_LEVELS.INFO)
  })
})

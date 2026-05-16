/**
 * oac swarm-status — List and inspect swarm/experts run sessions under .oac/runs/
 *
 * Usage:
 *   oac swarm-status                    List recent runs
 *   oac swarm-status <session-id>         Show run summary + recent events
 */

import type { Command } from 'commander'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log, info, success, dim, warn } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { createLogger } from '../lib/logger.js'

const cmdLog = createLogger('cmd:swarm-status')

interface RunSummary {
  runId: string
  objective?: string
  createdAt?: string
  executionMode?: string | null
  completedTasks?: string[]
  failedTasks?: string[]
  acceptance?: { passed: number; failed: number; unverified: number }
  qualityGate?: { passed: boolean; overallScore: number; grade: string } | null
}

interface SwarmEvent {
  type: string
  message: string
  timestamp?: string
}

export async function swarmStatusCommand(sessionId?: string): Promise<void> {
  const projectRoot = process.cwd()
  const runsDir = join(projectRoot, '.oac', 'runs')

  cmdLog.debug('swarm-status', { sessionId, runsDir })

  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    warn('No runs directory found. Run `oac experts --run` to create a session.')
    dim(`  Expected: ${runsDir}`)
    return
  }

  const runIds = entries.filter((e) => !e.startsWith('.')).sort().reverse()

  if (runIds.length === 0) {
    warn('No swarm runs found.')
    dim('  Run `oac experts --run "<objective>"` to start a session.')
    return
  }

  if (!sessionId) {
    log('')
    info(`Swarm runs (${runIds.length}):`)
    log('')
    const shown = runIds.slice(0, 20)
    for (const id of shown) {
      const summary = await loadSummary(runsDir, id)
      const objective = summary?.objective
        ? truncate(summary.objective, 60)
        : '(no summary)'
      const mode = summary?.executionMode ?? 'plan-only'
      const status = summary?.qualityGate
        ? summary.qualityGate.passed ? '✓ quality' : '✗ quality'
        : summary?.acceptance
          ? `${summary.acceptance.passed}p/${summary.acceptance.failed}f/${summary.acceptance.unverified}u`
          : ''
      log(`  ${id}`)
      dim(`    ${objective}`)
      if (status) dim(`    ${mode} · ${status}`)
    }
    if (runIds.length > shown.length) {
      dim(`  ... ${runIds.length - shown.length} more — use oac swarm-status <id>`)
    }
    log('')
    dim('Pass a session id for full details: oac swarm-status <session-id>')
    return
  }

  if (!runIds.includes(sessionId)) {
    throw new CommandUsageError(
      `Session '${sessionId}' not found. Available: ${runIds.slice(0, 5).join(', ')}${runIds.length > 5 ? '…' : ''}`,
    )
  }

  const runDir = join(runsDir, sessionId)
  const summary = await loadSummary(runsDir, sessionId)
  const spec = await loadJson(join(runDir, 'spec.json'))
  const events = await loadEvents(join(runDir, 'events.ndjson'))

  log('')
  success(`Session: ${sessionId}`)
  log('')

  if (summary) {
    info('Summary:')
    if (summary.objective) log(`  Objective: ${summary.objective}`)
    if (summary.createdAt) log(`  Created: ${summary.createdAt}`)
    if (summary.executionMode) log(`  Mode: ${summary.executionMode}`)
    if (summary.completedTasks) log(`  Completed tasks: ${summary.completedTasks.length}`)
    if (summary.failedTasks && summary.failedTasks.length > 0) {
      warn(`  Failed/blocked: ${summary.failedTasks.length}`)
    }
    if (summary.acceptance) {
      log(`  Acceptance: ${summary.acceptance.passed} passed, ${summary.acceptance.failed} failed, ${summary.acceptance.unverified} unverified`)
    }
    if (summary.qualityGate) {
      const g = summary.qualityGate
      log(`  Quality gate: ${g.passed ? 'PASSED' : 'FAILED'} (${g.overallScore}/100, grade ${g.grade})`)
    }
    log('')
  }

  if (spec && typeof spec === 'object') {
    const s = spec as Record<string, unknown>
    info('Spec:')
    if (s['scenario']) log(`  Scenario: ${String(s['scenario'])}`)
    const experts = s['experts'] as Array<{ name: string; role: string }> | undefined
    if (experts?.length) {
      log(`  Experts (${experts.length}): ${experts.map((e) => `${e.name}(${e.role})`).join(', ')}`)
    }
    log('')
  }

  if (events.length > 0) {
    info(`Recent events (last ${Math.min(10, events.length)} of ${events.length}):`)
    for (const event of events.slice(-10)) {
      dim(`  [${event.type}] ${event.message}`)
    }
    log('')
  } else {
    dim('No events recorded yet.')
    log('')
  }

  dim(`Artifacts: ${runDir}`)
  dim('  plan.json · spec.json · summary.json · events.ndjson · acceptance-report.md')
}

async function loadSummary(runsDir: string, runId: string): Promise<RunSummary | null> {
  try {
    const raw = await readFile(join(runsDir, runId, 'summary.json'), 'utf-8')
    return JSON.parse(raw) as RunSummary
  } catch {
    return null
  }
}

async function loadJson(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

async function loadEvents(path: string): Promise<SwarmEvent[]> {
  try {
    const raw = await readFile(path, 'utf-8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SwarmEvent)
  } catch {
    return []
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '…' : str
}

export function registerSwarmStatusCommand(program: Command): void {
  program
    .command('swarm-status [session-id]')
    .description('List or inspect swarm/experts run sessions under .oac/runs/')
    .addHelpText(
      'after',
      `
Examples:
  oac swarm-status                      List recent runs
  oac swarm-status swarm-m123abc        Show summary and recent events
`,
    )
    .action(async (sessionId: string | undefined) => {
      await swarmStatusCommand(sessionId)
    })
}

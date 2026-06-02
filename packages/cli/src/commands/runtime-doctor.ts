/**
 * oac runtime-doctor - inspect OpenAgent runtime health for QuestMode.
 */

import type { Command } from 'commander'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildRuntimeDoctorReport, type QuestRuntimeNameV18 } from '../lib/quest-runtime-reliability.js'
import { info, log, success, warn } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'

export interface RuntimeDoctorOptions {
  runtime?: string
  json?: boolean
  write?: boolean
}

export async function runtimeDoctorCommand(options: RuntimeDoctorOptions = {}): Promise<void> {
  const projectRoot = process.cwd()
  const runtime = normalizeRuntimeOption(options.runtime)
  const report = buildRuntimeDoctorReport(projectRoot)
  const filtered = runtime
    ? { ...report, checks: report.checks.filter((check) => check.runtime === runtime) }
    : report

  if (options.write) {
    const outDir = join(projectRoot, '.oac')
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'runtime-doctor-report.json'), JSON.stringify(filtered, null, 2) + '\n')
  }

  if (options.json) {
    log(JSON.stringify(filtered, null, 2))
    return
  }

  success(`Runtime doctor: ${filtered.verdict}`)
  info(`Project: ${projectRoot}`)
  for (const check of filtered.checks) {
    const line = `${check.runtime}/${check.id}: ${check.summary}`
    if (check.status === 'fail') warn(line)
    else log(`  ${check.status === 'pass' ? '✓' : '!'} ${line}`)
    if (check.recommendedAction && check.recommendedAction !== 'No action needed.') {
      log(`    action: ${check.recommendedAction}`)
    }
  }
  if (options.write) {
    info(`Wrote ${join(projectRoot, '.oac', 'runtime-doctor-report.json')}`)
  }
}

function normalizeRuntimeOption(value: string | undefined): QuestRuntimeNameV18 | undefined {
  if (!value) return undefined
  if (value === 'kimi' || value === 'opencode' || value === 'codex' || value === 'claude') return value
  throw new CommandUsageError(`Invalid runtime '${value}'. Choose: kimi, opencode, codex, claude`)
}

export function registerRuntimeDoctorCommand(program: Command): void {
  program
    .command('runtime-doctor')
    .description('Run Quest v18 runtime health checks for Kimi, OpenCode, Codex, and Claude')
    .option('--runtime <name>', 'Filter to one runtime: kimi, opencode, codex, or claude')
    .option('--json', 'Print machine-readable runtime doctor report', false)
    .option('--write', 'Write .oac/runtime-doctor-report.json', false)
    .addHelpText(
      'after',
      `
Examples:
  oac runtime-doctor
  oac runtime-doctor --runtime kimi
  oac runtime-doctor --runtime kimi --write
`,
    )
    .action(async (opts: RuntimeDoctorOptions) => {
      await runtimeDoctorCommand(opts)
    })
}

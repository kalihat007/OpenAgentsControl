/**
 * oac quest-verify — Run repo-native checks and update quest trust label.
 */

import { type Command } from 'commander'
import { log, info, success, warn, error, dim, bold } from '../ui/logger.js'
import { CommandUsageError } from '../lib/errors.js'
import { loadReconciledQuest, buildValidationEvent, type QuestVerificationResult } from '../lib/quest-reconciler.js'
import { appendQuestEvent, questExists } from '../lib/quest-run.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const execAsync = promisify(exec)

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestVerifyOptions = {
  force?: boolean
}

interface DetectedCheck {
  name: string
  command: string
  priority: number
}

// ── Project Detection ─────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function detectChecks(projectRoot: string): Promise<DetectedCheck[]> {
  const checks: DetectedCheck[] = []

  // Node / Bun projects
  const packageJsonPath = join(projectRoot, 'package.json')
  if (await fileExists(packageJsonPath)) {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    const scripts = pkg.scripts || {}

    const scriptMappings: Array<[string, string, number]> = [
      ['test', 'test', 1],
      ['build', 'build', 2],
      ['typecheck', 'typecheck', 3],
      ['lint', 'lint', 4],
    ]

    for (const [scriptName, checkName, priority] of scriptMappings) {
      if (scripts[scriptName]) {
        checks.push({
          name: checkName,
          command: `npm run ${scriptName}`,
          priority,
        })
      }
    }

    // Bun-specific fallback
    if (await fileExists(join(projectRoot, 'bun.lockb')) || await fileExists(join(projectRoot, 'bun.lock'))) {
      for (const [scriptName, checkName, priority] of scriptMappings) {
        if (scripts[scriptName] && !checks.some((c) => c.name === checkName)) {
          checks.push({
            name: checkName,
            command: `bun run ${scriptName}`,
            priority,
          })
        }
      }
    }
  }

  // Go projects
  if (await fileExists(join(projectRoot, 'go.mod'))) {
    checks.push({ name: 'test', command: 'go test ./...', priority: 1 })
    checks.push({ name: 'build', command: 'go build ./...', priority: 2 })
  }

  // Rust projects
  if (await fileExists(join(projectRoot, 'Cargo.toml'))) {
    checks.push({ name: 'test', command: 'cargo test', priority: 1 })
    checks.push({ name: 'build', command: 'cargo build', priority: 2 })
    checks.push({ name: 'lint', command: 'cargo clippy', priority: 4 })
  }

  // Python projects
  const isPython =
    (await fileExists(join(projectRoot, 'pyproject.toml'))) ||
    (await fileExists(join(projectRoot, 'setup.py'))) ||
    (await fileExists(join(projectRoot, 'requirements.txt')))
  if (isPython) {
    checks.push({ name: 'test', command: 'python -m pytest', priority: 1 })
    if (await fileExists(join(projectRoot, 'pyproject.toml'))) {
      checks.push({ name: 'lint', command: 'ruff check .', priority: 4 })
    }
  }

  // Makefile fallback (only if no specific project detected above)
  if (checks.length === 0 && (await fileExists(join(projectRoot, 'Makefile')))) {
    checks.push({ name: 'test', command: 'make test', priority: 1 })
    checks.push({ name: 'build', command: 'make build', priority: 2 })
  }

  // Sort by priority
  checks.sort((a, b) => a.priority - b.priority)
  return checks
}

// ── Check Execution ───────────────────────────────────────────────────────────

async function runCheck(
  projectRoot: string,
  check: DetectedCheck,
): Promise<{ passed: boolean; output?: string; durationMs: number }> {
  const start = Date.now()
  try {
    const { stdout, stderr } = await execAsync(check.command, {
      cwd: projectRoot,
      timeout: 120000,
      env: { ...process.env, CI: 'true' },
    })
    const durationMs = Date.now() - start
    const output = stdout || stderr || ''
    return { passed: true, output: output.slice(0, 2000), durationMs }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const output =
      (err && typeof err === 'object' && 'stdout' in err
        ? String((err as { stdout?: unknown }).stdout)
        : '') ||
      (err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: unknown }).stderr)
        : '') ||
      (err instanceof Error ? err.message : String(err))
    return { passed: false, output: output.slice(0, 2000), durationMs }
  }
}

// ── Command Handler ───────────────────────────────────────────────────────────

export async function questVerifyCommand(
  questId: string,
  options: QuestVerifyOptions,
): Promise<void> {
  const projectRoot = process.cwd()

  if (!(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  const quest = await loadReconciledQuest(projectRoot, questId)
  if (!quest) {
    throw new CommandUsageError(`Quest '${questId}' has no quest.json.`)
  }

  log('')
  bold(`Quest Verify — ${questId}`)
  log('')
  info(`Objective: ${quest.objective}`)
  info(`Current trust: ${quest.trustLabel}`)
  log('')

  // Detect checks
  const checks = await detectChecks(projectRoot)
  if (checks.length === 0) {
    warn('No recognizable test/build/lint setup found.')
    warn('Checked for: package.json scripts, go.mod, Cargo.toml, pyproject.toml, Makefile')
    if (!options.force) {
      throw new CommandUsageError(
        'No checks detected. Use --force to mark verified anyway, or add scripts to package.json.',
      )
    }
    info('--force: recording a forced verification note without promoting trust to tested')
  } else {
    info(`Detected ${checks.length} check(s):`)
    for (const c of checks) {
      dim(`  • ${c.name}: ${c.command}`)
    }
    log('')
  }

  // Run checks
  const results: QuestVerificationResult['checks'] = []
  for (const check of checks) {
    const spinner = `  Running ${check.name}...`
    log(spinner)
    const result = await runCheck(projectRoot, check)
    results.push({
      name: check.name,
      command: check.command,
      passed: result.passed,
      output: result.output,
      durationMs: result.durationMs,
    })
    if (result.passed) {
      success(`  ✓ ${check.name} passed (${result.durationMs}ms)`)
    } else {
      error(`  ✗ ${check.name} failed (${result.durationMs}ms)`)
      if (result.output) {
        dim(`    ${result.output.split('\n')[0]?.slice(0, 120) || ''}`)
      }
    }
  }

  const forcedNoChecks = checks.length === 0 && options.force === true
  const overallPassed = results.length > 0 && results.every((r) => r.passed)
  const passedCount = results.filter((r) => r.passed).length

  const verification: QuestVerificationResult = {
    timestamp: new Date().toISOString(),
    checks: results,
    overallPassed,
    summary: forcedNoChecks
      ? '0 checks detected; forced verification recorded'
      : `${passedCount}/${results.length} checks passed`,
    forced: forcedNoChecks || undefined,
    noChecks: forcedNoChecks || undefined,
  }

  log('')
  if (forcedNoChecks) {
    warn(`Verification FORCED — ${verification.summary}`)
  } else if (overallPassed) {
    success(`Verification PASSED — ${verification.summary}`)
  } else {
    error(`Verification FAILED — ${verification.summary}`)
  }
  log('')

  // Persist validation event
  const event = buildValidationEvent(verification)
  await appendQuestEvent(projectRoot, questId, event)

  dim(`Event appended to .oac/runs/${questId}/events.ndjson`)
  dim(`Trust label updated: ${quest.trustLabel} → ${overallPassed ? 'tested' : forcedNoChecks ? 'inspected_only' : 'failed'}`)
  log('')
}

// ── Commander Registration ────────────────────────────────────────────────────

export function registerQuestVerifyCommand(program: Command): void {
  program
    .command('quest-verify <quest-id>')
    .description('Run repo-native checks (test, build, lint) and update quest trust label')
    .option('--force', 'Record verification even if no checks are detected, without marking tested', false)
    .action(async (questId: string, opts: { force?: boolean }) => {
      await questVerifyCommand(questId, { force: opts.force ?? false })
    })
}

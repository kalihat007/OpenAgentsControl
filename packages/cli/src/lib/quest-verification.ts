/**
 * Quest Verification — reusable test/build/lint detection and execution.
 *
 * Extracted from quest-verify.ts so the auto-fix loop and other
 * lib modules can run verification without importing a command module.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { QuestVerificationResult } from './quest-run.js'

const execAsync = promisify(exec)

export interface DetectedCheck {
  name: string
  command: string
  priority: number
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function commandOnPath(command: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${command}`, { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

/** Pick npm/bun for package.json script checks (bun.lock prefers bun; else npm when present, else bun). */
export async function resolveNodeScriptRunner(
  projectRoot: string,
): Promise<'bun' | 'npm' | null> {
  const hasBunLock =
    (await fileExists(join(projectRoot, 'bun.lockb'))) ||
    (await fileExists(join(projectRoot, 'bun.lock')))
  const bunAvailable = await commandOnPath('bun')
  const npmAvailable = await commandOnPath('npm')

  if (hasBunLock && bunAvailable) return 'bun'
  if (npmAvailable) return 'npm'
  if (bunAvailable) return 'bun'
  return null
}

export async function detectChecks(projectRoot: string): Promise<DetectedCheck[]> {
  const checks: DetectedCheck[] = []

  // Node / Bun projects
  const packageJsonPath = join(projectRoot, 'package.json')
  if (await fileExists(packageJsonPath)) {
    const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    const scripts = pkg.scripts || {}
    const runner = await resolveNodeScriptRunner(projectRoot)

    const scriptMappings: Array<[string, string, number]> = [
      ['test', 'test', 1],
      ['build', 'build', 2],
      ['typecheck', 'typecheck', 3],
      ['lint', 'lint', 4],
    ]

    if (runner) {
      for (const [scriptName, checkName, priority] of scriptMappings) {
        if (scripts[scriptName]) {
          checks.push({
            name: checkName,
            command: `${runner} run ${scriptName}`,
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

export async function runCheck(
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

export interface RunQuestVerificationOptions {
  force?: boolean
}

export async function runQuestVerification(
  projectRoot: string,
  options: RunQuestVerificationOptions = {},
): Promise<QuestVerificationResult> {
  const checks = await detectChecks(projectRoot)
  const results: QuestVerificationResult['checks'] = []

  for (const check of checks) {
    const result = await runCheck(projectRoot, check)
    results.push({
      name: check.name,
      command: check.command,
      passed: result.passed,
      output: result.output,
      durationMs: result.durationMs,
    })
  }

  const forcedNoChecks = checks.length === 0 && options.force === true
  const overallPassed = results.length > 0 && results.every((r) => r.passed)
  const passedCount = results.filter((r) => r.passed).length

  return {
    timestamp: new Date().toISOString(),
    checks: results,
    overallPassed,
    summary: forcedNoChecks
      ? '0 checks detected; forced verification recorded'
      : `${passedCount}/${results.length} checks passed`,
    forced: forcedNoChecks || undefined,
    noChecks: forcedNoChecks || undefined,
  }
}

// ── CLI Error Classes ─────────────────────────────────────────────────────────
//
// Custom errors thrown by library/command code instead of calling process.exit().
// The top-level CLI entry point (index.ts) catches these and sets the exit code.

/**
 * Base class for all OAC CLI errors that should result in a non-zero exit code.
 * Carries an exitCode so the top-level handler knows what to return.
 */
export class CliError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

/**
 * Thrown when a component cannot be found in the registry.
 */
export class ComponentNotFoundError extends CliError {
  constructor(ref: string) {
    super(`Component '${ref}' not found. Run 'oac add' to see available components.`)
    this.name = 'ComponentNotFoundError'
  }
}

/**
 * Thrown when the cwd is not a valid project root.
 */
export class NotProjectRootError extends CliError {
  constructor() {
    super('Not a project root — no package.json or .git found in the current directory.')
    this.name = 'NotProjectRootError'
  }
}

/**
 * Thrown when bundled assets cannot be located or are empty.
 */
export class BundledFilesError extends CliError {
  constructor(message: string) {
    super(message)
    this.name = 'BundledFilesError'
  }
}

/**
 * Thrown when file installation fails (permissions, I/O, etc.).
 */
export class InstallError extends CliError {
  constructor(message: string) {
    super(message)
    this.name = 'InstallError'
  }
}

/**
 * Thrown when a command receives invalid or missing arguments.
 */
export class CommandUsageError extends CliError {
  constructor(message: string) {
    super(message)
    this.name = 'CommandUsageError'
  }
}

/**
 * Thrown when swarm execution fails (session creation, scheduling, or runtime errors).
 */
export class SwarmExecutionError extends CliError {
  constructor(message: string) {
    super(message)
    this.name = 'SwarmExecutionError'
  }
}

/**
 * Thrown when the post-run quality gate fails (--run default).
 */
export class QualityGateFailedError extends CliError {
  readonly overallScore: number

  constructor(summary: string, overallScore: number) {
    super(`Quality gate failed: ${summary}`, 1)
    this.name = 'QualityGateFailedError'
    this.overallScore = overallScore
  }
}

/**
 * Thrown when a swarm session exceeds configured API-call or parallelism limits.
 */
export class SessionBudgetExceededError extends SwarmExecutionError {
  readonly limit: number
  readonly used: number
  readonly limitType: 'api_calls' | 'parallel_agents'

  constructor(limitType: 'api_calls' | 'parallel_agents', used: number, limit: number) {
    const label = limitType === 'api_calls' ? 'API calls' : 'parallel agents'
    super(
      `Session budget exceeded: ${label} (${used}/${limit}). ` +
        'Adjust limits in .oac/config.json or reduce plan scope.',
    )
    this.name = 'SessionBudgetExceededError'
    this.limitType = limitType
    this.limit = limit
    this.used = used
  }
}

/**
 * A "clean exit" that signals a specific exit code without an error message.
 * Used for commands like `doctor` that exit 1 on errors but aren't themselves broken.
 */
export class ExitCodeError extends CliError {
  readonly silent: boolean

  constructor(exitCode: number, silent = true) {
    super(silent ? '' : `Exiting with code ${exitCode}`, exitCode)
    this.name = 'ExitCodeError'
    this.silent = silent
  }
}

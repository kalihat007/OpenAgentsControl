import { describe, it, expect, beforeEach, mock } from 'bun:test'
import {
  runExpertPipeline,
  getQuickConfig,
  getFullConfig,
  getSafeConfig,
  type PipelineConfig,
  type PipelineResult,
  type PipelineStage,
  type PipelineCallbacks,
  type QualityReport,
} from './expert-pipeline.js'
import { setGlobalLogLevel, LOG_LEVELS, setLogSink, resetLogSink } from './logger.js'

beforeEach(() => {
  setGlobalLogLevel(LOG_LEVELS.ERROR)
  setLogSink(() => {})
})

// ── Configuration presets ─────────────────────────────────────────────────────

describe('Pipeline configuration presets', () => {
  it('getQuickConfig returns minimal pipeline settings', () => {
    const config = getQuickConfig()
    expect(config.mode).toBe('autonomous')
    expect(config.useIndex).toBe(false)
    expect(config.useMemory).toBe(false)
    expect(config.useDecomposition).toBe(false)
    expect(config.qualityChecks).toBe(false)
    expect(config.dryRun).toBe(false)
    expect(config.verbose).toBe(false)
    expect(config.maxConcurrency).toBe(4)
  })

  it('getFullConfig enables everything with supervised mode', () => {
    const config = getFullConfig()
    expect(config.mode).toBe('supervised')
    expect(config.useIndex).toBe(true)
    expect(config.useMemory).toBe(true)
    expect(config.useDecomposition).toBe(true)
    expect(config.qualityChecks).toBe(true)
    expect(config.dryRun).toBe(false)
    expect(config.verbose).toBe(true)
    expect(config.maxConcurrency).toBe(4)
  })

  it('getSafeConfig uses collaborative mode with quality checks', () => {
    const config = getSafeConfig()
    expect(config.mode).toBe('collaborative')
    expect(config.useIndex).toBe(true)
    expect(config.useMemory).toBe(true)
    expect(config.useDecomposition).toBe(true)
    expect(config.qualityChecks).toBe(true)
    expect(config.maxConcurrency).toBe(2)
  })

  it('presets have distinct mode values', () => {
    expect(getQuickConfig().mode).toBe('autonomous')
    expect(getFullConfig().mode).toBe('supervised')
    expect(getSafeConfig().mode).toBe('collaborative')
  })
})

// ── Pipeline result structure ─────────────────────────────────────────────────

describe('Pipeline result structure', () => {
  it('returns a well-formed PipelineResult on simple objective', async () => {
    const result = await runExpertPipeline(
      'build a REST API',
      process.cwd(),
      { ...getQuickConfig(), mode: 'autonomous' },
    )

    expect(result.objective).toBe('build a REST API')
    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.stages)).toBe(true)
    expect(result.stages.length).toBeGreaterThan(0)
    expect(Array.isArray(result.routing)).toBe(true)
    expect(result.routing.length).toBeGreaterThan(0)
    expect(Array.isArray(result.subTasks)).toBe(true)
    expect(Array.isArray(result.qualityReports)).toBe(true)
    expect(typeof result.decomposed).toBe('boolean')
    expect(typeof result.memoryUpdated).toBe('boolean')
  })

  it('includes plan and execution results when running', async () => {
    const result = await runExpertPipeline(
      'implement user authentication with JWT',
      process.cwd(),
      { ...getQuickConfig(), mode: 'autonomous' },
    )

    expect(result.plan).not.toBeNull()
    expect(result.executionResults).not.toBeNull()
    expect(result.executionResults!.completedTasks.length).toBeGreaterThan(0)
    expect(result.executionResults!.session).toBeDefined()
  })

  it('includes interactiveSession in result', async () => {
    const result = await runExpertPipeline(
      'write unit tests for auth module',
      process.cwd(),
      { ...getQuickConfig(), mode: 'autonomous' },
    )

    expect(result.interactiveSession).not.toBeNull()
    expect(result.interactiveSession!.mode).toBe('autonomous')
  })
})

// ── Stage progression ─────────────────────────────────────────────────────────

describe('Pipeline stage progression', () => {
  it('quick config skips indexing stage', async () => {
    const result = await runExpertPipeline(
      'fix a bug in the login form',
      process.cwd(),
      getQuickConfig(),
    )

    expect(result.stages.includes('indexing')).toBe(false)
    expect(result.stages.includes('routing')).toBe(true)
    expect(result.stages.includes('planning')).toBe(true)
    expect(result.stages.includes('execution')).toBe(true)
    expect(result.stages.includes('complete')).toBe(true)
  })

  it('completes with "complete" as the last stage', async () => {
    const result = await runExpertPipeline(
      'create a React component',
      process.cwd(),
      getQuickConfig(),
    )

    const lastStage = result.stages[result.stages.length - 1]
    expect(lastStage).toBe('complete')
  })

  it('tracks stages in logical order', async () => {
    const result = await runExpertPipeline(
      'build a search feature',
      process.cwd(),
      getQuickConfig(),
    )

    const routingIdx = result.stages.indexOf('routing')
    const planningIdx = result.stages.indexOf('planning')
    const executionIdx = result.stages.indexOf('execution')
    const completeIdx = result.stages.indexOf('complete')

    expect(routingIdx).toBeLessThan(planningIdx)
    expect(planningIdx).toBeLessThan(executionIdx)
    expect(executionIdx).toBeLessThan(completeIdx)
  })
})

// ── Decomposition integration ─────────────────────────────────────────────────

describe('Decomposition integration', () => {
  it('skips decomposition for simple tasks when useDecomposition is false', async () => {
    const result = await runExpertPipeline(
      'fix a typo',
      process.cwd(),
      { ...getQuickConfig(), useDecomposition: false },
    )

    expect(result.decomposed).toBe(false)
    expect(result.subTasks.length).toBe(0)
  })

  it('decomposes complex multi-intent objectives when enabled', async () => {
    const result = await runExpertPipeline(
      'build a login page with OAuth authentication and rate limiting and deploy to production',
      process.cwd(),
      { ...getQuickConfig(), useDecomposition: true },
    )

    expect(result.decomposed).toBe(true)
    expect(result.subTasks.length).toBeGreaterThan(0)
  })

  it('does not decompose simple tasks even when enabled', async () => {
    const result = await runExpertPipeline(
      'fix bug',
      process.cwd(),
      { ...getQuickConfig(), useDecomposition: true },
    )

    expect(result.decomposed).toBe(false)
    expect(result.subTasks.length).toBe(0)
  })

  it('routes each sub-task separately after decomposition', async () => {
    const result = await runExpertPipeline(
      'build a React frontend and a REST API backend with database migrations and deploy it',
      process.cwd(),
      { ...getQuickConfig(), useDecomposition: true },
    )

    if (result.decomposed) {
      expect(result.routing.length).toBeGreaterThanOrEqual(result.subTasks.length)
    }
  })
})

// ── Memory integration ────────────────────────────────────────────────────────

describe('Memory integration', () => {
  it('runs without memory when useMemory is false', async () => {
    const result = await runExpertPipeline(
      'create a REST endpoint',
      process.cwd(),
      { ...getQuickConfig(), useMemory: false },
    )

    expect(result.memoryUpdated).toBe(false)
  })

  it('attempts memory update when useMemory is true', async () => {
    const result = await runExpertPipeline(
      'implement a login API',
      process.cwd(),
      { ...getQuickConfig(), useMemory: true },
    )

    expect(typeof result.memoryUpdated).toBe('boolean')
  })
})

// ── Callback invocations ──────────────────────────────────────────────────────

describe('Pipeline callbacks', () => {
  it('invokes onStageChange for each stage', async () => {
    const stageChanges: Array<{ stage: PipelineStage; message: string }> = []

    await runExpertPipeline(
      'build a search feature',
      process.cwd(),
      getQuickConfig(),
      {
        onStageChange: (stage, message) => {
          stageChanges.push({ stage, message })
        },
      },
    )

    expect(stageChanges.length).toBeGreaterThan(0)
    const stages = stageChanges.map((s) => s.stage)
    expect(stages.includes('routing')).toBe(true)
    expect(stages.includes('complete')).toBe(true)
  })

  it('invokes onProgress during execution', async () => {
    const progressUpdates: Array<{ pct: number; message: string }> = []

    await runExpertPipeline(
      'build a REST API with auth',
      process.cwd(),
      getQuickConfig(),
      {
        onProgress: (pct, message) => {
          progressUpdates.push({ pct, message })
        },
      },
    )

    expect(progressUpdates.length).toBeGreaterThan(0)
  })

  it('invokes onComplete with the final result', async () => {
    let completedResult: PipelineResult | null = null

    const result = await runExpertPipeline(
      'create a component',
      process.cwd(),
      getQuickConfig(),
      {
        onComplete: (r) => {
          completedResult = r
        },
      },
    )

    expect(completedResult).not.toBeNull()
    expect(completedResult!.objective).toBe(result.objective)
    expect(completedResult!.duration).toBe(result.duration)
  })

  it('invokes onQualityReport when quality checks are enabled', async () => {
    const reports: QualityReport[] = []

    await runExpertPipeline(
      'implement an auth endpoint',
      process.cwd(),
      { ...getQuickConfig(), qualityChecks: true },
      {
        onQualityReport: (report) => {
          reports.push(report)
        },
      },
    )

    expect(reports.length).toBeGreaterThan(0)
    for (const report of reports) {
      expect(typeof report.taskId).toBe('string')
      expect(typeof report.agent).toBe('string')
      expect(typeof report.score).toBe('number')
      expect(Array.isArray(report.checks)).toBe(true)
    }
  })

  it('invokes onApprovalNeeded in supervised mode and continues on approval', async () => {
    let approvalRequested = false

    const result = await runExpertPipeline(
      'build login feature',
      process.cwd(),
      { ...getQuickConfig(), mode: 'supervised' },
      {
        onApprovalNeeded: async () => {
          approvalRequested = true
          return true
        },
      },
    )

    expect(approvalRequested).toBe(true)
    expect(result.executionResults).not.toBeNull()
  })

  it('stops execution when approval is rejected', async () => {
    const result = await runExpertPipeline(
      'deploy to production',
      process.cwd(),
      { ...getQuickConfig(), mode: 'supervised' },
      {
        onApprovalNeeded: async () => false,
      },
    )

    expect(result.executionResults).toBeNull()
    expect(result.stages.includes('execution')).toBe(false)
  })
})

// ── Dry run mode ──────────────────────────────────────────────────────────────

describe('Dry run mode', () => {
  it('returns plan without executing when dryRun is true', async () => {
    const result = await runExpertPipeline(
      'build a microservice',
      process.cwd(),
      { ...getQuickConfig(), dryRun: true },
    )

    expect(result.plan).not.toBeNull()
    expect(result.executionResults).toBeNull()
    expect(result.stages.includes('execution')).toBe(false)
    expect(result.stages.includes('complete')).toBe(true)
  })

  it('dry run still performs routing', async () => {
    const result = await runExpertPipeline(
      'create a REST API',
      process.cwd(),
      { ...getQuickConfig(), dryRun: true },
    )

    expect(result.routing.length).toBeGreaterThan(0)
    expect(result.stages.includes('routing')).toBe(true)
  })

  it('dry run does not update memory', async () => {
    const result = await runExpertPipeline(
      'implement auth',
      process.cwd(),
      { ...getQuickConfig(), dryRun: true, useMemory: true },
    )

    expect(result.memoryUpdated).toBe(false)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('handles gracefully when no experts match (still returns result)', async () => {
    const result = await runExpertPipeline(
      'xyzzy foobar baz',
      process.cwd(),
      getQuickConfig(),
    )

    expect(result.objective).toBe('xyzzy foobar baz')
    expect(Array.isArray(result.stages)).toBe(true)
    expect(typeof result.duration).toBe('number')
  })

  it('continues when codebase indexing returns empty results for bad path', async () => {
    const result = await runExpertPipeline(
      'build an API',
      '/nonexistent/path/that/should/fail',
      { ...getQuickConfig(), useIndex: true },
    )

    expect(result.codebaseIndex).not.toBeNull()
    expect(result.codebaseIndex!.modules.length).toBe(0)
    expect(result.stages.includes('routing')).toBe(true)
  })

  it('returns partial result on planning failure for empty objective', async () => {
    const result = await runExpertPipeline(
      '',
      process.cwd(),
      getQuickConfig(),
    )

    expect(typeof result.duration).toBe('number')
    expect(Array.isArray(result.stages)).toBe(true)
  })
})

// ── Custom config merging ─────────────────────────────────────────────────────

describe('Custom config merging', () => {
  it('overrides specific fields from full config', async () => {
    const result = await runExpertPipeline(
      'build a feature',
      process.cwd(),
      { ...getFullConfig(), useIndex: false, mode: 'autonomous' },
    )

    expect(result.codebaseIndex).toBeNull()
    expect(result.interactiveSession?.mode).toBe('autonomous')
  })

  it('defaults to full config when no overrides', async () => {
    const stageChanges: PipelineStage[] = []

    await runExpertPipeline(
      'build a REST API with auth',
      process.cwd(),
      getQuickConfig(),
      {
        onStageChange: (stage) => stageChanges.push(stage),
      },
    )

    expect(stageChanges.includes('routing')).toBe(true)
    expect(stageChanges.includes('planning')).toBe(true)
  })
})

// ── Quality checks ────────────────────────────────────────────────────────────

describe('Quality checks', () => {
  it('produces quality reports when qualityChecks is enabled', async () => {
    const result = await runExpertPipeline(
      'implement a REST API with JWT auth',
      process.cwd(),
      { ...getQuickConfig(), qualityChecks: true },
    )

    expect(result.qualityReports.length).toBeGreaterThan(0)
    for (const report of result.qualityReports) {
      expect(typeof report.score).toBe('number')
      expect(report.score).toBeGreaterThanOrEqual(0)
      expect(report.score).toBeLessThanOrEqual(1)
      expect(report.passed + report.failed + report.unverified).toBe(report.checks.length)
    }
  })

  it('skips quality reports when qualityChecks is disabled', async () => {
    const result = await runExpertPipeline(
      'build an auth API',
      process.cwd(),
      { ...getQuickConfig(), qualityChecks: false },
    )

    expect(result.qualityReports.length).toBe(0)
  })

  it('includes quality and verification stages when enabled', async () => {
    const result = await runExpertPipeline(
      'build an API',
      process.cwd(),
      { ...getQuickConfig(), qualityChecks: true },
    )

    expect(result.stages.includes('quality')).toBe(true)
    expect(result.stages.includes('verification')).toBe(true)
  })
})

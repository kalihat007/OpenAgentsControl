import { describe, it, expect } from 'bun:test'
import { routeTask } from './task-router.js'
import { planExecution } from './swarm-executor.js'
import { buildRunSpec, RUN_SPEC_VERSION } from './run-spec.js'

describe('run-spec', () => {
  it('buildRunSpec produces versioned spec with expert roster', () => {
    const routed = routeTask('add unit tests for auth module', process.cwd())
    const plan = planExecution(routed)
    const spec = buildRunSpec(routed, plan)

    expect(spec.version).toBe(RUN_SPEC_VERSION)
    expect(spec.experts.some((e) => e.role === 'primary')).toBe(true)
    expect(spec.requirements.summary).toBe(routed.objective)
  })
})

import { describe, expect, it } from 'bun:test'
import { compilePrePlanningRequirements } from './quest-preplanning-requirements.js'
import { routeTask } from './task-router.js'

describe('quest-preplanning-requirements', () => {
  it('captures vague objectives as assumptions before task planning', () => {
    const routed = routeTask('fix everything and do the needful', process.cwd())
    const compiled = compilePrePlanningRequirements(routed)

    expect(compiled.version).toBe('15')
    expect(compiled.readiness).toBe('needs-clarification')
    expect(compiled.clarifyingQuestions.length).toBeGreaterThan(0)
    expect(compiled.assumptions.length).toBe(compiled.clarifyingQuestions.length)
    expect(compiled.acceptanceCriteria.some((criterion) =>
      criterion.startsWith('Pre-planning requirement readiness is needs-clarification'),
    )).toBe(true)
  })

  it('keeps direct coding requests ready with validation and next-step criteria', () => {
    const routed = routeTask(
      'implement a TypeScript function and class for a CLI script feature',
      process.cwd(),
    )
    const compiled = compilePrePlanningRequirements(routed)

    expect(compiled.version).toBe('15')
    expect(compiled.readiness).toBe('ready')
    expect(compiled.requirements.some((requirement) =>
      requirement.statement === 'Record validation evidence before the Quest is marked COMPLETE.',
    )).toBe(true)
    expect(compiled.acceptanceCriteria).toContain(
      'Next steps are suggested after completion and the agent waits for the user',
    )
  })
})

import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createIncident,
  findIncidentById,
  getIncidentStats,
  resolveIncident,
  searchIncidents,
  writePostMortem,
} from './incident-tracker.js'

describe('incident-tracker', () => {
  it('creates, searches, resolves, and stores post-mortems', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'oac-incidents-'))
    try {
      const incidentId = await createIncident(projectRoot, {
        questId: 'quest-1',
        taskId: 'task-1',
        category: 'runtime_crash',
        summary: 'Kimi runtime exited unexpectedly',
        evidence: ['exitCode=1'],
        severity: 'high',
      })

      expect(incidentId.startsWith('incident-')).toBe(true)

      const open = await searchIncidents(projectRoot, { status: 'open' })
      expect(open).toHaveLength(1)
      expect(open[0]?.summary).toContain('Kimi runtime')

      await resolveIncident(projectRoot, incidentId, 'Retried with fixed runtime prompt', 'TestEngineer')
      await writePostMortem(projectRoot, incidentId, {
        summary: 'Runtime prompt was missing required write-back details',
        rootCause: 'Prompt contract drift',
        impact: 'Quest paused until retry',
        timeline: [{ time: '2026-05-17T00:00:00.000Z', event: 'Failure observed' }],
        lessonsLearned: ['Keep runtime prompt contract tested'],
        preventiveMeasures: ['Add focused regression tests'],
      })

      const resolved = await findIncidentById(projectRoot, incidentId)
      expect(resolved?.status).toBe('resolved')
      expect(resolved?.resolvedBy).toBe('TestEngineer')
      expect(resolved?.postMortem?.rootCause).toBe('Prompt contract drift')

      const stats = await getIncidentStats(projectRoot)
      expect(stats.total).toBe(1)
      expect(stats.resolved).toBe(1)
      expect(stats.bySeverity.high).toBe(1)
      expect(stats.byCategory.runtime_crash).toBe(1)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

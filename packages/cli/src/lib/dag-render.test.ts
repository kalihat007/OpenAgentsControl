import { describe, expect, it } from 'bun:test'
import { buildDagLevels, renderDag, renderDagFlow } from './dag-render.js'

describe('dag-render', () => {
  describe('buildDagLevels', () => {
    it('assigns level 0 to root tasks', () => {
      const tasks = [
        { id: 'a', title: 'A', status: 'pending', dependsOn: [] },
        { id: 'b', title: 'B', status: 'pending', dependsOn: [] },
      ]
      const levels = buildDagLevels(tasks)
      expect(levels.get('a')).toBe(0)
      expect(levels.get('b')).toBe(0)
    })

    it('assigns level 1 to tasks depending on level 0', () => {
      const tasks = [
        { id: 'a', title: 'A', status: 'pending', dependsOn: [] },
        { id: 'b', title: 'B', status: 'pending', dependsOn: ['a'] },
      ]
      const levels = buildDagLevels(tasks)
      expect(levels.get('a')).toBe(0)
      expect(levels.get('b')).toBe(1)
    })

    it('handles transitive dependencies', () => {
      const tasks = [
        { id: 'a', title: 'A', status: 'pending', dependsOn: [] },
        { id: 'b', title: 'B', status: 'pending', dependsOn: ['a'] },
        { id: 'c', title: 'C', status: 'pending', dependsOn: ['b'] },
      ]
      const levels = buildDagLevels(tasks)
      expect(levels.get('a')).toBe(0)
      expect(levels.get('b')).toBe(1)
      expect(levels.get('c')).toBe(2)
    })

    it('handles diamond graph', () => {
      const tasks = [
        { id: 'a', title: 'A', status: 'pending', dependsOn: [] },
        { id: 'b', title: 'B', status: 'pending', dependsOn: ['a'] },
        { id: 'c', title: 'C', status: 'pending', dependsOn: ['a'] },
        { id: 'd', title: 'D', status: 'pending', dependsOn: ['b', 'c'] },
      ]
      const levels = buildDagLevels(tasks)
      expect(levels.get('a')).toBe(0)
      expect(levels.get('b')).toBe(1)
      expect(levels.get('c')).toBe(1)
      expect(levels.get('d')).toBe(2)
    })
  })

  describe('renderDag', () => {
    it('renders empty tasks', () => {
      expect(renderDag([])).toEqual([])
    })

    it('renders single task', () => {
      const lines = renderDag([
        { id: 'a', title: 'A', status: 'completed', dependsOn: [] },
      ])
      expect(lines.length).toBeGreaterThanOrEqual(1)
      expect(lines[0]).toContain('a')
    })

    it('renders dependency connector between levels', () => {
      const lines = renderDag([
        { id: 'a', title: 'A', status: 'completed', dependsOn: [] },
        { id: 'b', title: 'B', status: 'pending', dependsOn: ['a'] },
      ])
      expect(lines.some((l) => l.includes('│'))).toBe(true)
    })
  })

  describe('renderDagFlow', () => {
    it('renders flow with arrows', () => {
      const flow = renderDagFlow([
        { id: 'a', title: 'A', status: 'completed', dependsOn: [] },
        { id: 'b', title: 'B', status: 'in_progress', dependsOn: ['a'] },
      ])
      expect(flow).toContain('→')
      expect(flow).toContain('a')
      expect(flow).toContain('b')
    })

    it('truncates with ellipsis when exceeding maxTasks', () => {
      const tasks = Array.from({ length: 15 }, (_, i) => ({
        id: `t${i}`,
        title: `T${i}`,
        status: 'pending' as const,
        dependsOn: i > 0 ? [`t${i - 1}`] : [],
      }))
      const flow = renderDagFlow(tasks, 5)
      expect(flow).toContain('…+')
    })
  })
})

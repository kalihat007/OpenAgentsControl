import { describe, expect, it } from 'bun:test'
import { buildDag, findTransitiveDependents, findTasksToResetOnRetry } from './task-dag.js'

describe('task-dag', () => {
  describe('buildDag', () => {
    it('creates empty graph for empty nodes', () => {
      const g = buildDag([])
      expect(g.nodes.size).toBe(0)
    })

    it('maps children from dependsOn', () => {
      const g = buildDag([
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
      ])
      expect(g.children.get('a')).toEqual(['b', 'c'])
      expect(g.children.get('b')).toEqual([])
    })
  })

  describe('findTransitiveDependents', () => {
    it('returns empty for leaf node', () => {
      const g = buildDag([
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
      ])
      expect(findTransitiveDependents(g, 'b')).toEqual([])
    })

    it('finds direct dependents', () => {
      const g = buildDag([
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
      ])
      expect(findTransitiveDependents(g, 'a')).toEqual(['b', 'c'])
    })

    it('finds transitive dependents', () => {
      const g = buildDag([
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['b'] },
        { id: 'd', dependsOn: ['c'] },
      ])
      expect(findTransitiveDependents(g, 'a')).toEqual(['b', 'c', 'd'])
    })

    it('handles diamond graph', () => {
      const g = buildDag([
        { id: 'a', dependsOn: [] },
        { id: 'b', dependsOn: ['a'] },
        { id: 'c', dependsOn: ['a'] },
        { id: 'd', dependsOn: ['b', 'c'] },
      ])
      const deps = findTransitiveDependents(g, 'a')
      expect(deps).toContain('b')
      expect(deps).toContain('c')
      expect(deps).toContain('d')
      expect(deps).toHaveLength(3)
    })
  })

  describe('findTasksToResetOnRetry', () => {
    it('includes the retried task itself', () => {
      const tasks = [
        { id: 'a', dependsOn: [] as string[] },
        { id: 'b', dependsOn: ['a'] },
      ]
      expect(findTasksToResetOnRetry(tasks, 'a')).toEqual(['a', 'b'])
    })
  })
})

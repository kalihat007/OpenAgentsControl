import { describe, it, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { refreshRepoWiki, loadRepoWikiSnapshot } from './repo-wiki.js'
import { buildQuestRun, appendQuestEvent, persistQuestRun } from './quest-run.js'
import { planExecution } from './swarm-executor.js'
import type { RouterResult } from './task-router.js'

function routerResult(objective: string): RouterResult {
  return {
    objective,
    scenario: 'code_with_spec',
    primaryExperts: [
      {
        id: 'coder',
        name: 'CoderAgent',
        description: 'writes code',
        category: 'development',
        keywords: ['code'],
        filePatterns: ['*.ts'],
        score: 10,
      },
    ],
    secondaryExperts: [],
    reasoning: [],
    estimatedChunks: 2,
    confidence: {
      score: 1,
      isLowConfidence: false,
      isAmbiguous: false,
      ambiguousExperts: [],
    },
    clarification: {
      needed: false,
      questions: [],
    },
  }
}

describe('repo-wiki', () => {
  it('builds a living repo wiki for the current project directory', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-repo-wiki-'))
    try {
      await mkdir(join(tmpRoot, 'src'), { recursive: true })
      await mkdir(join(tmpRoot, 'test'), { recursive: true })
      await writeFile(join(tmpRoot, 'package.json'), JSON.stringify({ name: 'wiki-test', scripts: { test: 'node test.js' } }))
      await writeFile(join(tmpRoot, 'src', 'index.ts'), 'export const value = 1\n')
      await writeFile(join(tmpRoot, 'test', 'index.test.ts'), 'import "../src/index"\n')
      await writeFile(join(tmpRoot, 'README.md'), '# Wiki Test\n')

      const result = await refreshRepoWiki(tmpRoot, { reason: 'test', cwd: tmpRoot })

      expect(result.snapshot.summary.files).toBe(4)
      expect(result.snapshot.summary.packages).toBe(1)
      expect(result.snapshot.summary.byKind.source).toBe(1)
      expect(result.snapshot.summary.byKind.test).toBe(1)
      expect(result.snapshot.packages[0]?.name).toBe('wiki-test')
      expect(result.graph.nodes.some((node) => node.id === 'file:src/index.ts')).toBe(true)
      expect(await readFile(join(tmpRoot, '.oac', 'repo-wiki', 'index.md'), 'utf-8')).toContain('Repo Wiki')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('detects added, modified, and deleted files since the previous refresh', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-repo-wiki-changes-'))
    try {
      await mkdir(join(tmpRoot, 'src'), { recursive: true })
      await writeFile(join(tmpRoot, 'src', 'index.ts'), 'export const value = 1\n')
      await writeFile(join(tmpRoot, 'README.md'), '# First\n')
      await refreshRepoWiki(tmpRoot, { reason: 'first', cwd: tmpRoot })

      await writeFile(join(tmpRoot, 'src', 'index.ts'), 'export const value = 2\n')
      await writeFile(join(tmpRoot, 'src', 'new.ts'), 'export const fresh = true\n')
      await rm(join(tmpRoot, 'README.md'))

      const result = await refreshRepoWiki(tmpRoot, { reason: 'second', cwd: tmpRoot })

      expect(result.snapshot.changes.modified).toContain('src/index.ts')
      expect(result.snapshot.changes.added).toContain('src/new.ts')
      expect(result.snapshot.changes.deleted).toContain('README.md')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('refreshes automatically from Quest file change events', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-repo-wiki-quest-'))
    try {
      await mkdir(join(tmpRoot, 'src'), { recursive: true })
      await writeFile(join(tmpRoot, 'src', 'index.ts'), 'export const value = 1\n')
      const routed = routerResult('update repo wiki')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      await writeFile(join(tmpRoot, 'src', 'index.ts'), 'export const value = 2\n')
      await appendQuestEvent(tmpRoot, quest.questId, {
        timestamp: new Date().toISOString(),
        type: 'file_change',
        data: { added: 'src/index.ts' },
      })

      const snapshot = await loadRepoWikiSnapshot(tmpRoot)
      expect(snapshot?.reason).toBe('quest.file_change')
      expect(snapshot?.questId).toBe(quest.questId)
      expect(snapshot?.changes.questChangedFiles).toContain('src/index.ts')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

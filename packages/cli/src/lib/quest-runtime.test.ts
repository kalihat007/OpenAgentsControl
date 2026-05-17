import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initQuestArtifact,
  readQuestArtifact,
  writeQuestArtifact,
  appendQuestEvent,
  listQuests,
  questExists,
  removeQuest,
  formatRuntimeHandoff,
  formatQuestSummary,
  formatAcceptanceReport,
  getQuestDir,
  QUEST_RUNTIME_VERSION,
} from './quest-runtime.js'

describe('quest-runtime', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-quest-test-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  // ── ID Generation ───────────────────────────────────────────────────────────

  it('generateQuestId creates sequential IDs for the same day', async () => {
    // Create actual quests to reserve IDs
    const a1 = await initQuestArtifact({ projectRoot, objective: 'A', scenario: 'direct', intensity: 'lite' })
    const a2 = await initQuestArtifact({ projectRoot, objective: 'B', scenario: 'direct', intensity: 'lite' })
    const a3 = await initQuestArtifact({ projectRoot, objective: 'C', scenario: 'direct', intensity: 'lite' })

    expect(a1.questId).toMatch(/^quest-\d{8}-001$/)
    expect(a2.questId).toMatch(/^quest-\d{8}-002$/)
    expect(a3.questId).toMatch(/^quest-\d{8}-003$/)
  })

  // ── Init ────────────────────────────────────────────────────────────────────

  it('initQuestArtifact creates quest.json, task-graph.json, events.ndjson, and markdown files', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Test quest init',
      scenario: 'code_with_spec',
      intensity: 'standard',
      tasks: [
        { id: '1', title: 'First task', status: 'pending' },
        { id: '2', title: 'Second task', status: 'in_progress' },
      ],
    })

    expect(artifact.version).toBe(QUEST_RUNTIME_VERSION)
    expect(artifact.objective).toBe('Test quest init')
    expect(artifact.state).toBe('NEW')
    expect(artifact.trustLabel).toBe('planned_only')
    expect(artifact.tasks).toHaveLength(2)

    const questDir = getQuestDir(projectRoot, artifact.questId)
    const files = await readdir(questDir)
    expect(files).toContain('quest.json')
    expect(files).toContain('events.ndjson')
    expect(files).toContain('task-graph.json')
    expect(files).toContain('summary.md')
    expect(files).toContain('acceptance-report.md')

    // Events should have at least one entry
    const eventsRaw = await readFile(join(questDir, 'events.ndjson'), 'utf-8')
    const events = eventsRaw.trim().split('\n').map((l) => JSON.parse(l))
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0].type).toBe('state_change')
  })

  // ── Read/Write ──────────────────────────────────────────────────────────────

  it('writeQuestArtifact and readQuestArtifact roundtrip', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Roundtrip test',
      scenario: 'direct',
      intensity: 'lite',
    })

    artifact.state = 'EXECUTE'
    artifact.trustLabel = 'changed'
    artifact.checkpoint.changedFiles.push('src/index.ts')
    await writeQuestArtifact(projectRoot, artifact)

    const reloaded = await readQuestArtifact(projectRoot, artifact.questId)
    expect(reloaded.state).toBe('EXECUTE')
    expect(reloaded.trustLabel).toBe('changed')
    expect(reloaded.checkpoint.changedFiles).toContain('src/index.ts')
    expect(reloaded.questId).toBe(artifact.questId)
  })

  // ── Existence ───────────────────────────────────────────────────────────────

  it('questExists returns true for existing quests and false otherwise', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Existence test',
      scenario: 'direct',
      intensity: 'lite',
    })

    expect(await questExists(projectRoot, artifact.questId)).toBe(true)
    expect(await questExists(projectRoot, 'quest-19990101-999')).toBe(false)
  })

  // ── Events ──────────────────────────────────────────────────────────────────

  it('appendQuestEvent adds lines to events.ndjson', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Event test',
      scenario: 'direct',
      intensity: 'lite',
    })

    await appendQuestEvent(projectRoot, artifact.questId, {
      timestamp: new Date().toISOString(),
      type: 'task_update',
      data: { taskId: '1', from: 'pending', to: 'completed' },
    })

    const eventsPath = join(getQuestDir(projectRoot, artifact.questId), 'events.ndjson')
    const raw = await readFile(eventsPath, 'utf-8')
    const lines = raw.trim().split('\n')
    expect(lines.length).toBe(2)
    const last = JSON.parse(lines[1] as string)
    expect(last.type).toBe('task_update')
    expect(last.data.taskId).toBe('1')
  })

  // ── Listing ─────────────────────────────────────────────────────────────────

  it('listQuests returns quests sorted by updatedAt descending', async () => {
    const a1 = await initQuestArtifact({
      projectRoot,
      objective: 'Older',
      scenario: 'direct',
      intensity: 'lite',
    })

    const a2 = await initQuestArtifact({
      projectRoot,
      objective: 'Newer',
      scenario: 'direct',
      intensity: 'lite',
    })

    // Force a write on a1 so its updatedAt changes
    a1.trustLabel = 'changed'
    await writeQuestArtifact(projectRoot, a1)

    const list = await listQuests(projectRoot)
    expect(list.length).toBe(2)
    expect(list[0].questId).toBe(a1.questId)
    expect(list[1].questId).toBe(a2.questId)
  })

  it('listQuests returns empty array when no runs exist', async () => {
    const list = await listQuests(projectRoot)
    expect(list).toEqual([])
  })

  // ── Formatting ──────────────────────────────────────────────────────────────

  it('formatRuntimeHandoff includes quest ID, state, tasks, and runtime command', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Handoff test',
      scenario: 'code_with_spec',
      intensity: 'standard',
      tasks: [
        { id: '1', title: 'Done', status: 'completed' },
        { id: '2', title: 'Now', status: 'in_progress' },
        { id: '3', title: 'Later', status: 'pending' },
      ],
    })

    const text = formatRuntimeHandoff(artifact, 'kimi')
    expect(text).toContain(artifact.questId)
    expect(text).toContain('NEW')
    expect(text).toContain('Done')
    expect(text).toContain('Now')
    expect(text).toContain('kimi')
    expect(text).toContain('kimi --work-dir')
  })

  it('formatQuestSummary produces markdown with tasks and checkpoint', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Summary test',
      scenario: 'research_plan',
      intensity: 'deep',
      tasks: [{ id: '1', title: 'Research', status: 'completed' }],
    })

    const md = formatQuestSummary(artifact)
    expect(md).toContain('# Quest Summary')
    expect(md).toContain('Summary test')
    expect(md).toContain('[x] Research')
    expect(md).toContain('## Checkpoint')
  })

  it('formatAcceptanceReport includes changed files and risks', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Report test',
      scenario: 'direct',
      intensity: 'lite',
      tasks: [
        { id: '1', title: 'Good', status: 'completed' },
        { id: '2', title: 'Bad', status: 'failed' },
      ],
    })
    artifact.checkpoint.changedFiles = ['a.ts', 'b.ts']
    artifact.checkpoint.lastValidation = 'tests passed'
    await writeQuestArtifact(projectRoot, artifact)

    const md = formatAcceptanceReport(artifact)
    expect(md).toContain('# Acceptance Report')
    expect(md).toContain('a.ts')
    expect(md).toContain('b.ts')
    expect(md).toContain('Bad')
    expect(md).toContain('failed')
    expect(md).toContain('tests passed')
  })

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  it('removeQuest deletes the quest directory', async () => {
    const artifact = await initQuestArtifact({
      projectRoot,
      objective: 'Cleanup test',
      scenario: 'direct',
      intensity: 'lite',
    })

    expect(await questExists(projectRoot, artifact.questId)).toBe(true)
    await removeQuest(projectRoot, artifact.questId)
    expect(await questExists(projectRoot, artifact.questId)).toBe(false)
  })
})

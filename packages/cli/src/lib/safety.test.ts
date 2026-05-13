import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import {
  isGitRepo,
  hasUncommittedChanges,
  createSnapshot,
  restoreSnapshot,
  createStagingDir,
  cleanupStagingDir,
  stageWrite,
  listStagedWrites,
  createWorktree,
  removeWorktree,
  SafetyError,
} from './safety.js'

async function setupGitRepo(dir: string): Promise<void> {
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@oac.local"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# Test')
  execSync('git add .', { cwd: dir })
  execSync('git commit -m "init"', { cwd: dir })
}

describe('safety', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-safety-test-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('detects non-git repo', () => {
    expect(isGitRepo(projectRoot)).toBe(false)
  })

  it('detects git repo', async () => {
    await setupGitRepo(projectRoot)
    expect(isGitRepo(projectRoot)).toBe(true)
  })

  it('detects uncommitted changes', async () => {
    await setupGitRepo(projectRoot)
    expect(hasUncommittedChanges(projectRoot)).toBe(false)
    await writeFile(join(projectRoot, 'new.md'), 'hello')
    expect(hasUncommittedChanges(projectRoot)).toBe(true)
  })

  it('creates and restores stash snapshot', async () => {
    await setupGitRepo(projectRoot)
    await writeFile(join(projectRoot, 'new.md'), 'hello')
    const snapshot = createSnapshot(projectRoot, 'test-snapshot')
    expect(snapshot.type).toBe('stash')
    expect(hasUncommittedChanges(projectRoot)).toBe(false)
    restoreSnapshot(projectRoot, snapshot)
    expect(hasUncommittedChanges(projectRoot)).toBe(true)
  })

  it('creates tag snapshot when no changes', async () => {
    await setupGitRepo(projectRoot)
    const snapshot = createSnapshot(projectRoot, 'test-tag')
    expect(snapshot.type).toBe('tag')
  })

  it('throws on snapshot in non-git repo', () => {
    expect(() => createSnapshot(projectRoot)).toThrow(SafetyError)
  })

  it('stages writes without touching working tree', async () => {
    const stagingDir = await createStagingDir()
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'original')

    const write = await stageWrite(
      stagingDir,
      'task-1',
      'CoderAgent',
      'src/index.ts',
      'updated content',
      'update',
      projectRoot,
    )

    expect(write.path).toBe('src/index.ts')
    expect(write.originalContent).toBe('original')
    expect(write.operation).toBe('update')

    // Working tree untouched
    const onDisk = await Bun.file(join(projectRoot, 'src', 'index.ts')).text()
    expect(onDisk).toBe('original')

    const staged = await listStagedWrites(stagingDir)
    expect(staged.length).toBe(1)
    expect(staged[0]!.content).toBe('updated content')

    await cleanupStagingDir(stagingDir)
  })

  it('creates and removes worktree', async () => {
    await setupGitRepo(projectRoot)
    const worktree = createWorktree(projectRoot)
    expect(worktree.created).toBe(true)
    expect(worktree.path).toContain('oac-worktree')
    expect(worktree.branch).toContain('oac-run-')

    // Worktree has the file from main
    const readmePath = join(worktree.path, 'README.md')
    expect(await Bun.file(readmePath).exists()).toBe(true)

    removeWorktree(worktree)
    expect(await Bun.file(worktree.path).exists()).toBe(false)
  })
})

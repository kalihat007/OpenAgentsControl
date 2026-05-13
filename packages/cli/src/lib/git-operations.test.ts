import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

import {
  getGitContext,
  isGitRepo,
  getCurrentBranch,
  isWorkingTreeClean,
  createExpertBranch,
  switchBranch,
  deleteBranch,
  listExpertBranches,
  generateDiff,
  generateDiffBetweenBranches,
  parseDiffOutput,
  formatDiffSummary,
  createCommitPlan,
  stageFiles,
  commitChanges,
  generateCommitMessage,
  checkSafety,
  createCheckpoint,
  rollbackToCheckpoint,
  listCheckpoints,
  getChangedFilesSince,
  getFileHistory,
  type GitContext,
  type FileDiff,
  type DiffResult,
  type DiffSummary,
  type CommitPlan,
  type SafetyCheck,
} from './git-operations.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function gitSync(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8' }).trim()
}

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'oac-git-test-'))
  gitSync('init', dir)
  gitSync('config user.email "test@openagents.dev"', dir)
  gitSync('config user.name "Test"', dir)
  // Create an initial commit so HEAD exists
  await writeFile(join(dir, 'README.md'), '# Test repo\n')
  gitSync('add .', dir)
  gitSync('commit -m "Initial commit"', dir)
  return dir
}

async function cleanupTempRepo(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

// ── Git context detection ─────────────────────────────────────────────────────

describe('Git context detection', () => {
  describe('isGitRepo', () => {
    test('returns true for a real git repo', async () => {
      const dir = await createTempRepo()
      try {
        expect(await isGitRepo(dir)).toBe(true)
      } finally {
        await cleanupTempRepo(dir)
      }
    })

    test('returns false for a non-git directory', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'oac-notgit-'))
      try {
        expect(await isGitRepo(dir)).toBe(false)
      } finally {
        await cleanupTempRepo(dir)
      }
    })
  })

  describe('getCurrentBranch', () => {
    test('returns the current branch name', async () => {
      const dir = await createTempRepo()
      try {
        const branch = await getCurrentBranch(dir)
        // git init defaults to main or master depending on config
        expect(['main', 'master']).toContain(branch)
      } finally {
        await cleanupTempRepo(dir)
      }
    })

    test('returns short SHA on detached HEAD', async () => {
      const dir = await createTempRepo()
      try {
        const hash = gitSync('rev-parse HEAD', dir)
        gitSync(`checkout ${hash}`, dir)
        const branch = await getCurrentBranch(dir)
        expect(branch.length).toBeGreaterThan(0)
        expect(branch.length).toBeLessThanOrEqual(hash.length)
      } finally {
        await cleanupTempRepo(dir)
      }
    })
  })

  describe('isWorkingTreeClean', () => {
    test('returns true for a clean repo', async () => {
      const dir = await createTempRepo()
      try {
        expect(await isWorkingTreeClean(dir)).toBe(true)
      } finally {
        await cleanupTempRepo(dir)
      }
    })

    test('returns false when there are changes', async () => {
      const dir = await createTempRepo()
      try {
        await writeFile(join(dir, 'dirty.txt'), 'dirty')
        expect(await isWorkingTreeClean(dir)).toBe(false)
      } finally {
        await cleanupTempRepo(dir)
      }
    })
  })

  describe('getGitContext', () => {
    test('returns full context for a clean repo', async () => {
      const dir = await createTempRepo()
      try {
        const ctx = await getGitContext(dir)
        // macOS /var -> /private/var symlink: normalize both sides
        const { realpathSync } = await import('node:fs')
        expect(realpathSync(ctx.repoRoot)).toBe(realpathSync(dir))
        expect(ctx.currentBranch).toBeTruthy()
        expect(ctx.isClean).toBe(true)
        expect(ctx.hasUncommittedChanges).toBe(false)
      } finally {
        await cleanupTempRepo(dir)
      }
    })

    test('detects uncommitted changes', async () => {
      const dir = await createTempRepo()
      try {
        await writeFile(join(dir, 'new.txt'), 'content')
        const ctx = await getGitContext(dir)
        expect(ctx.isClean).toBe(false)
        expect(ctx.hasUncommittedChanges).toBe(true)
      } finally {
        await cleanupTempRepo(dir)
      }
    })

    test('detects base branch', async () => {
      const dir = await createTempRepo()
      try {
        const ctx = await getGitContext(dir)
        expect(['main', 'master']).toContain(ctx.baseBranch)
      } finally {
        await cleanupTempRepo(dir)
      }
    })
  })
})

// ── Branch management ─────────────────────────────────────────────────────────

describe('Branch management', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempRepo()
  })

  afterEach(async () => {
    await cleanupTempRepo(dir)
  })

  test('branch naming convention follows openagent/task/expert pattern', () => {
    const plan = createCommitPlan('task-123', 'frontend-expert', 'build UI', ['src/App.tsx'])
    expect(plan.branch).toBe('openagent/task-123/frontend-expert')
  })

  test('branch names sanitize special characters', () => {
    const plan = createCommitPlan('task 123!@#', 'my/expert name', 'test', ['a.ts'])
    expect(plan.branch).toBe('openagent/task-123---/my-expert-name')
  })

  test('createExpertBranch creates and switches to branch', async () => {
    const result = await createExpertBranch(dir, 'task-42', 'backend-dev')
    expect(result.success).toBe(true)
    expect(result.branch).toBe('openagent/task-42/backend-dev')

    const current = await getCurrentBranch(dir)
    expect(current).toBe('openagent/task-42/backend-dev')
  })

  test('switchBranch switches to existing branch', async () => {
    const defaultBranch = await getCurrentBranch(dir)
    await createExpertBranch(dir, 'task-1', 'fe')

    const result = await switchBranch(dir, defaultBranch)
    expect(result.success).toBe(true)

    const current = await getCurrentBranch(dir)
    expect(current).toBe(defaultBranch)
  })

  test('switchBranch fails for non-existent branch', async () => {
    const result = await switchBranch(dir, 'does-not-exist')
    expect(result.success).toBe(false)
  })

  test('deleteBranch deletes an existing branch', async () => {
    const defaultBranch = await getCurrentBranch(dir)
    await createExpertBranch(dir, 'task-del', 'expert')
    await switchBranch(dir, defaultBranch)

    const result = await deleteBranch(dir, 'openagent/task-del/expert')
    expect(result.success).toBe(true)
  })

  test('deleteBranch fails for non-existent branch', async () => {
    const result = await deleteBranch(dir, 'nope')
    expect(result.success).toBe(false)
  })

  test('listExpertBranches returns only openagent branches', async () => {
    const defaultBranch = await getCurrentBranch(dir)
    await createExpertBranch(dir, 'task-a', 'fe')
    await switchBranch(dir, defaultBranch)
    await createExpertBranch(dir, 'task-b', 'be')
    await switchBranch(dir, defaultBranch)

    // Also create a non-openagent branch
    gitSync('checkout -b unrelated-branch', dir)
    gitSync(`checkout ${defaultBranch}`, dir)

    const branches = await listExpertBranches(dir)
    expect(branches.length).toBe(2)
    expect(branches).toContain('openagent/task-a/fe')
    expect(branches).toContain('openagent/task-b/be')
    expect(branches).not.toContain('unrelated-branch')
  })
})

// ── Diff parsing ──────────────────────────────────────────────────────────────

describe('Diff parsing', () => {
  test('parses empty diff', () => {
    expect(parseDiffOutput('')).toEqual([])
    expect(parseDiffOutput('   \n  ')).toEqual([])
  })

  test('parses a modified file diff', () => {
    const raw = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo'
+import { bar } from './bar'
 
 export function main() {`

    const files = parseDiffOutput(raw)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe('src/index.ts')
    expect(files[0]!.status).toBe('modified')
    expect(files[0]!.additions).toBe(1)
    expect(files[0]!.deletions).toBe(0)
  })

  test('parses a new file diff', () => {
    const raw = `diff --git a/new-file.ts b/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,3 @@
+export const x = 1
+export const y = 2
+export const z = 3`

    const files = parseDiffOutput(raw)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe('new-file.ts')
    expect(files[0]!.status).toBe('added')
    expect(files[0]!.additions).toBe(3)
    expect(files[0]!.deletions).toBe(0)
  })

  test('parses a deleted file diff', () => {
    const raw = `diff --git a/old.ts b/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const old = true
-export const gone = true`

    const files = parseDiffOutput(raw)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe('old.ts')
    expect(files[0]!.status).toBe('deleted')
    expect(files[0]!.additions).toBe(0)
    expect(files[0]!.deletions).toBe(2)
  })

  test('parses a renamed file diff', () => {
    const raw = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
index abc1234..def5678 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
-const name = 'old'
+const name = 'new'`

    const files = parseDiffOutput(raw)
    expect(files).toHaveLength(1)
    expect(files[0]!.path).toBe('new-name.ts')
    expect(files[0]!.status).toBe('renamed')
  })

  test('parses multi-file diff', () => {
    const raw = `diff --git a/a.ts b/a.ts
index 111..222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1,2 @@
 line1
+line2
diff --git a/b.ts b/b.ts
new file mode 100644
index 000..333
--- /dev/null
+++ b/b.ts
@@ -0,0 +1 @@
+new file content`

    const files = parseDiffOutput(raw)
    expect(files).toHaveLength(2)
    expect(files[0]!.path).toBe('a.ts')
    expect(files[0]!.status).toBe('modified')
    expect(files[1]!.path).toBe('b.ts')
    expect(files[1]!.status).toBe('added')
  })
})

// ── Commit message generation ─────────────────────────────────────────────────

describe('Commit message generation', () => {
  test('generates a well-formatted commit message', () => {
    const summary: DiffSummary = {
      filesChanged: 3,
      insertions: 50,
      deletions: 10,
      newFiles: ['src/new.ts'],
      modifiedFiles: ['src/main.ts'],
      deletedFiles: ['src/old.ts'],
    }

    const msg = generateCommitMessage('Add user authentication flow', 'backend-dev', summary)
    expect(msg).toContain('[backend-dev]')
    expect(msg).toContain('Add user authentication flow')
    expect(msg).toContain('Files changed: 3')
    expect(msg).toContain('Insertions: 50')
    expect(msg).toContain('Deletions: 10')
    expect(msg).toContain('New: src/new.ts')
    expect(msg).toContain('Modified: src/main.ts')
    expect(msg).toContain('Deleted: src/old.ts')
  })

  test('truncates long objectives', () => {
    const longObjective = 'A'.repeat(100)
    const summary: DiffSummary = {
      filesChanged: 1, insertions: 1, deletions: 0,
      newFiles: [], modifiedFiles: ['a.ts'], deletedFiles: [],
    }

    const msg = generateCommitMessage(longObjective, 'expert', summary)
    const header = msg.split('\n')[0]!
    // header = "[expert] " + truncated objective
    expect(header.length).toBeLessThanOrEqual(100)
    expect(header).toContain('...')
  })
})

// ── Safety checks ─────────────────────────────────────────────────────────────

describe('Safety checks', () => {
  test('clean repo is safe', async () => {
    const dir = await createTempRepo()
    try {
      const result = await checkSafety(dir)
      expect(result.safe).toBe(true)
      expect(result.blockers).toHaveLength(0)
    } finally {
      await cleanupTempRepo(dir)
    }
  })

  test('non-git directory has blocker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oac-notgit-'))
    try {
      const result = await checkSafety(dir)
      expect(result.safe).toBe(false)
      expect(result.blockers.length).toBeGreaterThan(0)
      expect(result.blockers[0]).toContain('Not a git repository')
    } finally {
      await cleanupTempRepo(dir)
    }
  })

  test('dirty working tree produces warnings', async () => {
    const dir = await createTempRepo()
    try {
      await writeFile(join(dir, 'dirty.txt'), 'uncommitted')
      const result = await checkSafety(dir)
      expect(result.safe).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
    } finally {
      await cleanupTempRepo(dir)
    }
  })

  test('detached HEAD produces warning', async () => {
    const dir = await createTempRepo()
    try {
      const hash = gitSync('rev-parse HEAD', dir)
      gitSync(`checkout ${hash}`, dir)
      const result = await checkSafety(dir)
      expect(result.safe).toBe(true)
      expect(result.warnings.some(w => w.includes('detached'))).toBe(true)
    } finally {
      await cleanupTempRepo(dir)
    }
  })
})

// ── Commit plan creation ──────────────────────────────────────────────────────

describe('Commit plan creation', () => {
  test('creates a plan with proper branch and strategy', () => {
    const plan = createCommitPlan('task-99', 'qa-expert', 'add tests', ['test/a.test.ts', 'test/b.test.ts'])
    expect(plan.branch).toBe('openagent/task-99/qa-expert')
    expect(plan.strategy).toBe('feature_branch')
    expect(plan.files).toEqual(['test/a.test.ts', 'test/b.test.ts'])
    expect(plan.message).toContain('[qa-expert]')
    expect(plan.message).toContain('add tests')
  })
})

// ── Diff summary formatting ───────────────────────────────────────────────────

describe('Diff summary formatting', () => {
  test('formats a rich diff summary', () => {
    const diff: DiffResult = {
      files: [
        { path: 'src/new.ts', status: 'added', additions: 20, deletions: 0 },
        { path: 'src/main.ts', status: 'modified', additions: 5, deletions: 3 },
        { path: 'src/old.ts', status: 'deleted', additions: 0, deletions: 15 },
      ],
      summary: {
        filesChanged: 3,
        insertions: 25,
        deletions: 18,
        newFiles: ['src/new.ts'],
        modifiedFiles: ['src/main.ts'],
        deletedFiles: ['src/old.ts'],
      },
      patch: '',
    }

    const formatted = formatDiffSummary(diff)
    expect(formatted).toContain('3 file(s) changed')
    expect(formatted).toContain('25 insertion(s)')
    expect(formatted).toContain('18 deletion(s)')
    expect(formatted).toContain('New:')
    expect(formatted).toContain('src/new.ts')
    expect(formatted).toContain('Modified:')
    expect(formatted).toContain('src/main.ts')
    expect(formatted).toContain('Deleted:')
    expect(formatted).toContain('src/old.ts')
  })

  test('formats an empty diff', () => {
    const diff: DiffResult = {
      files: [],
      summary: {
        filesChanged: 0, insertions: 0, deletions: 0,
        newFiles: [], modifiedFiles: [], deletedFiles: [],
      },
      patch: '',
    }

    const formatted = formatDiffSummary(diff)
    expect(formatted).toContain('0 file(s) changed')
    expect(formatted).not.toContain('New:')
    expect(formatted).not.toContain('Modified:')
    expect(formatted).not.toContain('Deleted:')
  })
})

// ── Integration tests (temp repo) ─────────────────────────────────────────────

describe('Git operations integration', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempRepo()
  })

  afterEach(async () => {
    await cleanupTempRepo(dir)
  })

  test('stage and commit workflow', async () => {
    await writeFile(join(dir, 'feature.ts'), 'export const feature = true\n')
    const stageResult = await stageFiles(dir, ['feature.ts'])
    expect(stageResult.success).toBe(true)

    const commitResult = await commitChanges(dir, 'add feature')
    expect(commitResult.success).toBe(true)
    expect(commitResult.commitHash).toBeTruthy()

    expect(await isWorkingTreeClean(dir)).toBe(true)
  })

  test('stageFiles fails with empty array', async () => {
    const result = await stageFiles(dir, [])
    expect(result.success).toBe(false)
  })

  test('generateDiff captures uncommitted changes', async () => {
    await writeFile(join(dir, 'README.md'), '# Updated\n')
    const diff = await generateDiff(dir)
    expect(diff.files.length).toBeGreaterThan(0)
    expect(diff.summary.filesChanged).toBeGreaterThan(0)
  })

  test('generateDiffBetweenBranches works across branches', async () => {
    const defaultBranch = await getCurrentBranch(dir)
    await createExpertBranch(dir, 'diff-test', 'expert')
    await writeFile(join(dir, 'branch-file.ts'), 'export const x = 1\n')
    gitSync('add .', dir)
    gitSync('commit -m "branch commit"', dir)

    const diff = await generateDiffBetweenBranches(dir, defaultBranch, 'openagent/diff-test/expert')
    expect(diff.files.length).toBeGreaterThan(0)
    expect(diff.summary.newFiles).toContain('branch-file.ts')
  })

  test('checkpoint create, list, and rollback', async () => {
    await writeFile(join(dir, 'feature.ts'), 'v1')
    gitSync('add .', dir)
    gitSync('commit -m "v1"', dir)

    const cpResult = await createCheckpoint(dir, 'before-refactor')
    expect(cpResult.success).toBe(true)

    const checkpoints = await listCheckpoints(dir)
    expect(checkpoints).toContain('before-refactor')

    // Make a new commit
    await writeFile(join(dir, 'feature.ts'), 'v2')
    gitSync('add .', dir)
    gitSync('commit -m "v2"', dir)

    // Rollback
    const rbResult = await rollbackToCheckpoint(dir, 'before-refactor')
    expect(rbResult.success).toBe(true)
  })

  test('rollback to non-existent checkpoint fails gracefully', async () => {
    const result = await rollbackToCheckpoint(dir, 'does-not-exist')
    expect(result.success).toBe(false)
    expect(result.details).toContain('not found')
  })

  test('getChangedFilesSince returns changed files', async () => {
    const initialHash = gitSync('rev-parse HEAD', dir)
    await writeFile(join(dir, 'new.ts'), 'content')
    gitSync('add .', dir)
    gitSync('commit -m "add new"', dir)

    const changed = await getChangedFilesSince(dir, initialHash)
    expect(changed).toContain('new.ts')
  })

  test('getFileHistory returns commit log for a file', async () => {
    await writeFile(join(dir, 'tracked.ts'), 'v1')
    gitSync('add .', dir)
    gitSync('commit -m "v1 of tracked"', dir)

    await writeFile(join(dir, 'tracked.ts'), 'v2')
    gitSync('add .', dir)
    gitSync('commit -m "v2 of tracked"', dir)

    const history = await getFileHistory(dir, 'tracked.ts')
    expect(history.length).toBe(2)
    expect(history[0]!.message).toBe('v2 of tracked')
    expect(history[1]!.message).toBe('v1 of tracked')
    expect(history[0]!.hash).toBeTruthy()
    expect(history[0]!.date).toBeTruthy()
  })

  test('getFileHistory respects limit', async () => {
    for (let i = 1; i <= 5; i++) {
      await writeFile(join(dir, 'multi.ts'), `v${i}`)
      gitSync('add .', dir)
      gitSync(`commit -m "version ${i}"`, dir)
    }

    const history = await getFileHistory(dir, 'multi.ts', 3)
    expect(history.length).toBe(3)
  })
})

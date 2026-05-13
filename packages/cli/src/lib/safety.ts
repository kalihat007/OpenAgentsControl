/**
 * Execution safety layer for OAC CLI.
 *
 * Provides git-based snapshots, staged writes, worktree isolation,
 * and conflict resolution for safe multi-agent execution.
 */

import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotResult {
  id: string
  type: 'stash' | 'commit' | 'tag'
  ref: string
  createdAt: string
  message: string
}

export interface StagedWrite {
  taskId: string
  agent: string
  path: string
  content: string
  originalContent: string | null
  operation: 'create' | 'update' | 'delete'
  stagedAt: string
}

export interface WorktreeResult {
  path: string
  branch: string
  originalPath: string
  created: boolean
}

export interface ConflictReport {
  path: string
  agents: string[]
  type: 'disjoint' | 'overlap' | 'delete-modify'
  resolution: 'auto-merged' | 'escalated' | 'skipped'
  mergedContent?: string
}

export interface SafetyContext {
  projectRoot: string
  snapshot: SnapshotResult | null
  stagingDir: string
  worktree: WorktreeResult | null
  writes: StagedWrite[]
  conflicts: ConflictReport[]
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function git(args: string[], cwd: string, silent = true): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', stdio: silent ? ['pipe', 'pipe', 'pipe'] : 'inherit' })
  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    status: result.status ?? 1,
  }
}

function gitOk(args: string[], cwd: string): boolean {
  return git(args, cwd).status === 0
}

/** True if the project root is inside a git repo. */
export function isGitRepo(projectRoot: string): boolean {
  return gitOk(['rev-parse', '--git-dir'], projectRoot)
}

/** True if there are uncommitted changes. */
export function hasUncommittedChanges(projectRoot: string): boolean {
  const result = git(['status', '--porcelain'], projectRoot)
  return result.stdout.length > 0
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Creates a git snapshot before any writes.
 * Priority: stash (fastest) → commit → tag.
 */
export function createSnapshot(projectRoot: string, message = 'oac-pre-execute'): SnapshotResult {
  const timestamp = new Date().toISOString()
  const id = `oac-snapshot-${Date.now()}`

  if (!isGitRepo(projectRoot)) {
    throw new SafetyError('Not a git repository — cannot create snapshot. Run `git init` or disable safe mode.')
  }

  // Try stash first (fast, reversible)
  if (hasUncommittedChanges(projectRoot)) {
    const stashResult = git(['stash', 'push', '-m', `${message} [${id}]`], projectRoot)
    if (stashResult.status === 0) {
      const stashList = git(['stash', 'list'], projectRoot)
      const stashRef = stashList.stdout.split('\n')[0]?.match(/^(stash@\{[^}]+\})/)?.[1] ?? `stash@{0}`
      return { id, type: 'stash', ref: stashRef, createdAt: timestamp, message }
    }
  }

  // No changes to stash — create a lightweight tag on current HEAD
  const tagResult = git(['tag', '-a', id, '-m', message], projectRoot)
  if (tagResult.status === 0) {
    return { id, type: 'tag', ref: id, createdAt: timestamp, message }
  }

  throw new SafetyError(`Failed to create snapshot: ${tagResult.stderr}`)
}

/**
 * Restores the repo to the snapshot state.
 */
export function restoreSnapshot(projectRoot: string, snapshot: SnapshotResult): void {
  if (snapshot.type === 'stash') {
    git(['stash', 'pop', snapshot.ref], projectRoot, false)
  } else if (snapshot.type === 'tag') {
    git(['reset', '--hard', snapshot.ref], projectRoot, false)
    git(['tag', '-d', snapshot.ref], projectRoot, true)
  } else {
    git(['reset', '--hard', snapshot.ref], projectRoot, false)
  }
}

// ── Staging ───────────────────────────────────────────────────────────────────

const STAGING_PREFIX = 'oac-stage-'

/** Creates a temp staging directory for buffered writes. */
export async function createStagingDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), STAGING_PREFIX))
}

/** Cleans up the staging directory. */
export async function cleanupStagingDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/**
 * Stages a write operation without touching the working tree.
 * Stores metadata + content in the staging dir.
 */
export async function stageWrite(
  stagingDir: string,
  taskId: string,
  agent: string,
  relativePath: string,
  content: string,
  operation: 'create' | 'update' | 'delete',
  projectRoot: string,
): Promise<StagedWrite> {
  const stagedAt = new Date().toISOString()
  const originalPath = join(projectRoot, relativePath)

  let originalContent: string | null = null
  try {
    originalContent = await readFile(originalPath, 'utf-8')
  } catch {
    originalContent = null
  }

  const write: StagedWrite = {
    taskId,
    agent,
    path: relativePath,
    content,
    originalContent,
    operation,
    stagedAt,
  }

  // Persist to staging dir
  await mkdir(join(stagingDir, 'meta'), { recursive: true })
  await writeFile(join(stagingDir, 'meta', `${taskId}--${sanitizePath(relativePath)}.json`), JSON.stringify(write, null, 2))

  // Persist content separately for easy diffing
  if (operation !== 'delete') {
    await mkdir(join(stagingDir, 'content', dirname(relativePath)), { recursive: true })
    await writeFile(join(stagingDir, 'content', relativePath), content)
  }

  return write
}

/** Returns all staged writes, sorted by path then task. */
export async function listStagedWrites(stagingDir: string): Promise<StagedWrite[]> {
  const metaDir = join(stagingDir, 'meta')
  const files = await readdir(metaDir).catch(() => [])
  const writes: StagedWrite[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const raw = await readFile(join(metaDir, file), 'utf-8')
    writes.push(JSON.parse(raw) as StagedWrite)
  }
  return writes.sort((a, b) => a.path.localeCompare(b.path) || a.taskId.localeCompare(b.taskId))
}

// ── Worktree ──────────────────────────────────────────────────────────────────

/**
 * Creates a git worktree for isolated execution.
 * Returns the worktree path and branch name.
 */
export function createWorktree(projectRoot: string, branch = `oac-run-${Date.now()}`): WorktreeResult {
  if (!isGitRepo(projectRoot)) {
    throw new SafetyError('Not a git repository — cannot create worktree.')
  }

  const worktreePath = join(tmpdir(), `oac-worktree-${Date.now()}`)
  const result = git(['worktree', 'add', '-b', branch, worktreePath], projectRoot)

  if (result.status !== 0) {
    throw new SafetyError(`Failed to create worktree: ${result.stderr}`)
  }

  return { path: worktreePath, branch, originalPath: projectRoot, created: true }
}

/** Removes a worktree and its branch. */
export function removeWorktree(worktree: WorktreeResult): void {
  git(['worktree', 'remove', '--force', worktree.path], worktree.originalPath, true)
  git(['branch', '-D', worktree.branch], worktree.originalPath, true)
}

/** Merges the worktree branch back into the original branch. */
export function mergeWorktree(worktree: WorktreeResult, message = 'oac-run-merge'): void {
  const mergeResult = git(['merge', '--no-ff', '-m', message, worktree.branch], worktree.originalPath)
  if (mergeResult.status !== 0) {
    git(['merge', '--abort'], worktree.originalPath, true)
    throw new SafetyError(`Worktree merge failed — aborted. Resolve conflicts manually from branch: ${worktree.branch}`)
  }
}

// ── Conflict resolution ───────────────────────────────────────────────────────

/**
 * Analyzes staged writes for conflicts.
 * Auto-merges disjoint edits; escalates overlapping edits.
 */
export function resolveConflicts(writes: StagedWrite[]): ConflictReport[] {
  const byPath = groupBy(writes, (w) => w.path)
  const reports: ConflictReport[] = []

  for (const [path, pathWrites] of Object.entries(byPath)) {
    if (pathWrites.length <= 1) continue

    const agents = [...new Set(pathWrites.map((w) => w.agent))]

    // Detect delete + modify conflicts
    const hasDelete = pathWrites.some((w) => w.operation === 'delete')
    const hasModify = pathWrites.some((w) => w.operation === 'update' || w.operation === 'create')
    if (hasDelete && hasModify) {
      reports.push({ path, agents, type: 'delete-modify', resolution: 'escalated' })
      continue
    }

    // Check if edits are on disjoint line ranges (simple heuristic)
    const updates = pathWrites.filter((w) => w.operation === 'update')
    if (updates.length >= 2 && areDisjointEdits(updates)) {
      const mergedContent = mergeDisjointEdits(updates)
      reports.push({ path, agents, type: 'disjoint', resolution: 'auto-merged', mergedContent })
      continue
    }

    // Overlapping edits — escalate to user
    reports.push({ path, agents, type: 'overlap', resolution: 'escalated' })
  }

  return reports
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizePath(p: string): string {
  return p.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '-')
}

function dirname(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.slice(0, idx) : '.'
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>
  for (const item of items) {
    const key = keyFn(item)
    result[key] = result[key] ?? []
    result[key].push(item)
  }
  return result
}

/** Naive disjoint edit detection: compares line-level changes. */
function areDisjointEdits(writes: StagedWrite[]): boolean {
  void writes
  // TODO: implement proper diff-based range detection
  // For now, assume edits from different agents on the same file are overlapping
  // unless proven otherwise (conservative)
  return false
}

/** Naive merge: takes the last edit. Real impl would use three-way merge. */
function mergeDisjointEdits(writes: StagedWrite[]): string {
  return writes[writes.length - 1]!.content
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class SafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafetyError'
  }
}

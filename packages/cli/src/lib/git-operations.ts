/**
 * Git-aware operations for expert workflows.
 *
 * Provides branch management, structured diffs, commit planning,
 * safety checks, and rollback capabilities so experts can work
 * within git workflows safely.
 */

import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitContext {
  repoRoot: string
  currentBranch: string
  baseBranch: string
  isClean: boolean
  hasUncommittedChanges: boolean
}

export type BranchStrategy = 'feature_branch' | 'working_branch' | 'stash_based'

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

export interface DiffSummary {
  filesChanged: number
  insertions: number
  deletions: number
  newFiles: string[]
  modifiedFiles: string[]
  deletedFiles: string[]
}

export interface DiffResult {
  files: FileDiff[]
  summary: DiffSummary
  patch: string
}

export interface CommitPlan {
  branch: string
  message: string
  files: string[]
  strategy: BranchStrategy
}

export interface GitOperationResult {
  success: boolean
  operation: string
  details: string
  branch?: string
  commitHash?: string
}

export interface SafetyCheck {
  safe: boolean
  warnings: string[]
  blockers: string[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const BRANCH_PREFIX = 'openagent'

async function git(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFile('git', args, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 }
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string }
    return {
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? '').trim(),
      exitCode: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

function ok(operation: string, details: string, extra?: { branch?: string; commitHash?: string }): GitOperationResult {
  return { success: true, operation, details, ...extra }
}

function fail(operation: string, details: string, extra?: { branch?: string }): GitOperationResult {
  return { success: false, operation, details, ...extra }
}

function buildDiffSummary(files: FileDiff[]): DiffSummary {
  return {
    filesChanged: files.length,
    insertions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    newFiles: files.filter(f => f.status === 'added').map(f => f.path),
    modifiedFiles: files.filter(f => f.status === 'modified').map(f => f.path),
    deletedFiles: files.filter(f => f.status === 'deleted').map(f => f.path),
  }
}

// ── Context detection ─────────────────────────────────────────────────────────

export async function isGitRepo(path: string): Promise<boolean> {
  const result = await git(['rev-parse', '--is-inside-work-tree'], path)
  return result.exitCode === 0 && result.stdout === 'true'
}

export async function getCurrentBranch(projectRoot: string): Promise<string> {
  const result = await git(['symbolic-ref', '--short', 'HEAD'], projectRoot)
  if (result.exitCode === 0 && result.stdout) return result.stdout

  // Detached HEAD — return the short SHA
  const sha = await git(['rev-parse', '--short', 'HEAD'], projectRoot)
  return sha.stdout || 'HEAD'
}

export async function isWorkingTreeClean(projectRoot: string): Promise<boolean> {
  const result = await git(['status', '--porcelain'], projectRoot)
  return result.exitCode === 0 && result.stdout.length === 0
}

export async function getGitContext(projectRoot: string): Promise<GitContext> {
  const repoRootResult = await git(['rev-parse', '--show-toplevel'], projectRoot)
  const repoRoot = repoRootResult.stdout || projectRoot

  const currentBranch = await getCurrentBranch(projectRoot)
  const isClean = await isWorkingTreeClean(projectRoot)

  // Detect base branch: prefer main, fall back to master, then current
  let baseBranch = currentBranch
  for (const candidate of ['main', 'master']) {
    const check = await git(['rev-parse', '--verify', candidate], projectRoot)
    if (check.exitCode === 0) {
      baseBranch = candidate
      break
    }
  }

  return {
    repoRoot,
    currentBranch,
    baseBranch,
    isClean,
    hasUncommittedChanges: !isClean,
  }
}

// ── Branch management ─────────────────────────────────────────────────────────

function expertBranchName(taskId: string, expertId: string): string {
  const safeTask = taskId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const safeExpert = expertId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${BRANCH_PREFIX}/${safeTask}/${safeExpert}`
}

export async function createExpertBranch(
  projectRoot: string,
  taskId: string,
  expertId: string,
): Promise<GitOperationResult> {
  const branch = expertBranchName(taskId, expertId)
  const result = await git(['checkout', '-b', branch], projectRoot)
  if (result.exitCode !== 0) {
    return fail('createExpertBranch', result.stderr, { branch })
  }
  return ok('createExpertBranch', `Created and switched to branch ${branch}`, { branch })
}

export async function switchBranch(
  projectRoot: string,
  branch: string,
): Promise<GitOperationResult> {
  const result = await git(['checkout', branch], projectRoot)
  if (result.exitCode !== 0) {
    return fail('switchBranch', result.stderr, { branch })
  }
  return ok('switchBranch', `Switched to branch ${branch}`, { branch })
}

export async function deleteBranch(
  projectRoot: string,
  branch: string,
): Promise<GitOperationResult> {
  const result = await git(['branch', '-D', branch], projectRoot)
  if (result.exitCode !== 0) {
    return fail('deleteBranch', result.stderr, { branch })
  }
  return ok('deleteBranch', `Deleted branch ${branch}`, { branch })
}

export async function listExpertBranches(projectRoot: string): Promise<string[]> {
  const result = await git(['branch', '--list', `${BRANCH_PREFIX}/*`], projectRoot)
  if (result.exitCode !== 0 || !result.stdout) return []
  return result.stdout
    .split('\n')
    .map(line => line.replace(/^\*?\s*/, '').trim())
    .filter(Boolean)
}

// ── Diff operations ───────────────────────────────────────────────────────────

export function parseDiffOutput(rawDiff: string): FileDiff[] {
  if (!rawDiff.trim()) return []

  const files: FileDiff[] = []
  const diffHeaders = rawDiff.split(/^diff --git /m).filter(Boolean)

  for (const section of diffHeaders) {
    const lines = section.split('\n')
    const headerLine = lines[0] ?? ''

    // Extract file path from "a/path b/path"
    const pathMatch = headerLine.match(/a\/(.+?)\s+b\/(.+)/)
    const aPath = pathMatch?.[1] ?? ''
    const bPath = pathMatch?.[2] ?? ''
    const filePath = bPath || aPath

    if (!filePath) continue

    let status: FileDiff['status'] = 'modified'
    if (section.includes('new file mode')) {
      status = 'added'
    } else if (section.includes('deleted file mode')) {
      status = 'deleted'
    } else if (section.includes('rename from') || aPath !== bPath) {
      status = 'renamed'
    }

    let additions = 0
    let deletions = 0
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }

    files.push({ path: filePath, status, additions, deletions })
  }

  return files
}

export async function generateDiff(projectRoot: string): Promise<DiffResult> {
  // Capture both staged and unstaged changes
  const stagedResult = await git(['diff', '--cached'], projectRoot)
  const unstagedResult = await git(['diff'], projectRoot)

  // Also include untracked files as pseudo-diffs
  const untrackedResult = await git(['ls-files', '--others', '--exclude-standard'], projectRoot)

  const patch = [stagedResult.stdout, unstagedResult.stdout].filter(Boolean).join('\n')
  const files = parseDiffOutput(patch)

  // Add untracked files
  if (untrackedResult.stdout) {
    for (const filePath of untrackedResult.stdout.split('\n').filter(Boolean)) {
      files.push({ path: filePath, status: 'added', additions: 0, deletions: 0 })
    }
  }

  return { files, summary: buildDiffSummary(files), patch }
}

export async function generateDiffBetweenBranches(
  projectRoot: string,
  base: string,
  head: string,
): Promise<DiffResult> {
  const result = await git(['diff', `${base}...${head}`], projectRoot)
  const patch = result.stdout
  const files = parseDiffOutput(patch)
  return { files, summary: buildDiffSummary(files), patch }
}

export function formatDiffSummary(diff: DiffResult): string {
  const { summary } = diff
  const lines: string[] = []

  lines.push(`${summary.filesChanged} file(s) changed, ${summary.insertions} insertion(s), ${summary.deletions} deletion(s)`)

  if (summary.newFiles.length > 0) {
    lines.push(`  New:      ${summary.newFiles.join(', ')}`)
  }
  if (summary.modifiedFiles.length > 0) {
    lines.push(`  Modified: ${summary.modifiedFiles.join(', ')}`)
  }
  if (summary.deletedFiles.length > 0) {
    lines.push(`  Deleted:  ${summary.deletedFiles.join(', ')}`)
  }

  return lines.join('\n')
}

// ── Commit operations ─────────────────────────────────────────────────────────

export function generateCommitMessage(
  objective: string,
  expertId: string,
  diff: DiffSummary,
): string {
  const scope = expertId.replace(/-/g, ' ')
  const shortObjective = objective.length > 72
    ? objective.slice(0, 69) + '...'
    : objective

  const header = `[${expertId}] ${shortObjective}`

  const body = [
    '',
    `Expert: ${scope}`,
    `Files changed: ${diff.filesChanged}`,
    `Insertions: ${diff.insertions}, Deletions: ${diff.deletions}`,
  ]

  if (diff.newFiles.length > 0) body.push(`New: ${diff.newFiles.join(', ')}`)
  if (diff.modifiedFiles.length > 0) body.push(`Modified: ${diff.modifiedFiles.join(', ')}`)
  if (diff.deletedFiles.length > 0) body.push(`Deleted: ${diff.deletedFiles.join(', ')}`)

  return [header, ...body].join('\n')
}

export function createCommitPlan(
  taskId: string,
  expertId: string,
  objective: string,
  files: string[],
): CommitPlan {
  const branch = expertBranchName(taskId, expertId)
  const summary: DiffSummary = {
    filesChanged: files.length,
    insertions: 0,
    deletions: 0,
    newFiles: [],
    modifiedFiles: files,
    deletedFiles: [],
  }
  const message = generateCommitMessage(objective, expertId, summary)
  return { branch, message, files, strategy: 'feature_branch' }
}

export async function stageFiles(
  projectRoot: string,
  files: string[],
): Promise<GitOperationResult> {
  if (files.length === 0) {
    return fail('stageFiles', 'No files provided to stage')
  }
  const result = await git(['add', '--', ...files], projectRoot)
  if (result.exitCode !== 0) {
    return fail('stageFiles', result.stderr)
  }
  return ok('stageFiles', `Staged ${files.length} file(s)`)
}

export async function commitChanges(
  projectRoot: string,
  message: string,
): Promise<GitOperationResult> {
  const result = await git(['commit', '-m', message], projectRoot)
  if (result.exitCode !== 0) {
    return fail('commitChanges', result.stderr)
  }

  const hashResult = await git(['rev-parse', '--short', 'HEAD'], projectRoot)
  const commitHash = hashResult.stdout || undefined
  return ok('commitChanges', 'Changes committed', { commitHash })
}

// ── Safety & rollback ─────────────────────────────────────────────────────────

export async function checkSafety(projectRoot: string): Promise<SafetyCheck> {
  const warnings: string[] = []
  const blockers: string[] = []

  const isRepo = await isGitRepo(projectRoot)
  if (!isRepo) {
    blockers.push('Not a git repository')
    return { safe: false, warnings, blockers }
  }

  // Check for detached HEAD
  const headResult = await git(['symbolic-ref', '--short', 'HEAD'], projectRoot)
  if (headResult.exitCode !== 0) {
    warnings.push('HEAD is detached — commits will be orphaned without a branch')
  }

  // Check for uncommitted changes
  const statusResult = await git(['status', '--porcelain'], projectRoot)
  if (statusResult.stdout.length > 0) {
    const lines = statusResult.stdout.split('\n').filter(Boolean)
    warnings.push(`${lines.length} uncommitted change(s) in working tree`)
  }

  // Check for untracked files
  const untrackedResult = await git(['ls-files', '--others', '--exclude-standard'], projectRoot)
  if (untrackedResult.stdout.length > 0) {
    const count = untrackedResult.stdout.split('\n').filter(Boolean).length
    warnings.push(`${count} untracked file(s)`)
  }

  // Check for merge in progress
  const mergeResult = await git(['rev-parse', '--verify', 'MERGE_HEAD'], projectRoot)
  if (mergeResult.exitCode === 0) {
    blockers.push('Merge in progress — resolve or abort before continuing')
  }

  // Check for rebase in progress
  const rebaseResult = await git(['rev-parse', '--verify', 'REBASE_HEAD'], projectRoot)
  if (rebaseResult.exitCode === 0) {
    blockers.push('Rebase in progress — resolve or abort before continuing')
  }

  return { safe: blockers.length === 0, warnings, blockers }
}

const CHECKPOINT_TAG_PREFIX = 'oac-checkpoint/'

export async function createCheckpoint(
  projectRoot: string,
  label: string,
): Promise<GitOperationResult> {
  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]/g, '-')
  const tagName = `${CHECKPOINT_TAG_PREFIX}${safeLabel}`

  // Stash any uncommitted changes first so the tag captures HEAD cleanly
  const isClean = await isWorkingTreeClean(projectRoot)
  if (!isClean) {
    const stash = await git(['stash', 'push', '-m', `checkpoint: ${safeLabel}`], projectRoot)
    if (stash.exitCode !== 0) {
      return fail('createCheckpoint', `Failed to stash changes: ${stash.stderr}`)
    }
  }

  const tag = await git(['tag', '-a', tagName, '-m', `Checkpoint: ${safeLabel}`], projectRoot)
  if (tag.exitCode !== 0) {
    // Restore stash if tagging failed
    if (!isClean) await git(['stash', 'pop'], projectRoot)
    return fail('createCheckpoint', `Failed to create tag: ${tag.stderr}`)
  }

  // Restore the stashed changes so work isn't lost
  if (!isClean) {
    await git(['stash', 'pop'], projectRoot)
  }

  return ok('createCheckpoint', `Checkpoint '${safeLabel}' created at current HEAD`)
}

export async function rollbackToCheckpoint(
  projectRoot: string,
  label: string,
): Promise<GitOperationResult> {
  const safeLabel = label.replace(/[^a-zA-Z0-9_.-]/g, '-')
  const tagName = `${CHECKPOINT_TAG_PREFIX}${safeLabel}`

  const verify = await git(['rev-parse', '--verify', tagName], projectRoot)
  if (verify.exitCode !== 0) {
    return fail('rollbackToCheckpoint', `Checkpoint '${safeLabel}' not found`)
  }

  const reset = await git(['reset', '--hard', tagName], projectRoot)
  if (reset.exitCode !== 0) {
    return fail('rollbackToCheckpoint', `Failed to reset: ${reset.stderr}`)
  }

  return ok('rollbackToCheckpoint', `Rolled back to checkpoint '${safeLabel}'`)
}

export async function listCheckpoints(projectRoot: string): Promise<string[]> {
  const result = await git(['tag', '--list', `${CHECKPOINT_TAG_PREFIX}*`], projectRoot)
  if (result.exitCode !== 0 || !result.stdout) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map(tag => tag.replace(CHECKPOINT_TAG_PREFIX, ''))
}

// ── Utility ───────────────────────────────────────────────────────────────────

export async function getChangedFilesSince(
  projectRoot: string,
  commitOrBranch: string,
): Promise<string[]> {
  const result = await git(['diff', '--name-only', commitOrBranch], projectRoot)
  if (result.exitCode !== 0 || !result.stdout) return []
  return result.stdout.split('\n').filter(Boolean)
}

export async function getFileHistory(
  projectRoot: string,
  filePath: string,
  limit = 10,
): Promise<{ hash: string; message: string; date: string }[]> {
  const result = await git(
    ['log', `--max-count=${limit}`, '--format=%H|||%s|||%aI', '--', filePath],
    projectRoot,
  )
  if (result.exitCode !== 0 || !result.stdout) return []

  return result.stdout.split('\n').filter(Boolean).map(line => {
    const [hash = '', message = '', date = ''] = line.split('|||')
    return { hash, message, date }
  })
}

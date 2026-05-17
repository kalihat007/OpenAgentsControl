/**
 * Worktree Manager — conflict-safe git worktrees for multi-agent swarms.
 *
 * When enabled, each agent gets its own git worktree under
 * `.oac/runs/{quest-id}/worktrees/{agent-id}/`.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createLogger } from './logger.js'

const log = createLogger('worktree-manager')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorktreeConfig {
  enabled: boolean
  mergeStrategy: 'manual' | 'auto-squash' | 'auto-rebase'
}

export interface WorktreeResult {
  agentId: string
  worktreePath: string
  branch: string
  created: boolean
}

export interface MergeResult {
  agentId: string
  merged: boolean
  conflicts: string[]
}

// ── Worktree lifecycle ────────────────────────────────────────────────────────

export async function createAgentWorktrees(
  projectRoot: string,
  questId: string,
  agents: string[],
): Promise<Record<string, string>> {
  const worktreeRoot = join(projectRoot, '.oac', 'runs', questId, 'worktrees')
  await mkdir(worktreeRoot, { recursive: true })

  const result: Record<string, string> = {}

  for (const agentId of agents) {
    const branch = `quest-${questId}-${agentId}`
    const worktreePath = join(worktreeRoot, agentId)

    // Create branch if it doesn't exist
    const branchExists = await gitExitCode(projectRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]) === 0
    if (!branchExists) {
      await git(projectRoot, ['branch', branch])
    }

    // Check if worktree already exists
    const worktreeList = await git(projectRoot, ['worktree', 'list', '--porcelain'])
    const alreadyExists = worktreeList.split('\n').some((line) => line.includes(worktreePath))

    if (!alreadyExists) {
      await git(projectRoot, ['worktree', 'add', worktreePath, branch])
      log.info('Created worktree', { agentId, worktreePath, branch })
    } else {
      log.debug('Worktree already exists', { agentId, worktreePath })
    }

    result[agentId] = worktreePath
  }

  return result
}

export async function verifyWorktree(
  _projectRoot: string,
  worktreePath: string,
): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = []

  try {
    // Basic sanity: can we run a no-op git command? Uncommitted changes are
    // expected after a runtime completes work in an isolated checkout.
    await git(worktreePath, ['rev-parse', '--git-dir'])
  } catch (err) {
    errors.push(`Git error: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { passed: errors.length === 0, errors }
}

export async function mergeWorktree(
  projectRoot: string,
  agentId: string,
  questId: string,
  strategy: WorktreeConfig['mergeStrategy'],
): Promise<MergeResult> {
  const branch = `quest-${questId}-${agentId}`
  const conflicts: string[] = []

  try {
    if (strategy === 'manual') {
      log.info('Manual merge required', { agentId, branch })
      return { agentId, merged: false, conflicts: [`Manual merge required for branch ${branch}`] }
    }

    const worktreeRoot = join(projectRoot, '.oac', 'runs', questId, 'worktrees')
    const worktreePath = join(worktreeRoot, agentId)
    await commitWorktreeChanges(worktreePath, questId, agentId)

    const mergeArgs = strategy === 'auto-squash'
      ? ['merge', '--squash', branch]
      : ['merge', branch]

    await git(projectRoot, mergeArgs)
    log.info('Worktree merged', { agentId, branch, strategy })
    return { agentId, merged: true, conflicts: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('conflict')) {
      conflicts.push(message)
      // Abort the merge to leave repo in clean state
      try {
        await git(projectRoot, ['merge', '--abort'])
      } catch {
        // ignore abort failure
      }
    }
    log.warn('Worktree merge failed', { agentId, branch, error: message })
    return { agentId, merged: false, conflicts }
  }
}

async function commitWorktreeChanges(
  worktreePath: string,
  questId: string,
  agentId: string,
): Promise<void> {
  const status = await git(worktreePath, ['status', '--porcelain'])
  if (!status.trim()) return

  await git(worktreePath, ['add', '-A'])
  try {
    await git(worktreePath, ['commit', '-m', `quest ${questId}: ${agentId}`])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('nothing to commit')) {
      throw err
    }
  }
}

export async function cleanupWorktrees(
  projectRoot: string,
  questId: string,
): Promise<void> {
  const worktreeRoot = join(projectRoot, '.oac', 'runs', questId, 'worktrees')

  // List all worktrees and remove those under our path
  const list = await git(projectRoot, ['worktree', 'list', '--porcelain'])
  const lines = list.split('\n')
  let currentPath = ''

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice(9).trim()
    }
    if (line.startsWith('branch ') && currentPath.includes(worktreeRoot)) {
      try {
        await git(projectRoot, ['worktree', 'remove', '--force', currentPath])
        log.debug('Removed worktree', { path: currentPath })
      } catch (err) {
        log.warn('Failed to remove worktree', { path: currentPath, error: err instanceof Error ? err.message : String(err) })
      }
      currentPath = ''
    }
  }
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr || stdout}`))
      }
    })
  })
}

function gitExitCode(cwd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.on('close', (code) => {
      resolve(code ?? 1)
    })
  })
}

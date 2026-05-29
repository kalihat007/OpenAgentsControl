/**
 * oac repo-wiki — refresh the local living repository wiki.
 */

import type { Command } from 'commander'
import { setTimeout as sleep } from 'node:timers/promises'
import { refreshRepoWiki } from '../lib/repo-wiki.js'
import { dim, info, success } from '../ui/logger.js'

export interface RepoWikiCommandOptions {
  json?: boolean
  watch?: boolean
  interval?: string
  maxFiles?: string
}

export async function repoWikiCommand(options: RepoWikiCommandOptions): Promise<void> {
  const projectRoot = process.cwd()
  const intervalMs = parsePositiveInt(options.interval, 5000)
  const maxFiles = parsePositiveInt(options.maxFiles, 2000)

  if (options.watch) {
    info(`Watching current project directory for repo wiki refreshes every ${intervalMs}ms`)
    for (;;) {
      const result = await refreshRepoWiki(projectRoot, {
        reason: 'watch',
        maxFiles,
        cwd: process.cwd(),
      })
      if (options.json) {
        console.log(JSON.stringify(toJson(result), null, 2))
      } else {
        success(`Repo wiki refreshed: ${result.snapshot.summary.files} file(s), ${result.snapshot.summary.packages} package(s)`)
        dim(`  ${result.dir}`)
      }
      await sleep(intervalMs)
    }
  }

  const result = await refreshRepoWiki(projectRoot, {
    reason: 'manual',
    maxFiles,
    cwd: process.cwd(),
  })

  if (options.json) {
    console.log(JSON.stringify(toJson(result), null, 2))
    return
  }

  success(`Repo wiki updated in .oac/repo-wiki/`)
  info(`  Files indexed: ${result.snapshot.summary.files}`)
  info(`  Packages: ${result.snapshot.summary.packages}`)
  info(`  Added: ${result.snapshot.changes.added.length}, modified: ${result.snapshot.changes.modified.length}, deleted: ${result.snapshot.changes.deleted.length}`)
  dim(`  Index: ${result.written.index}`)
}

export function registerRepoWikiCommand(program: Command): void {
  program
    .command('repo-wiki')
    .description('Generate or refresh the local living repo wiki under .oac/repo-wiki/')
    .option('--json', 'Print machine-readable summary')
    .option('--watch', 'Continuously refresh the repo wiki in the current project directory')
    .option('--interval <ms>', 'Watch refresh interval in milliseconds', '5000')
    .option('--max-files <n>', 'Maximum number of files to index', '2000')
    .action(async (opts: RepoWikiCommandOptions) => {
      await repoWikiCommand(opts)
    })
}

function toJson(result: Awaited<ReturnType<typeof refreshRepoWiki>>): Record<string, unknown> {
  return {
    dir: result.dir,
    generatedAt: result.snapshot.generatedAt,
    files: result.snapshot.summary.files,
    packages: result.snapshot.summary.packages,
    changes: result.snapshot.changes,
    written: result.written,
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

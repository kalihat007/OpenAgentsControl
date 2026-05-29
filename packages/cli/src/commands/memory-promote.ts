/**
 * oac memory-promote — Review and approve Quest memory promotion candidates.
 */

import { type Command } from 'commander'
import { approveMemoryPromotion, memoryPromotionStorePath, refreshMemoryPromotionStore, rejectMemoryPromotion } from '../lib/quest-memory-promotion.js'
import { CommandUsageError } from '../lib/errors.js'
import { bold, dim, info, log, success, warn } from '../ui/logger.js'

export interface MemoryPromoteOptions {
  json?: boolean
  minOccurrences?: number
  minConfidence?: number
  approve?: string
  approveAll?: boolean
  reject?: string
  reason?: string
}

export async function memoryPromoteCommand(options: MemoryPromoteOptions): Promise<void> {
  const projectRoot = process.cwd()
  const minOccurrences = options.minOccurrences ?? 2
  const minConfidence = options.minConfidence ?? 0.65

  if (minOccurrences < 1) {
    throw new CommandUsageError('--min-occurrences must be at least 1')
  }
  if (minConfidence < 0 || minConfidence > 1) {
    throw new CommandUsageError('--min-confidence must be between 0 and 1')
  }

  let store = await refreshMemoryPromotionStore(projectRoot, {
    minOccurrences,
    minConfidence,
  })

  if (options.approve && options.approveAll) {
    throw new CommandUsageError('Use either --approve <id> or --approve-all, not both.')
  }
  if (options.approve && options.reject) {
    throw new CommandUsageError('Use either --approve <id> or --reject <id>, not both.')
  }

  if (options.approve) {
    await approveMemoryPromotion(projectRoot, options.approve)
    store = await refreshMemoryPromotionStore(projectRoot, { minOccurrences, minConfidence })
  }

  if (options.approveAll) {
    const pendingIds = store.candidates
      .filter((candidate) => candidate.status === 'pending')
      .map((candidate) => candidate.id)
    for (const candidateId of pendingIds) {
      await approveMemoryPromotion(projectRoot, candidateId)
    }
    store = await refreshMemoryPromotionStore(projectRoot, { minOccurrences, minConfidence })
  }

  if (options.reject) {
    await rejectMemoryPromotion(projectRoot, options.reject, options.reason)
    store = await refreshMemoryPromotionStore(projectRoot, { minOccurrences, minConfidence })
  }

  const pending = store.candidates.filter((candidate) => candidate.status === 'pending')
  const approved = store.candidates.filter((candidate) => candidate.status === 'approved')
  const rejected = store.candidates.filter((candidate) => candidate.status === 'rejected')

  if (options.json) {
    log(JSON.stringify({
      storePath: memoryPromotionStorePath(projectRoot),
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      store,
    }, null, 2))
    return
  }

  log('')
  bold('Quest Memory Promotion')
  log('')
  info(`Store: ${memoryPromotionStorePath(projectRoot)}`)
  info(`Threshold: ${minOccurrences}+ occurrence(s), confidence >= ${minConfidence}`)
  info(`Candidates: ${pending.length} pending, ${approved.length} approved, ${rejected.length} rejected`)

  if (options.approve) {
    success(`Approved memory promotion: ${options.approve}`)
  }
  if (options.approveAll) {
    success('Approved all pending memory promotions')
  }
  if (options.reject) {
    warn(`Rejected memory promotion: ${options.reject}`)
  }

  if (pending.length === 0) {
    log('')
    dim('No pending repeated learnings are ready for promotion.')
    log('')
    return
  }

  log('')
  info('Pending candidates:')
  for (const candidate of pending.slice(0, 20)) {
    log(`  - ${candidate.id}  ${candidate.kind}  confidence ${candidate.confidence}  occurrences ${candidate.occurrenceCount}`)
    dim(`    ${candidate.summary}`)
    dim(`    sources: ${candidate.sourceQuestIds.join(', ')}`)
    dim(`    approve: oac memory-promote --approve ${candidate.id}`)
  }
  if (pending.length > 20) {
    dim(`  ... ${pending.length - 20} more pending candidate(s). Use --json for all details.`)
  }
  log('')
}

export function registerMemoryPromoteCommand(program: Command): void {
  program
    .command('memory-promote')
    .description('Review and approve repeated Quest learnings before promoting them to durable repo memory')
    .option('--json', 'Print machine-readable promotion state', false)
    .option('--min-occurrences <n>', 'Minimum repeated occurrences required for a candidate', parseInteger, 2)
    .option('--min-confidence <n>', 'Minimum confidence score required for a candidate', parseFloatOption, 0.65)
    .option('--approve <candidate-id>', 'Approve one pending candidate and write it to team memory')
    .option('--approve-all', 'Approve all pending candidates')
    .option('--reject <candidate-id>', 'Reject one pending candidate')
    .option('--reason <text>', 'Reason to store with --reject')
    .addHelpText(
      'after',
      `
Examples:
  oac memory-promote
  oac memory-promote --json
  oac memory-promote --approve mp-abc123def456
  oac memory-promote --reject mp-abc123def456 --reason "Too broad"
`,
    )
    .action(async (opts: {
      json?: boolean
      minOccurrences?: number
      minConfidence?: number
      approve?: string
      approveAll?: boolean
      reject?: string
      reason?: string
    }) => {
      await memoryPromoteCommand(opts)
    })
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new CommandUsageError(`Invalid integer: ${value}`)
  }
  return parsed
}

function parseFloatOption(value: string): number {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
    throw new CommandUsageError(`Invalid number: ${value}`)
  }
  return parsed
}

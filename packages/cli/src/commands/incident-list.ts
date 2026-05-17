/**
 * oac incident-list — List incidents from .oac/incidents.jsonl
 */

import type { Command } from 'commander'
import { log, dim, warn, bold } from '../ui/logger.js'
import { searchIncidents, getIncidentStats } from '../lib/incident-tracker.js'

export async function incidentListCommand(options: {
  quest?: string
  status?: 'open' | 'resolved'
  severity?: 'low' | 'medium' | 'high' | 'critical'
}): Promise<void> {
  const projectRoot = process.cwd()
  const incidents = await searchIncidents(projectRoot, {
    questId: options.quest,
    status: options.status,
    severity: options.severity,
  })

  const stats = await getIncidentStats(projectRoot)

  if (incidents.length === 0) {
    warn('No incidents found.')
    dim(`  Total recorded: ${stats.total} (${stats.open} open, ${stats.resolved} resolved)`)
    return
  }

  log('')
  bold(`Incidents (${incidents.length} of ${stats.total} total)`)
  log(`  Open: ${stats.open} | Resolved: ${stats.resolved}`)
  log('')
  dim('  ID                    Date       Severity  Status   Category            Quest')
  for (const incident of incidents.slice(0, 30)) {
    const date = incident.createdAt.slice(0, 10)
    const severity = incident.severity.padEnd(8)
    const status = incident.status.padEnd(8)
    const category = incident.category.padEnd(18)
    log(`  ${incident.incidentId.slice(0, 20).padEnd(20)} ${date}  ${severity} ${status} ${category} ${incident.questId}`)
    dim(`    ${incident.summary.slice(0, 72)}`)
  }
  if (incidents.length > 30) {
    dim(`  ... ${incidents.length - 30} more — use oac incident-search <query>`)
  }
  log('')
}

export function registerIncidentListCommand(program: Command): void {
  program
    .command('incident-list')
    .description('List incidents tracked in .oac/incidents.jsonl')
    .option('--quest <quest-id>', 'Filter by quest ID')
    .option('--status <status>', 'Filter by status: open or resolved')
    .option('--severity <severity>', 'Filter by severity: low, medium, high, critical')
    .action(async (opts: { quest?: string; status?: 'open' | 'resolved'; severity?: 'low' | 'medium' | 'high' | 'critical' }) => {
      await incidentListCommand(opts)
    })
}

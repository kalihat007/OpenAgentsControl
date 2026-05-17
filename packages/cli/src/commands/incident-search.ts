/**
 * oac incident-search — Search incident summaries and evidence
 */

import type { Command } from 'commander'
import { log, dim, warn, bold } from '../ui/logger.js'
import { searchIncidents } from '../lib/incident-tracker.js'

export async function incidentSearchCommand(query: string): Promise<void> {
  const projectRoot = process.cwd()
  const incidents = await searchIncidents(projectRoot)

  const normalizedQuery = query.toLowerCase()
  const filtered = incidents.filter((i) =>
    i.summary.toLowerCase().includes(normalizedQuery) ||
    i.evidence.some((e) => e.toLowerCase().includes(normalizedQuery)) ||
    i.category.toLowerCase().includes(normalizedQuery) ||
    i.questId.toLowerCase().includes(normalizedQuery),
  )

  if (filtered.length === 0) {
    warn(`No incidents matching "${query}".`)
    return
  }

  log('')
  bold(`Incidents matching "${query}" (${filtered.length})`)
  log('')
  for (const incident of filtered) {
    const statusIcon = incident.status === 'resolved' ? '✓' : '⊘'
    log(`${statusIcon} ${incident.incidentId} — ${incident.summary}`)
    dim(`  ${incident.category} | ${incident.severity} | ${incident.questId} | ${incident.createdAt.slice(0, 10)}`)
    if (incident.evidence.length > 0) {
      dim(`  Evidence: ${incident.evidence.join('; ')}`)
    }
  }
  log('')
}

export function registerIncidentSearchCommand(program: Command): void {
  program
    .command('incident-search <query>')
    .description('Search incident summaries and evidence by keyword')
    .action(async (query: string) => {
      await incidentSearchCommand(query)
    })
}

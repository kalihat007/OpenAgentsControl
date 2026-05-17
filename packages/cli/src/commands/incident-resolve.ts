/**
 * oac incident-resolve — Resolve an open incident
 */

import type { Command } from 'commander'
import { log, success, warn } from '../ui/logger.js'
import { resolveIncident, findIncidentById } from '../lib/incident-tracker.js'

export async function incidentResolveCommand(
  incidentId: string,
  options: { resolution: string },
): Promise<void> {
  const projectRoot = process.cwd()
  const incident = await findIncidentById(projectRoot, incidentId)

  if (!incident) {
    warn(`Incident '${incidentId}' not found.`)
    return
  }

  if (incident.status === 'resolved') {
    warn(`Incident '${incidentId}' is already resolved.`)
    return
  }

  await resolveIncident(projectRoot, incidentId, options.resolution)
  success(`Incident ${incidentId} resolved.`)
  log(`  Resolution: ${options.resolution}`)
}

export function registerIncidentResolveCommand(program: Command): void {
  program
    .command('incident-resolve <incident-id>')
    .description('Resolve an open incident with a resolution summary')
    .requiredOption('--resolution <text>', 'Resolution description')
    .action(async (incidentId: string, opts: { resolution: string }) => {
      await incidentResolveCommand(incidentId, opts)
    })
}

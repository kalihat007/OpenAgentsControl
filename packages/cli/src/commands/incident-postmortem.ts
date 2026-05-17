/**
 * oac incident-postmortem — Write a post-mortem for a resolved incident
 */

import type { Command } from 'commander'
import { log, success, warn } from '../ui/logger.js'
import { findIncidentById, writePostMortem } from '../lib/incident-tracker.js'

export async function incidentPostmortemCommand(incidentId: string): Promise<void> {
  const projectRoot = process.cwd()
  const incident = await findIncidentById(projectRoot, incidentId)

  if (!incident) {
    warn(`Incident '${incidentId}' not found.`)
    return
  }

  if (incident.status !== 'resolved') {
    warn(`Incident '${incidentId}' is not resolved yet. Resolve it first with oac incident-resolve.`)
    return
  }

  // Simple interactive post-mortem (non-interactive fallback for headless)
  const summary = incident.summary
  const rootCause = 'Root cause not yet determined — update post-mortem manually.'
  const impact = `Affected quest ${incident.questId}${incident.taskId ? `, task ${incident.taskId}` : ''}.`
  const timeline = [
    { time: incident.createdAt, event: 'Incident created' },
    { time: incident.resolvedAt ?? new Date().toISOString(), event: 'Incident resolved' },
  ]
  const lessonsLearned = ['Documented for future reference.']
  const preventiveMeasures = ['Review process to prevent recurrence.']

  await writePostMortem(projectRoot, incidentId, {
    summary,
    rootCause,
    impact,
    timeline,
    lessonsLearned,
    preventiveMeasures,
  })

  success(`Post-mortem written for incident ${incidentId}.`)
  log(`  Edit .oac/incidents.jsonl to refine the post-mortem details.`)
}

export function registerIncidentPostmortemCommand(program: Command): void {
  program
    .command('incident-postmortem <incident-id>')
    .description('Write a post-mortem for a resolved incident')
    .action(async (incidentId: string) => {
      await incidentPostmortemCommand(incidentId)
    })
}

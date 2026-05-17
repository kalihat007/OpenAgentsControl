/**
 * Incident Tracker — append-only incident log for failures, blocked runs,
 * verification failures, and retry exhaustion.
 *
 * Persisted to `.oac/incidents.jsonl`.
 */

import { readFile, mkdir, appendFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('incident-tracker')
const INCIDENTS_PATH = '.oac/incidents.jsonl'

// ── Types ─────────────────────────────────────────────────────────────────────

export type IncidentCategory =
  | 'task_failure'
  | 'verification_failure'
  | 'blocked_run'
  | 'retry_exhaustion'
  | 'runtime_crash'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface IncidentCreatedEvent {
  type: 'incident.created'
  timestamp: string
  incidentId: string
  questId: string
  taskId?: string
  category: IncidentCategory
  summary: string
  evidence: string[]
  severity: IncidentSeverity
}

export interface IncidentResolvedEvent {
  type: 'incident.resolved'
  timestamp: string
  incidentId: string
  resolution: string
  resolvedBy?: string
}

export interface PostMortemWrittenEvent {
  type: 'postmortem.written'
  timestamp: string
  incidentId: string
  postMortem: PostMortem
}

export interface IncidentLinkedEvent {
  type: 'incident.linked'
  timestamp: string
  incidentId: string
  linkedIncidentId: string
  reason: string
}

export type IncidentEvent =
  | IncidentCreatedEvent
  | IncidentResolvedEvent
  | PostMortemWrittenEvent
  | IncidentLinkedEvent

export interface PostMortem {
  incidentId: string
  summary: string
  rootCause: string
  impact: string
  timeline: Array<{ time: string; event: string }>
  lessonsLearned: string[]
  preventiveMeasures: string[]
  writtenAt: string
}

export interface IncidentRecord {
  incidentId: string
  questId: string
  taskId?: string
  category: IncidentCategory
  summary: string
  evidence: string[]
  severity: IncidentSeverity
  status: 'open' | 'resolved'
  createdAt: string
  resolution?: string
  resolvedAt?: string
  resolvedBy?: string
  postMortem?: PostMortem
  linkedIncidentIds: string[]
}

export interface IncidentSearchFilters {
  questId?: string
  status?: 'open' | 'resolved'
  severity?: IncidentSeverity
  category?: IncidentCategory
  after?: string
  before?: string
}

// ── Persistence ───────────────────────────────────────────────────────────────

export async function appendIncidentEvent(
  projectRoot: string,
  event: IncidentEvent,
): Promise<void> {
  const path = join(projectRoot, INCIDENTS_PATH)
  await mkdir(dirname(path), { recursive: true })
  const line = JSON.stringify(event) + '\n'
  await appendFile(path, line)
  log.debug('Incident event appended', { type: event.type, incidentId: (event as IncidentCreatedEvent).incidentId ?? (event as IncidentResolvedEvent).incidentId })
}

export async function loadIncidentEvents(projectRoot: string): Promise<IncidentEvent[]> {
  const path = join(projectRoot, INCIDENTS_PATH)
  try {
    const raw = await readFile(path, 'utf-8')
    const events: IncidentEvent[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line) as IncidentEvent)
      } catch {
        continue
      }
    }
    return events
  } catch {
    return []
  }
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export async function loadIncidents(projectRoot: string): Promise<IncidentRecord[]> {
  const events = await loadIncidentEvents(projectRoot)
  const map = new Map<string, IncidentRecord>()

  for (const event of events) {
    switch (event.type) {
      case 'incident.created': {
        const record: IncidentRecord = {
          incidentId: event.incidentId,
          questId: event.questId,
          taskId: event.taskId,
          category: event.category,
          summary: event.summary,
          evidence: event.evidence,
          severity: event.severity,
          status: 'open',
          createdAt: event.timestamp,
          linkedIncidentIds: [],
        }
        map.set(event.incidentId, record)
        break
      }
      case 'incident.resolved': {
        const record = map.get(event.incidentId)
        if (record) {
          record.status = 'resolved'
          record.resolution = event.resolution
          record.resolvedAt = event.timestamp
          record.resolvedBy = event.resolvedBy
        }
        break
      }
      case 'postmortem.written': {
        const record = map.get(event.incidentId)
        if (record) {
          record.postMortem = event.postMortem
        }
        break
      }
      case 'incident.linked': {
        const record = map.get(event.incidentId)
        if (record && !record.linkedIncidentIds.includes(event.linkedIncidentId)) {
          record.linkedIncidentIds.push(event.linkedIncidentId)
        }
        break
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createIncident(
  projectRoot: string,
  params: {
    questId: string
    taskId?: string
    category: IncidentCategory
    summary: string
    evidence?: string[]
    severity?: IncidentSeverity
  },
): Promise<string> {
  const incidentId = `incident-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  const event: IncidentCreatedEvent = {
    type: 'incident.created',
    timestamp: new Date().toISOString(),
    incidentId,
    questId: params.questId,
    taskId: params.taskId,
    category: params.category,
    summary: params.summary,
    evidence: params.evidence ?? [],
    severity: params.severity ?? 'medium',
  }
  await appendIncidentEvent(projectRoot, event)
  return incidentId
}

export async function resolveIncident(
  projectRoot: string,
  incidentId: string,
  resolution: string,
  resolvedBy?: string,
): Promise<void> {
  const event: IncidentResolvedEvent = {
    type: 'incident.resolved',
    timestamp: new Date().toISOString(),
    incidentId,
    resolution,
    resolvedBy,
  }
  await appendIncidentEvent(projectRoot, event)
}

export async function writePostMortem(
  projectRoot: string,
  incidentId: string,
  postMortem: Omit<PostMortem, 'incidentId' | 'writtenAt'>,
): Promise<void> {
  const event: PostMortemWrittenEvent = {
    type: 'postmortem.written',
    timestamp: new Date().toISOString(),
    incidentId,
    postMortem: {
      ...postMortem,
      incidentId,
      writtenAt: new Date().toISOString(),
    },
  }
  await appendIncidentEvent(projectRoot, event)
}

export async function searchIncidents(
  projectRoot: string,
  filters: IncidentSearchFilters = {},
): Promise<IncidentRecord[]> {
  let incidents = await loadIncidents(projectRoot)

  if (filters.questId) {
    incidents = incidents.filter((i) => i.questId === filters.questId)
  }
  if (filters.status) {
    incidents = incidents.filter((i) => i.status === filters.status)
  }
  if (filters.severity) {
    incidents = incidents.filter((i) => i.severity === filters.severity)
  }
  if (filters.category) {
    incidents = incidents.filter((i) => i.category === filters.category)
  }
  if (filters.after) {
    incidents = incidents.filter((i) => i.createdAt >= filters.after!)
  }
  if (filters.before) {
    incidents = incidents.filter((i) => i.createdAt <= filters.before!)
  }

  return incidents
}

export async function getIncidentStats(projectRoot: string): Promise<{
  total: number
  open: number
  resolved: number
  bySeverity: Record<IncidentSeverity, number>
  byCategory: Record<IncidentCategory, number>
}> {
  const incidents = await loadIncidents(projectRoot)
  const bySeverity: Record<IncidentSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  const byCategory: Record<IncidentCategory, number> = {
    task_failure: 0,
    verification_failure: 0,
    blocked_run: 0,
    retry_exhaustion: 0,
    runtime_crash: 0,
  }

  for (const i of incidents) {
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1
  }

  return {
    total: incidents.length,
    open: incidents.filter((i) => i.status === 'open').length,
    resolved: incidents.filter((i) => i.status === 'resolved').length,
    bySeverity,
    byCategory,
  }
}

export async function findIncidentById(
  projectRoot: string,
  incidentId: string,
): Promise<IncidentRecord | null> {
  const incidents = await loadIncidents(projectRoot)
  return incidents.find((i) => i.incidentId === incidentId) ?? null
}

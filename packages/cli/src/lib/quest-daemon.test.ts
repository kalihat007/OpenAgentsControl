import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  appendDaemonAction,
  loadDaemonActions,
  loadDaemonState,
  saveDaemonState,
  type QuestDaemonState,
} from './quest-daemon.js'

describe('quest-daemon persistence', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-quest-daemon-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('saves daemon.json as the daemon-owned state snapshot', async () => {
    const state: QuestDaemonState = {
      version: '1',
      questId: 'quest-daemon-test',
      status: 'running',
      startedAt: '2026-05-17T00:00:00.000Z',
      lastHeartbeatAt: '2026-05-17T00:00:00.000Z',
      pid: 12345,
      runtimes: [],
      actionCursor: 0,
    }

    await saveDaemonState(projectRoot, state)
    const loaded = await loadDaemonState(projectRoot, state.questId)

    expect(loaded?.questId).toBe(state.questId)
    expect(loaded?.status).toBe('running')
    expect(loaded?.actionCursor).toBe(0)
  })

  it('stores controls in append-only daemon-actions.ndjson', async () => {
    await appendDaemonAction(projectRoot, 'quest-daemon-test', {
      type: 'pause',
      requestedAt: '2026-05-17T00:00:00.000Z',
    })
    await appendDaemonAction(projectRoot, 'quest-daemon-test', {
      type: 'rerun_task',
      taskId: 'task-002',
      requestedAt: '2026-05-17T00:00:01.000Z',
    })

    const actions = await loadDaemonActions(projectRoot, 'quest-daemon-test')

    expect(actions).toHaveLength(2)
    expect(actions[0]?.type).toBe('pause')
    expect(actions[1]?.type).toBe('rerun_task')
    expect(actions[1]).toMatchObject({ taskId: 'task-002' })
  })
})

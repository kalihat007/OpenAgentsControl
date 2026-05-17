import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { questReviewCommand } from './quest-review.js'
import { loadDaemonActions, saveDaemonState, type QuestDaemonState } from '../lib/quest-daemon.js'
import { loadEvents } from '../lib/quest-reconciler.js'
import { persistQuestRun, type QuestRun } from '../lib/quest-run.js'

describe('quest-review command', () => {
  let projectRoot: string
  let previousCwd: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    projectRoot = await mkdtemp(join(tmpdir(), 'oac-quest-review-'))
    process.chdir(projectRoot)
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('approves a REVIEW quest and resumes a paused daemon', async () => {
    const quest = makeQuest('quest-review-approve')
    await persistQuestRun(projectRoot, quest)
    await saveDaemonState(projectRoot, makePausedDaemonState(quest.questId))

    await questReviewCommand(quest.questId, { approve: true })

    const events = await loadEvents(projectRoot, quest.questId)
    expect(events.some((event) => event.type === 'review.approved')).toBe(true)

    const actions = await loadDaemonActions(projectRoot, quest.questId)
    expect(actions.some((action) => action.type === 'resume')).toBe(true)
  })

  it('skip works without a committed .oac/config.json', async () => {
    const quest = makeQuest('quest-review-skip-no-config')
    await persistQuestRun(projectRoot, quest)

    await questReviewCommand(quest.questId, { skip: true })

    const events = await loadEvents(projectRoot, quest.questId)
    expect(events.some((event) => event.type === 'review.approved')).toBe(true)
  })
})

function makeQuest(questId: string): QuestRun {
  const now = new Date().toISOString()
  return {
    version: '8',
    questId,
    runId: questId,
    objective: 'Review command test',
    scenario: 'code_with_spec',
    state: 'REVIEW',
    intensity: 'standard',
    trustLabel: 'changed',
    createdAt: now,
    updatedAt: now,
    experts: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Task one',
        status: 'completed',
        expert: 'coder',
        dependsOn: [],
        acceptanceCriteria: [],
      },
    ],
    acceptanceCriteria: ['review can approve'],
    artifacts: {
      runDir: `.oac/runs/${questId}`,
      quest: 'quest.json',
      spec: 'spec.json',
    },
    nextSuggestedAction: 'review',
    runtimes: {
      opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
      kimi: { command: 'kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml', resumePrompt: 'resume' },
      claude: { command: 'claude', resumePrompt: 'resume' },
    },
    changedFiles: ['src/example.ts'],
  }
}

function makePausedDaemonState(questId: string): QuestDaemonState {
  const now = new Date().toISOString()
  return {
    version: '1',
    questId,
    status: 'paused',
    startedAt: now,
    lastHeartbeatAt: now,
    pid: process.pid,
    runtimes: [],
    actionCursor: 0,
  }
}

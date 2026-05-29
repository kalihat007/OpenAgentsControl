import { describe, expect, it } from 'bun:test'
import { buildQuestNextStepSuggestions } from './quest-next-steps.js'
import type { QuestRun } from './quest-run.js'

describe('quest-next-steps', () => {
  it('recommends next work from changed Quest and runtime surfaces', () => {
    const quest = makeQuest({
      changedFiles: [
        'packages/cli/src/lib/quest-reconciler.ts',
        'packages/cli/src/lib/runtime-bridge.ts',
        'plugins/kimi-code/openagent.yaml',
        'scripts/tests/test-kimi-quest-v8.sh',
        'packages/cli/.opencode/.expert-memory.json',
      ],
    })

    const suggestions = buildQuestNextStepSuggestions(quest)
    const titles = suggestions.map((suggestion) => suggestion.title).join('\n')

    expect(titles).toContain('Kimi')
    expect(titles).toContain('focused regressions')
    expect(titles).toContain('generated memory artifact')
    expect(suggestions.some((suggestion) => suggestion.command?.includes('RUN_LIVE_KIMI=1'))).toBe(true)
  })

  it('prefers targeted verification when checks are missing or forced', () => {
    const quest = makeQuest({
      verification: {
        timestamp: new Date().toISOString(),
        checks: [],
        overallPassed: true,
        summary: 'forced',
        forced: true,
        noChecks: true,
      },
      changedFiles: ['packages/cli/src/commands/quest-complete.ts'],
    })

    const suggestions = buildQuestNextStepSuggestions(quest)
    expect(suggestions[0]?.id).toBe('run-targeted-verification')
    expect(suggestions[0]?.reason).toContain('forced')
    expect(suggestions[0]?.command).toContain('npm run typecheck -w packages/cli')
  })
})

function makeQuest(overrides: Partial<QuestRun> = {}): QuestRun {
  const now = new Date().toISOString()
  return {
    version: '8',
    questId: 'quest-next-steps-test',
    runId: 'quest-next-steps-test',
    objective: 'Improve Quest next-step recommendations',
    scenario: 'code_with_spec',
    state: 'COMPLETE',
    intensity: 'standard',
    trustLabel: 'tested',
    createdAt: now,
    updatedAt: now,
    experts: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Implement recommendations',
        status: 'completed',
        expert: 'TechLeadAgent',
        dependsOn: [],
        acceptanceCriteria: ['recommendations are contextual'],
      },
    ],
    acceptanceCriteria: ['recommendations are contextual'],
    artifacts: {
      runDir: '.oac/runs/quest-next-steps-test',
      quest: 'quest.json',
      spec: 'spec.json',
    },
    nextSuggestedAction: 'complete',
    nextStepSuggestions: [],
    runtimes: {
      opencode: { command: 'opencode --agent OpenAgent', resumePrompt: 'resume' },
      kimi: { command: 'kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml', resumePrompt: 'resume' },
      claude: { command: 'claude', resumePrompt: 'resume' },
      codex: { command: 'codex', resumePrompt: 'resume' },
    },
    changedFiles: [],
    verification: {
      timestamp: now,
      checks: [{ name: 'test', command: 'bun test', passed: true }],
      overallPassed: true,
      summary: 'passed',
    },
    ...overrides,
  }
}


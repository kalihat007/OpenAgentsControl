import { describe, it, expect } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildQuestRun,
  persistQuestRun,
  generateQuestId,
  questExists,
  appendQuestEvent,
  writeTaskGraph,
  formatRuntimeHandoff,
  normalizeQuestRun,
  formatQuestSummary,
  formatAcceptanceReport,
  type QuestRun,
} from './quest-run.js'
import { loadQuestMemoryGraph } from './quest-memory-graph.js'
import { loadQuestInteractionMemory } from './quest-interaction-memory.js'
import { planExecution } from './swarm-executor.js'
import type { RouterResult } from './task-router.js'

function routerResult(objective: string): RouterResult {
  return {
    objective,
    scenario: 'code_with_spec',
    primaryExperts: [
      {
        id: 'coder',
        name: 'CoderAgent',
        description: 'writes code',
        category: 'development',
        keywords: ['code'],
        filePatterns: ['*.ts'],
        score: 10,
      },
    ],
    secondaryExperts: [],
    reasoning: [],
    estimatedChunks: 2,
    confidence: {
      score: 1,
      isLowConfidence: false,
      isAmbiguous: false,
      ambiguousExperts: [],
    },
    clarification: {
      needed: false,
      questions: [],
    },
  }
}

describe('quest-run', () => {
  it('builds a v8 Quest sidecar from a plan', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    expect(quest.version).toBe('8')
    expect(quest.questId).toBe(plan.session.id)
    expect(quest.state).toBe('SPEC')
    expect(quest.tasks.length).toBeGreaterThan(0)
    expect(quest.artifacts.memoryGraph).toBe('memory-graph.json')
    expect(quest.artifacts.interactionMemory).toBe('interaction-memory.json')
    expect(quest.artifacts.repoWiki).toBe('../../repo-wiki/index.md')
    expect(quest.artifacts.codingIntelligence).toBe('coding-intelligence.json')
    expect(quest.artifacts.patchCapsules).toBe('patch-capsules.json')
    expect(quest.artifacts.codingReview).toBe('coding-review.md')
    expect(quest.artifacts.codingAutopilot).toBe('coding-autopilot.json')
    expect(quest.artifacts.symbolGraph).toBe('symbol-graph.json')
    expect(quest.artifacts.smartTestMatrix).toBe('smart-test-matrix.json')
    expect(quest.artifacts.patchLedger).toBe('patch-ledger.json')
    expect(quest.artifacts.preEditContract).toBe('pre-edit-contract.json')
    expect(quest.artifacts.automaticCodeReview).toBe('automatic-code-review.json')
    expect(quest.artifacts.failureMemory).toBe('failure-memory.json')
    expect(quest.artifacts.runtimeParityEnforcer).toBe('runtime-parity-enforcer.json')
    expect(quest.artifacts.dependencyResearchGate).toBe('dependency-research-gate.json')
    expect(quest.artifacts.autofixPlan).toBe('autofix-plan.json')
    expect(quest.artifacts.prReadiness).toBe('pr-readiness.md')
    expect(quest.artifacts.codingExecution).toBe('coding-execution.json')
    expect(quest.artifacts.executableAcceptance).toBe('executable-acceptance.json')
    expect(quest.artifacts.guardedAutofixRunner).toBe('guarded-autofix-runner.json')
    expect(quest.artifacts.contractDriftGuard).toBe('contract-drift-guard.json')
    expect(quest.artifacts.reviewPatchLoop).toBe('review-patch-loop.json')
    expect(quest.artifacts.testGapFinder).toBe('test-gap-finder.json')
    expect(quest.artifacts.regressionSnapshots).toBe('regression-snapshots.json')
    expect(quest.artifacts.runtimeCompatibilityMatrix).toBe('runtime-compatibility-matrix.json')
    expect(quest.artifacts.ownershipLockPlan).toBe('ownership-lock-plan.json')
    expect(quest.artifacts.securitySecretsGate).toBe('security-secrets-gate.json')
    expect(quest.artifacts.prAutoPackager).toBe('pr-auto-packager.json')
    expect(quest.artifacts.prAutoPackagerBrief).toBe('pr-auto-packager.md')
    expect(quest.runtimes.kimi.command).toContain('kimi --work-dir .')
  })

  it('persists quest.json under .oac/runs/{id}', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-run-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      const questPath = await persistQuestRun(tmpRoot, quest)
      const raw = await readFile(questPath, 'utf-8')
      expect(JSON.parse(raw).questId).toBe(plan.session.id)
      const graph = await loadQuestMemoryGraph(tmpRoot, quest.questId)
      expect(graph?.summary.requests).toBe(1)
      expect(graph?.summary.tasks).toBe(quest.tasks.length)
      const interactionMemory = await loadQuestInteractionMemory(tmpRoot, quest.questId)
      expect(interactionMemory?.summary.requests).toBe(1)
      expect(interactionMemory?.workingContext.currentWorkDir).toBe(tmpRoot)
      const repoWiki = await readFile(join(tmpRoot, '.oac', 'repo-wiki', 'index.md'), 'utf-8')
      expect(repoWiki).toContain('Repo Wiki')
      const codingIntelligence = await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-intelligence.json'), 'utf-8')
      expect(codingIntelligence).toContain('"version": "9"')
      const codingAutopilot = await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-autopilot.json'), 'utf-8')
      expect(codingAutopilot).toContain('"version": "10"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'smart-test-matrix.json'), 'utf-8')).toContain('minimumCredibleCommands')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-readiness.md'), 'utf-8')).toContain('PR Readiness')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'coding-execution.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'executable-acceptance.json'), 'utf-8')).toContain('"version": "11"')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'security-secrets-gate.json'), 'utf-8')).toContain('patternsChecked')
      expect(await readFile(join(tmpRoot, '.oac', 'runs', quest.questId, 'pr-auto-packager.md'), 'utf-8')).toContain('Summary')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('generateQuestId creates sequential IDs for the same day', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-id-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs'), { recursive: true })

      // Create directories to reserve IDs
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-001'))
      await mkdir(join(tmpRoot, '.oac', 'runs', 'quest-19990101-002'))

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const id1 = await generateQuestId(tmpRoot)
      expect(id1).toBe(`quest-${today}-001`)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('questExists returns true for persisted quests and false otherwise', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-exists-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

      expect(await questExists(tmpRoot, quest.questId)).toBe(false)
      await persistQuestRun(tmpRoot, quest)
      expect(await questExists(tmpRoot, quest.questId)).toBe(true)
      expect(await questExists(tmpRoot, 'nonexistent')).toBe(false)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('appendQuestEvent appends to events.ndjson', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-events-'))
    try {
      await mkdir(join(tmpRoot, '.oac'), { recursive: true })
      const routed = routerResult('build JWT auth API')
      const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
      const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
      await persistQuestRun(tmpRoot, quest)

      await appendQuestEvent(tmpRoot, quest.questId, {
        timestamp: new Date().toISOString(),
        type: 'task_update',
        data: { taskId: '1', to: 'completed' },
      })

      const eventsPath = join(tmpRoot, '.oac', 'runs', quest.questId, 'events.ndjson')
      const raw = await readFile(eventsPath, 'utf-8')
      const lines = raw.trim().split('\n')
      expect(lines.length).toBe(1)
      const event = JSON.parse(lines[0] as string)
      expect(event.type).toBe('task_update')
      const graph = await loadQuestMemoryGraph(tmpRoot, quest.questId)
      expect(graph?.summary.actions).toBe(1)
      const interactionMemory = await loadQuestInteractionMemory(tmpRoot, quest.questId)
      expect(interactionMemory?.summary.actions).toBe(1)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('writeTaskGraph writes task-graph.json', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-quest-graph-'))
    try {
      await mkdir(join(tmpRoot, '.oac', 'runs', 'q1'), { recursive: true })
      await writeTaskGraph(tmpRoot, 'q1', [
        { id: '1', title: 'A', status: 'completed' },
        { id: '2', title: 'B', status: 'pending' },
      ])
      const raw = await readFile(join(tmpRoot, '.oac', 'runs', 'q1', 'task-graph.json'), 'utf-8')
      const graph = JSON.parse(raw)
      expect(graph.tasks).toHaveLength(2)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('formatRuntimeHandoff includes runtime command and resume prompt', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const text = formatRuntimeHandoff(quest, 'kimi')
    expect(text).toContain(quest.questId)
    expect(text).toContain('kimi --work-dir')
    expect(text).toContain('Resume prompt:')
    expect(text).toContain('interaction-memory.json')
    expect(text).toContain('.oac/repo-wiki/index.md')
    expect(text).toContain('coding-intelligence.json')
    expect(text).toContain('patch-capsules.json')
    expect(text).toContain('coding-autopilot.json')
    expect(text).toContain('symbol-graph.json')
    expect(text).toContain('smart-test-matrix.json')
    expect(text).toContain('pre-edit-contract.json')
    expect(text).toContain('autofix-plan.json')
    expect(text).toContain('coding-execution.json')
    expect(text).toContain('executable-acceptance.json')
    expect(text).toContain('security-secrets-gate.json')
    expect(text).toContain('pr-auto-packager.md')
    expect(text).toContain('Quest v9 coding')
    expect(text).toContain('Coding Autopilot')
    expect(text).toContain('Coding Execution')
    expect(text).toContain('Pre-Execution Discovery Gate')
    expect(text).toContain('research.assessed')
  })

  it('formatRuntimeHandoff includes codex command', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const text = formatRuntimeHandoff(quest, 'codex')
    expect(text).toContain('CODEX Resume')
    expect(text).toContain('codex exec -C .')
  })

  it('normalizeQuestRun backfills codex for legacy quest.json', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })
    const legacy = {
      ...quest,
      runtimes: {
        opencode: quest.runtimes.opencode,
        kimi: quest.runtimes.kimi,
        claude: quest.runtimes.claude,
      },
    } as QuestRun

    const normalized = normalizeQuestRun(legacy)
    expect(normalized.runtimes.codex.command).toContain('codex exec -C .')
  })

  it('formatQuestSummary produces markdown', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatQuestSummary(quest)
    expect(md).toContain('# Quest Summary')
    expect(md).toContain(quest.objective)
    expect(md).toContain('## Next Action')
  })

  it('formatAcceptanceReport includes risks for failed tasks', () => {
    const routed = routerResult('build JWT auth API')
    const plan = planExecution(routed, { autoDecompose: false, maxConcurrency: 1 })
    const quest = buildQuestRun(routed, plan, { state: 'SPEC' })

    const md = formatAcceptanceReport(quest)
    expect(md).toContain('# Acceptance Report')
    expect(md).toContain('## Remaining Risks')
  })
})

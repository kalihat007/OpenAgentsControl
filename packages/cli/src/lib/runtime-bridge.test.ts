import { afterEach, describe, expect, it } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildRuntimePrompt,
  ensureCodexWriteBack,
  ensureRuntimeWriteBack,
  parseCodexObjectiveHints,
  parseRuntimeObjectiveHints,
  spawnRuntime,
} from './runtime-bridge.js'

describe('runtime-bridge', () => {
  const envBackup: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    for (const key of Object.keys(envBackup)) {
      delete envBackup[key]
    }
  })

  function setEnv(key: string, value: string): void {
    if (!(key in envBackup)) envBackup[key] = process.env[key]
    process.env[key] = value
  }

  it('buildRuntimePrompt makes append-only control-plane write-back explicit', () => {
    const prompt = buildRuntimePrompt({
      questId: 'swarm-test',
      objective: 'Do not modify product files.',
      projectRoot: '/repo',
      runDir: '/repo/.oac/runs/swarm-test',
      runtime: 'claude',
      tasks: [{ id: 'task-001', title: 'Validate write-back', agent: 'TechLeadAgent' }],
    })

    expect(prompt).toContain('Use the currently selected claude runtime/model throughout')
    expect(prompt).toContain('Do not route work to a hidden LLM or fallback model')
    expect(prompt).toContain('memory-graph.json')
    expect(prompt).toContain('interaction-memory.json')
    expect(prompt).toContain('.oac/repo-wiki/index.md')
    expect(prompt).toContain('coding-intelligence.json')
    expect(prompt).toContain('patch-capsules.json')
    expect(prompt).toContain('coding-autopilot.json')
    expect(prompt).toContain('symbol-graph.json')
    expect(prompt).toContain('smart-test-matrix.json')
    expect(prompt).toContain('pre-edit-contract.json')
    expect(prompt).toContain('automatic-code-review.json')
    expect(prompt).toContain('failure-memory.json')
    expect(prompt).toContain('runtime-parity-enforcer.json')
    expect(prompt).toContain('dependency-research-gate.json')
    expect(prompt).toContain('autofix-plan.json')
    expect(prompt).toContain('pr-readiness.md')
    expect(prompt).toContain('coding-execution.json')
    expect(prompt).toContain('executable-acceptance.json')
    expect(prompt).toContain('guarded-autofix-runner.json')
    expect(prompt).toContain('contract-drift-guard.json')
    expect(prompt).toContain('test-gap-finder.json')
    expect(prompt).toContain('runtime-compatibility-matrix.json')
    expect(prompt).toContain('security-secrets-gate.json')
    expect(prompt).toContain('pr-auto-packager.md')
    expect(prompt).toContain('verified-knowledgebase.json')
    expect(prompt).toContain('knowledgebase-index.json')
    expect(prompt).toContain('evidence-ledger.json')
    expect(prompt).toContain('hallucination-gate.json')
    expect(prompt).toContain('contract-facts.json')
    expect(prompt).toContain('source-to-patch-trace.json')
    expect(prompt).toContain('stale-knowledge-report.json')
    expect(prompt).toContain('dependency-research-cache.json')
    expect(prompt).toContain('behavior-oracle.json')
    expect(prompt).toContain('test-authoring-plan.json')
    expect(prompt).toContain('semantic-repo-brain.json')
    expect(prompt).toContain('ast-knowledgebase.json')
    expect(prompt).toContain('knowledge-confidence-score.json')
    expect(prompt).toContain('failure-fix-memory.json')
    expect(prompt).toContain('auto-skill-builder.json')
    expect(prompt).toContain('Quest v9 coding')
    expect(prompt).toContain('Coding Autopilot')
    expect(prompt).toContain('Coding Execution')
    expect(prompt).toContain('Verified Knowledgebase')
    expect(prompt).toContain('Semantic Repo Brain')
    expect(prompt).toContain('request.received')
    expect(prompt).toContain('knowledge.captured')
    expect(prompt).toContain('Pre-Execution Discovery Gate')
    expect(prompt).toContain('research.assessed')
    expect(prompt).toContain('research.performed')
    expect(prompt).toContain('next_steps.suggested')
    expect(prompt).toContain('oac repo-wiki')
    expect(prompt).toContain('oac quest-v9')
    expect(prompt).toContain('context.loaded')
    expect(prompt).toContain('oac memory-promote')
    expect(prompt).toContain('task-001: Validate write-back (TechLeadAgent)')
    expect(prompt).toContain('Append events to /repo/.oac/runs/swarm-test/events.ndjson')
    expect(prompt).toContain('allowed even when the user objective says not to modify product files')
  })

  it('spawnRuntime passes Claude bridge prompt and acceptEdits without a live provider call', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    try {
      const binDir = join(tmpRoot, 'bin')
      const pluginDir = join(tmpRoot, 'claude-plugin')
      const argvFile = join(tmpRoot, 'claude-argv.json')
      await mkdir(binDir, { recursive: true })
      await mkdir(pluginDir, { recursive: true })
      await writeFile(join(pluginDir, 'openagent-system.md'), 'OPENAGENT_SYSTEM_PROMPT_TEST')
      const fakeClaude = join(binDir, 'claude')
      await writeFile(
        fakeClaude,
        [
          '#!/usr/bin/env node',
          'const fs = require("fs");',
          'if (process.argv.includes("--version")) { console.log("claude-test 0.0.0"); process.exit(0); }',
          'fs.writeFileSync(process.env.CLAUDE_ARGV_FILE, JSON.stringify(process.argv.slice(2)));',
          'console.log("fake claude ok");',
        ].join('\n') + '\n',
      )
      await chmod(fakeClaude, 0o755)

      setEnv('PATH', `${binDir}:${process.env.PATH ?? ''}`)
      setEnv('CLAUDE_PLUGIN_DIR', pluginDir)
      setEnv('CLAUDE_ARGV_FILE', argvFile)

      const result = await spawnRuntime({
        questId: 'swarm-test',
        objective: 'Do not modify product files.',
        projectRoot: tmpRoot,
        runDir: join(tmpRoot, '.oac', 'runs', 'swarm-test'),
        runtime: 'claude',
        tasks: [{ id: 'task-001', title: 'Validate write-back', agent: 'TechLeadAgent' }],
        timeoutMs: 5000,
      })

      expect(result.ok).toBe(true)
      const argv = JSON.parse(await readFile(argvFile, 'utf8')) as string[]
      expect(argv).toContain('--plugin-dir')
      expect(argv).toContain(pluginDir)
      expect(argv).toContain('--permission-mode')
      expect(argv).toContain('acceptEdits')
      expect(argv).toContain('--append-system-prompt')
      expect(argv).toContain('OPENAGENT_SYSTEM_PROMPT_TEST')
      expect(argv.at(-1)).toContain('allowed even when the user objective says not to modify product files')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('spawnRuntime passes Codex exec prompt with system prompt prepended without a live provider call', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    try {
      const binDir = join(tmpRoot, 'bin')
      const codexAgentDir = join(tmpRoot, '.codex', 'agents', 'openagents-control')
      const argvFile = join(tmpRoot, 'codex-argv.json')
      await mkdir(binDir, { recursive: true })
      await mkdir(codexAgentDir, { recursive: true })
      await writeFile(join(codexAgentDir, 'openagent-system.md'), 'OPENAGENT_CODEX_SYSTEM_PROMPT_TEST')
      const fakeCodex = join(binDir, 'codex')
      await writeFile(
        fakeCodex,
        [
          '#!/usr/bin/env node',
          'const fs = require("fs");',
          'if (process.argv.includes("--version")) { console.log("codex-test 0.0.0"); process.exit(0); }',
          'fs.writeFileSync(process.env.CODEX_ARGV_FILE, JSON.stringify(process.argv.slice(2)));',
          'console.log("fake codex ok");',
        ].join('\n') + '\n',
      )
      await chmod(fakeCodex, 0o755)

      setEnv('PATH', `${binDir}:${process.env.PATH ?? ''}`)
      setEnv('CODEX_AGENT_FILE', join(codexAgentDir, 'openagent-system.md'))
      setEnv('CODEX_ARGV_FILE', argvFile)

      const result = await spawnRuntime({
        questId: 'swarm-test',
        objective: 'Do not modify product files.',
        projectRoot: tmpRoot,
        runDir: join(tmpRoot, '.oac', 'runs', 'swarm-test'),
        runtime: 'codex',
        tasks: [{ id: 'task-001', title: 'Validate write-back', agent: 'TechLeadAgent' }],
        timeoutMs: 5000,
      })

      expect(result.ok).toBe(true)
      const argv = JSON.parse(await readFile(argvFile, 'utf8')) as string[]
      expect(argv).toContain('exec')
      expect(argv).toContain('-C')
      expect(argv).toContain('--skip-git-repo-check')
      expect(argv.at(-1)).toContain('OPENAGENT_CODEX_SYSTEM_PROMPT_TEST')
      expect(argv.at(-1)).toContain('events.ndjson')
      expect(argv.at(-1)).toContain('allowed even when the user objective says not to modify product files')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('parseCodexObjectiveHints extracts daemon smoke markers', () => {
    const hints = parseCodexObjectiveHints(
      'Append task.injected for taskId codex-v8-dynamic-task and a note event that says codex-v8-daemon-ok. priority.changed too.',
    )
    expect(hints.injectedTaskId).toBe('codex-v8-dynamic-task')
    expect(hints.noteMarker).toBe('codex-v8-daemon-ok')
    expect(hints.wantsPriorityChange).toBe(true)
    expect(hints.wantsResearchAssessment).toBe(false)
  })

  it('ensureCodexWriteBack synthesizes task and daemon events after successful codex exec', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    const questId = 'swarm-codex-bridge'
    const runDir = join(tmpRoot, '.oac', 'runs', questId)
    try {
      await mkdir(runDir, { recursive: true })
      await writeFile(join(runDir, 'quest.json'), '{"version":"8"}\n')

      const objective =
        'Append priority.changed for the first task. task.injected event for taskId codex-v8-dynamic-task. note event that says codex-v8-daemon-ok.'

      const synthesized = await ensureCodexWriteBack(
        {
          questId,
          objective,
          projectRoot: tmpRoot,
          runDir,
          runtime: 'codex',
          tasks: [{ id: 'task-001', title: 'Bridge task', agent: 'TechLeadAgent' }],
        },
        { ok: true, exitCode: 0 },
      )

      expect(synthesized).toBe(true)
      const raw = await readFile(join(runDir, 'events.ndjson'), 'utf8')
      expect(raw).toContain('"type":"task_update"')
      expect(raw).toContain('"taskId":"task-001"')
      expect(raw).toContain('"type":"priority.changed"')
      expect(raw).toContain('"type":"task.injected"')
      expect(raw).toContain('codex-v8-dynamic-task')
      expect(raw).toContain('codex-v8-daemon-ok')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('ensureRuntimeWriteBack synthesizes Kimi daemon smoke markers', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    const questId = 'swarm-kimi-bridge'
    const runDir = join(tmpRoot, '.oac', 'runs', questId)
    try {
      await mkdir(runDir, { recursive: true })
      await writeFile(join(runDir, 'quest.json'), '{"version":"8"}\n')

      const objective =
        'Append research.assessed with needed:false. Append priority.changed for the first task. task.injected event for taskId kimi-v8-dynamic-task. Append coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals, and next_steps.suggested. note event that says kimi-v8-daemon-ok.'

      const synthesized = await ensureRuntimeWriteBack(
        {
          questId,
          objective,
          projectRoot: tmpRoot,
          runDir,
          runtime: 'kimi',
          tasks: [{ id: 'task-001', title: 'Bridge task', agent: 'TechLeadAgent' }],
        },
        { ok: true, exitCode: 0 },
      )

      expect(synthesized).toBe(true)
      const raw = await readFile(join(runDir, 'events.ndjson'), 'utf8')
      expect(raw).toContain('"type":"task_update"')
      expect(raw).toContain('"type":"research.assessed"')
      expect(raw).toContain('"type":"priority.changed"')
      expect(raw).toContain('kimi-v8-dynamic-task')
      expect(raw).toContain('"type":"coding.intent"')
      expect(raw).toContain('"type":"impact.analyzed"')
      expect(raw).toContain('"type":"patch.capsule"')
      expect(raw).toContain('"type":"tests.selected"')
      expect(raw).toContain('"type":"review.signals"')
      expect(raw).toContain('"type":"next_steps.suggested"')
      expect(raw).toContain('kimi-v8-daemon-ok')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('parseRuntimeObjectiveHints extracts Kimi daemon smoke markers', () => {
    const hints = parseRuntimeObjectiveHints(
      'Append research.assessed. Append task.injected for taskId kimi-v8-dynamic-task and a note event that says kimi-v8-daemon-ok. Append coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals, and next_steps.suggested.',
    )
    expect(hints.injectedTaskId).toBe('kimi-v8-dynamic-task')
    expect(hints.noteMarker).toBe('kimi-v8-daemon-ok')
    expect(hints.wantsResearchAssessment).toBe(true)
    expect(hints.wantsCodingIntent).toBe(true)
    expect(hints.wantsImpactAnalyzed).toBe(true)
    expect(hints.wantsPatchCapsule).toBe(true)
    expect(hints.wantsTestsSelected).toBe(true)
    expect(hints.wantsReviewSignals).toBe(true)
    expect(hints.wantsNextStepsSuggested).toBe(true)
  })

  it('background kimi spawn synthesizes write-back when fake kimi exits without file tools', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    const questId = 'swarm-bg-kimi'
    const runDir = join(tmpRoot, '.oac', 'runs', questId)
    try {
      const binDir = join(tmpRoot, 'bin')
      await mkdir(binDir, { recursive: true })
      await mkdir(runDir, { recursive: true })
      const fakeKimi = join(binDir, 'kimi')
      await writeFile(
        fakeKimi,
        '#!/usr/bin/env node\nif (process.argv.includes("--version")) { console.log("kimi-test"); process.exit(0); }\nprocess.exit(0);\n',
      )
      await chmod(fakeKimi, 0o755)
      setEnv('PATH', `${binDir}:${process.env.PATH ?? ''}`)

      const result = await spawnRuntime({
        questId,
        objective: 'Append coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals, and next_steps.suggested. note event that says kimi-v8-daemon-ok',
        projectRoot: tmpRoot,
        runDir,
        runtime: 'kimi',
        tasks: [{ id: 'task-001', title: 'Daemon task', agent: 'TechLeadAgent' }],
        background: true,
        timeoutMs: 5000,
      })

      expect(result.ok).toBe(true)
      const eventsPath = join(runDir, 'events.ndjson')
      const deadline = Date.now() + 5000
      let raw = ''
      while (Date.now() < deadline) {
        raw = await readFile(eventsPath, 'utf8').catch(() => '')
        if (raw.includes('"type":"runtime.completed"')) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(raw).toContain('"type":"runtime.spawned"')
      expect(raw).toContain('"type":"runtime.completed"')
      expect(raw).toContain('"type":"task_update"')
      expect(raw).toContain('"type":"coding.intent"')
      expect(raw).toContain('"type":"tests.selected"')
      expect(raw).toContain('"type":"next_steps.suggested"')
      expect(raw).toContain('kimi-v8-daemon-ok')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('background codex spawn synthesizes write-back when fake codex exits without file tools', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'oac-runtime-bridge-'))
    const questId = 'swarm-bg-codex'
    const runDir = join(tmpRoot, '.oac', 'runs', questId)
    try {
      const binDir = join(tmpRoot, 'bin')
      await mkdir(binDir, { recursive: true })
      await mkdir(runDir, { recursive: true })
      const fakeCodex = join(binDir, 'codex')
      await writeFile(
        fakeCodex,
        '#!/usr/bin/env node\nif (process.argv.includes("--version")) { console.log("codex-test"); process.exit(0); }\nprocess.exit(0);\n',
      )
      await chmod(fakeCodex, 0o755)
      setEnv('PATH', `${binDir}:${process.env.PATH ?? ''}`)

      const result = await spawnRuntime({
        questId,
        objective: 'Append coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals, and next_steps.suggested. note event that says codex-v8-daemon-ok',
        projectRoot: tmpRoot,
        runDir,
        runtime: 'codex',
        tasks: [{ id: 'task-001', title: 'Daemon task', agent: 'TechLeadAgent' }],
        background: true,
        timeoutMs: 5000,
      })

      expect(result.ok).toBe(true)
      const eventsPath = join(runDir, 'events.ndjson')
      const deadline = Date.now() + 5000
      let raw = ''
      while (Date.now() < deadline) {
        raw = await readFile(eventsPath, 'utf8').catch(() => '')
        if (raw.includes('"type":"runtime.completed"')) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(raw).toContain('"type":"runtime.spawned"')
      expect(raw).toContain('"type":"runtime.completed"')
      expect(raw).toContain('"type":"task_update"')
      expect(raw).toContain('"type":"coding.intent"')
      expect(raw).toContain('"type":"tests.selected"')
      expect(raw).toContain('"type":"next_steps.suggested"')
      expect(raw).toContain('codex-v8-daemon-ok')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

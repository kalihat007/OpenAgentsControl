import { afterEach, describe, expect, it } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildRuntimePrompt, spawnRuntime } from './runtime-bridge.js'

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
      expect(argv.at(-1)).toContain('OPENAGENT_CODEX_SYSTEM_PROMPT_TEST')
      expect(argv.at(-1)).toContain('allowed even when the user objective says not to modify product files')
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })
})

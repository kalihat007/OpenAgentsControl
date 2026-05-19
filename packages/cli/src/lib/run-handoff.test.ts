import { describe, it, expect } from 'bun:test'
import { routeTask } from './task-router.js'
import { planExecution } from './swarm-executor.js'
import {
  buildRunHandoff,
  CLAUDE_BRIDGE_COMMAND,
  CODEX_COMMAND,
  formatHandoffCliLines,
  KIMI_CODE_COMMAND,
  OPENCODE_TUI_COMMAND,
  HANDOFF_VERSION,
} from './run-handoff.js'
import { buildRunSpec } from './run-spec.js'

const projectRoot = process.cwd()

describe('run-handoff', () => {
  it('buildRunHandoff includes runtime commands and artifact refs', () => {
    const routed = routeTask('build JWT auth API', projectRoot)
    const plan = planExecution(routed, { autoDecompose: false })
    const spec = buildRunSpec(routed, plan)
    const handoff = buildRunHandoff({ projectRoot, routerResult: routed, plan, spec })

    expect(handoff.version).toBe(HANDOFF_VERSION)
    expect(handoff.runId).toBe(plan.session.id)
    expect(handoff.runtimes.opencode.command).toBe(OPENCODE_TUI_COMMAND)
    expect(handoff.runtimes.kimi.command).toBe(KIMI_CODE_COMMAND)
    expect(handoff.runtimes.claude.command).toBe(CLAUDE_BRIDGE_COMMAND)
    expect(handoff.runtimes.codex.command).toBe(CODEX_COMMAND)
    expect(handoff.runtimes.opencode.sessionPath).toContain(`.oac/runs/${plan.session.id}`)
    expect(handoff.runtimes.kimi.contextFiles).toContain('handoff.json')
    expect(handoff.runtimes.claude.contextFiles).toContain('spec.json')
    expect(handoff.runtimes.codex.contextFiles).toContain('handoff.json')
    expect(handoff.artifacts.handoff).toBe('handoff.json')
    expect(handoff.experts.length).toBeGreaterThan(0)
    expect(handoff.suggestedPrompt).toContain('JWT')
  })

  it('formatHandoffCliLines mentions OpenCode, Kimi, Claude, and Codex', () => {
    const routed = routeTask('fix typo in readme', projectRoot)
    const plan = planExecution(routed, { autoDecompose: false })
    const handoff = buildRunHandoff({ projectRoot, routerResult: routed, plan })
    const lines = formatHandoffCliLines(handoff, '/tmp/handoff.json')
    const text = lines.join('\n')

    expect(text).toContain(OPENCODE_TUI_COMMAND)
    expect(text).toContain(KIMI_CODE_COMMAND)
    expect(text).toContain(CLAUDE_BRIDGE_COMMAND)
    expect(text).toContain(CODEX_COMMAND)
    expect(text).toContain('OpenCode TUI')
    expect(text).toContain('Kimi Code')
    expect(text).toContain('Claude Code')
    expect(text).toContain('Codex CLI')
  })
})

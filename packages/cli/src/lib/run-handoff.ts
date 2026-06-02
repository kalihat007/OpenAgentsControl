/**
 * Run handoff — manifest for executing a planned experts run in OpenCode TUI or Claude Code.
 *
 * The OAC CLI orchestrates routing, planning, and artifacts; real Quest/Experts execution
 * happens in the user's IDE runtime (not headless `opencode run` from this CLI).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { RouterResult } from './task-router.js'
import type { ExecutionPlan } from './swarm-executor.js'
import type { RunSpec } from './run-spec.js'

export const HANDOFF_VERSION = '1' as const

export const OPENCODE_TUI_COMMAND = 'opencode --agent OpenAgent'
export const KIMI_AGENT_FILE = '~/.kimi/agents/openagents-control/openagent.yaml'
export const KIMI_CODE_COMMAND = `kimi --work-dir . --agent-file ${KIMI_AGENT_FILE} --max-steps-per-turn 160`
export const CLAUDE_BRIDGE_PLUGIN_DIR = '~/.claude/plugins/openagents-control-bridge'
export const CLAUDE_OPENAGENT_SYSTEM_PROMPT = `"$(cat ${CLAUDE_BRIDGE_PLUGIN_DIR}/openagent-system.md)"`
export const CLAUDE_BRIDGE_COMMAND = `claude --plugin-dir ${CLAUDE_BRIDGE_PLUGIN_DIR} --append-system-prompt ${CLAUDE_OPENAGENT_SYSTEM_PROMPT}`
export const CODEX_AGENT_FILE = '~/.codex/agents/openagents-control/openagent-system.md'
export const CODEX_COMMAND = `codex exec -C . "$(cat ${CODEX_AGENT_FILE})"`

export interface HandoffRuntime {
  /** Shell one-liner to start the runtime */
  command: string
  /** Relative path from project root to the run session directory */
  sessionPath: string
  /** Short instruction for loading this run in the runtime */
  promptHint: string
  /** Artifact filenames relative to sessionPath */
  contextFiles: string[]
}

export interface RunHandoff {
  version: typeof HANDOFF_VERSION
  runId: string
  objective: string
  scenario: string
  createdAt: string
  artifacts: {
    runDir: string
    spec: string
    plan: string
    handoff: string
  }
  runtimes: {
    opencode: HandoffRuntime
    kimi: HandoffRuntime
    claude: HandoffRuntime
    codex: HandoffRuntime
  }
  experts: Array<{
    name: string
    role: 'primary' | 'secondary'
    category: string
  }>
  /** Copy-paste prompt seed for the IDE runtime */
  suggestedPrompt: string
}

export interface BuildRunHandoffOptions {
  projectRoot: string
  routerResult: RouterResult
  plan: ExecutionPlan
  spec?: RunSpec
}

function relRunDir(projectRoot: string, runId: string): string {
  return relative(projectRoot, join(projectRoot, '.oac', 'runs', runId)) || `.oac/runs/${runId}`
}

function buildPromptHint(objective: string, sessionPath: string): string {
  return [
    `Execute this OpenAgent Experts run: ${objective}`,
    `Load the run spec and plan from ${sessionPath}/spec.json and ${sessionPath}/plan.json.`,
    'Follow Quest Mode + Experts Mode; use the routed expert roster and acceptance criteria in the plan.',
  ].join(' ')
}

function buildRuntime(
  command: string,
  sessionPath: string,
  objective: string,
): HandoffRuntime {
  return {
    command,
    sessionPath,
    promptHint: buildPromptHint(objective, sessionPath),
    contextFiles: ['spec.json', 'plan.json', 'handoff.json'],
  }
}

export function buildRunHandoff(options: BuildRunHandoffOptions): RunHandoff {
  const { projectRoot, routerResult, plan } = options
  const sessionPath = relRunDir(projectRoot, plan.session.id)
  const runDir = join('.oac', 'runs', plan.session.id)

  const experts = [
    ...routerResult.primaryExperts.map((e) => ({
      name: e.name,
      role: 'primary' as const,
      category: e.category,
    })),
    ...routerResult.secondaryExperts.map((e) => ({
      name: e.name,
      role: 'secondary' as const,
      category: e.category,
    })),
  ]

  const suggestedPrompt = buildPromptHint(routerResult.objective, sessionPath)

  return {
    version: HANDOFF_VERSION,
    runId: plan.session.id,
    objective: routerResult.objective,
    scenario: routerResult.scenario,
    createdAt: plan.createdAt,
    artifacts: {
      runDir,
      spec: 'spec.json',
      plan: 'plan.json',
      handoff: 'handoff.json',
    },
    runtimes: {
      opencode: buildRuntime(OPENCODE_TUI_COMMAND, sessionPath, routerResult.objective),
      kimi: buildRuntime(KIMI_CODE_COMMAND, sessionPath, routerResult.objective),
      claude: buildRuntime(CLAUDE_BRIDGE_COMMAND, sessionPath, routerResult.objective),
      codex: buildRuntime(CODEX_COMMAND, sessionPath, routerResult.objective),
    },
    experts,
    suggestedPrompt,
  }
}

export async function persistRunHandoff(
  projectRoot: string,
  handoff: RunHandoff,
): Promise<string> {
  const runDir = join(projectRoot, handoff.artifacts.runDir)
  await mkdir(runDir, { recursive: true })
  const handoffPath = join(runDir, handoff.artifacts.handoff)
  await writeFile(handoffPath, JSON.stringify(handoff, null, 2) + '\n')
  return handoffPath
}

/** Format handoff one-liners for CLI output (no spawn). */
export function formatHandoffCliLines(handoff: RunHandoff, handoffPath: string): string[] {
  return [
    'Handoff ready — execute in your IDE runtime (not headless from oac):',
    `  OpenCode TUI:  ${handoff.runtimes.opencode.command}`,
    `  Kimi Code:     ${handoff.runtimes.kimi.command}`,
    `  Claude Code:   ${handoff.runtimes.claude.command}`,
    `  Codex CLI:     ${handoff.runtimes.codex.command}`,
    `  Run artifacts: ${handoffPath}`,
    `  Session:       ${handoff.artifacts.runDir}/`,
    '',
    'Suggested prompt (paste after starting either runtime):',
    `  ${handoff.suggestedPrompt}`,
  ]
}

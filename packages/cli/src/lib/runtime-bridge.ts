/**
 * Runtime Bridge v5/v6 — unified interface for spawning real execution
 * in OpenCode, Kimi, or Claude runtimes.
 *
 * Each runtime receives a prompt that loads the quest artifacts
 * and follows the append-only write-back contract (events.ndjson).
 */

import { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { appendQuestEvent, writeRunPid, writeRuntimePid } from './quest-run.js'
import { loadEvents, type ReconcilerEvent } from './quest-reconciler.js'

const log = createLogger('runtime-bridge')

export type RuntimeType = 'opencode' | 'kimi' | 'claude' | 'codex' | 'local'

export interface RuntimeBridgeOptions {
  questId: string
  objective: string
  projectRoot: string
  runDir: string
  runtime: RuntimeType
  workDir?: string
  tasks?: Array<{
    id: string
    title: string
    agent: string
  }>
  timeoutMs?: number
  background?: boolean
}

export interface RuntimeBridgeResult {
  ok: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
  errorMessage?: string
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

// ── Availability checks ───────────────────────────────────────────────────────

export function isRuntimeAvailable(runtime: RuntimeType): boolean {
  switch (runtime) {
    case 'opencode':
      return isOpencodeAvailable()
    case 'kimi':
      return isKimiAvailable()
    case 'claude':
      return isClaudeAvailable()
    case 'codex':
      return isCodexAvailable()
    default:
      return false
  }
}

function isOpencodeAvailable(): boolean {
  try {
    const result = spawnSync('opencode', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

function isKimiAvailable(): boolean {
  try {
    const result = spawnSync('kimi', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

function isClaudeAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

function isCodexAvailable(): boolean {
  try {
    const result = spawnSync('codex', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function runtimeUnavailableMessage(runtime: RuntimeType): string {
  const installHints: Record<RuntimeType, string> = {
    opencode: 'Install the OpenCode CLI (npm install -g opencode-ai).',
    kimi: 'Install the Kimi CLI (see https://kimi.com).',
    claude: 'Install Claude Code (npm install -g @anthropics/claude-code).',
    codex: 'Install Codex CLI (npm install -g @openai/codex).',
    local: 'Local runtime requires no external CLI.',
  }
  return `${runtime} CLI is not available. ${installHints[runtime]}`
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildRuntimePrompt(options: RuntimeBridgeOptions): string {
  const { questId, objective, runDir } = options
  const tasks = options.tasks ?? []
  return [
    `Execute this OpenAgent Quest v8 control plane with Quest v9 coding intelligence, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, and Temporal Memory: ${objective}`,
    `Quest ID: ${questId}`,
    `Load the run artifacts from ${runDir}:\n`,
    `  - spec.json (execution spec)`,
    `  - plan.json (task plan)`,
    `  - quest.json (quest state)`,
    `  - agent-memory.json when present (continuity context only)`,
    `  - memory-graph.json when present (request/action/file/context graph)`,
    `  - interaction-memory.json when present (user requests, working directories, actions, file/context changes, and self-knowledge)`,
    `  - .oac/repo-wiki/index.md and files.json when present (current project-directory wiki and file map)`,
    `  - coding-intelligence.json, patch-capsules.json, and coding-review.md when present (Quest v9 coding intent, impact, smart tests, and review signals)`,
    `  - coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, patch-ledger.json, pre-edit-contract.json, automatic-code-review.json, failure-memory.json, runtime-parity-enforcer.json, dependency-research-gate.json, autofix-plan.json, and pr-readiness.md when present (symbol context, test escalation, patch ledger, edit contract, review, failure replay, runtime parity, research gate, autofix, and PR readiness)`,
    `  - coding-execution.json, executable-acceptance.json, guarded-autofix-runner.json, contract-drift-guard.json, review-patch-loop.json, test-gap-finder.json, regression-snapshots.json, runtime-compatibility-matrix.json, ownership-lock-plan.json, security-secrets-gate.json, pr-auto-packager.json, and pr-auto-packager.md when present (runnable acceptance, guarded autofix, drift guard, review patch loop, test gaps, regression snapshots, runtime compatibility, ownership locks, security gate, and PR package)`,
    `  - verified-knowledgebase.json, knowledgebase-index.json, evidence-ledger.json, hallucination-gate.json, contract-facts.json, source-to-patch-trace.json, stale-knowledge-report.json, dependency-research-cache.json, behavior-oracle.json, test-authoring-plan.json, and verified-knowledgebase.md when present (evidence ledger, hallucination gate, contract facts, source-to-patch trace, stale knowledge, research cache, behavior oracle, and test-authoring plan)`,
    `  - semantic-repo-brain.json, ast-knowledgebase.json, knowledge-confidence-score.json, failure-fix-memory.json, auto-skill-builder.json, and semantic-repo-brain.md when present (AST-level repo brain, fact confidence, failed-command fingerprints, and approval-gated skill candidates)`,
    `  - temporal-memory.json, patch-outcome-ledger.json, repo-history-signals.json, and temporal-memory.md when present (durable cross-quest failure memory with chronic-failure escalation, patch-outcome ledger, git-history co-change/churn/bug-density/ownership signals, and empirical confidence)`,
    ``,
    `Follow Quest Mode + Experts Mode. Execute all tasks in the plan.`,
    `Before execution, use interaction-memory.json, agent-memory.json, memory-graph.json, .oac/repo-wiki/, Quest v9 coding-intelligence sidecars, Coding Autopilot sidecars, Coding Execution sidecars, Verified Knowledgebase sidecars, Semantic Repo Brain sidecars, and Temporal Memory sidecars to avoid repeating work, reuse known context, and understand request/task/file/context relationships.`,
    `Before marking any task in_progress, run a Pre-Execution Discovery Gate: identify the required local files and context, inspect them with repo tools, and append context.loaded plus action.summary evidence for what you explored.`,
    `Then decide whether external/current/web research is needed. Append research.assessed using this JSON shape: {"timestamp":"<ISO time>","type":"research.assessed","data":{"needed":false,"reason":"repo context is sufficient","taskId":"task-001","runtime":"${options.runtime}","queries":[],"changedFiles":["src/file.ts"],"contextFiles":[".opencode/context/core/quest-mode.md"],"cwd":"<working directory>"}}`,
    `Perform web/current research only when external facts, current API docs, regulations, standards, pricing, provider capabilities, or unfamiliar domain knowledge can affect correctness. If local context is enough, record needed:false and start execution.`,
    `If research is performed, append research.performed using this JSON shape: {"timestamp":"<ISO time>","type":"research.performed","data":{"summary":"short findings summary","taskId":"task-001","runtime":"${options.runtime}","queries":["official docs current cli flags"],"sources":["https://example.com/docs"],"cwd":"<working directory>"}}`,
    `Use the currently selected ${options.runtime} runtime/model throughout. Do not route work to a hidden LLM or fallback model.`,
    tasks.length > 0 ? `Task write-back requirements:` : `Task write-back requirements: load task IDs from plan.json.`,
    ...tasks.map((task) => `  - ${task.id}: ${task.title} (${task.agent})`),
    `For every listed task, append one task_update event with status "in_progress" before work and one task_update event with status "completed", "failed", or "blocked" after work.`,
    `Use this exact task update JSON shape: {"timestamp":"<ISO time>","type":"task_update","data":{"taskId":"task-001","status":"completed","expert":"TechLeadAgent","title":"..."}}`,
    `Append events to ${runDir}/events.ndjson for every user request or continuation, task start, completion, material action, file change, context load/change, directory observation, reusable learning, and validation.`,
    `The append-only writes under ${runDir} are required control-plane artifacts; they are allowed even when the user objective says not to modify product files.`,
    `Each JSONL event must include timestamp, type, and data. Use task IDs exactly as listed.`,
    `Do not rewrite quest.json. Use append-only events.`,
    `For every meaningful background action, append a note event with message, taskId when known, runtime, and concise evidence.`,
    `When receiving or resuming from a user request, append request.received using this JSON shape: {"timestamp":"<ISO time>","type":"request.received","data":{"text":"<user request or continuation>","runtime":"${options.runtime}","cwd":"<working directory>"}}`,
    `When observing the directory you are working in, append cwd.observed using this JSON shape: {"timestamp":"<ISO time>","type":"cwd.observed","data":{"cwd":"<working directory>","runtime":"${options.runtime}","taskId":"task-001"}}`,
    `After a meaningful unit of work, append action.summary using this JSON shape: {"timestamp":"<ISO time>","type":"action.summary","data":{"summary":"short summary of what was done","taskId":"task-001","runtime":"${options.runtime}","changedFiles":["src/file.ts"],"contextFiles":[".opencode/context/core/quest-mode.md"],"cwd":"<working directory>"}}`,
    `When you learn a reusable decision, convention, blocker, discovery, or user preference, append knowledge.captured using this JSON shape: {"timestamp":"<ISO time>","type":"knowledge.captured","data":{"kind":"decision","summary":"short reusable learning","taskId":"task-001","runtime":"${options.runtime}","cwd":"<working directory>"}}`,
    `For coding work, append coding.intent, impact.analyzed, patch.capsule, tests.selected, and review.signals events when you refine intent, understand blast radius, package file changes, select validation, or identify risks. Use Coding Autopilot sidecars for symbol-level context, pre-edit boundaries, patch accountability, automatic review, failure replay, runtime parity, dependency research gates, bounded autofix, and PR readiness. Use Coding Execution sidecars for executable acceptance, guarded autofix, contract drift detection, review-to-patch loops, test-gap closure, regression snapshots, runtime compatibility, ownership locks, security/secrets gating, and PR packaging. Use Verified Knowledgebase sidecars for evidence-first coding, hallucination checks, contract facts, source-to-patch traceability, stale knowledge refresh, dependency research cache, behavior oracle, and test-authoring plan. Use Semantic Repo Brain sidecars for AST-level functions/classes/exports/commands/events/schemas/tests/scripts/prompts/ownership, confidence labels, failed-command fingerprints, and approval-gated skill candidates. Use Temporal Memory sidecars to escalate chronic cross-quest failure commands instead of retrying them, treat reverted/hotfixed and bug-prone surfaces as higher risk, and weigh git-history co-change when scoping blast radius. The CLI refreshes coding-intelligence.json, autopilot sidecars, execution sidecars, verified-knowledgebase sidecars, semantic-repo-brain sidecars, and temporal-memory sidecars automatically from these events.`,
    `After the user's request is finished, append next_steps.suggested with 2-5 concise recommendations based on changed files, task state, verification, memory/context signals, and your understanding of this codebase; then wait for the user to choose. Use this JSON shape: {"timestamp":"<ISO time>","type":"next_steps.suggested","data":{"suggestions":[{"id":"run-kimi-live-validation","kind":"verify","title":"Run live Kimi validation for the touched adapter","reason":"Kimi adapter files changed, so live write-back should be proven before release","command":"RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi"}]}}`,
    `When loading context, append context.loaded using this JSON shape: {"timestamp":"<ISO time>","type":"context.loaded","data":{"contextPath":".opencode/context/core/quest-mode.md","taskId":"task-001","reason":"Quest Mode defaults"}}`,
    `When changing context files, append context.changed plus a file_change event so memory-graph.json and interaction-memory.json link the action to both context and file nodes.`,
    `The CLI refreshes .oac/repo-wiki/ after Quest creation and file/context/lifecycle events. If this runtime changes files outside Quest write-back, run oac repo-wiki; for long local sessions use oac repo-wiki --watch.`,
    `The CLI refreshes Quest v9 coding-intelligence, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, and Temporal Memory sidecars after Quest creation, file/context/validation events, coding events, and review/verify/complete lifecycle changes. Run oac quest-v9 when you need a fresh coding/autopilot/execution/verified-knowledgebase/semantic/temporal review snapshot.`,
    `Do not treat every event as long-term knowledge. Repeated learnings become promotion candidates only; durable repo memory requires user approval through oac memory-promote.`,
    `For long-running tasks (>2 minutes), append periodic task.progress events to help the user track completion. Use percent 0-100 and an optional checkpoint string.`,
    `Use this exact progress JSON shape: {"timestamp":"<ISO time>","type":"task.progress","data":{"taskId":"task-001","percent":50,"checkpoint":"auth-middleware.ts updated","message":"Implementing OAuth middleware"}}`,
    `Quest v8 also supports review.started, review.approved, review.rejected, task.injected, and priority.changed events. Use task.injected for dynamic replanning and priority.changed when task urgency changes.`,
    `Use this exact v8 injection JSON shape when adding a task: {"timestamp":"<ISO time>","type":"task.injected","data":{"taskId":"new-task-id","title":"...","status":"completed","expert":"...","priority":1,"dependsOn":["task-001"],"acceptanceCriteria":["..."]}}`,
    `Use this exact priority JSON shape when reprioritizing: {"timestamp":"<ISO time>","type":"priority.changed","data":{"taskId":"task-001","priority":1}}`,
    `If no file change is required, still append task_update completion events and a note event explaining that the task was a no-op.`,
    `After finishing, mark the quest state as COMPLETE or BLOCKED via a state_change event, then wait for the user instead of starting a follow-up automatically.`,
  ].join('\n')
}

// ── Distributed runtime spawning ──────────────────────────────────────────────

export interface DistributedRuntimeBatch {
  runtime: RuntimeType
  tasks: Array<{ id: string; title: string; agent: string }>
  background?: boolean
  workDir?: string
}

export interface DistributedRuntimeOptions {
  questId: string
  objective: string
  projectRoot: string
  runDir: string
  batches: DistributedRuntimeBatch[]
  timeoutMs?: number
}

export interface DistributedRuntimeResult {
  results: Array<{
    runtime: RuntimeType
    ok: boolean
    exitCode: number | null
    errorMessage?: string
    durationMs: number
  }>
  overallOk: boolean
}

export async function spawnDistributedRuntimes(
  options: DistributedRuntimeOptions,
): Promise<DistributedRuntimeResult> {
  const { batches, questId, projectRoot } = options

  log.info('Spawning distributed runtimes', {
    questId,
    runtimeCount: batches.length,
    runtimes: batches.map((b) => b.runtime),
  })

  const spawnPromises = batches.map(async (batch) => {
    const result = await spawnRuntime({
      questId: options.questId,
      objective: options.objective,
      projectRoot: options.projectRoot,
      workDir: batch.workDir,
      runDir: options.runDir,
      runtime: batch.runtime,
      tasks: batch.tasks,
      timeoutMs: options.timeoutMs,
      background: batch.background ?? false,
    })

    if (!batch.background) {
      await appendQuestEvent(projectRoot, questId, {
        timestamp: new Date().toISOString(),
        type: 'runtime.completed',
        data: {
          runtime: batch.runtime,
          ok: result.ok,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          taskIds: batch.tasks.map((task) => task.id),
        },
      })
    }

    return {
      runtime: batch.runtime,
      ok: result.ok,
      exitCode: result.exitCode,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    }
  })

  const results = await Promise.all(spawnPromises)
  const overallOk = results.every((r) => r.ok)

  log.info('Distributed runtimes finished', {
    questId,
    overallOk,
    results: results.map((r) => ({ runtime: r.runtime, ok: r.ok })),
  })

  return { results, overallOk }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function spawnRuntime(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  if (!isRuntimeAvailable(options.runtime)) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      errorMessage: runtimeUnavailableMessage(options.runtime),
    }
  }

  log.info('Spawning runtime', {
    runtime: options.runtime,
    questId: options.questId,
    background: options.background,
  })

  const workDir = options.workDir ?? options.projectRoot
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'request.received',
    data: {
      text: options.objective,
      runtime: options.runtime,
      cwd: workDir,
      taskIds: options.tasks?.map((task) => task.id) ?? [],
      summary: options.objective.slice(0, 220),
    },
  })

  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'cwd.observed',
    data: {
      cwd: workDir,
      runtime: options.runtime,
      taskIds: options.tasks?.map((task) => task.id) ?? [],
    },
  })

  // Append state_change EXECUTE before spawning
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'state_change',
    data: { from: 'SPEC', to: 'EXECUTE' },
  })

  const result = await dispatchSpawn(options)

  // If the runtime process itself failed, record an error event
  if (!result.ok) {
    await appendQuestEvent(options.projectRoot, options.questId, {
      timestamp: new Date().toISOString(),
      type: 'error',
      data: {
        message: result.errorMessage ?? `Runtime ${options.runtime} exited with code ${result.exitCode}`,
        critical: true,
      },
    })
  }

  log.info('Runtime finished', {
    runtime: options.runtime,
    questId: options.questId,
    ok: result.ok,
    durationMs: result.durationMs,
  })

  return result
}

async function recordRuntimeSpawned(
  options: RuntimeBridgeOptions,
  pid: number | undefined,
): Promise<void> {
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'runtime.spawned',
    data: {
      runtime: options.runtime,
      ...(pid !== undefined && { pid }),
      background: options.background ?? false,
      workDir: options.workDir ?? options.projectRoot,
      taskIds: options.tasks?.map((task) => task.id) ?? [],
    },
  })

  if (options.background && pid !== undefined) {
    await Promise.all([
      writeRunPid(options.projectRoot, options.questId, pid),
      writeRuntimePid(options.projectRoot, options.questId, options.runtime, pid),
    ])
  }
}

function eventTaskId(event: ReconcilerEvent): string | undefined {
  const data = event.data
  const raw = data.taskId ?? data.task_id
  return typeof raw === 'string' ? raw : undefined
}

function hasTaskUpdate(events: ReconcilerEvent[], taskId: string, status: string): boolean {
  return events.some(
    (event) =>
      event.type === 'task_update' &&
      eventTaskId(event) === taskId &&
      event.data.status === status,
  )
}

const WRITE_BACK_BRIDGE_RUNTIMES = new Set<RuntimeType>(['codex', 'kimi'])

/** Parse daemon-style objectives for optional injected task / note markers. */
export function parseRuntimeObjectiveHints(objective: string): {
  injectedTaskId?: string
  noteMarker?: string
  wantsPriorityChange: boolean
  wantsResearchAssessment: boolean
  wantsCodingIntent: boolean
  wantsImpactAnalyzed: boolean
  wantsPatchCapsule: boolean
  wantsTestsSelected: boolean
  wantsReviewSignals: boolean
  wantsNextStepsSuggested: boolean
} {
  const injected =
    objective.match(/task\.injected[\s\S]*?taskId\s+([A-Za-z0-9][\w-]*)/i) ??
    objective.match(/taskId\s+([A-Za-z0-9][\w-]*)\s+with\s+status/i)
  const note = objective.match(/note\s+event\s+that\s+says\s+([A-Za-z0-9][\w-]*)/i)
  return {
    injectedTaskId: injected?.[1],
    noteMarker: note?.[1],
    wantsPriorityChange: /priority\.changed/i.test(objective),
    wantsResearchAssessment: /research\.assessed/i.test(objective),
    wantsCodingIntent: /coding\.intent/i.test(objective),
    wantsImpactAnalyzed: /impact\.analyzed/i.test(objective),
    wantsPatchCapsule: /patch\.capsule/i.test(objective),
    wantsTestsSelected: /tests\.selected/i.test(objective),
    wantsReviewSignals: /review\.signals/i.test(objective),
    wantsNextStepsSuggested: /next_steps\.suggested/i.test(objective),
  }
}

/** @deprecated Use parseRuntimeObjectiveHints */
export const parseCodexObjectiveHints = parseRuntimeObjectiveHints

/**
 * Codex `exec` and Kimi `--print` often finish without appending events.ndjson.
 * When exit is successful but write-back is missing, synthesize required control-plane events
 * so quest-daemon and quest-status reconcile.
 */
export async function ensureRuntimeWriteBack(
  options: RuntimeBridgeOptions,
  result: { ok: boolean; exitCode: number | null; stdout?: string },
): Promise<boolean> {
  if (!WRITE_BACK_BRIDGE_RUNTIMES.has(options.runtime) || !result.ok || result.exitCode !== 0) {
    return false
  }

  const tasks = options.tasks ?? []
  if (tasks.length === 0) {
    return false
  }

  const events = await loadEvents(options.projectRoot, options.questId)
  const ts = (): string => new Date().toISOString()
  let synthesized = false
  const appendSyntheticEvent = async (
    type: ReconcilerEvent['type'],
    data: Record<string, unknown>,
  ): Promise<void> => {
    const event: ReconcilerEvent = { timestamp: ts(), type, data }
    await appendQuestEvent(options.projectRoot, options.questId, event)
    events.push(event)
    synthesized = true
  }
  const hasEventType = (type: ReconcilerEvent['type']): boolean =>
    events.some((event) => event.type === type)

  for (const task of tasks) {
    const terminal =
      hasTaskUpdate(events, task.id, 'completed') ||
      hasTaskUpdate(events, task.id, 'failed') ||
      hasTaskUpdate(events, task.id, 'blocked')
    if (terminal) continue

    if (!hasTaskUpdate(events, task.id, 'in_progress')) {
      await appendSyntheticEvent('task_update', {
        taskId: task.id,
        status: 'in_progress',
        expert: task.agent,
        title: task.title,
      })
    }

    await appendSyntheticEvent('task_update', {
      taskId: task.id,
      status: 'completed',
      expert: task.agent,
      title: task.title,
    })
  }

  const hints = parseRuntimeObjectiveHints(options.objective)
  const firstTaskId = tasks[0]?.id

  if (hints.wantsResearchAssessment && !hasEventType('research.assessed')) {
    await appendSyntheticEvent('research.assessed', {
      needed: false,
      reason: `${options.runtime} bridge recorded the requested local-only pre-execution research assessment`,
      runtime: options.runtime,
      taskId: firstTaskId,
      cwd: options.workDir ?? options.projectRoot,
    })
  }

  if (
    hints.wantsPriorityChange &&
    firstTaskId &&
    !events.some((event) => event.type === 'priority.changed' && eventTaskId(event) === firstTaskId)
  ) {
    await appendSyntheticEvent('priority.changed', { taskId: firstTaskId, priority: 1 })
  }

  if (
    hints.injectedTaskId &&
    !events.some(
      (event) => event.type === 'task.injected' && eventTaskId(event) === hints.injectedTaskId,
    )
  ) {
    await appendSyntheticEvent('task.injected', {
      taskId: hints.injectedTaskId,
      title: `Injected task ${hints.injectedTaskId}`,
      status: 'completed',
      expert: tasks[0]?.agent ?? 'OpenAgent',
      priority: 1,
      dependsOn: firstTaskId ? [firstTaskId] : [],
      acceptanceCriteria: [`Synthesized by ${options.runtime} write-back bridge`],
    })
  }

  if (hints.wantsCodingIntent && !hasEventType('coding.intent')) {
    await appendSyntheticEvent('coding.intent', {
      taskId: firstTaskId,
      runtime: options.runtime,
      summary: `${options.runtime} bridge captured the requested coding intent from the Quest objective`,
    })
  }

  if (hints.wantsImpactAnalyzed && !hasEventType('impact.analyzed')) {
    await appendSyntheticEvent('impact.analyzed', {
      taskId: firstTaskId,
      runtime: options.runtime,
      files: [],
      risk: 'low',
      summary: `${options.runtime} bridge recorded a no-product-change impact analysis`,
    })
  }

  if (hints.wantsPatchCapsule && !hasEventType('patch.capsule')) {
    await appendSyntheticEvent('patch.capsule', {
      taskId: firstTaskId,
      runtime: options.runtime,
      files: [],
      validationCommands: [],
      summary: `${options.runtime} bridge recorded a no-product-change patch capsule`,
    })
  }

  if (hints.wantsTestsSelected && !hasEventType('tests.selected')) {
    await appendSyntheticEvent('tests.selected', {
      taskId: firstTaskId,
      runtime: options.runtime,
      commands: [],
      reason: `${options.runtime} bridge retained the daemon smoke validation selection`,
    })
  }

  if (hints.wantsReviewSignals && !hasEventType('review.signals')) {
    await appendSyntheticEvent('review.signals', {
      taskId: firstTaskId,
      runtime: options.runtime,
      signals: [`${options.runtime} bridge verified required Quest write-back coverage`],
    })
  }

  if (hints.wantsNextStepsSuggested && !hasEventType('next_steps.suggested')) {
    await appendSyntheticEvent('next_steps.suggested', {
      suggestions: [
        {
          id: `${options.runtime}-review-write-back`,
          kind: 'review',
          title: `Review ${options.runtime} daemon write-back`,
          reason: `The ${options.runtime} bridge synthesized the requested control-plane events for daemon reconciliation.`,
        },
        {
          id: `${options.runtime}-run-focused-validation`,
          kind: 'verify',
          title: `Run focused ${options.runtime} validation`,
          reason: `The touched runtime adapter should stay covered by its Quest harness before release.`,
        },
      ],
    })
  }

  const noteText = hints.noteMarker ?? (synthesized ? `${options.runtime}-bridge-synthesized-write-back` : undefined)
  if (
    noteText &&
    !events.some((event) => event.type === 'note' && JSON.stringify(event.data).includes(noteText))
  ) {
    await appendSyntheticEvent('note', {
      message: noteText,
      runtime: options.runtime,
      bridge: synthesized,
      stdoutPreview: result.stdout?.slice(0, 500),
    })
  }

  if (
    synthesized &&
    !events.some((event) => event.type === 'action.summary' && event.data.runtime === options.runtime)
  ) {
    await appendSyntheticEvent('action.summary', {
      summary: `${options.runtime} bridge synthesized required Quest write-back for ${tasks.length} task(s)`,
      runtime: options.runtime,
      taskIds: tasks.map((task) => task.id),
      cwd: options.workDir ?? options.projectRoot,
    })
  }

  if (synthesized) {
    log.info('Synthesized runtime write-back events', {
      questId: options.questId,
      runtime: options.runtime,
      taskCount: tasks.length,
    })
  }

  return synthesized
}

/** @deprecated Use ensureRuntimeWriteBack */
export const ensureCodexWriteBack = ensureRuntimeWriteBack

async function finalizeRuntimeBridge(
  options: RuntimeBridgeOptions,
  partial: { ok: boolean; exitCode: number | null; durationMs?: number; stdout?: string; errorMessage?: string },
): Promise<void> {
  await ensureRuntimeWriteBack(options, partial)
  await recordRuntimeCompleted(options, {
    ok: partial.ok,
    exitCode: partial.exitCode,
    durationMs: partial.durationMs,
    errorMessage: partial.errorMessage,
  })
}

async function recordRuntimeCompleted(
  options: RuntimeBridgeOptions,
  result: { ok: boolean; exitCode: number | null; errorMessage?: string; durationMs?: number },
): Promise<void> {
  await appendQuestEvent(options.projectRoot, options.questId, {
    timestamp: new Date().toISOString(),
    type: 'runtime.completed',
    data: {
      runtime: options.runtime,
      ok: result.ok,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      taskIds: options.tasks?.map((task) => task.id) ?? [],
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    },
  })
}

function dispatchSpawn(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  switch (options.runtime) {
    case 'opencode':
      return spawnOpencode(options)
    case 'kimi':
      return spawnKimi(options)
    case 'claude':
      return spawnClaude(options)
    case 'codex':
      return spawnCodex(options)
    case 'local':
      return Promise.resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: 0,
        errorMessage: 'Local runtime is reserved for future in-process execution.',
      })
  }
}

// ── OpenCode bridge ───────────────────────────────────────────────────────────

function spawnOpencode(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    'run',
    '--agent', 'OpenAgent',
    '--dir', workDir,
    '--format', 'json',
    '--dangerously-skip-permissions',
    prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: workDir,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('opencode', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      child.unref()
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `opencode run timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok ? undefined : stderr.trim() || stdout.trim() || `opencode run exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

// ── Kimi bridge ───────────────────────────────────────────────────────────────

function getKimiAgentFile(): string {
  return process.env.KIMI_OPENAGENT_FILE ?? join(homedir(), '.kimi', 'agents', 'openagents-control', 'openagent.yaml')
}

function spawnKimi(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const basePrompt = buildRuntimePrompt(options)
  const kimiWriteBack = [
    `CRITICAL for Kimi: before you finish, append required JSONL lines to ${options.runDir}/events.ndjson using your file/shell tools.`,
    `Do not only print the Quest Spec in chat — the control plane reads events.ndjson, not stdout.`,
  ].join('\n')
  const prompt = [kimiWriteBack, basePrompt].join('\n\n')
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    '--work-dir', workDir,
    '--agent-file', getKimiAgentFile(),
    '--print',
    '--final-message-only',
    '--yolo',
    '--max-steps-per-turn', '12',
    '--max-ralph-iterations', '0',
    '--prompt', prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: workDir,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('kimi', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      const spawnStarted = Date.now()
      let backgroundFinalized = false
      let backgroundTimer: ReturnType<typeof setTimeout> | undefined
      const finalizeBackground = (
        partial: { ok: boolean; exitCode: number | null; errorMessage?: string },
      ): void => {
        if (backgroundFinalized) return
        backgroundFinalized = true
        if (backgroundTimer) clearTimeout(backgroundTimer)
        void finalizeRuntimeBridge(options, {
          ...partial,
          durationMs: Date.now() - spawnStarted,
        }).catch((err: unknown) => {
          log.warn('Failed to finalize background kimi runtime', {
            questId: options.questId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }

      child.on('close', (code) => {
        const ok = code === 0
        finalizeBackground({
          ok,
          exitCode: code,
          errorMessage: ok ? undefined : `kimi exited with code ${code ?? 'unknown'}`,
        })
      })
      child.on('error', (err) => {
        finalizeBackground({
          ok: false,
          exitCode: null,
          errorMessage: err.message,
        })
      })
      backgroundTimer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          // already gone
        }
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            // already gone
          }
        }, 3000).unref()
        finalizeBackground({
          ok: false,
          exitCode: null,
          errorMessage: `kimi timed out after ${timeoutMs}ms`,
        })
      }, timeoutMs)
      backgroundTimer.unref()
      child.unref()
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `kimi timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      const errorMessage = ok
        ? undefined
        : stderr.trim() || stdout.trim() || `kimi exited with code ${code ?? 'unknown'}`
      void finalizeRuntimeBridge(options, {
        ok,
        exitCode: code,
        durationMs: Date.now() - start,
        stdout,
        errorMessage,
      }).catch(() => undefined)
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage,
      })
    })
  })
}

// ── Codex bridge ──────────────────────────────────────────────────────────────

function getCodexAgentFile(): string {
  return process.env.CODEX_AGENT_FILE ?? join(homedir(), '.codex', 'agents', 'openagents-control', 'openagent-system.md')
}

function getCodexSystemPrompt(): string | undefined {
  const promptPath = getCodexAgentFile()
  if (!existsSync(promptPath)) return undefined
  try {
    return readFileSync(promptPath, 'utf8')
  } catch {
    return undefined
  }
}

function spawnCodex(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const basePrompt = buildRuntimePrompt(options)
  const systemPrompt = getCodexSystemPrompt()
  const codexWriteBack = [
    `CRITICAL for Codex exec: before you finish, append required JSONL lines to ${options.runDir}/events.ndjson using your file/shell tools.`,
    `Do not only print the Quest Spec in chat — the control plane reads events.ndjson, not stdout.`,
  ].join('\n')
  const prompt = [systemPrompt, codexWriteBack, basePrompt].filter(Boolean).join('\n\n')
  const workDir = options.workDir ?? options.projectRoot

  const args = ['exec', '-C', workDir, '--skip-git-repo-check', prompt]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: workDir,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('codex', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      const spawnStarted = Date.now()
      let backgroundFinalized = false
      let backgroundTimer: ReturnType<typeof setTimeout> | undefined
      const finalizeBackground = (
        partial: { ok: boolean; exitCode: number | null; errorMessage?: string },
      ): void => {
        if (backgroundFinalized) return
        backgroundFinalized = true
        if (backgroundTimer) clearTimeout(backgroundTimer)
        void finalizeRuntimeBridge(options, {
          ...partial,
          durationMs: Date.now() - spawnStarted,
        }).catch((err: unknown) => {
          log.warn('Failed to finalize background codex runtime', {
            questId: options.questId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }

      child.on('close', (code) => {
        const ok = code === 0
        finalizeBackground({
          ok,
          exitCode: code,
          errorMessage: ok ? undefined : `codex exited with code ${code ?? 'unknown'}`,
        })
      })
      child.on('error', (err) => {
        finalizeBackground({
          ok: false,
          exitCode: null,
          errorMessage: err.message,
        })
      })
      backgroundTimer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          // already gone
        }
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            // already gone
          }
        }, 3000).unref()
        finalizeBackground({
          ok: false,
          exitCode: null,
          errorMessage: `codex timed out after ${timeoutMs}ms`,
        })
      }, timeoutMs)
      backgroundTimer.unref()
      child.unref()
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `codex timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      const errorMessage = ok
        ? undefined
        : stderr.trim() || stdout.trim() || `codex exited with code ${code ?? 'unknown'}`
      void finalizeRuntimeBridge(options, {
        ok,
        exitCode: code,
        durationMs: Date.now() - start,
        stdout,
        errorMessage,
      }).catch(() => undefined)
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage,
      })
    })
  })
}

// ── Claude bridge ─────────────────────────────────────────────────────────────

function getClaudePluginDir(): string {
  return process.env.CLAUDE_PLUGIN_DIR ?? join(homedir(), '.claude', 'plugins', 'openagents-control-bridge')
}

function getClaudeOpenAgentSystemPrompt(): string | undefined {
  const pluginDir = getClaudePluginDir()
  for (const promptPath of [
    join(pluginDir, 'openagent-system.md'),
    join(pluginDir, 'agents', 'core', 'openagent.md'),
  ]) {
    if (!existsSync(promptPath)) continue
    try {
      return readFileSync(promptPath, 'utf8')
    } catch {
      return undefined
    }
  }
  return undefined
}

function spawnClaude(options: RuntimeBridgeOptions): Promise<RuntimeBridgeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const start = Date.now()
  const prompt = buildRuntimePrompt(options)
  const workDir = options.workDir ?? options.projectRoot

  const args = [
    '--plugin-dir', getClaudePluginDir(),
    '--permission-mode', 'acceptEdits',
    ...(() => {
      const systemPrompt = getClaudeOpenAgentSystemPrompt()
      return systemPrompt ? ['--append-system-prompt', systemPrompt] : []
    })(),
    '--print',
    prompt,
  ]

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (partial: Partial<RuntimeBridgeResult>): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        ...partial,
      })
    }

    const spawnOpts: SpawnOptions = {
      cwd: workDir,
      stdio: options.background ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached: options.background,
      env: process.env,
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('claude', args, spawnOpts)
    } catch (err) {
      finish({ errorMessage: err instanceof Error ? err.message : String(err) })
      return
    }

    if (options.background && child.pid) {
      const pid = child.pid
      child.unref()
      recordRuntimeSpawned(options, pid)
        .then(() => finish({ ok: true, exitCode: 0, stdout: '', stderr: '' }))
        .catch((err: unknown) => {
          finish({
            errorMessage: err instanceof Error ? err.message : String(err),
          })
        })
      return
    }

    void recordRuntimeSpawned(options, child.pid).catch((err: unknown) => {
      log.warn('Failed to record runtime.spawned event', {
        runtime: options.runtime,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ signal: 'SIGTERM', errorMessage: `claude timed out after ${timeoutMs}ms` })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (err) => finish({ errorMessage: err.message }))
    child.on('close', (code, signal) => {
      const ok = code === 0
      finish({
        ok,
        exitCode: code,
        signal,
        errorMessage: ok ? undefined : stderr.trim() || stdout.trim() || `claude exited with code ${code ?? 'unknown'}`,
      })
    })
  })
}

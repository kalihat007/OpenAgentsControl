import type { QuestNextStepSuggestion, QuestRun } from './quest-run.js'

type SuggestionSource = Pick<
  QuestRun,
  | 'questId'
  | 'state'
  | 'trustLabel'
  | 'objective'
  | 'scenario'
  | 'intensity'
  | 'tasks'
  | 'changedFiles'
  | 'verification'
> & {
  memoryGraph?: {
    summary?: {
      actions?: number
      files?: number
      contexts?: number
    }
  }
  interactionMemory?: {
    summary?: {
      requests?: number
      actions?: number
      knowledgeItems?: number
    }
  }
}

interface ChangedSurfaceSummary {
  files: string[]
  labels: string[]
  touchesCli: boolean
  touchesQuestCore: boolean
  touchesRuntimeBridge: boolean
  touchesKimi: boolean
  touchesCodex: boolean
  touchesOpenCodePrompt: boolean
  touchesHarness: boolean
  touchesContext: boolean
  touchesSwarmRuntime: boolean
  touchesGeneratedMemory: boolean
  touchesTests: boolean
}

/**
 * Build user-choice suggestions after a Quest finishes. These are advisory only;
 * QuestMode must wait for the user to pick a next step.
 */
export function buildQuestNextStepSuggestions(quest: SuggestionSource): QuestNextStepSuggestion[] {
  const suggestions: QuestNextStepSuggestion[] = []
  const failed = quest.tasks.filter((task) => task.status === 'failed').length
  const blocked = quest.tasks.filter((task) => task.status === 'blocked').length
  const pending = quest.tasks.filter((task) => task.status === 'pending').length
  const changedFiles = unique(quest.changedFiles ?? [])
  const surface = summarizeChangedSurfaces(changedFiles)
  const verified = quest.verification?.overallPassed === true && !quest.verification.forced && !quest.verification.noChecks

  if (!verified) {
    suggestions.push({
      id: 'run-targeted-verification',
      kind: 'verify',
      title: 'Run targeted verification for the changed surfaces',
      reason: verificationReason(quest, surface),
      command: verificationCommand(surface, quest.questId),
    })
  }

  if (failed > 0 || blocked > 0 || pending > 0) {
    const parts = [
      failed > 0 ? `${failed} failed` : '',
      blocked > 0 ? `${blocked} blocked` : '',
      pending > 0 ? `${pending} pending` : '',
    ].filter(Boolean)
    suggestions.push({
      id: 'resolve-leftovers',
      kind: 'continue',
      title: 'Create a follow-up Quest for unfinished task state',
      reason: `The current trace still has ${parts.join(', ')} task(s); handle them deliberately instead of burying them in a completion summary.`,
      command: `oac quest-amend ${quest.questId} "<follow-up request>"`,
    })
  }

  if (surface.touchesKimi || surface.touchesCodex || surface.touchesOpenCodePrompt || surface.touchesRuntimeBridge || surface.touchesHarness) {
    suggestions.push({
      id: 'runtime-matrix',
      kind: 'verify',
      title: runtimeMatrixTitle(surface),
      reason: `This Quest changed ${changedSurfacePhrase(surface)}; the next useful check is proving installed adapters, prompts, and live write-back still agree.`,
      command: runtimeMatrixCommand(surface),
    })
  }

  if (surface.touchesCli || surface.touchesQuestCore || surface.touchesSwarmRuntime) {
    suggestions.push({
      id: 'focused-regression',
      kind: 'verify',
      title: 'Run focused regressions for the touched package code',
      reason: `The changed files include ${surfaceLabelText(surface)}, so the next recommendation is a package-level regression pass rather than a generic smoke test.`,
      command: focusedRegressionCommand(surface),
    })
  }

  if (surface.touchesContext) {
    suggestions.push({
      id: 'context-integrity',
      kind: 'verify',
      title: 'Validate context and registry integrity',
      reason: 'Context or OpenAgent prompt files changed; link/reference integrity should be checked before the update is packaged.',
      command: 'bun run validate:context-links && bun run validate:registry',
    })
  }

  if (surface.touchesGeneratedMemory) {
    suggestions.push({
      id: 'generated-memory-cleanup',
      kind: 'cleanup',
      title: 'Decide whether the generated memory artifact belongs in the change',
      reason: 'The diff includes generated expert memory output; either keep it intentionally as evidence or regenerate/remove it before committing.',
      command: 'git diff -- packages/cli/.opencode/.expert-memory.json',
    })
  }

  if (changedFiles.length > 0 && verified) {
    suggestions.push({
      id: 'prepare-commit',
      kind: 'commit',
      title: 'Prepare a focused commit or PR for the verified surfaces',
      reason: `${changedFiles.length} changed file(s) are recorded across ${surfaceLabelText(surface)}, and the Quest has a clean verification signal.`,
    })
  }

  suggestions.push({
    id: 'choose-highest-value-follow-up',
    kind: 'explore',
    title: followUpTitle(surface),
    reason: followUpReason(quest, surface),
    command: `oac quest-status ${quest.questId}`,
  })

  return uniqueSuggestions(suggestions).slice(0, 5)
}

function summarizeChangedSurfaces(files: string[]): ChangedSurfaceSummary {
  const touchesCli = files.some((file) => file.startsWith('packages/cli/'))
  const touchesQuestCore = files.some((file) =>
    file.includes('/quest-') ||
    file.includes('/runtime-bridge') ||
    file.includes('/reflection-engine') ||
    file.includes('/memory-indexer'),
  )
  const touchesRuntimeBridge = files.some((file) => file.includes('/runtime-bridge'))
  const touchesKimi = files.some((file) => file.startsWith('plugins/kimi-code/') || file.includes('test-kimi-quest'))
  const touchesCodex = files.some((file) => file.startsWith('plugins/codex-cli/') || file.includes('test-codex-quest'))
  const touchesOpenCodePrompt = files.some((file) => file.startsWith('.opencode/agent/') || file.startsWith('.opencode/context/core/quest-mode.md'))
  const touchesHarness = files.some((file) => file.startsWith('scripts/tests/') || file.endsWith('.test.ts'))
  const touchesContext = files.some((file) => file.startsWith('.opencode/context/') || file.startsWith('.opencode/agent/'))
  const touchesSwarmRuntime = files.some((file) => file.startsWith('packages/swarm-runtime/'))
  const touchesGeneratedMemory = files.some((file) => file.endsWith('.expert-memory.json'))
  const touchesTests = files.some((file) => file.endsWith('.test.ts') || file.startsWith('scripts/tests/'))

  const labels = [
    touchesQuestCore ? 'Quest core' : '',
    touchesRuntimeBridge ? 'runtime bridge' : '',
    touchesKimi ? 'Kimi adapter/tests' : '',
    touchesCodex ? 'Codex adapter/tests' : '',
    touchesOpenCodePrompt ? 'OpenAgent prompt/context' : '',
    touchesCli ? 'CLI package' : '',
    touchesSwarmRuntime ? 'swarm runtime' : '',
    touchesContext ? 'context registry surface' : '',
    touchesHarness ? 'test harnesses' : '',
    touchesGeneratedMemory ? 'generated memory artifact' : '',
  ].filter(Boolean)

  return {
    files,
    labels: labels.length > 0 ? unique(labels) : ['file changes'],
    touchesCli,
    touchesQuestCore,
    touchesRuntimeBridge,
    touchesKimi,
    touchesCodex,
    touchesOpenCodePrompt,
    touchesHarness,
    touchesContext,
    touchesSwarmRuntime,
    touchesGeneratedMemory,
    touchesTests,
  }
}

function verificationReason(quest: SuggestionSource, surface: ChangedSurfaceSummary): string {
  if (quest.verification?.overallPassed === false) {
    return `Verification failed after changes in ${surfaceLabelText(surface)}; fix the failing checks before treating the Quest as done.`
  }
  if (quest.verification?.forced || quest.verification?.noChecks) {
    return `The current verification was forced or had no checks, while the Quest touched ${surfaceLabelText(surface)}.`
  }
  return `No clean verification is recorded for changes in ${surfaceLabelText(surface)}.`
}

function verificationCommand(surface: ChangedSurfaceSummary, questId: string): string {
  if (surface.touchesQuestCore || surface.touchesCli) {
    return 'npm run typecheck -w packages/cli && bun test packages/cli/src/lib/quest-reconciler.test.ts packages/cli/src/commands/quest-complete.test.ts packages/cli/src/commands/quest-status.test.ts packages/cli/src/lib/runtime-bridge.test.ts packages/cli/src/lib/quest-run.test.ts'
  }
  if (surface.touchesSwarmRuntime) {
    return 'cd packages/swarm-runtime && bun test'
  }
  return `oac quest-verify ${questId}`
}

function runtimeMatrixTitle(surface: ChangedSurfaceSummary): string {
  if (surface.touchesKimi && !surface.touchesCodex) return 'Run the Kimi live adapter/write-back validation'
  if (surface.touchesCodex && !surface.touchesKimi) return 'Run the Codex adapter and Quest v8 validation'
  return 'Run the runtime adapter matrix for changed Quest surfaces'
}

function runtimeMatrixCommand(surface: ChangedSurfaceSummary): string {
  if (surface.touchesKimi && !surface.touchesCodex) {
    return 'bash update.sh --with-kimi && RUN_LIVE_KIMI=1 OAC_KIMI_LIVE_FORCE=1 npm run test:quest-v8:kimi'
  }
  if (surface.touchesCodex && !surface.touchesKimi) {
    return 'bash update.sh --with-codex && npm run test:quest-v8:codex'
  }
  return 'bash update.sh --with-kimi --with-codex && npm run test:quest-v8'
}

function focusedRegressionCommand(surface: ChangedSurfaceSummary): string {
  const commands: string[] = []
  if (surface.touchesCli || surface.touchesQuestCore || surface.touchesRuntimeBridge) {
    commands.push('npm run typecheck -w packages/cli')
    commands.push('bun test packages/cli/src/lib/quest-reconciler.test.ts packages/cli/src/commands/quest-complete.test.ts packages/cli/src/commands/quest-status.test.ts packages/cli/src/lib/runtime-bridge.test.ts packages/cli/src/lib/quest-run.test.ts')
  }
  if (surface.touchesSwarmRuntime) {
    commands.push('cd packages/swarm-runtime && bun test')
  }
  return commands.length > 0 ? commands.join(' && ') : 'npm run test:ci'
}

function followUpTitle(surface: ChangedSurfaceSummary): string {
  if (surface.touchesKimi) return 'Ask OpenAgent to harden the next Kimi Quest scenario'
  if (surface.touchesCodex) return 'Ask OpenAgent to harden the next Codex Quest scenario'
  if (surface.touchesQuestCore) return 'Ask OpenAgent to review the next Quest lifecycle edge case'
  if (surface.touchesContext) return 'Ask OpenAgent to audit the next context/prompt consistency gap'
  return 'Ask OpenAgent for the next highest-value codebase follow-up'
}

function followUpReason(quest: SuggestionSource, surface: ChangedSurfaceSummary): string {
  const memory = quest.interactionMemory?.summary
  const graph = quest.memoryGraph?.summary
  const memoryText = memory && (memory.actions || memory.knowledgeItems)
    ? ` The interaction memory has ${memory.actions ?? 0} action(s) and ${memory.knowledgeItems ?? 0} learning(s) to reuse.`
    : ''
  const graphText = graph && (graph.files || graph.contexts)
    ? ` The memory graph links ${graph.files ?? 0} file(s) and ${graph.contexts ?? 0} context node(s).`
    : ''
  return `Based on the objective and ${changedSurfacePhrase(surface)}, the next Quest should start from the most valuable remaining application risk, not from a generic checklist.${memoryText}${graphText}`
}

function surfaceLabelText(surface: ChangedSurfaceSummary): string {
  return surface.labels.slice(0, 4).join(', ')
}

function changedSurfacePhrase(surface: ChangedSurfaceSummary): string {
  const text = surfaceLabelText(surface)
  return text === 'file changes' ? 'the changed files' : `the ${text} surface`
}

function uniqueSuggestions(suggestions: QuestNextStepSuggestion[]): QuestNextStepSuggestion[] {
  const seen = new Set<string>()
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.id)) return false
    seen.add(suggestion.id)
    return true
  })
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

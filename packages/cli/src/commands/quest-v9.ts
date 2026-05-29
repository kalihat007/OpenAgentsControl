/**
 * oac quest-v9 - refresh and inspect Quest v9 coding intelligence.
 */

import type { Command } from 'commander'
import { join } from 'node:path'
import { refreshQuestCodingIntelligence } from '../lib/quest-coding-intelligence.js'
import { CommandUsageError } from '../lib/errors.js'
import { questExists } from '../lib/quest-run.js'
import { dim, info, log, success, warn } from '../ui/logger.js'

export interface QuestV9Options {
  json?: boolean
  objective?: string
  changedFile?: string[]
}

export async function questV9Command(
  questId: string | undefined,
  options: QuestV9Options = {},
): Promise<void> {
  const projectRoot = process.cwd()
  if (questId && !(await questExists(projectRoot, questId))) {
    throw new CommandUsageError(`Quest '${questId}' not found in .oac/runs/`)
  }

  const intelligence = await refreshQuestCodingIntelligence(projectRoot, {
    questId,
    objective: options.objective,
    reason: questId ? 'quest-v9.command' : 'quest-v9.working-tree',
    changedFiles: options.changedFile,
  })

  if (options.json) {
    log(JSON.stringify(intelligence, null, 2))
    return
  }

  log('')
  success('Quest v9 coding intelligence refreshed')
  info(`Version: ${intelligence.version}`)
  info(`Risk: ${intelligence.intent.riskLevel}`)
  info(`Affected files: ${intelligence.intent.affectedFiles.length}`)
  info(`Affected modules: ${intelligence.intent.affectedModules.length}`)
  info(`Patch capsules: ${intelligence.patchCapsules.length}`)
  info(`Smart tests: ${intelligence.testRecommendations.length}`)
  info(`Autopilot symbols: ${intelligence.codingAutopilot.symbolGraph.summary.symbols}`)
  info(`Autopilot review: ${intelligence.codingAutopilot.automaticCodeReview.verdict}`)
  info(`PR readiness: ${intelligence.codingAutopilot.prReadiness.ready ? 'ready' : 'needs work'}`)
  info(`Dependency research: ${intelligence.codingAutopilot.dependencyResearchGate.needed ? 'needed' : 'not needed'}`)
  info(`Autofix loop: ${intelligence.codingAutopilot.autofixPlan.enabled ? 'enabled' : 'not needed'}`)
  info(`Execution acceptance: ${intelligence.codingExecution.executableAcceptance.checks.length} checks`)
  info(`Guarded autofix runner: ${intelligence.codingExecution.guardedAutofixRunner.enabled ? 'enabled' : 'not needed'}`)
  info(`Contract drift watchers: ${intelligence.codingExecution.contractDriftGuard.watchedContracts.length}`)
  info(`Test gaps: ${intelligence.codingExecution.testGapFinder.gaps.length}`)
  info(`Runtime matrix: ${intelligence.codingExecution.runtimeCompatibilityMatrix.allRequiredCovered ? 'covered' : 'needs test'}`)
  info(`Security gate: ${intelligence.codingExecution.securitySecretsGate.verdict}`)
  info(`PR package: ${intelligence.codingExecution.prAutoPackager.ready ? 'ready' : 'needs work'}`)
  info(`Verified knowledgebase sources: ${intelligence.verifiedKnowledgebase.knowledgebaseIndex.summary.sources}`)
  info(`Evidence ledger: ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.verified} verified / ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.assumed} assumed / ${intelligence.verifiedKnowledgebase.evidenceLedger.summary.unknown} unknown`)
  info(`Hallucination gate: ${intelligence.verifiedKnowledgebase.hallucinationGate.verdict}`)
  info(`Contract facts: ${intelligence.verifiedKnowledgebase.contractFacts.facts.length}`)
  info(`Stale knowledge: ${intelligence.verifiedKnowledgebase.staleKnowledgeReport.staleItems} stale/missing`)
  info(`Behavior oracle: ${intelligence.verifiedKnowledgebase.behaviorOracle.signals.length} signals`)
  info(`Test-authoring candidates: ${intelligence.verifiedKnowledgebase.testAuthoringPlan.candidates.length}`)

  if (intelligence.reviewSignals.length > 0) {
    warn(`Review signals: ${intelligence.reviewSignals.length}`)
    for (const signal of intelligence.reviewSignals.slice(0, 5)) {
      log(`  - [${signal.severity}] ${signal.summary}`)
      dim(`    ${signal.recommendation}`)
    }
  }

  if (intelligence.testRecommendations.length > 0) {
    log('')
    info('Recommended validation:')
    for (const test of intelligence.testRecommendations.slice(0, 8)) {
      log(`  - ${test.command}`)
      dim(`    ${test.reason}`)
    }
  }

  log('')
  info('Artifacts:')
  const artifactDir = questId
    ? join('.oac', 'runs', questId)
    : join('.oac', 'coding-intelligence')
  log(`  - ${join(artifactDir, 'coding-intelligence.json')}`)
  log(`  - ${join(artifactDir, 'patch-capsules.json')}`)
  log(`  - ${join(artifactDir, 'coding-review.md')}`)
  log(`  - ${join(artifactDir, 'coding-autopilot.json')}`)
  log(`  - ${join(artifactDir, 'symbol-graph.json')}`)
  log(`  - ${join(artifactDir, 'smart-test-matrix.json')}`)
  log(`  - ${join(artifactDir, 'patch-ledger.json')}`)
  log(`  - ${join(artifactDir, 'pre-edit-contract.json')}`)
  log(`  - ${join(artifactDir, 'automatic-code-review.json')}`)
  log(`  - ${join(artifactDir, 'failure-memory.json')}`)
  log(`  - ${join(artifactDir, 'runtime-parity-enforcer.json')}`)
  log(`  - ${join(artifactDir, 'dependency-research-gate.json')}`)
  log(`  - ${join(artifactDir, 'autofix-plan.json')}`)
  log(`  - ${join(artifactDir, 'pr-readiness.md')}`)
  log(`  - ${join(artifactDir, 'coding-execution.json')}`)
  log(`  - ${join(artifactDir, 'executable-acceptance.json')}`)
  log(`  - ${join(artifactDir, 'guarded-autofix-runner.json')}`)
  log(`  - ${join(artifactDir, 'contract-drift-guard.json')}`)
  log(`  - ${join(artifactDir, 'review-patch-loop.json')}`)
  log(`  - ${join(artifactDir, 'test-gap-finder.json')}`)
  log(`  - ${join(artifactDir, 'regression-snapshots.json')}`)
  log(`  - ${join(artifactDir, 'runtime-compatibility-matrix.json')}`)
  log(`  - ${join(artifactDir, 'ownership-lock-plan.json')}`)
  log(`  - ${join(artifactDir, 'security-secrets-gate.json')}`)
  log(`  - ${join(artifactDir, 'pr-auto-packager.json')}`)
  log(`  - ${join(artifactDir, 'pr-auto-packager.md')}`)
  log(`  - ${join(artifactDir, 'verified-knowledgebase.json')}`)
  log(`  - ${join(artifactDir, 'knowledgebase-index.json')}`)
  log(`  - ${join(artifactDir, 'evidence-ledger.json')}`)
  log(`  - ${join(artifactDir, 'hallucination-gate.json')}`)
  log(`  - ${join(artifactDir, 'contract-facts.json')}`)
  log(`  - ${join(artifactDir, 'source-to-patch-trace.json')}`)
  log(`  - ${join(artifactDir, 'stale-knowledge-report.json')}`)
  log(`  - ${join(artifactDir, 'dependency-research-cache.json')}`)
  log(`  - ${join(artifactDir, 'behavior-oracle.json')}`)
  log(`  - ${join(artifactDir, 'test-authoring-plan.json')}`)
  log(`  - ${join(artifactDir, 'verified-knowledgebase.md')}`)
  log('')
}

export function registerQuestV9Command(program: Command): void {
  program
    .command('quest-v9 [quest-id]')
    .description('Refresh and inspect Quest v9 coding intelligence, Coding Autopilot, Coding Execution, and Verified Knowledgebase artifacts')
    .option('--json', 'Print machine-readable coding intelligence', false)
    .option('--objective <text>', 'Objective to use when no quest id is supplied')
    .option('--changed-file <path...>', 'Changed file path(s) to include in the analysis')
    .addHelpText(
      'after',
      `
Examples:
  oac quest-v9
  oac quest-v9 swarm-abc123
  oac quest-v9 --objective "harden installer validation" --changed-file install.sh update.sh
  oac quest-v9 swarm-abc123 --json
`,
    )
    .action(async (questId: string | undefined, opts: QuestV9Options) => {
      await questV9Command(questId, opts)
    })
}

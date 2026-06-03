#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oac-kimi-v8.XXXXXX")"
INSTALLED_AGENT_FILE="$HOME/.kimi/agents/openagents-control/openagent.yaml"
AGENT_FILE="${KIMI_OPENAGENT_FILE:-$INSTALLED_AGENT_FILE}"
DAEMON_QUEST_ID=""
TERMINAL_DAEMON=0

wait_for_kimi_processes_to_release_dir() {
  local dir="$1"
  if ! command -v pgrep >/dev/null 2>&1; then
    sleep 2
    return 0
  fi

  for _ in $(seq 1 20); do
    if ! pgrep -f "$dir" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  pkill -TERM -f "$dir" >/dev/null 2>&1 || true
  sleep 1
}

cleanup() {
  if [ -n "${DAEMON_QUEST_ID:-}" ] && [ "$TERMINAL_DAEMON" != "1" ]; then
    DAEMON_FILE="$TEST_DIR/work/.oac/runs/${DAEMON_QUEST_ID}/daemon.json"
    if [ -f "$DAEMON_FILE" ]; then
      node - "$DAEMON_FILE" <<'NODE' | while read -r pid; do
const fs = require("fs");
const daemon = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const pids = [
  daemon.pid,
  ...(daemon.runtimes ?? []).map((runtime) => runtime.pid),
].filter(Boolean);
for (const pid of pids) console.log(pid);
NODE
        kill "$pid" >/dev/null 2>&1 || true
      done
    fi
  fi
  wait_for_kimi_processes_to_release_dir "$TEST_DIR"
  for _ in $(seq 1 5); do
    rm -rf "$TEST_DIR" 2>/dev/null && return 0
    wait_for_kimi_processes_to_release_dir "$TEST_DIR"
    sleep 0.5
  done
  rm -rf "$TEST_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass() { printf "✓ %s\n" "$1"; }
fail() { printf "✗ %s\n" "$1" >&2; exit 1; }
warn() { printf "! %s\n" "$1" >&2; }

run_with_timeout() {
  local duration=$1
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$duration" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$duration" "$@"
  else
    "$@"
  fi
}

OAC_CLI=(bun "$REPO_ROOT/packages/cli/src/index.ts")
V18_ARTIFACTS=(
  runtime-reliability-os.json
  command-failure-index.json
  timeout-policy.json
  claim-ledger.json
  runtime-doctor-report.json
  autonomous-recovery-plan.json
  flaky-command-memory.json
  evidence-replay.md
)
V18_DIRECT_SIDECARS="runtime-reliability-os.json, command-failure-index.json, timeout-policy.json, claim-ledger.json, runtime-doctor-report.json, autonomous-recovery-plan.json, flaky-command-memory.json, evidence-replay.md"
V19_ARTIFACTS=(
  deep-coding-collaboration-os.json
  deep-thinking-review.json
  idea-to-build-brief.json
  smarter-code-plan.json
  collaboration-board.json
  decision-tradeoff-matrix.json
  build-better-roadmap.md
)
V19_DIRECT_SIDECARS="deep-coding-collaboration-os.json, deep-thinking-review.json, idea-to-build-brief.json, smarter-code-plan.json, collaboration-board.json, decision-tradeoff-matrix.json, build-better-roadmap.md"
V20_ARTIFACTS=(
  self-improving-coding-team-os.json
  coding-team-metrics.json
  delivery-retrospective.json
  learning-feedback-loop.json
  improvement-backlog.json
  skill-evolution-candidates.json
  self-improvement-roadmap.md
)
V20_DIRECT_SIDECARS="self-improving-coding-team-os.json, coding-team-metrics.json, delivery-retrospective.json, learning-feedback-loop.json, improvement-backlog.json, skill-evolution-candidates.json, self-improvement-roadmap.md"
V21_ARTIFACTS=(
  predictive-engineering-os.json
  intent-architecture-compiler.json
  change-simulation-engine.json
  risk-forecast-score.json
  implementation-path-ranking.json
  test-intelligence-planner.json
  proof-contract.json
  architecture-drift-detector.json
  context-freshness-gate.json
  predictive-timeout-guard.json
  predictive-engineering-roadmap.md
)
V21_DIRECT_SIDECARS="predictive-engineering-os.json, intent-architecture-compiler.json, change-simulation-engine.json, risk-forecast-score.json, implementation-path-ranking.json, test-intelligence-planner.json, proof-contract.json, architecture-drift-detector.json, context-freshness-gate.json, predictive-timeout-guard.json, predictive-engineering-roadmap.md"

require_v18_artifact_mentions() {
  local file="$1"
  local label="$2"
  for artifact in "${V18_ARTIFACTS[@]}"; do
    grep -q "$artifact" "$file" || fail "$label missing Quest v18 $artifact"
  done
}

require_v18_artifacts_exist() {
  local dir="$1"
  local label="$2"
  for artifact in "${V18_ARTIFACTS[@]}"; do
    [ -f "$dir/$artifact" ] || fail "Missing $label Quest v18 $artifact"
  done
}

require_v19_artifact_mentions() {
  local file="$1"
  local label="$2"
  for artifact in "${V19_ARTIFACTS[@]}"; do
    grep -q "$artifact" "$file" || fail "$label missing Quest v19 $artifact"
  done
}

require_v19_artifacts_exist() {
  local dir="$1"
  local label="$2"
  for artifact in "${V19_ARTIFACTS[@]}"; do
    [ -f "$dir/$artifact" ] || fail "Missing $label Quest v19 $artifact"
  done
}

require_v20_artifact_mentions() {
  local file="$1"
  local label="$2"
  for artifact in "${V20_ARTIFACTS[@]}"; do
    grep -q "$artifact" "$file" || fail "$label missing Quest v20 $artifact"
  done
}

require_v20_artifacts_exist() {
  local dir="$1"
  local label="$2"
  for artifact in "${V20_ARTIFACTS[@]}"; do
    [ -f "$dir/$artifact" ] || fail "Missing $label Quest v20 $artifact"
  done
}

require_v21_artifact_mentions() {
  local file="$1"
  local label="$2"
  for artifact in "${V21_ARTIFACTS[@]}"; do
    grep -q "$artifact" "$file" || fail "$label missing Quest v21 $artifact"
  done
}

require_v21_artifacts_exist() {
  local dir="$1"
  local label="$2"
  for artifact in "${V21_ARTIFACTS[@]}"; do
    [ -f "$dir/$artifact" ] || fail "Missing $label Quest v21 $artifact"
  done
}

printf "\nOpenAgent Quest v8 Kimi comprehensive smoke\n"
printf "Workspace: %s\n\n" "$TEST_DIR"

if ! command -v kimi >/dev/null 2>&1; then
  warn "Kimi CLI not found; skipping live Kimi sections"
  exit 0
fi
pass "Kimi CLI available: $(kimi --version 2>/dev/null | head -n 1)"

if [ ! -f "$AGENT_FILE" ]; then
  fail "Kimi OpenAgent adapter not found at $AGENT_FILE. Run: ./install.sh advanced --with-kimi"
fi
pass "Kimi OpenAgent adapter found"

if [ "$AGENT_FILE" = "$INSTALLED_AGENT_FILE" ]; then
  cmp -s "$REPO_ROOT/plugins/kimi-code/openagent.yaml" "$INSTALLED_AGENT_FILE" \
    || fail "Installed Kimi adapter differs from repo plugin. Run: ./update.sh --with-kimi"
  cmp -s "$REPO_ROOT/plugins/kimi-code/openagent-system.md" "$HOME/.kimi/agents/openagents-control/openagent-system.md" \
    || fail "Installed Kimi system prompt differs from repo plugin. Run: ./update.sh --with-kimi"
  pass "Installed Kimi adapter matches repo plugin"
fi

grep -q 'Quest v8 lifecycle' "$AGENT_FILE" || fail "Kimi adapter does not mention Quest v8 lifecycle"
grep -q 'REVIEW -> VERIFY' "$AGENT_FILE" || fail "Kimi adapter does not include REVIEW lifecycle"
grep -q 'VERIFY -> REFLECT' "$AGENT_FILE" || fail "Kimi adapter does not include REFLECT lifecycle"
grep -q 'task.injected' "$AGENT_FILE" || fail "Kimi adapter does not mention task.injected"
grep -q 'priority.changed' "$AGENT_FILE" || fail "Kimi adapter does not mention priority.changed"
grep -q 'memory-graph.json' "$AGENT_FILE" || fail "Kimi adapter does not mention memory-graph.json"
grep -q 'interaction-memory.json' "$AGENT_FILE" || fail "Kimi adapter does not mention interaction-memory.json"
grep -q 'Step Budget Guard' "$AGENT_FILE" || fail "Kimi adapter does not mention Step Budget Guard"
grep -q 'max_steps_per_turn' "$AGENT_FILE" || fail "Kimi adapter does not mention Kimi max_steps_per_turn"
grep -q 'runtime_step_budget' "$AGENT_FILE" || fail "Kimi adapter does not mention runtime_step_budget"
grep -q 'Artifact Name Integrity Gate' "$AGENT_FILE" || fail "Kimi adapter does not mention artifact name integrity gate"
grep -q 'Command Timeout Guard' "$AGENT_FILE" || fail "Kimi adapter does not mention Command Timeout Guard"
grep -q 'Killed by timeout (30s)' "$AGENT_FILE" || fail "Kimi adapter does not mention native 30s timeout recovery"
grep -q 'timeout_s: 300' "$AGENT_FILE" || fail "Kimi adapter does not mention explicit shell/task timeout"
grep -q 'runtime_command_timeout' "$AGENT_FILE" || fail "Kimi adapter does not mention runtime_command_timeout"
grep -q 'coding-intelligence.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Quest v9 coding-intelligence.json"
grep -q 'patch-capsules.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Quest v9 patch-capsules.json"
grep -q 'coding-review.md' "$AGENT_FILE" || fail "Kimi adapter does not mention Quest v9 coding-review.md"
grep -q 'coding-autopilot.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Coding Autopilot"
grep -q 'symbol-graph.json' "$AGENT_FILE" || fail "Kimi adapter does not mention symbol graph"
grep -q 'smart-test-matrix.json' "$AGENT_FILE" || fail "Kimi adapter does not mention smart test matrix"
grep -q 'pre-edit-contract.json' "$AGENT_FILE" || fail "Kimi adapter does not mention pre-edit contract"
grep -q 'pr-readiness.md' "$AGENT_FILE" || fail "Kimi adapter does not mention PR readiness"
grep -q 'coding-execution.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Coding Execution"
grep -q 'executable-acceptance.json' "$AGENT_FILE" || fail "Kimi adapter does not mention executable acceptance"
grep -q 'runtime-compatibility-matrix.json' "$AGENT_FILE" || fail "Kimi adapter does not mention runtime compatibility matrix"
grep -q 'security-secrets-gate.json' "$AGENT_FILE" || fail "Kimi adapter does not mention security secrets gate"
grep -q 'pr-auto-packager.md' "$AGENT_FILE" || fail "Kimi adapter does not mention PR auto-packager"
grep -q 'verified-knowledgebase.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Verified Knowledgebase"
grep -q 'evidence-ledger.json' "$AGENT_FILE" || fail "Kimi adapter does not mention evidence ledger"
grep -q 'hallucination-gate.json' "$AGENT_FILE" || fail "Kimi adapter does not mention hallucination gate"
grep -q 'source-to-patch-trace.json' "$AGENT_FILE" || fail "Kimi adapter does not mention source-to-patch trace"
grep -q 'behavior-oracle.json' "$AGENT_FILE" || fail "Kimi adapter does not mention behavior oracle"
grep -q 'semantic-repo-brain.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Semantic Repo Brain"
grep -q 'knowledge-confidence-score.json' "$AGENT_FILE" || fail "Kimi adapter does not mention knowledge confidence score"
grep -q 'failure-fix-memory.json' "$AGENT_FILE" || fail "Kimi adapter does not mention failure fix memory"
grep -q 'auto-skill-builder.json' "$AGENT_FILE" || fail "Kimi adapter does not mention auto skill builder"
grep -q 'temporal-memory.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Temporal Memory"
grep -q 'patch-outcome-ledger.json' "$AGENT_FILE" || fail "Kimi adapter does not mention patch-outcome ledger"
grep -q 'repo-history-signals.json' "$AGENT_FILE" || fail "Kimi adapter does not mention repo-history signals"
grep -q 'intelligent-coding-team.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Intelligent Coding Team OS"
grep -q 'requirement-compiler.json' "$AGENT_FILE" || fail "Kimi adapter does not mention requirement compiler"
grep -q 'expert-team-blackboard.json' "$AGENT_FILE" || fail "Kimi adapter does not mention expert team blackboard"
grep -q 'change-impact-simulator.json' "$AGENT_FILE" || fail "Kimi adapter does not mention change impact simulator"
grep -q 'project-skill-pack-builder.json' "$AGENT_FILE" || fail "Kimi adapter does not mention project skill pack builder"
grep -q 'verified-delivery-os.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Verified Coding Delivery OS"
grep -q 'acceptance-compiler.json' "$AGENT_FILE" || fail "Kimi adapter does not mention acceptance compiler"
grep -q 'evidence-first-gate.json' "$AGENT_FILE" || fail "Kimi adapter does not mention evidence-first gate"
grep -q 'patch-provenance-ledger.json' "$AGENT_FILE" || fail "Kimi adapter does not mention patch provenance ledger"
grep -q 'runtime-cycle-matrix.json' "$AGENT_FILE" || fail "Kimi adapter does not mention runtime cycle matrix"
grep -q 'auto-eval-generator.json' "$AGENT_FILE" || fail "Kimi adapter does not mention auto eval generator"
grep -q 'agent-debate-gate.json' "$AGENT_FILE" || fail "Kimi adapter does not mention agent debate gate"
grep -q 'release-readiness-dashboard.json' "$AGENT_FILE" || fail "Kimi adapter does not mention release readiness dashboard"
grep -q 'product-architect-review.json' "$AGENT_FILE" || fail "Kimi adapter does not mention Product Architect Intelligence"
grep -q 'architecture-next-steps.json' "$AGENT_FILE" || fail "Kimi adapter does not mention architecture next steps"
grep -q 'strategic-next-actions.md' "$AGENT_FILE" || fail "Kimi adapter does not mention strategic next actions"
grep -q 'Runtime Reliability + Evidence Replay OS' "$AGENT_FILE" || fail "Kimi adapter does not mention Runtime Reliability + Evidence Replay OS"
require_v18_artifact_mentions "$AGENT_FILE" "Kimi adapter"
grep -q 'Deep Coding Collaboration OS' "$AGENT_FILE" || fail "Kimi adapter does not mention Deep Coding Collaboration OS"
require_v19_artifact_mentions "$AGENT_FILE" "Kimi adapter"
grep -q 'Self-Improving Coding Team OS' "$AGENT_FILE" || fail "Kimi adapter does not mention Self-Improving Coding Team OS"
require_v20_artifact_mentions "$AGENT_FILE" "Kimi adapter"
grep -q 'Predictive Engineering OS' "$AGENT_FILE" || fail "Kimi adapter does not mention Predictive Engineering OS"
require_v21_artifact_mentions "$AGENT_FILE" "Kimi adapter"
grep -q 'context.loaded' "$AGENT_FILE" || fail "Kimi adapter does not mention context.loaded"
grep -q 'request.received' "$AGENT_FILE" || fail "Kimi adapter does not mention request.received"
grep -q 'research.assessed' "$AGENT_FILE" || fail "Kimi adapter does not mention research.assessed"
grep -q 'memory-promote' "$AGENT_FILE" || fail "Kimi adapter does not mention memory promotion approval"
grep -q 'repo-wiki' "$AGENT_FILE" || fail "Kimi adapter does not mention repo wiki autopilot"
grep -q 'quest-v9' "$AGENT_FILE" || fail "Kimi adapter does not mention quest-v9 refresh"
grep -q 'coding.intent' "$AGENT_FILE" || fail "Kimi adapter does not mention coding.intent"
grep -q 'tests.selected' "$AGENT_FILE" || fail "Kimi adapter does not mention tests.selected"
grep -q 'next_steps.suggested' "$AGENT_FILE" || fail "Kimi adapter does not mention next_steps.suggested"
pass "Kimi adapter advertises Quest v8 adaptive protocol and Quest v9-v21 coding intelligence"

mkdir -p "$TEST_DIR/work/.oac"
cd "$TEST_DIR/work"

cat > package.json <<'JSON'
{
  "name": "oac-v8-kimi-test",
  "private": true,
  "scripts": {
    "test": "node -e \"process.exit(0)\"",
    "build": "node -e \"process.exit(0)\"",
    "lint": "node -e \"process.exit(0)\""
  }
}
JSON

cat > .oac/config.json <<'JSON'
{
  "version": "1",
  "preferences": {
    "yoloMode": false,
    "autoBackup": true,
    "expertMode": true,
    "useAgentSwarm": true,
    "maxParallelAgents": 2,
    "maxApiCallsPerSession": 100
  },
  "v6": {
    "enabled": true,
    "distributedSwarm": {
      "enabled": true,
      "defaultRuntime": "kimi",
      "allowMultiRuntime": false,
      "maxConcurrentRuntimes": 2
    }
  },
  "v8": {
    "enabled": true,
    "reviewGate": {
      "enabled": true,
      "autoApproveOnNoChanges": true,
      "requiredFor": ["standard", "deep"],
      "excludedFor": ["lite"]
    },
    "priorityQueue": {
      "enabled": true,
      "maxConcurrentUrgent": 2,
      "preemptOnCritical": false
    },
    "selfImprovement": {
      "enabled": true,
      "patternCorpusMaxSize": 1000,
      "minPatternConfidence": 0.7
    }
  }
}
JSON

DIRECT_OUT="$TEST_DIR/direct-v8.txt"
DIRECT_PROMPT="Do not use tools. Start with OpenAgent Quest Spec. Include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, priority.changed, and research.assessed. Also mention Quest v9 coding intelligence, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, Temporal Memory, Intelligent Coding Team OS, Verified Coding Delivery OS, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, Deep Coding Collaboration OS, Self-Improving Coding Team OS, and Predictive Engineering OS sidecars coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, pre-edit-contract.json, pr-readiness.md, coding-execution.json, executable-acceptance.json, runtime-compatibility-matrix.json, security-secrets-gate.json, pr-auto-packager.md, verified-knowledgebase.json, evidence-ledger.json, hallucination-gate.json, source-to-patch-trace.json, behavior-oracle.json, semantic-repo-brain.json, knowledge-confidence-score.json, failure-fix-memory.json, auto-skill-builder.json, temporal-memory.json, patch-outcome-ledger.json, repo-history-signals.json, intelligent-coding-team.json, requirement-compiler.json, expert-team-blackboard.json, change-impact-simulator.json, project-skill-pack-builder.json, verified-delivery-os.json, acceptance-compiler.json, evidence-first-gate.json, patch-provenance-ledger.json, runtime-cycle-matrix.json, auto-eval-generator.json, agent-debate-gate.json, release-readiness-dashboard.json, product-architect-review.json, architecture-next-steps.json, roadmap-signals.json, capability-gap-map.json, product-risk-register.json, user-value-matrix.json, strategic-refactor-radar.json, architecture-decision-suggestions.json, strategic-next-actions.md, ${V18_DIRECT_SIDECARS}, ${V19_DIRECT_SIDECARS}, ${V20_DIRECT_SIDECARS}, ${V21_DIRECT_SIDECARS} and events coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals."
run_with_timeout 120 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$DIRECT_PROMPT" > "$DIRECT_OUT" 2>&1 || {
    sed -n '1,160p' "$DIRECT_OUT" || true
    fail "Direct Kimi v8 Quest Spec turn failed"
  }

node - "$DIRECT_OUT" <<'NODE'
const fs = require("fs");
const text = fs.readFileSync(process.argv[2], "utf8");
const checks = {
  startsWithQuest: /^(?:```text\s*)?OpenAgent Quest Spec/m.test(text),
  stateNew: /State:\s*NEW/i.test(text),
  reviewLifecycle: /EXECUTE\s*(?:->|→)\s*REVIEW\s*(?:->|→)\s*VERIFY/i.test(text),
  reflectLifecycle: /VERIFY\s*(?:->|→)\s*REFLECT\s*(?:->|→)\s*COMPLETE/i.test(text),
  reviewEvent: /review\.started/i.test(text),
  taskInjected: /task\.injected/i.test(text),
  priorityChanged: /priority\.changed/i.test(text),
  researchAssessed: /research\.assessed/i.test(text),
  codingIntelligence: /coding-intelligence\.json/i.test(text),
  codingAutopilot: /coding-autopilot\.json/i.test(text),
  codingExecution: /coding-execution\.json/i.test(text),
  executableAcceptance: /executable-acceptance\.json/i.test(text),
  symbolGraph: /symbol-graph\.json/i.test(text),
  smartTestMatrix: /smart-test-matrix\.json/i.test(text),
  runtimeMatrix: /runtime-compatibility-matrix\.json/i.test(text),
  securityGate: /security-secrets-gate\.json/i.test(text),
  verifiedKnowledgebase: /verified-knowledgebase\.json/i.test(text),
  evidenceLedger: /evidence-ledger\.json/i.test(text),
  hallucinationGate: /hallucination-gate\.json/i.test(text),
  sourceToPatchTrace: /source-to-patch-trace\.json/i.test(text),
  behaviorOracle: /behavior-oracle\.json/i.test(text),
  semanticRepoBrain: /semantic-repo-brain\.json/i.test(text),
  knowledgeConfidenceScore: /knowledge-confidence-score\.json/i.test(text),
  failureFixMemory: /failure-fix-memory\.json/i.test(text),
  autoSkillBuilder: /auto-skill-builder\.json/i.test(text),
  temporalMemory: /temporal-memory\.json/i.test(text),
  patchOutcomeLedger: /patch-outcome-ledger\.json/i.test(text),
  repoHistorySignals: /repo-history-signals\.json/i.test(text),
  intelligentCodingTeam: /intelligent-coding-team\.json/i.test(text),
  requirementCompiler: /requirement-compiler\.json/i.test(text),
  expertTeamBlackboard: /expert-team-blackboard\.json/i.test(text),
  changeImpactSimulator: /change-impact-simulator\.json/i.test(text),
  projectSkillPackBuilder: /project-skill-pack-builder\.json/i.test(text),
  verifiedDeliveryOs: /verified-delivery-os\.json/i.test(text),
  acceptanceCompiler: /acceptance-compiler\.json/i.test(text),
  evidenceFirstGate: /evidence-first-gate\.json/i.test(text),
  patchProvenanceLedger: /patch-provenance-ledger\.json/i.test(text),
  runtimeCycleMatrix: /runtime-cycle-matrix\.json/i.test(text),
  autoEvalGenerator: /auto-eval-generator\.json/i.test(text),
  agentDebateGate: /agent-debate-gate\.json/i.test(text),
  releaseReadinessDashboard: /release-readiness-dashboard\.json/i.test(text),
  productArchitectReview: /product-architect-review\.json/i.test(text),
  architectureNextSteps: /architecture-next-steps\.json/i.test(text),
  roadmapSignals: /roadmap-signals\.json/i.test(text),
  strategicNextActions: /strategic-next-actions\.md/i.test(text),
  runtimeReliability: /runtime-reliability-os\.json/i.test(text),
  commandFailureIndex: /command-failure-index\.json/i.test(text),
  timeoutPolicy: /timeout-policy\.json/i.test(text),
  claimLedger: /claim-ledger\.json/i.test(text),
  runtimeDoctorReport: /runtime-doctor-report\.json/i.test(text),
  autonomousRecoveryPlan: /autonomous-recovery-plan\.json/i.test(text),
  flakyCommandMemory: /flaky-command-memory\.json/i.test(text),
  evidenceReplay: /evidence-replay\.md/i.test(text),
  deepCodingCollaboration: /deep-coding-collaboration-os\.json/i.test(text),
  deepThinkingReview: /deep-thinking-review\.json/i.test(text),
  ideaToBuildBrief: /idea-to-build-brief\.json/i.test(text),
  smarterCodePlan: /smarter-code-plan\.json/i.test(text),
  collaborationBoard: /collaboration-board\.json/i.test(text),
  decisionTradeoffMatrix: /decision-tradeoff-matrix\.json/i.test(text),
  buildBetterRoadmap: /build-better-roadmap\.md/i.test(text),
  selfImprovingCodingTeam: /self-improving-coding-team-os\.json/i.test(text),
  codingTeamMetrics: /coding-team-metrics\.json/i.test(text),
  deliveryRetrospective: /delivery-retrospective\.json/i.test(text),
  learningFeedbackLoop: /learning-feedback-loop\.json/i.test(text),
  improvementBacklog: /improvement-backlog\.json/i.test(text),
  skillEvolutionCandidates: /skill-evolution-candidates\.json/i.test(text),
  selfImprovementRoadmap: /self-improvement-roadmap\.md/i.test(text),
  predictiveEngineering: /predictive-engineering-os\.json/i.test(text),
  intentArchitectureCompiler: /intent-architecture-compiler\.json/i.test(text),
  changeSimulationEngine: /change-simulation-engine\.json/i.test(text),
  riskForecastScore: /risk-forecast-score\.json/i.test(text),
  implementationPathRanking: /implementation-path-ranking\.json/i.test(text),
  testIntelligencePlanner: /test-intelligence-planner\.json/i.test(text),
  proofContract: /proof-contract\.json/i.test(text),
  architectureDriftDetector: /architecture-drift-detector\.json/i.test(text),
  contextFreshnessGate: /context-freshness-gate\.json/i.test(text),
  predictiveTimeoutGuard: /predictive-timeout-guard\.json/i.test(text),
  predictiveEngineeringRoadmap: /predictive-engineering-roadmap\.md/i.test(text),
  patchCapsule: /patch\.capsule/i.test(text),
  testsSelected: /tests\.selected/i.test(text),
};
for (const [name, ok] of Object.entries(checks)) {
  console.log(`direct_${name}=${ok ? "passed" : "failed"}`);
}
if (Object.values(checks).some((ok) => !ok)) {
  console.error(text.slice(0, 2000));
  process.exit(1);
}
NODE
pass "Direct Kimi prompt follows Quest v8 protocol"

CYCLE_FIRST_OUT="$TEST_DIR/cycle-first-v8.txt"
CYCLE_SECOND_OUT="$TEST_DIR/cycle-second-v8.txt"
CYCLE_FIRST_PROMPT="Do not use tools. Treat this as substantial planning work. Start with OpenAgent Quest Spec and include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, and priority.changed. This is turn one; propose a safe repo inspection approach."
CYCLE_SECOND_PROMPT="Do not use tools. This is a second substantial request after the first completed in the same Kimi session. Start a fresh OpenAgent Quest Spec with State: NEW and include Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, and priority.changed. Propose a safe validation approach."

run_with_timeout 120 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$CYCLE_FIRST_PROMPT" > "$CYCLE_FIRST_OUT" 2>&1 || {
    sed -n '1,160p' "$CYCLE_FIRST_OUT" || true
    fail "First Kimi v8 same-session turn failed"
  }

run_with_timeout 120 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --continue \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$CYCLE_SECOND_PROMPT" > "$CYCLE_SECOND_OUT" 2>&1 || {
    sed -n '1,160p' "$CYCLE_SECOND_OUT" || true
    fail "Second Kimi v8 same-session turn failed"
  }

node - "$CYCLE_FIRST_OUT" "$CYCLE_SECOND_OUT" <<'NODE'
const fs = require("fs");
const [first, second] = process.argv.slice(2);

function check(label, file) {
  const text = fs.readFileSync(file, "utf8").trim();
  const checks = {
    startsWithQuest: /^(?:```text\s*)?OpenAgent Quest Spec/m.test(text),
    stateNew: /State:\s*NEW/i.test(text),
    scenario: /Scenario:\s*(direct|code_with_spec|prototype_demo|create_tool|research_plan)/i.test(text),
    intensity: /Intensity:\s*(lite|standard|deep)/i.test(text),
    teamLead: /Team Lead:\s*active/i.test(text),
    experts: /Experts:/i.test(text),
    trustLabel: /Trust Label:\s*(planned_only|inspected_only|changed|tested|pushed)/i.test(text),
    reviewLifecycle: /EXECUTE\s*(?:->|→)\s*REVIEW\s*(?:->|→)\s*VERIFY/i.test(text),
    reflectLifecycle: /VERIFY\s*(?:->|→)\s*REFLECT\s*(?:->|→)\s*COMPLETE/i.test(text),
    reviewEvent: /review\.started/i.test(text),
    taskInjected: /task\.injected/i.test(text),
    priorityChanged: /priority\.changed/i.test(text),
  };
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${label}_${name}=${ok ? "passed" : "failed"}`);
  }
  if (Object.values(checks).some((ok) => !ok)) {
    console.error(`\n--- ${label} output ---\n${text.slice(0, 2000)}`);
    process.exit(1);
  }
}

check("cycle_first", first);
check("cycle_second", second);
NODE
pass "Kimi starts a fresh Quest v8 Spec for both substantial same-session turns"

"${OAC_CLI[@]}" quest-run --runtime kimi "Plan a no-op Kimi Quest v8 validation. Do not modify files." > quest-run.txt 2>&1
QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
[ -n "$QUEST_ID" ] || fail "No v8 Quest created"

QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
[ "$QUEST_VERSION" = "8" ] || fail "Expected Quest version 8, got $QUEST_VERSION"
grep -q 'kimi --work-dir' .oac/runs/"$QUEST_ID"/quest.json || fail "quest.json missing kimi runtime command"
[ -f ".oac/runs/${QUEST_ID}/interaction-memory.json" ] || fail "Missing interaction-memory.json"
[ -f ".oac/runs/${QUEST_ID}/plan.json" ] || fail "Missing plan.json"
[ -f ".oac/runs/${QUEST_ID}/spec.json" ] || fail "Missing spec.json"
[ -f ".oac/runs/${QUEST_ID}/coding-intelligence.json" ] || fail "Missing Quest v9 coding-intelligence.json"
[ -f ".oac/runs/${QUEST_ID}/patch-capsules.json" ] || fail "Missing Quest v9 patch-capsules.json"
[ -f ".oac/runs/${QUEST_ID}/coding-review.md" ] || fail "Missing Quest v9 coding-review.md"
[ -f ".oac/runs/${QUEST_ID}/coding-autopilot.json" ] || fail "Missing Coding Autopilot"
[ -f ".oac/runs/${QUEST_ID}/symbol-graph.json" ] || fail "Missing symbol graph"
[ -f ".oac/runs/${QUEST_ID}/smart-test-matrix.json" ] || fail "Missing smart test matrix"
[ -f ".oac/runs/${QUEST_ID}/patch-ledger.json" ] || fail "Missing patch ledger"
[ -f ".oac/runs/${QUEST_ID}/pre-edit-contract.json" ] || fail "Missing pre-edit contract"
[ -f ".oac/runs/${QUEST_ID}/automatic-code-review.json" ] || fail "Missing automatic code review"
[ -f ".oac/runs/${QUEST_ID}/failure-memory.json" ] || fail "Missing failure memory"
[ -f ".oac/runs/${QUEST_ID}/runtime-parity-enforcer.json" ] || fail "Missing runtime parity enforcer"
[ -f ".oac/runs/${QUEST_ID}/dependency-research-gate.json" ] || fail "Missing dependency research gate"
[ -f ".oac/runs/${QUEST_ID}/autofix-plan.json" ] || fail "Missing autofix plan"
[ -f ".oac/runs/${QUEST_ID}/pr-readiness.md" ] || fail "Missing PR readiness"
[ -f ".oac/runs/${QUEST_ID}/coding-execution.json" ] || fail "Missing Coding Execution"
[ -f ".oac/runs/${QUEST_ID}/executable-acceptance.json" ] || fail "Missing executable acceptance"
[ -f ".oac/runs/${QUEST_ID}/guarded-autofix-runner.json" ] || fail "Missing guarded autofix runner"
[ -f ".oac/runs/${QUEST_ID}/contract-drift-guard.json" ] || fail "Missing contract drift guard"
[ -f ".oac/runs/${QUEST_ID}/review-patch-loop.json" ] || fail "Missing review patch loop"
[ -f ".oac/runs/${QUEST_ID}/test-gap-finder.json" ] || fail "Missing test gap finder"
[ -f ".oac/runs/${QUEST_ID}/regression-snapshots.json" ] || fail "Missing regression snapshots"
[ -f ".oac/runs/${QUEST_ID}/runtime-compatibility-matrix.json" ] || fail "Missing runtime compatibility matrix"
[ -f ".oac/runs/${QUEST_ID}/ownership-lock-plan.json" ] || fail "Missing ownership lock plan"
[ -f ".oac/runs/${QUEST_ID}/security-secrets-gate.json" ] || fail "Missing security secrets gate"
[ -f ".oac/runs/${QUEST_ID}/pr-auto-packager.json" ] || fail "Missing PR auto-packager JSON"
[ -f ".oac/runs/${QUEST_ID}/pr-auto-packager.md" ] || fail "Missing PR auto-packager brief"
[ -f ".oac/runs/${QUEST_ID}/verified-knowledgebase.json" ] || fail "Missing Verified Knowledgebase"
[ -f ".oac/runs/${QUEST_ID}/knowledgebase-index.json" ] || fail "Missing knowledgebase index"
[ -f ".oac/runs/${QUEST_ID}/evidence-ledger.json" ] || fail "Missing evidence ledger"
[ -f ".oac/runs/${QUEST_ID}/hallucination-gate.json" ] || fail "Missing hallucination gate"
[ -f ".oac/runs/${QUEST_ID}/contract-facts.json" ] || fail "Missing contract facts"
[ -f ".oac/runs/${QUEST_ID}/source-to-patch-trace.json" ] || fail "Missing source-to-patch trace"
[ -f ".oac/runs/${QUEST_ID}/stale-knowledge-report.json" ] || fail "Missing stale knowledge report"
[ -f ".oac/runs/${QUEST_ID}/dependency-research-cache.json" ] || fail "Missing dependency research cache"
[ -f ".oac/runs/${QUEST_ID}/behavior-oracle.json" ] || fail "Missing behavior oracle"
[ -f ".oac/runs/${QUEST_ID}/test-authoring-plan.json" ] || fail "Missing test authoring plan"
[ -f ".oac/runs/${QUEST_ID}/verified-knowledgebase.md" ] || fail "Missing Verified Knowledgebase brief"
[ -f ".oac/runs/${QUEST_ID}/semantic-repo-brain.json" ] || fail "Missing Semantic Repo Brain"
[ -f ".oac/runs/${QUEST_ID}/ast-knowledgebase.json" ] || fail "Missing AST knowledgebase"
[ -f ".oac/runs/${QUEST_ID}/knowledge-confidence-score.json" ] || fail "Missing knowledge confidence score"
[ -f ".oac/runs/${QUEST_ID}/failure-fix-memory.json" ] || fail "Missing failure fix memory"
[ -f ".oac/runs/${QUEST_ID}/auto-skill-builder.json" ] || fail "Missing auto skill builder"
[ -f ".oac/runs/${QUEST_ID}/semantic-repo-brain.md" ] || fail "Missing Semantic Repo Brain brief"
[ -f ".oac/runs/${QUEST_ID}/temporal-memory.json" ] || fail "Missing Quest v14 temporal-memory.json"
[ -f ".oac/runs/${QUEST_ID}/patch-outcome-ledger.json" ] || fail "Missing Quest v14 patch-outcome-ledger.json"
[ -f ".oac/runs/${QUEST_ID}/repo-history-signals.json" ] || fail "Missing Quest v14 repo-history-signals.json"
[ -f ".oac/runs/${QUEST_ID}/temporal-memory.md" ] || fail "Missing Quest v14 temporal-memory brief"
[ -f ".oac/runs/${QUEST_ID}/intelligent-coding-team.json" ] || fail "Missing Quest v15 intelligent-coding-team.json"
[ -f ".oac/runs/${QUEST_ID}/requirement-compiler.json" ] || fail "Missing Quest v15 requirement-compiler.json"
[ -f ".oac/runs/${QUEST_ID}/expert-team-blackboard.json" ] || fail "Missing Quest v15 expert-team-blackboard.json"
[ -f ".oac/runs/${QUEST_ID}/change-impact-simulator.json" ] || fail "Missing Quest v15 change-impact-simulator.json"
[ -f ".oac/runs/${QUEST_ID}/project-skill-pack-builder.json" ] || fail "Missing Quest v15 project-skill-pack-builder.json"
[ -f ".oac/runs/${QUEST_ID}/intelligent-coding-team.md" ] || fail "Missing Quest v15 Intelligent Coding Team OS brief"
[ -f ".oac/runs/${QUEST_ID}/verified-delivery-os.json" ] || fail "Missing Quest v16 verified-delivery-os.json"
[ -f ".oac/runs/${QUEST_ID}/acceptance-compiler.json" ] || fail "Missing Quest v16 acceptance-compiler.json"
[ -f ".oac/runs/${QUEST_ID}/evidence-first-gate.json" ] || fail "Missing Quest v16 evidence-first-gate.json"
[ -f ".oac/runs/${QUEST_ID}/patch-provenance-ledger.json" ] || fail "Missing Quest v16 patch-provenance-ledger.json"
[ -f ".oac/runs/${QUEST_ID}/runtime-cycle-matrix.json" ] || fail "Missing Quest v16 runtime-cycle-matrix.json"
[ -f ".oac/runs/${QUEST_ID}/auto-eval-generator.json" ] || fail "Missing Quest v16 auto-eval-generator.json"
[ -f ".oac/runs/${QUEST_ID}/agent-debate-gate.json" ] || fail "Missing Quest v16 agent-debate-gate.json"
[ -f ".oac/runs/${QUEST_ID}/release-readiness-dashboard.json" ] || fail "Missing Quest v16 release-readiness-dashboard.json"
[ -f ".oac/runs/${QUEST_ID}/verified-delivery-os.md" ] || fail "Missing Quest v16 Verified Coding Delivery OS brief"
[ -f ".oac/runs/${QUEST_ID}/product-architect-review.json" ] || fail "Missing Quest v17 product-architect-review.json"
[ -f ".oac/runs/${QUEST_ID}/architecture-next-steps.json" ] || fail "Missing Quest v17 architecture-next-steps.json"
[ -f ".oac/runs/${QUEST_ID}/roadmap-signals.json" ] || fail "Missing Quest v17 roadmap-signals.json"
[ -f ".oac/runs/${QUEST_ID}/capability-gap-map.json" ] || fail "Missing Quest v17 capability-gap-map.json"
[ -f ".oac/runs/${QUEST_ID}/product-risk-register.json" ] || fail "Missing Quest v17 product-risk-register.json"
[ -f ".oac/runs/${QUEST_ID}/user-value-matrix.json" ] || fail "Missing Quest v17 user-value-matrix.json"
[ -f ".oac/runs/${QUEST_ID}/strategic-refactor-radar.json" ] || fail "Missing Quest v17 strategic-refactor-radar.json"
[ -f ".oac/runs/${QUEST_ID}/architecture-decision-suggestions.json" ] || fail "Missing Quest v17 architecture-decision-suggestions.json"
[ -f ".oac/runs/${QUEST_ID}/strategic-next-actions.md" ] || fail "Missing Quest v17 strategic next actions brief"
require_v18_artifacts_exist ".oac/runs/${QUEST_ID}" "Kimi runtime"
require_v19_artifacts_exist ".oac/runs/${QUEST_ID}" "Kimi runtime"
require_v20_artifacts_exist ".oac/runs/${QUEST_ID}" "Kimi runtime"
require_v21_artifacts_exist ".oac/runs/${QUEST_ID}" "Kimi runtime"
[ -f ".oac/repo-wiki/index.md" ] || fail "Missing repo wiki index after Quest creation"
grep -q 'Repo Wiki' .oac/repo-wiki/index.md || fail "Repo wiki index missing title"
node - "$QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const runDir = `.oac/runs/${questId}`;
const plan = JSON.parse(fs.readFileSync(`${runDir}/plan.json`, "utf8"));
const spec = JSON.parse(fs.readFileSync(`${runDir}/spec.json`, "utf8"));
if (plan.requirementCompiler?.version !== "15") throw new Error("missing pre-planning requirement compiler in plan.json");
if (!plan.acceptanceCriteria?.some((criterion) => criterion.startsWith("Pre-planning requirement readiness is "))) {
  throw new Error("missing pre-planning acceptance criteria in plan.json");
}
if (spec.requirements?.compilerVersion !== "15") throw new Error("missing requirement compiler metadata in spec.json");
if (!Array.isArray(spec.requirements?.compiled) || spec.requirements.compiled.length < 1) {
  throw new Error("missing compiled requirements in spec.json");
}
if (!spec.requirements.acceptanceCriteria?.some((criterion) => criterion.startsWith("Pre-planning requirement readiness is "))) {
  throw new Error("missing pre-planning acceptance criteria in spec.json");
}
const intelligence = JSON.parse(fs.readFileSync(`.oac/runs/${questId}/coding-intelligence.json`, "utf8"));
if (intelligence.version !== "9") throw new Error(`expected Quest v9 coding intelligence, got ${intelligence.version}`);
if (!intelligence.codingAutopilot || intelligence.codingAutopilot.version !== "10") throw new Error("missing Coding Autopilot v10");
if (!intelligence.codingExecution || intelligence.codingExecution.version !== "11") throw new Error("missing Coding Execution v11");
if (!intelligence.verifiedKnowledgebase || intelligence.verifiedKnowledgebase.version !== "12") throw new Error("missing Verified Knowledgebase v12");
if (!intelligence.verifiedKnowledgebase.evidenceLedger?.facts?.length) throw new Error("missing v12 evidence ledger facts");
if (!intelligence.verifiedKnowledgebase.hallucinationGate?.checks?.length) throw new Error("missing v12 hallucination gate checks");
if (!intelligence.semanticRepoBrain || intelligence.semanticRepoBrain.version !== "13") throw new Error("missing Semantic Repo Brain v13");
if (!intelligence.semanticRepoBrain.semanticGraph?.summary) throw new Error("missing v13 semantic graph summary");
if (!intelligence.semanticRepoBrain.completionGate?.checks?.length) throw new Error("missing v13 semantic completion gate checks");
if (!intelligence.temporalMemory || intelligence.temporalMemory.version !== "14") throw new Error("missing Temporal Memory v14");
if (!Array.isArray(intelligence.temporalMemory.chronicCommands)) throw new Error("missing v14 chronic command memory");
if (!intelligence.intelligentCodingTeam || intelligence.intelligentCodingTeam.version !== "15") throw new Error("missing Intelligent Coding Team OS v15");
if (!intelligence.intelligentCodingTeam.teamGate?.checks?.length) throw new Error("missing v15 team gate checks");
if (!intelligence.verifiedDelivery || intelligence.verifiedDelivery.version !== "16") throw new Error("missing Verified Coding Delivery OS v16");
if (!intelligence.verifiedDelivery.acceptanceCompiler?.criteria?.length) throw new Error("missing v16 acceptance criteria");
if (!intelligence.verifiedDelivery.evidenceFirstGate?.claims?.length) throw new Error("missing v16 evidence-first claims");
if (!intelligence.verifiedDelivery.runtimeCycleMatrix || intelligence.verifiedDelivery.runtimeCycleMatrix.requiredCycles !== 3) throw new Error("missing v16 runtime three-cycle matrix");
if (!Array.isArray(intelligence.verifiedDelivery.releaseReadinessDashboard?.requiredCommands)) throw new Error("missing v16 release readiness commands");
if (!intelligence.verifiedDelivery.releaseReadinessDashboard?.installUpdateGate) throw new Error("missing v16 install/update gate");
if (!intelligence.productArchitect || intelligence.productArchitect.version !== "17") throw new Error("missing Product Architect Intelligence v17");
if (!intelligence.productArchitect.productArchitectReview?.recommendations?.length) throw new Error("missing v17 product-architect recommendations");
if (!Array.isArray(intelligence.productArchitect.architectureNextSteps) || intelligence.productArchitect.architectureNextSteps.length < 1) throw new Error("missing v17 architecture next steps");
if (!Array.isArray(intelligence.productArchitect.roadmapSignals)) throw new Error("missing v17 roadmap signals");
if (!Array.isArray(intelligence.productArchitect.productRiskRegister)) throw new Error("missing v17 product risk register");
if (!intelligence.runtimeReliability || intelligence.runtimeReliability.version !== "18") throw new Error("missing Runtime Reliability + Evidence Replay OS v18");
if (!Array.isArray(intelligence.runtimeReliability.claimLedger?.claims) || intelligence.runtimeReliability.claimLedger.claims.length < 1) throw new Error("missing v18 claim ledger");
if (!Array.isArray(intelligence.runtimeReliability.evidenceReplay?.replayCommands)) throw new Error("missing v18 replay commands");
if (!intelligence.deepCodingCollaboration || intelligence.deepCodingCollaboration.version !== "19") throw new Error("missing Deep Coding Collaboration OS v19");
if (!Array.isArray(intelligence.deepCodingCollaboration.deepThinkingReview?.hardQuestions) || intelligence.deepCodingCollaboration.deepThinkingReview.hardQuestions.length < 1) throw new Error("missing v19 hard questions");
if (!Array.isArray(intelligence.deepCodingCollaboration.ideaToBuildBrief?.buildSlices) || intelligence.deepCodingCollaboration.ideaToBuildBrief.buildSlices.length < 1) throw new Error("missing v19 idea-to-build slices");
if (!Array.isArray(intelligence.deepCodingCollaboration.smarterCodePlan?.codeQualityMoves) || intelligence.deepCodingCollaboration.smarterCodePlan.codeQualityMoves.length < 1) throw new Error("missing v19 smarter code moves");
if (!intelligence.selfImprovingCodingTeam || intelligence.selfImprovingCodingTeam.version !== "20") throw new Error("missing Self-Improving Coding Team OS v20");
if (typeof intelligence.selfImprovingCodingTeam.codingTeamMetrics?.deliveryScore !== "number") throw new Error("missing v20 coding team delivery score");
if (!Array.isArray(intelligence.selfImprovingCodingTeam.deliveryRetrospective?.wins)) throw new Error("missing v20 delivery retrospective wins");
if (!Array.isArray(intelligence.selfImprovingCodingTeam.learningFeedbackLoop?.policy)) throw new Error("missing v20 learning feedback policy");
if (!Array.isArray(intelligence.selfImprovingCodingTeam.improvementBacklog)) throw new Error("missing v20 improvement backlog");
if (!Array.isArray(intelligence.selfImprovingCodingTeam.skillEvolutionCandidates)) throw new Error("missing v20 skill evolution candidates");
if (!intelligence.predictiveEngineering || intelligence.predictiveEngineering.version !== "21") throw new Error("missing Predictive Engineering OS v21");
if (!intelligence.predictiveEngineering.intentArchitectureCompiler?.requirements?.length) throw new Error("missing v21 intent architecture requirements");
if (!Array.isArray(intelligence.predictiveEngineering.changeSimulationEngine?.predictedSurfaces)) throw new Error("missing v21 predicted surfaces");
if (!intelligence.predictiveEngineering.riskForecastScore?.overallRisk) throw new Error("missing v21 risk forecast");
if (!intelligence.predictiveEngineering.implementationPathRanking?.selectedPath) throw new Error("missing v21 implementation path");
if (!Array.isArray(intelligence.predictiveEngineering.testIntelligencePlanner?.requiredTests)) throw new Error("missing v21 test intelligence plan");
if (!Array.isArray(intelligence.predictiveEngineering.proofContract?.doneClaims)) throw new Error("missing v21 proof contract");
if (!Array.isArray(intelligence.predictiveEngineering.predictiveTimeoutGuard?.timeoutPolicy)) throw new Error("missing v21 timeout guard");
if (!Array.isArray(intelligence.testRecommendations) || intelligence.testRecommendations.length < 1) {
  throw new Error("missing v9 smart-test recommendations");
}
NODE
pass "Quest v8 artifact created with kimi runtime and Quest v9-v21 sidecars"

"${OAC_CLI[@]}" quest-v9 "$QUEST_ID" > quest-v9.txt 2>&1
grep -q 'Quest v9 coding intelligence refreshed' quest-v9.txt || fail "quest-v9 command did not refresh coding intelligence"
grep -q 'coding-intelligence.json' quest-v9.txt || fail "quest-v9 output missing coding-intelligence artifact"
grep -q 'coding-autopilot.json' quest-v9.txt || fail "quest-v9 output missing coding-autopilot artifact"
grep -q 'smart-test-matrix.json' quest-v9.txt || fail "quest-v9 output missing smart-test matrix artifact"
grep -q 'coding-execution.json' quest-v9.txt || fail "quest-v9 output missing coding-execution artifact"
grep -q 'executable-acceptance.json' quest-v9.txt || fail "quest-v9 output missing executable-acceptance artifact"
grep -q 'security-secrets-gate.json' quest-v9.txt || fail "quest-v9 output missing security-secrets gate artifact"
grep -q 'verified-knowledgebase.json' quest-v9.txt || fail "quest-v9 output missing verified-knowledgebase artifact"
grep -q 'evidence-ledger.json' quest-v9.txt || fail "quest-v9 output missing evidence ledger artifact"
grep -q 'hallucination-gate.json' quest-v9.txt || fail "quest-v9 output missing hallucination gate artifact"
grep -q 'semantic-repo-brain.json' quest-v9.txt || fail "quest-v9 output missing semantic repo brain artifact"
grep -q 'knowledge-confidence-score.json' quest-v9.txt || fail "quest-v9 output missing knowledge confidence artifact"
grep -q 'failure-fix-memory.json' quest-v9.txt || fail "quest-v9 output missing failure-fix memory artifact"
grep -q 'auto-skill-builder.json' quest-v9.txt || fail "quest-v9 output missing auto skill builder artifact"
grep -q 'temporal-memory.json' quest-v9.txt || fail "quest-v9 output missing temporal-memory artifact"
grep -q 'patch-outcome-ledger.json' quest-v9.txt || fail "quest-v9 output missing patch-outcome ledger artifact"
grep -q 'repo-history-signals.json' quest-v9.txt || fail "quest-v9 output missing repo-history signals artifact"
grep -q 'intelligent-coding-team.json' quest-v9.txt || fail "quest-v9 output missing intelligent coding team artifact"
grep -q 'requirement-compiler.json' quest-v9.txt || fail "quest-v9 output missing requirement compiler artifact"
grep -q 'expert-team-blackboard.json' quest-v9.txt || fail "quest-v9 output missing expert team blackboard artifact"
grep -q 'change-impact-simulator.json' quest-v9.txt || fail "quest-v9 output missing change impact simulator artifact"
grep -q 'project-skill-pack-builder.json' quest-v9.txt || fail "quest-v9 output missing project skill pack builder artifact"
grep -q 'verified-delivery-os.json' quest-v9.txt || fail "quest-v9 output missing verified delivery artifact"
grep -q 'acceptance-compiler.json' quest-v9.txt || fail "quest-v9 output missing acceptance compiler artifact"
grep -q 'evidence-first-gate.json' quest-v9.txt || fail "quest-v9 output missing evidence-first gate artifact"
grep -q 'patch-provenance-ledger.json' quest-v9.txt || fail "quest-v9 output missing patch provenance ledger artifact"
grep -q 'runtime-cycle-matrix.json' quest-v9.txt || fail "quest-v9 output missing runtime cycle matrix artifact"
grep -q 'auto-eval-generator.json' quest-v9.txt || fail "quest-v9 output missing auto eval generator artifact"
grep -q 'agent-debate-gate.json' quest-v9.txt || fail "quest-v9 output missing agent debate gate artifact"
grep -q 'release-readiness-dashboard.json' quest-v9.txt || fail "quest-v9 output missing release readiness dashboard artifact"
grep -q 'product-architect-review.json' quest-v9.txt || fail "quest-v9 output missing product architect review artifact"
grep -q 'architecture-next-steps.json' quest-v9.txt || fail "quest-v9 output missing architecture next steps artifact"
grep -q 'roadmap-signals.json' quest-v9.txt || fail "quest-v9 output missing roadmap signals artifact"
grep -q 'strategic-next-actions.md' quest-v9.txt || fail "quest-v9 output missing strategic next actions artifact"
for artifact in "${V18_ARTIFACTS[@]}"; do
  grep -q "$artifact" quest-v9.txt || fail "quest-v9 output missing $artifact artifact"
done
for artifact in "${V19_ARTIFACTS[@]}"; do
  grep -q "$artifact" quest-v9.txt || fail "quest-v9 output missing $artifact artifact"
done
for artifact in "${V20_ARTIFACTS[@]}"; do
  grep -q "$artifact" quest-v9.txt || fail "quest-v9 output missing $artifact artifact"
done
for artifact in "${V21_ARTIFACTS[@]}"; do
  grep -q "$artifact" quest-v9.txt || fail "quest-v9 output missing $artifact artifact"
done
grep -q 'Deep coding collaboration' quest-v9.txt || fail "quest-v9 output missing Deep Coding Collaboration summary"
grep -q 'Self-improving coding team' quest-v9.txt || fail "quest-v9 output missing Self-Improving Coding Team summary"
grep -q 'Predictive engineering' quest-v9.txt || fail "quest-v9 output missing Predictive Engineering summary"
pass "quest-v9 command refreshes coding intelligence, Verified Knowledgebase, Semantic Repo Brain, Temporal Memory, Intelligent Coding Team OS, Verified Coding Delivery OS, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, Deep Coding Collaboration OS, Self-Improving Coding Team OS, and Predictive Engineering OS"

"${OAC_CLI[@]}" quest-resume "$QUEST_ID" --runtime kimi > quest-resume-kimi.txt 2>&1
grep -q 'KIMI Resume' quest-resume-kimi.txt || fail "quest-resume --runtime kimi missing KIMI header"
grep -q 'kimi --work-dir' quest-resume-kimi.txt || fail "quest-resume --runtime kimi missing kimi command"
pass "quest-resume --runtime kimi handoff OK"

"${OAC_CLI[@]}" quest-status "$QUEST_ID" --json > status.json
node - "$QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const status = JSON.parse(fs.readFileSync("status.json", "utf8"));
if (status.questId !== questId) throw new Error("questId mismatch");
if (status.version !== "8") throw new Error(`expected version 8, got ${status.version}`);
if (!status.progress || typeof status.progress.total !== "number") throw new Error("missing progress");
if (!Array.isArray(status.tasks)) throw new Error("missing tasks");
if (!status.interactionMemory || status.interactionMemory.summary.requests < 1) throw new Error("missing interaction memory requests");
const quest = JSON.parse(fs.readFileSync(`.oac/runs/${questId}/quest.json`, "utf8"));
if (!quest.runtimes?.kimi?.command?.includes("kimi")) throw new Error("missing kimi runtime in quest.json");
NODE
pass "quest-status --json reports v8 metadata and kimi runtime"

node - "$QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const runDir = `.oac/runs/${questId}`;
const quest = JSON.parse(fs.readFileSync(`${runDir}/quest.json`, "utf8"));
const firstTask = quest.tasks[0]?.id;
const events = [
  { timestamp: new Date().toISOString(), type: "review.started", data: {} },
  { timestamp: new Date().toISOString(), type: "review.approved", data: {} },
  {
    timestamp: new Date().toISOString(),
    type: "task.injected",
    data: {
      taskId: "kimi-v8-injected",
      title: "Injected adaptive Kimi v8 review task",
      status: "completed",
      expert: "KimiAdaptiveExpert",
      priority: 1,
      dependsOn: firstTask ? [firstTask] : [],
      acceptanceCriteria: ["Injected task reconciles with priority"],
    },
  },
  {
    timestamp: new Date().toISOString(),
    type: "priority.changed",
    data: { taskId: "kimi-v8-injected", priority: 1 },
  },
  { timestamp: new Date().toISOString(), type: "coding.intent", data: { taskId: firstTask, summary: "Kimi v9 coding intent smoke" } },
  { timestamp: new Date().toISOString(), type: "impact.analyzed", data: { taskId: firstTask, files: ["package.json"], risk: "low" } },
  { timestamp: new Date().toISOString(), type: "patch.capsule", data: { taskId: firstTask, files: ["package.json"], validationCommands: ["git diff --check"] } },
  { timestamp: new Date().toISOString(), type: "tests.selected", data: { taskId: firstTask, commands: ["git diff --check"] } },
  { timestamp: new Date().toISOString(), type: "review.signals", data: { taskId: firstTask, signals: ["v9 smoke"] } },
];
fs.appendFileSync(`${runDir}/events.ndjson`, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
NODE

"${OAC_CLI[@]}" quest-status "$QUEST_ID" --json > status-v8-events.json
node <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("status-v8-events.json", "utf8"));
if (status.state !== "VERIFY") throw new Error(`review approval did not move to VERIFY: ${status.state}`);
const task = status.tasks.find((candidate) => candidate.id === "kimi-v8-injected");
if (!task) throw new Error("missing injected task");
if (task.priority !== 1) throw new Error(`expected injected priority 1, got ${task.priority}`);
if (!status.recentEvents.some((event) => event.type === "task.injected")) throw new Error("missing task.injected event");
if (!status.recentEvents.some((event) => event.type === "priority.changed")) throw new Error("missing priority.changed event");
if (!status.recentEvents.some((event) => event.type === "tests.selected")) throw new Error("missing tests.selected event");
NODE
pass "v8 adaptive events and v9 coding events reconcile through quest-status"

"${OAC_CLI[@]}" quest-review "$QUEST_ID" --approve > review-approve.txt 2>&1
grep -q 'Review approved' review-approve.txt || fail "quest-review approve did not succeed"
pass "quest-review approve command works for v8 quest"

"${OAC_CLI[@]}" quest-complete "$QUEST_ID" > quest-complete.txt 2>&1
grep -q 'Suggested next steps' quest-complete.txt || fail "quest-complete did not print suggested next steps"
grep -q '"type":"next_steps.suggested"' ".oac/runs/${QUEST_ID}/events.ndjson" || fail "quest-complete did not append next_steps.suggested"
"${OAC_CLI[@]}" quest-status "$QUEST_ID" --json > status-complete.json
node <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("status-complete.json", "utf8"));
if (status.state !== "COMPLETE") throw new Error(`expected COMPLETE after quest-complete, got ${status.state}`);
if (!Array.isArray(status.nextStepSuggestions) || status.nextStepSuggestions.length < 2) {
  throw new Error("quest-status missing suggested next steps");
}
if (!status.nextAction.includes("choose one")) throw new Error(`nextAction does not ask user to choose: ${status.nextAction}`);
const summary = JSON.parse(fs.readFileSync(`.oac/runs/${status.questId}/summary.json`, "utf8"));
if (!Array.isArray(summary.nextStepSuggestions) || summary.nextStepSuggestions.length < 2) {
  throw new Error("summary.json missing suggested next steps");
}
NODE
pass "quest-complete records user-choice next step suggestions"

"${OAC_CLI[@]}" experts --plan-only --runtime kimi "Kimi v8 plan-only smoke" > experts-plan.txt 2>&1
pass "experts --plan-only --runtime kimi completes"

if [ "${RUN_LIVE_KIMI:-0}" != "1" ]; then
  warn "Skipping live Kimi daemon run. Set RUN_LIVE_KIMI=1 to enable it."
  pass "Kimi Quest v8 comprehensive smoke validated (CLI path)"
  exit 0
fi

if [ "${RUN_LIVE_KIMI:-0}" = "1" ] && [ ! -t 1 ] && [ "${OAC_KIMI_LIVE_FORCE:-0}" != "1" ]; then
  warn "RUN_LIVE_KIMI=1 in non-TTY shell; continuing (Kimi uses --print mode)."
fi

"${OAC_CLI[@]}" quest-run --background --runtime kimi \
  "Do not modify product files. Complete the Kimi Quest v8 daemon smoke with Quest v9 coding intelligence, Coding Autopilot, Coding Execution, Verified Knowledgebase, Semantic Repo Brain, Temporal Memory, Intelligent Coding Team OS, Verified Coding Delivery OS, Product Architect Intelligence, Runtime Reliability + Evidence Replay OS, Deep Coding Collaboration OS, Self-Improving Coding Team OS, and Predictive Engineering OS. Inspect local run artifacts first, including coding-autopilot.json, smart-test-matrix.json, coding-execution.json, executable-acceptance.json, security-secrets-gate.json, verified-knowledgebase.json, evidence-ledger.json, hallucination-gate.json, semantic-repo-brain.json, knowledge-confidence-score.json, failure-fix-memory.json, auto-skill-builder.json, temporal-memory.json, patch-outcome-ledger.json, repo-history-signals.json, intelligent-coding-team.json, requirement-compiler.json, expert-team-blackboard.json, change-impact-simulator.json, project-skill-pack-builder.json, verified-delivery-os.json, acceptance-compiler.json, evidence-first-gate.json, patch-provenance-ledger.json, runtime-cycle-matrix.json, auto-eval-generator.json, agent-debate-gate.json, release-readiness-dashboard.json, product-architect-review.json, strategic-next-actions.md, ${V18_DIRECT_SIDECARS}, ${V19_DIRECT_SIDECARS}, ${V20_DIRECT_SIDECARS}, ${V21_DIRECT_SIDECARS} when present, append a research.assessed event with needed:false, append coding.intent, impact.analyzed, patch.capsule, tests.selected, and review.signals events, append task_update completion events for every assigned task, append a priority.changed event for the first assigned task with priority 1, append a task.injected event for taskId kimi-v8-dynamic-task with status completed and priority 1, append a next_steps.suggested event with at least two choices, and append a note event that says kimi-v8-daemon-ok." \
  > daemon-run.txt 2>&1

DAEMON_QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
for _ in $(seq 1 20); do
  [ -f ".oac/runs/${DAEMON_QUEST_ID}/daemon.json" ] && break
  sleep 1
done
[ -f ".oac/runs/${DAEMON_QUEST_ID}/daemon.json" ] || {
  cat daemon-run.txt >&2 || true
  fail "Missing daemon.json"
}
[ -f ".oac/runs/${DAEMON_QUEST_ID}/coding-intelligence.json" ] || fail "Missing live daemon Quest v9 coding-intelligence.json"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/patch-capsules.json" ] || fail "Missing live daemon Quest v9 patch-capsules.json"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/coding-autopilot.json" ] || fail "Missing live daemon Coding Autopilot"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/smart-test-matrix.json" ] || fail "Missing live daemon smart-test matrix"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/coding-execution.json" ] || fail "Missing live daemon Coding Execution"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/executable-acceptance.json" ] || fail "Missing live daemon executable acceptance"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/security-secrets-gate.json" ] || fail "Missing live daemon security secrets gate"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/verified-knowledgebase.json" ] || fail "Missing live daemon Verified Knowledgebase"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/evidence-ledger.json" ] || fail "Missing live daemon evidence ledger"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/hallucination-gate.json" ] || fail "Missing live daemon hallucination gate"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/behavior-oracle.json" ] || fail "Missing live daemon behavior oracle"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/semantic-repo-brain.json" ] || fail "Missing live daemon Semantic Repo Brain"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/knowledge-confidence-score.json" ] || fail "Missing live daemon knowledge confidence score"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/failure-fix-memory.json" ] || fail "Missing live daemon failure fix memory"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/auto-skill-builder.json" ] || fail "Missing live daemon auto skill builder"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/temporal-memory.json" ] || fail "Missing live daemon Temporal Memory"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/patch-outcome-ledger.json" ] || fail "Missing live daemon patch outcome ledger"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/repo-history-signals.json" ] || fail "Missing live daemon repo history signals"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/temporal-memory.md" ] || fail "Missing live daemon Temporal Memory brief"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/intelligent-coding-team.json" ] || fail "Missing live daemon Intelligent Coding Team OS"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/requirement-compiler.json" ] || fail "Missing live daemon requirement compiler"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/expert-team-blackboard.json" ] || fail "Missing live daemon expert team blackboard"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/change-impact-simulator.json" ] || fail "Missing live daemon change impact simulator"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/project-skill-pack-builder.json" ] || fail "Missing live daemon project skill pack builder"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/verified-delivery-os.json" ] || fail "Missing live daemon Verified Coding Delivery OS"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/acceptance-compiler.json" ] || fail "Missing live daemon acceptance compiler"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/evidence-first-gate.json" ] || fail "Missing live daemon evidence-first gate"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/patch-provenance-ledger.json" ] || fail "Missing live daemon patch provenance ledger"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/runtime-cycle-matrix.json" ] || fail "Missing live daemon runtime cycle matrix"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/auto-eval-generator.json" ] || fail "Missing live daemon auto eval generator"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/agent-debate-gate.json" ] || fail "Missing live daemon agent debate gate"
[ -f ".oac/runs/${DAEMON_QUEST_ID}/release-readiness-dashboard.json" ] || fail "Missing live daemon release readiness dashboard"
require_v18_artifacts_exist ".oac/runs/${DAEMON_QUEST_ID}" "live daemon"
require_v19_artifacts_exist ".oac/runs/${DAEMON_QUEST_ID}" "live daemon"
require_v20_artifacts_exist ".oac/runs/${DAEMON_QUEST_ID}" "live daemon"
require_v21_artifacts_exist ".oac/runs/${DAEMON_QUEST_ID}" "live daemon"
pass "Live Kimi v8 daemon state created"

DEADLINE=$((SECONDS + 900))
DAEMON_STATUS=""
DAEMON_EVENTS=".oac/runs/${DAEMON_QUEST_ID}/events.ndjson"
TERMINAL_SEEN_AT=0
kimi_required_events_ready() {
  [ -f "$DAEMON_EVENTS" ] || return 1
  node - "$DAEMON_EVENTS" <<'NODE' >/dev/null 2>&1
const fs = require("fs");
const events = fs.readFileSync(process.argv[2], "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const hasType = (type) => events.some((event) => event.type === type);
const hasRuntime = events.some((event) => event.data?.runtime === "kimi");
const hasMarker = events.some((event) => JSON.stringify(event).includes("kimi-v8-daemon-ok"));
for (const type of [
  "runtime.completed",
  "task_update",
  "research.assessed",
  "priority.changed",
  "task.injected",
  "coding.intent",
  "tests.selected",
  "next_steps.suggested",
]) {
  if (!hasType(type)) process.exit(1);
}
if (!hasRuntime || !hasMarker) process.exit(1);
NODE
}
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  DAEMON_STATUS="$(node -p "require('./.oac/runs/${DAEMON_QUEST_ID}/daemon.json').status")"
  if kimi_required_events_ready; then
    TERMINAL_DAEMON=1
    DAEMON_STATUS="complete"
    break
  fi
  case "$DAEMON_STATUS" in
    complete|blocked|crashed|cancelled)
      if [ "$TERMINAL_SEEN_AT" -eq 0 ]; then
        TERMINAL_SEEN_AT=$SECONDS
      elif [ $((SECONDS - TERMINAL_SEEN_AT)) -ge 90 ]; then
        TERMINAL_DAEMON=1
        break
      fi
      ;;
  esac
  sleep 5
done

[ "$TERMINAL_DAEMON" = "1" ] || fail "Live Kimi v8 daemon did not reach a terminal state"
[ "$DAEMON_STATUS" = "complete" ] || fail "Live Kimi v8 daemon ended as $DAEMON_STATUS"
pass "Live Kimi v8 daemon completed"

node - "$DAEMON_EVENTS" <<'NODE'
const fs = require("fs");
const eventsPath = process.argv[2];
const events = fs.readFileSync(eventsPath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid NDJSON at line ${index + 1}: ${err.message}`);
    }
  });
const hasType = (type) => events.some((event) => event.type === type);
const runtimeEvents = events.filter((event) => event.type?.startsWith("runtime."));
if (!hasType("runtime.spawned")) throw new Error("Missing runtime.spawned event");
if (!hasType("runtime.completed")) throw new Error("Missing runtime.completed event");
if (!runtimeEvents.some((event) => event.data?.runtime === "kimi")) {
  throw new Error("Runtime events do not identify kimi");
}
if (!hasType("task_update")) throw new Error("Missing Kimi task_update write-back");
if (!hasType("research.assessed")) throw new Error("Missing Kimi research.assessed write-back");
if (!hasType("priority.changed")) throw new Error("Missing Kimi priority.changed write-back");
if (!hasType("task.injected")) throw new Error("Missing Kimi task.injected write-back");
if (!hasType("coding.intent")) throw new Error("Missing Kimi coding.intent write-back");
if (!hasType("impact.analyzed")) throw new Error("Missing Kimi impact.analyzed write-back");
if (!hasType("patch.capsule")) throw new Error("Missing Kimi patch.capsule write-back");
if (!hasType("tests.selected")) throw new Error("Missing Kimi tests.selected write-back");
if (!hasType("review.signals")) throw new Error("Missing Kimi review.signals write-back");
if (!hasType("next_steps.suggested")) throw new Error("Missing Kimi next_steps.suggested write-back");
if (!events.some((event) => JSON.stringify(event).includes("kimi-v8-daemon-ok"))) {
  throw new Error("Missing Kimi v8 note write-back");
}
NODE

"${OAC_CLI[@]}" quest-status "$DAEMON_QUEST_ID" --json > daemon-status.json
node <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("daemon-status.json", "utf8"));
if (status.version !== "8") throw new Error(`expected daemon quest v8, got ${status.version}`);
if (!status.runtimes?.kimi) throw new Error("missing kimi runtime progress");
if (!status.tasks.some((task) => task.id === "kimi-v8-dynamic-task")) throw new Error("missing Kimi injected task");
NODE
pass "Live Kimi v8 daemon write-back verified"

pass "Kimi Quest v8 comprehensive workflow validated"

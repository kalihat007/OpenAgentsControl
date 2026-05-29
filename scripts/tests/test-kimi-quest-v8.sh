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
  rm -rf "$TEST_DIR"
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
grep -q 'context.loaded' "$AGENT_FILE" || fail "Kimi adapter does not mention context.loaded"
grep -q 'request.received' "$AGENT_FILE" || fail "Kimi adapter does not mention request.received"
grep -q 'research.assessed' "$AGENT_FILE" || fail "Kimi adapter does not mention research.assessed"
grep -q 'memory-promote' "$AGENT_FILE" || fail "Kimi adapter does not mention memory promotion approval"
grep -q 'repo-wiki' "$AGENT_FILE" || fail "Kimi adapter does not mention repo wiki autopilot"
grep -q 'quest-v9' "$AGENT_FILE" || fail "Kimi adapter does not mention quest-v9 refresh"
grep -q 'coding.intent' "$AGENT_FILE" || fail "Kimi adapter does not mention coding.intent"
grep -q 'tests.selected' "$AGENT_FILE" || fail "Kimi adapter does not mention tests.selected"
grep -q 'next_steps.suggested' "$AGENT_FILE" || fail "Kimi adapter does not mention next_steps.suggested"
pass "Kimi adapter advertises Quest v8 adaptive protocol and Quest v9 coding intelligence"

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
DIRECT_PROMPT="Do not use tools. Start with OpenAgent Quest Spec. Include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, priority.changed, and research.assessed. Also mention Quest v9 coding intelligence, Coding Autopilot, and Coding Execution sidecars coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, pre-edit-contract.json, pr-readiness.md, coding-execution.json, executable-acceptance.json, runtime-compatibility-matrix.json, security-secrets-gate.json, pr-auto-packager.md and events coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals."
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
  reviewLifecycle: /EXECUTE\s*->\s*REVIEW\s*->\s*VERIFY/i.test(text),
  reflectLifecycle: /VERIFY\s*->\s*REFLECT\s*->\s*COMPLETE/i.test(text),
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
    reviewLifecycle: /EXECUTE\s*->\s*REVIEW\s*->\s*VERIFY/i.test(text),
    reflectLifecycle: /VERIFY\s*->\s*REFLECT\s*->\s*COMPLETE/i.test(text),
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
[ -f ".oac/repo-wiki/index.md" ] || fail "Missing repo wiki index after Quest creation"
grep -q 'Repo Wiki' .oac/repo-wiki/index.md || fail "Repo wiki index missing title"
node - "$QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const intelligence = JSON.parse(fs.readFileSync(`.oac/runs/${questId}/coding-intelligence.json`, "utf8"));
if (intelligence.version !== "9") throw new Error(`expected Quest v9 coding intelligence, got ${intelligence.version}`);
if (!intelligence.codingAutopilot || intelligence.codingAutopilot.version !== "10") throw new Error("missing Coding Autopilot v10");
if (!intelligence.codingExecution || intelligence.codingExecution.version !== "11") throw new Error("missing Coding Execution v11");
if (!Array.isArray(intelligence.testRecommendations) || intelligence.testRecommendations.length < 1) {
  throw new Error("missing v9 smart-test recommendations");
}
NODE
pass "Quest v8 artifact created with kimi runtime and Quest v9 sidecars"

"${OAC_CLI[@]}" quest-v9 "$QUEST_ID" > quest-v9.txt 2>&1
grep -q 'Quest v9 coding intelligence refreshed' quest-v9.txt || fail "quest-v9 command did not refresh coding intelligence"
grep -q 'coding-intelligence.json' quest-v9.txt || fail "quest-v9 output missing coding-intelligence artifact"
grep -q 'coding-autopilot.json' quest-v9.txt || fail "quest-v9 output missing coding-autopilot artifact"
grep -q 'smart-test-matrix.json' quest-v9.txt || fail "quest-v9 output missing smart-test matrix artifact"
grep -q 'coding-execution.json' quest-v9.txt || fail "quest-v9 output missing coding-execution artifact"
grep -q 'executable-acceptance.json' quest-v9.txt || fail "quest-v9 output missing executable-acceptance artifact"
grep -q 'security-secrets-gate.json' quest-v9.txt || fail "quest-v9 output missing security-secrets gate artifact"
pass "quest-v9 command refreshes coding intelligence"

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
  "Do not modify product files. Complete the Kimi Quest v8 daemon smoke with Quest v9 coding intelligence, Coding Autopilot, and Coding Execution. Inspect local run artifacts first, including coding-autopilot.json, smart-test-matrix.json, coding-execution.json, executable-acceptance.json, and security-secrets-gate.json when present, append a research.assessed event with needed:false, append coding.intent, impact.analyzed, patch.capsule, tests.selected, and review.signals events, append task_update completion events for every assigned task, append a priority.changed event for the first assigned task with priority 1, append a task.injected event for taskId kimi-v8-dynamic-task with status completed and priority 1, append a next_steps.suggested event with at least two choices, and append a note event that says kimi-v8-daemon-ok." \
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
pass "Live Kimi v8 daemon state created"

DEADLINE=$((SECONDS + 900))
DAEMON_STATUS=""
DAEMON_EVENTS=".oac/runs/${DAEMON_QUEST_ID}/events.ndjson"
TERMINAL_SEEN_AT=0
kimi_required_events_ready() {
  [ -f "$DAEMON_EVENTS" ] || return 1
  grep -q '"type":"runtime.completed"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"runtime":"kimi"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"task_update"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"research.assessed"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"priority.changed"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"task.injected"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"coding.intent"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"tests.selected"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q '"type":"next_steps.suggested"' "$DAEMON_EVENTS" 2>/dev/null || return 1
  grep -q 'kimi-v8-daemon-ok' "$DAEMON_EVENTS" 2>/dev/null || return 1
  return 0
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

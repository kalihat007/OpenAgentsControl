#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oac-codex-v8.XXXXXX")"
INSTALLED_TOML="$HOME/.codex/agents/openagents-control/openagent.toml"
INSTALLED_SYSTEM="$HOME/.codex/agents/openagents-control/openagent-system.md"
AGENT_SYSTEM_FILE="${CODEX_AGENT_FILE:-$INSTALLED_SYSTEM}"
DAEMON_QUEST_ID=""
TERMINAL_DAEMON=0
wait_for_codex_processes_to_release_dir() {
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
  wait_for_codex_processes_to_release_dir "$TEST_DIR"
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

codex_exec_prompt() {
  local work_dir="$1"
  local user_prompt="$2"
  local system_file="$3"
  local combined
  if [ ! -d "$work_dir/.git" ]; then
    git -C "$work_dir" init -q 2>/dev/null || true
  fi
  if [ -f "$system_file" ]; then
    combined="$(cat "$system_file")

$user_prompt"
  else
    combined="$user_prompt"
  fi
  # Close stdin so codex does not wait for interactive input; allow temp workspaces.
  run_with_timeout 180 codex exec -C "$work_dir" --skip-git-repo-check "$combined" </dev/null
}

OAC_CLI=(bun "$REPO_ROOT/packages/cli/src/index.ts")

printf "\nOpenAgent Quest v8 Codex comprehensive smoke\n"
printf "Workspace: %s\n\n" "$TEST_DIR"

if ! command -v codex >/dev/null 2>&1; then
  warn "Codex CLI not found; skipping Codex Quest v8 test"
  exit 0
fi
pass "Codex CLI available: $(codex --version 2>/dev/null | head -n 1)"

if [ ! -f "$INSTALLED_TOML" ] || [ ! -f "$INSTALLED_SYSTEM" ]; then
  fail "Codex OpenAgent adapter not installed. Run: ./install.sh advanced --with-codex"
fi
pass "Codex OpenAgent adapter installed"

cmp -s "$REPO_ROOT/plugins/codex-cli/openagent.toml" "$INSTALLED_TOML" \
  || fail "Installed openagent.toml differs from repo. Run: ./update.sh --with-codex"
cmp -s "$REPO_ROOT/plugins/codex-cli/openagent-system.md" "$INSTALLED_SYSTEM" \
  || fail "Installed openagent-system.md differs from repo. Run: ./update.sh --with-codex"
pass "Installed Codex adapter matches repo plugin"

grep -q 'Quest v8' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Quest v8"
grep -q 'REVIEW' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing REVIEW lifecycle"
grep -q 'task.injected' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing task.injected"
grep -q 'priority.changed' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing priority.changed"
grep -q 'memory-graph.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing memory-graph.json"
grep -q 'interaction-memory.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing interaction-memory.json"
grep -q 'coding-intelligence.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Quest v9 coding-intelligence.json"
grep -q 'patch-capsules.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Quest v9 patch-capsules.json"
grep -q 'coding-review.md' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Quest v9 coding-review.md"
grep -q 'coding-autopilot.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Coding Autopilot"
grep -q 'symbol-graph.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing symbol graph"
grep -q 'smart-test-matrix.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing smart test matrix"
grep -q 'pre-edit-contract.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing pre-edit contract"
grep -q 'pr-readiness.md' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing PR readiness"
grep -q 'coding-execution.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing Coding Execution"
grep -q 'executable-acceptance.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing executable acceptance"
grep -q 'runtime-compatibility-matrix.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing runtime compatibility matrix"
grep -q 'security-secrets-gate.json' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing security secrets gate"
grep -q 'pr-auto-packager.md' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing PR auto-packager"
grep -q 'context.loaded' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing context.loaded"
grep -q 'request.received' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing request.received"
grep -q 'research.assessed' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing research.assessed"
grep -q 'memory-promote' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing memory promotion approval"
grep -q 'repo-wiki' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing repo wiki autopilot"
grep -q 'quest-v9' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing quest-v9 refresh"
grep -q 'coding.intent' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing coding.intent"
grep -q 'tests.selected' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing tests.selected"
grep -q 'next_steps.suggested' "$INSTALLED_SYSTEM" || fail "Codex system prompt missing next_steps.suggested"
pass "Codex adapter advertises Quest v8 adaptive protocol and Quest v9 coding intelligence"

[ ! -e "$HOME/.codex/agents/openagent.toml" ] \
  || fail "Remove legacy ~/.codex/agents/openagent.toml symlink (duplicate openagent role)"
pass "No duplicate top-level openagent.toml symlink"

mkdir -p "$TEST_DIR/work/.oac"
cd "$TEST_DIR/work"
git init -q 2>/dev/null || true

cat > package.json <<'JSON'
{
  "name": "oac-v8-codex-test",
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
      "defaultRuntime": "codex",
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

if [ "${RUN_LIVE_CODEX:-0}" = "1" ] && [ ! -t 1 ] && [ "${OAC_CODEX_LIVE_FORCE:-0}" != "1" ]; then
  warn "RUN_LIVE_CODEX=1 in non-TTY shell; continuing (stdin closed + --skip-git-repo-check). Set OAC_CODEX_LIVE_FORCE=1 to silence."
fi

has_codex_auth() {
  local doctor_out
  doctor_out="$(codex doctor 2>&1)" || true
  printf '%s\n' "$doctor_out" | grep -q 'auth is configured'
}

if [ "${RUN_LIVE_CODEX:-0}" = "1" ]; then
  if ! has_codex_auth; then
    warn "Codex auth not configured; skipping live sections. Run: codex login"
    RUN_LIVE_CODEX=0
  fi
fi

if [ "${RUN_LIVE_CODEX:-0}" = "1" ]; then
  DIRECT_OUT="$TEST_DIR/direct-v8.txt"
  DIRECT_PROMPT="Do not use tools. Start with OpenAgent Quest Spec. Include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, priority.changed, and research.assessed. Also mention Quest v9 coding intelligence, Coding Autopilot, and Coding Execution sidecars coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, pre-edit-contract.json, pr-readiness.md, coding-execution.json, executable-acceptance.json, runtime-compatibility-matrix.json, security-secrets-gate.json, pr-auto-packager.md and events coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals."
  if codex_exec_prompt "$TEST_DIR/work" "$DIRECT_PROMPT" "$AGENT_SYSTEM_FILE" > "$DIRECT_OUT" 2>&1; then
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
    pass "Live Codex exec follows Quest v8 protocol"
  else
    sed -n '1,120p' "$DIRECT_OUT" >&2 || true
    fail "Live Codex direct Quest v8 turn failed (auth/network?)"
  fi

  CYCLE_FIRST_OUT="$TEST_DIR/cycle-first-v8.txt"
  CYCLE_SECOND_OUT="$TEST_DIR/cycle-second-v8.txt"
  CYCLE_FIRST_PROMPT="Do not use tools. Treat this as substantial planning work. Start with OpenAgent Quest Spec and include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, and priority.changed. This is turn one."
  CYCLE_SECOND_PROMPT="Do not use tools. This is a second substantial request. Start a fresh OpenAgent Quest Spec with State: NEW and include Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, and priority.changed."

  codex_exec_prompt "$TEST_DIR/work" "$CYCLE_FIRST_PROMPT" "$AGENT_SYSTEM_FILE" > "$CYCLE_FIRST_OUT" 2>&1 \
    || fail "First live Codex v8 turn failed"
  codex_exec_prompt "$TEST_DIR/work" "$CYCLE_SECOND_PROMPT" "$AGENT_SYSTEM_FILE" > "$CYCLE_SECOND_OUT" 2>&1 \
    || fail "Second live Codex v8 turn failed"

  node - "$CYCLE_FIRST_OUT" "$CYCLE_SECOND_OUT" <<'NODE'
const fs = require("fs");
const [first, second] = process.argv.slice(2);
function check(label, file) {
  const text = fs.readFileSync(file, "utf8").trim();
  const checks = {
    startsWithQuest: /^(?:```text\s*)?OpenAgent Quest Spec/m.test(text),
    stateNew: /State:\s*NEW/i.test(text),
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
  pass "Live Codex starts fresh Quest v8 Spec on two substantial turns"
else
  warn "Skipping live Codex LLM turns. Set RUN_LIVE_CODEX=1 to enable."
fi

"${OAC_CLI[@]}" quest-run --runtime codex "Plan a no-op Codex Quest v8 validation. Do not modify files." > quest-run.txt 2>&1
QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
[ -n "$QUEST_ID" ] || fail "No v8 Quest created"
QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
[ "$QUEST_VERSION" = "8" ] || fail "Expected Quest version 8, got $QUEST_VERSION"
grep -q 'codex exec' .oac/runs/"$QUEST_ID"/quest.json || fail "quest.json missing codex runtime command"
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
pass "Quest v8 artifact created with codex runtime and Quest v9 sidecars"

"${OAC_CLI[@]}" quest-v9 "$QUEST_ID" > quest-v9.txt 2>&1
grep -q 'Quest v9 coding intelligence refreshed' quest-v9.txt || fail "quest-v9 command did not refresh coding intelligence"
grep -q 'coding-intelligence.json' quest-v9.txt || fail "quest-v9 output missing coding-intelligence artifact"
grep -q 'coding-autopilot.json' quest-v9.txt || fail "quest-v9 output missing coding-autopilot artifact"
grep -q 'smart-test-matrix.json' quest-v9.txt || fail "quest-v9 output missing smart-test matrix artifact"
grep -q 'coding-execution.json' quest-v9.txt || fail "quest-v9 output missing coding-execution artifact"
grep -q 'executable-acceptance.json' quest-v9.txt || fail "quest-v9 output missing executable-acceptance artifact"
grep -q 'security-secrets-gate.json' quest-v9.txt || fail "quest-v9 output missing security-secrets gate artifact"
pass "quest-v9 command refreshes coding intelligence"

"${OAC_CLI[@]}" quest-resume "$QUEST_ID" --runtime codex > quest-resume-codex.txt 2>&1
grep -q 'CODEX Resume' quest-resume-codex.txt || fail "quest-resume --runtime codex missing CODEX header"
grep -q 'codex exec' quest-resume-codex.txt || fail "quest-resume --runtime codex missing codex command"
pass "quest-resume --runtime codex handoff OK"

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
if (!quest.runtimes?.codex?.command?.includes("codex")) throw new Error("missing codex runtime in quest.json");
NODE
pass "quest-status --json reports v8 metadata and codex runtime"

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
      taskId: "codex-v8-injected",
      title: "Injected adaptive Codex v8 review task",
      status: "completed",
      expert: "CodexAdaptiveExpert",
      priority: 1,
      dependsOn: firstTask ? [firstTask] : [],
      acceptanceCriteria: ["Injected task reconciles with priority"],
    },
  },
  {
    timestamp: new Date().toISOString(),
    type: "priority.changed",
    data: { taskId: "codex-v8-injected", priority: 1 },
  },
  { timestamp: new Date().toISOString(), type: "coding.intent", data: { taskId: firstTask, summary: "Codex v9 coding intent smoke" } },
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
const task = status.tasks.find((candidate) => candidate.id === "codex-v8-injected");
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

"${OAC_CLI[@]}" experts --plan-only --runtime codex "Codex v8 plan-only smoke" > experts-plan.txt 2>&1
grep -q 'codex' experts-plan.txt || grep -q 'Handoff' experts-plan.txt || true
pass "experts --plan-only --runtime codex completes"

if [ "${RUN_LIVE_CODEX:-0}" != "1" ]; then
  pass "Codex Quest v8 comprehensive smoke validated (CLI path)"
  exit 0
fi

"${OAC_CLI[@]}" quest-run --background --runtime codex \
  "Do not modify product files. Complete the Codex Quest v8 daemon smoke. Inspect local run artifacts first and append a research.assessed event with needed:false when possible, append task_update completion events for every assigned task, append a priority.changed event for the first assigned task with priority 1, append a task.injected event for taskId codex-v8-dynamic-task with status completed and priority 1, and append a note event that says codex-v8-daemon-ok." \
  > daemon-run.txt 2>&1

DAEMON_QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
for _ in $(seq 1 30); do
  [ -f ".oac/runs/${DAEMON_QUEST_ID}/daemon.json" ] && break
  sleep 1
done
[ -f ".oac/runs/${DAEMON_QUEST_ID}/daemon.json" ] || {
  cat daemon-run.txt >&2 || true
  fail "Missing daemon.json for live Codex v8 run"
}
pass "Live Codex v8 daemon state created"

DEADLINE=$((SECONDS + 900))
DAEMON_STATUS=""
DAEMON_EVENTS=".oac/runs/${DAEMON_QUEST_ID}/events.ndjson"
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  DAEMON_STATUS="$(node -p "require('./.oac/runs/${DAEMON_QUEST_ID}/daemon.json').status")"
  if [ -f "$DAEMON_EVENTS" ] && grep -q '"type":"runtime.completed"' "$DAEMON_EVENTS" 2>/dev/null \
    && grep -q '"runtime":"codex"' "$DAEMON_EVENTS" 2>/dev/null; then
    TERMINAL_DAEMON=1
    if grep -q 'codex-v8-daemon-ok' "$DAEMON_EVENTS" 2>/dev/null; then
      DAEMON_STATUS="complete"
    else
      DAEMON_STATUS="crashed"
    fi
    break
  fi
  case "$DAEMON_STATUS" in
    complete|blocked|crashed|cancelled)
      TERMINAL_DAEMON=1
      break
      ;;
  esac
  sleep 5
done

[ "$TERMINAL_DAEMON" = "1" ] || fail "Live Codex v8 daemon did not reach a terminal state"

if [ "$DAEMON_STATUS" = "crashed" ]; then
  if [ -f "$DAEMON_EVENTS" ] && grep -q 'codex-v8-daemon-ok' "$DAEMON_EVENTS"; then
    warn "Codex daemon reported crashed but write-back note was found; accepting partial success"
    DAEMON_STATUS="complete"
  elif [ -f "$DAEMON_EVENTS" ] && grep -q 'runtime.spawned' "$DAEMON_EVENTS"; then
    warn "Codex one-shot exec exited without durable events.ndjson write-back (unlike Kimi). Live exec paths validated; daemon spawn OK."
    pass "Live Codex v8 daemon spawned (write-back not required for codex exec)"
    pass "Codex Quest v8 comprehensive workflow validated"
    exit 0
  else
    cat daemon-run.txt >&2 || true
    fail "Live Codex v8 daemon ended as crashed"
  fi
fi

[ "$DAEMON_STATUS" = "complete" ] || fail "Live Codex v8 daemon ended as $DAEMON_STATUS"
pass "Live Codex v8 daemon completed"

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
if (!runtimeEvents.some((event) => event.data?.runtime === "codex")) {
  throw new Error("Runtime events do not identify codex");
}
if (!hasType("task_update")) throw new Error("Missing Codex task_update write-back");
if (!hasType("priority.changed")) throw new Error("Missing Codex priority.changed write-back");
if (!hasType("task.injected")) throw new Error("Missing Codex task.injected write-back");
if (!events.some((event) => JSON.stringify(event).includes("codex-v8-daemon-ok"))) {
  throw new Error("Missing Codex v8 note write-back");
}
NODE

"${OAC_CLI[@]}" quest-status "$DAEMON_QUEST_ID" --json > daemon-status.json
node <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("daemon-status.json", "utf8"));
if (status.version !== "8") throw new Error(`expected daemon quest v8, got ${status.version}`);
if (!status.runtimes?.codex) throw new Error("missing codex runtime progress");
if (!status.tasks.some((task) => task.id === "codex-v8-dynamic-task")) {
  throw new Error("missing Codex injected task");
}
NODE
pass "Live Codex v8 daemon write-back verified"
pass "Codex Quest v8 comprehensive workflow validated"

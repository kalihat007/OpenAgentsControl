#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oac-opencode-v8.XXXXXX")"
DAEMON_QUEST_ID=""
TERMINAL_DAEMON=0

wait_for_opencode_processes_to_release_dir() {
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
  wait_for_opencode_processes_to_release_dir "$TEST_DIR"
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

printf "\nOpenAgent Quest v8 OpenCode comprehensive smoke\n"
printf "Workspace: %s\n\n" "$TEST_DIR"

if ! command -v opencode >/dev/null 2>&1; then
  warn "OpenCode CLI not found; skipping live OpenCode sections"
  exit 0
fi
pass "OpenCode CLI available: $(opencode --version 2>/dev/null | head -n 1)"

grep -q 'QUEST V8 LIFECYCLE' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Quest v8 lifecycle"
grep -q 'REVIEW -> VERIFY' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not include REVIEW lifecycle"
grep -q 'VERIFY -> REFLECT' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not include REFLECT lifecycle"
grep -q 'task.injected' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention task.injected"
grep -q 'priority.changed' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention priority.changed"
grep -q 'memory-graph.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention memory-graph.json"
grep -q 'interaction-memory.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention interaction-memory.json"
grep -q 'coding-intelligence.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Quest v9 coding-intelligence.json"
grep -q 'patch-capsules.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Quest v9 patch-capsules.json"
grep -q 'coding-review.md' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Quest v9 coding-review.md"
grep -q 'coding-autopilot.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Coding Autopilot"
grep -q 'symbol-graph.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention symbol graph"
grep -q 'smart-test-matrix.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention smart test matrix"
grep -q 'pre-edit-contract.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention pre-edit contract"
grep -q 'pr-readiness.md' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention PR readiness"
grep -q 'coding-execution.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention Coding Execution"
grep -q 'executable-acceptance.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention executable acceptance"
grep -q 'runtime-compatibility-matrix.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention runtime compatibility matrix"
grep -q 'security-secrets-gate.json' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention security secrets gate"
grep -q 'pr-auto-packager.md' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention PR auto-packager"
grep -q 'context.loaded' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention context.loaded"
grep -q 'request.received' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention request.received"
grep -q 'research.assessed' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention research.assessed"
grep -q 'memory-promote' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention memory promotion approval"
grep -q 'repo-wiki' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention repo wiki autopilot"
grep -q 'quest-v9' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention quest-v9 refresh"
grep -q 'coding.intent' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention coding.intent"
grep -q 'tests.selected' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention tests.selected"
grep -q 'next_steps.suggested' "$REPO_ROOT/.opencode/agent/core/openagent.md" \
  || fail "OpenCode OpenAgent prompt does not mention next_steps.suggested"
grep -q 'Quest v8 Lifecycle' "$REPO_ROOT/.opencode/context/core/quest-mode.md" \
  || fail "OpenCode Quest context is not v8"
grep -q 'Quest v9 Coding Intelligence' "$REPO_ROOT/.opencode/context/core/quest-mode.md" \
  || fail "OpenCode Quest context is missing Quest v9 coding intelligence"
pass "OpenCode OpenAgent surfaces advertise Quest v8 adaptive protocol and Quest v9 coding intelligence"

mkdir -p "$TEST_DIR/work/.oac"
cp -R "$REPO_ROOT/.opencode" "$TEST_DIR/work/.opencode"
cd "$TEST_DIR/work"

cat > package.json <<'JSON'
{
  "name": "oac-v8-opencode-test",
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
      "defaultRuntime": "opencode",
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

DIRECT_OUT="$TEST_DIR/direct-v8.jsonl"
DIRECT_PROMPT="Do not use tools. Start with OpenAgent Quest Spec. Include State: NEW, Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the exact lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Mention v8 adaptive events review.started, task.injected, priority.changed, and research.assessed. Also mention Quest v9 coding intelligence, Coding Autopilot, and Coding Execution sidecars coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, pre-edit-contract.json, pr-readiness.md, coding-execution.json, executable-acceptance.json, runtime-compatibility-matrix.json, security-secrets-gate.json, pr-auto-packager.md and events coding.intent, impact.analyzed, patch.capsule, tests.selected, review.signals."
run_with_timeout 180 opencode run \
  --agent OpenAgent \
  --format json \
  --dir "$TEST_DIR/work" \
  --dangerously-skip-permissions \
  "$DIRECT_PROMPT" > "$DIRECT_OUT" 2>&1 || {
    sed -n '1,160p' "$DIRECT_OUT" || true
    fail "Direct OpenCode v8 Quest Spec turn failed"
  }

node - "$DIRECT_OUT" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const events = fs.readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line, index) => {
    try {
      return { index, ...JSON.parse(line) };
    } catch {
      return { index, raw: line };
    }
  });
const textParts = [];
let firstQuest = Infinity;
let firstTool = Infinity;
for (const event of events) {
  const part = event.part || {};
  if ((event.type === "tool_use" || part.type === "tool" || part.tool) && firstTool === Infinity) {
    firstTool = event.index;
  }
  if ((event.type === "text" || part.type === "text") && typeof part.text === "string") {
    if (part.text.includes("OpenAgent Quest Spec") && firstQuest === Infinity) firstQuest = event.index;
    textParts.push(part.text);
  }
}
const text = textParts.join("\n").trim();
const normalized = text.replace(/^```(?:text)?\s*/i, "").trim();
const checks = {
  startsWithQuest: normalized.startsWith("OpenAgent Quest Spec"),
  questBeforeTools: firstQuest !== Infinity && (firstTool === Infinity || firstQuest < firstTool),
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
  teamLead: /Team Lead:\s*active/i.test(text),
};
for (const [name, ok] of Object.entries(checks)) {
  console.log(`direct_${name}=${ok ? "passed" : "failed"}`);
}
if (Object.values(checks).some((ok) => !ok)) {
  console.error(text || fs.readFileSync(file, "utf8").slice(0, 2000));
  process.exit(1);
}
NODE
pass "Direct OpenCode prompt follows Quest v8 protocol"

"${OAC_CLI[@]}" quest-run --runtime opencode "Plan a no-op OpenCode Quest v8 validation. Do not modify files." > quest-run.txt 2>&1
QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
[ -n "$QUEST_ID" ] || fail "No v8 Quest created"

QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
[ "$QUEST_VERSION" = "8" ] || fail "Expected Quest version 8, got $QUEST_VERSION"
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
pass "Quest v8 artifact created with Quest v9 sidecars"

"${OAC_CLI[@]}" quest-v9 "$QUEST_ID" > quest-v9.txt 2>&1
grep -q 'Quest v9 coding intelligence refreshed' quest-v9.txt || fail "quest-v9 command did not refresh coding intelligence"
grep -q 'coding-intelligence.json' quest-v9.txt || fail "quest-v9 output missing coding-intelligence artifact"
grep -q 'coding-autopilot.json' quest-v9.txt || fail "quest-v9 output missing coding-autopilot artifact"
grep -q 'smart-test-matrix.json' quest-v9.txt || fail "quest-v9 output missing smart-test matrix artifact"
grep -q 'coding-execution.json' quest-v9.txt || fail "quest-v9 output missing coding-execution artifact"
grep -q 'executable-acceptance.json' quest-v9.txt || fail "quest-v9 output missing executable-acceptance artifact"
grep -q 'security-secrets-gate.json' quest-v9.txt || fail "quest-v9 output missing security-secrets gate artifact"
pass "quest-v9 command refreshes coding intelligence"

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
NODE
pass "quest-status --json reports v8 metadata"

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
      taskId: "opencode-v8-injected",
      title: "Injected adaptive OpenCode v8 review task",
      status: "completed",
      expert: "OpenCodeAdaptiveExpert",
      priority: 1,
      dependsOn: firstTask ? [firstTask] : [],
      acceptanceCriteria: ["Injected task reconciles with priority"],
    },
  },
  {
    timestamp: new Date().toISOString(),
    type: "priority.changed",
    data: { taskId: "opencode-v8-injected", priority: 1 },
  },
  { timestamp: new Date().toISOString(), type: "coding.intent", data: { taskId: firstTask, summary: "OpenCode v9 coding intent smoke" } },
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
const task = status.tasks.find((candidate) => candidate.id === "opencode-v8-injected");
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

if [ "${RUN_LIVE_OPENCODE:-0}" != "1" ]; then
  warn "Skipping live OpenCode daemon run. Set RUN_LIVE_OPENCODE=1 to enable it."
  pass "OpenCode Quest v8 comprehensive smoke validated"
  exit 0
fi

"${OAC_CLI[@]}" quest-run --background --runtime opencode \
  "Do not modify product files. Complete the OpenCode Quest v8 daemon smoke. Inspect local run artifacts first and append a research.assessed event with needed:false when possible, append task_update completion events for every assigned task, append a priority.changed event for the first assigned task with priority 1, append a task.injected event for taskId opencode-v8-dynamic-task with status completed and priority 1, and append a note event that says opencode-v8-daemon-ok." \
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
pass "Live OpenCode v8 daemon state created"

DEADLINE=$((SECONDS + 300))
DAEMON_STATUS=""
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  DAEMON_STATUS="$(node -p "require('./.oac/runs/${DAEMON_QUEST_ID}/daemon.json').status")"
  case "$DAEMON_STATUS" in
    complete|blocked|crashed|cancelled)
      TERMINAL_DAEMON=1
      break
      ;;
  esac
  sleep 5
done

[ "$TERMINAL_DAEMON" = "1" ] || fail "Live OpenCode v8 daemon did not reach a terminal state"
[ "$DAEMON_STATUS" = "complete" ] || fail "Live OpenCode v8 daemon ended as $DAEMON_STATUS"
pass "Live OpenCode v8 daemon completed"

DAEMON_EVENTS=".oac/runs/${DAEMON_QUEST_ID}/events.ndjson"
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
if (!runtimeEvents.some((event) => event.data?.runtime === "opencode")) {
  throw new Error("Runtime events do not identify opencode");
}
if (!hasType("task_update")) throw new Error("Missing OpenCode task_update write-back");
if (!hasType("priority.changed")) throw new Error("Missing OpenCode priority.changed write-back");
if (!hasType("task.injected")) throw new Error("Missing OpenCode task.injected write-back");
if (!events.some((event) => JSON.stringify(event).includes("opencode-v8-daemon-ok"))) {
  throw new Error("Missing OpenCode v8 note write-back");
}
NODE

"${OAC_CLI[@]}" quest-status "$DAEMON_QUEST_ID" --json > daemon-status.json
node <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("daemon-status.json", "utf8"));
if (status.version !== "8") throw new Error(`expected daemon quest v8, got ${status.version}`);
if (!status.runtimes?.opencode) throw new Error("missing opencode runtime progress");
if (!status.tasks.some((task) => task.id === "opencode-v8-dynamic-task")) throw new Error("missing OpenCode injected task");
NODE
pass "Live OpenCode v8 daemon write-back verified"

pass "OpenCode Quest v8 comprehensive workflow validated"

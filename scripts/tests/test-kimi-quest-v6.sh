#!/usr/bin/env bash

#############################################################################
# Kimi Quest v6 Test
# Validates OpenAgent v6 behavior through the Kimi runtime:
# - installed Kimi adapter is present
# - direct Kimi starts fresh Quest Specs across turns
# - oac distributed execution can use Kimi as the selected/default runtime
# - Kimi writes append-only task_update/runtime events
# - quest-status --json reconciles v6 runtime progress
#############################################################################

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="/tmp/oac-kimi-quest-v6-$$"
OAC_CLI=(bun "${REPO_ROOT}/packages/cli/dist/index.js")
INSTALLED_AGENT_FILE="$HOME/.kimi/agents/openagents-control/openagent.yaml"
AGENT_FILE="${KIMI_OPENAGENT_FILE:-$INSTALLED_AGENT_FILE}"

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

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

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Kimi OpenAgent Quest v6 Test                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ ! -f "${REPO_ROOT}/packages/cli/dist/index.js" ]; then
  fail "CLI dist is missing. Run: cd packages/cli && bun run build"
fi

if ! command -v kimi >/dev/null 2>&1; then
  warn "Kimi CLI not found; skipping optional live Kimi v6 test"
  exit 0
fi
pass "Kimi CLI available: $(kimi --version 2>/dev/null | head -n 1)"

if [ ! -f "$AGENT_FILE" ]; then
  fail "Kimi OpenAgent adapter not found at $AGENT_FILE. Run: ./install.sh advanced --with-kimi"
fi
pass "Kimi OpenAgent adapter found"

if [ "$AGENT_FILE" = "$INSTALLED_AGENT_FILE" ]; then
  cmp -s "${REPO_ROOT}/plugins/kimi-code/openagent.yaml" "$INSTALLED_AGENT_FILE" \
    || fail "Installed Kimi adapter differs from repo plugin"
  pass "Installed Kimi adapter matches repo plugin"
fi

mkdir -p "$TEST_DIR/work/.oac"
cd "$TEST_DIR/work"

cat > package.json <<'JSON'
{
  "name": "v6-kimi-test",
  "version": "1.0.0",
  "scripts": {
    "test": "echo 'Tests passed'",
    "build": "echo 'Build passed'",
    "lint": "echo 'Lint passed'"
  }
}
JSON

cat > .oac/config.json <<'JSON'
{
  "version": "1",
  "preferences": {
    "yoloMode": true,
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
    },
    "teamMemory": {
      "enabled": true,
      "maxLessons": 500,
      "autoLearnFromSuccess": true,
      "autoLearnFromFailure": true
    },
    "worktrees": {
      "enabled": false,
      "mergeStrategy": "manual"
    },
    "incidents": {
      "enabled": true,
      "autoCreateOnFailure": true,
      "requirePostMortem": false
    }
  }
}
JSON

FIRST_OUT="$TEST_DIR/first.txt"
SECOND_OUT="$TEST_DIR/second.txt"

FIRST_PROMPT="Do not use tools. Treat this as substantial planning work. Start with OpenAgent Quest Spec and include State: NEW, Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. This is v6 Kimi turn one; propose a safe repo inspection approach."
SECOND_PROMPT="Do not use tools. This is a second substantial request after the first completed in the same session. Start a fresh OpenAgent Quest Spec with State: NEW and include Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. Propose a safe validation approach."

run_with_timeout 90 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$FIRST_PROMPT" > "$FIRST_OUT" 2>&1 || {
    sed -n '1,120p' "$FIRST_OUT" || true
    fail "First Kimi v6 Quest Spec turn failed"
  }

run_with_timeout 90 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --continue \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$SECOND_PROMPT" > "$SECOND_OUT" 2>&1 || {
    sed -n '1,120p' "$SECOND_OUT" || true
    fail "Second Kimi v6 Quest Spec turn failed"
  }

node - "$FIRST_OUT" "$SECOND_OUT" <<'NODE'
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
  };
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${label}_${name}=${ok ? "passed" : "failed"}`);
  }
  if (Object.values(checks).some((ok) => !ok)) {
    console.error(`\n--- ${label} output ---\n${text.slice(0, 2000)}`);
    process.exit(1);
  }
}

check("first", first);
check("second", second);
NODE
pass "Kimi starts fresh Quest Specs across substantial turns"

"${OAC_CLI[@]}" project-intelligence --refresh > "$TEST_DIR/project-intelligence.txt" 2>&1
for doc in architecture.md test-strategy.md install-behavior.md runtime-compatibility.md known-risks.md release-history.md; do
  [ -f ".oac/project-intelligence/$doc" ] || fail "Missing project intelligence doc: $doc"
done
pass "Project intelligence generated"

"${OAC_CLI[@]}" experts --plan-only "Plan a v6 Kimi validation no-op" > "$TEST_DIR/plan.txt" 2>&1
QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
[ -n "$QUEST_ID" ] || fail "No quest run created"

QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
[ "$QUEST_VERSION" = "6" ] || [ "$QUEST_VERSION" = "7" ] || fail "Expected quest version 6 or 7, got $QUEST_VERSION"
[ -f ".oac/runs/${QUEST_ID}/agent-memory.json" ] || fail "Missing v6 agent-memory.json"
pass "Quest v6 artifacts created"

RUNTIME_OUT="$TEST_DIR/runtime.txt"
KIMI_OPENAGENT_FILE="$AGENT_FILE" "${OAC_CLI[@]}" experts \
  --run \
  --quick \
  --distributed \
  --runtime kimi \
  --no-quality-gate \
  "Do not modify files. Complete the v6 Kimi distributed runtime smoke. Append task_update completion events for every assigned task and a note event that says kimi-v6-runtime-ok." \
  > "$RUNTIME_OUT" 2>&1 || {
    sed -n '1,200p' "$RUNTIME_OUT" || true
    fail "v6 distributed Kimi runtime execution failed"
  }

RUNTIME_QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
RUNTIME_EVENTS=".oac/runs/${RUNTIME_QUEST_ID}/events.ndjson"
[ -f "$RUNTIME_EVENTS" ] || fail "Missing runtime events file"

grep -q '"type":"runtime.spawned"' "$RUNTIME_EVENTS" || fail "Missing runtime.spawned event"
grep -q '"type":"runtime.completed"' "$RUNTIME_EVENTS" || fail "Missing runtime.completed event"
grep -q '"runtime":"kimi"' "$RUNTIME_EVENTS" || fail "Runtime events do not identify kimi"
grep -q '"type":"task_update"' "$RUNTIME_EVENTS" || fail "Missing task_update write-back"
grep -q 'kimi-v6-runtime-ok' "$RUNTIME_EVENTS" || fail "Missing Kimi v6 note write-back"
pass "Kimi v6 distributed runtime wrote append-only events"

"${OAC_CLI[@]}" quest-status "$RUNTIME_QUEST_ID" --json > "$TEST_DIR/status.json"
node - "$TEST_DIR/status.json" <<'NODE'
const fs = require("fs");
const status = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (status.questId.length === 0) throw new Error("missing questId");
if (!status.runtimes?.kimi) throw new Error("missing kimi runtime progress");
if ((status.runtimes.kimi.assigned ?? 0) < 1) throw new Error("kimi assigned count missing");
if ((status.progress?.total ?? 0) < 1) throw new Error("progress total missing");
if (!Array.isArray(status.recentEvents)) throw new Error("recentEvents missing");
NODE
pass "quest-status --json reconciles Kimi v6 runtime progress"

"${OAC_CLI[@]}" incident-list > "$TEST_DIR/incidents.txt" 2>&1
pass "Incident command works after v6 Kimi run"

pass "Kimi Quest v6 workflow validated"

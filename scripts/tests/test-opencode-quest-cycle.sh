#!/usr/bin/env bash

#############################################################################
# OpenCode Quest Cycle Test
# Verifies that opencode --agent OpenAgent starts a fresh Quest Spec for a
# second substantial input in the same OpenCode session.
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
TEST_DIR="/tmp/oac-opencode-quest-cycle-$$"

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

run_with_timeout() {
    local duration=$1
    shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "$duration" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$duration" "$@"
    else
        "$@" &
        local cmd_pid=$!
        (
            sleep "$duration"
            if kill -0 "$cmd_pid" >/dev/null 2>&1; then
                kill_process_tree "$cmd_pid" TERM
                sleep 3
                kill_process_tree "$cmd_pid" KILL
            fi
        ) &
        local watcher_pid=$!
        local status=0
        wait "$cmd_pid" || status=$?
        kill "$watcher_pid" >/dev/null 2>&1 || true
        wait "$watcher_pid" 2>/dev/null || true
        return "$status"
    fi
}

kill_process_tree() {
    local pid=$1
    local signal=${2:-TERM}
    local children
    children="$(pgrep -P "$pid" 2>/dev/null || true)"
    for child in $children; do
        kill_process_tree "$child" "$signal"
    done
    kill "-$signal" "$pid" >/dev/null 2>&1 || true
}

cleanup() {
    pkill -f "$TEST_DIR" >/dev/null 2>&1 || true
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║            OpenCode OpenAgent Quest Cycle Test                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if ! command -v opencode >/dev/null 2>&1; then
    warn "OpenCode CLI not found; skipping optional OpenCode Quest cycle test"
    exit 0
fi

mkdir -p "$TEST_DIR/work"
printf '# OpenCode Quest Cycle Smoke\n' > "$TEST_DIR/work/README.md"
cp -R "$REPO_ROOT/.opencode" "$TEST_DIR/work/.opencode"

FIRST_OUT="$TEST_DIR/first.jsonl"
SECOND_OUT="$TEST_DIR/second.jsonl"

FIRST_PROMPT="Do not use tools. Treat this as substantial planning work. Start with OpenAgent Quest Spec and include State: NEW, Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. This is turn one; propose a safe repo inspection approach."
SECOND_PROMPT="Do not use tools. This is a second substantial request after the first completed in the same session. Start a fresh OpenAgent Quest Spec with State: NEW and include Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. Propose a safe validation approach."

if ! run_with_timeout 90 opencode run \
    --agent OpenAgent \
    --format json \
    --dir "$TEST_DIR/work" \
    "$FIRST_PROMPT" > "$FIRST_OUT" 2>&1; then
    warn "OpenCode invocation failed; skipping optional live test"
    sed -n '1,80p' "$FIRST_OUT" || true
    exit 0
fi

SESSION_ID="$(node - "$FIRST_OUT" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
for (const line of fs.readFileSync(file, "utf8").trim().split(/\n+/)) {
  try {
    const event = JSON.parse(line);
    if (event.sessionID) {
      console.log(event.sessionID);
      process.exit(0);
    }
  } catch {}
}
process.exit(1);
NODE
)"

if [ -z "$SESSION_ID" ]; then
    fail "Could not extract OpenCode session ID from first run"
fi

if ! run_with_timeout 90 opencode run \
    --agent OpenAgent \
    --format json \
    --dir "$TEST_DIR/work" \
    --session "$SESSION_ID" \
    "$SECOND_PROMPT" > "$SECOND_OUT" 2>&1; then
    fail "Second OpenCode turn failed"
fi

node - "$FIRST_OUT" "$SECOND_OUT" <<'NODE'
const fs = require("fs");
const [first, second] = process.argv.slice(2);

function parse(file) {
  const raw = fs.readFileSync(file, "utf8");
  const events = raw.trim().split(/\n+/).filter(Boolean).map((line, index) => {
    try {
      return { index, ...JSON.parse(line) };
    } catch {
      return { index, raw: line };
    }
  });
  let text = "";
  let firstQuest = Infinity;
  let firstTool = Infinity;
  for (const event of events) {
    const part = event.part || {};
    if ((event.type === "text" || part.type === "text") && part.text) {
      if (part.text.includes("OpenAgent Quest Spec") && firstQuest === Infinity) {
        firstQuest = event.index;
      }
      text += part.text + "\n";
    }
    if (event.type === "tool_use" || part.type === "tool" || part.tool) {
      if (firstTool === Infinity) firstTool = event.index;
    }
  }
  return { text: text || raw, firstQuest, firstTool };
}

function check(label, file) {
  const parsed = parse(file);
  const checks = {
    startsWithQuest: /(?:^|\n)(?:```text\s*)?OpenAgent Quest Spec/m.test(parsed.text),
    questBeforeTools: parsed.firstQuest !== Infinity && (parsed.firstTool === Infinity || parsed.firstQuest < parsed.firstTool),
    stateNew: /State:\s*NEW/i.test(parsed.text),
    scenario: /Scenario:\s*(direct|code_with_spec|prototype_demo|create_tool|research_plan)/i.test(parsed.text),
    intensity: /Intensity:\s*(lite|standard|deep)/i.test(parsed.text),
    teamLead: /Team Lead:\s*active/i.test(parsed.text),
    experts: /Experts:/i.test(parsed.text),
    trustLabel: /Trust Label:\s*(planned_only|inspected_only|changed|tested|pushed)/i.test(parsed.text),
  };
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${label}_${name}=${ok ? "passed" : "failed"}`);
  }
  if (Object.values(checks).some((ok) => !ok)) {
    console.error(`\n--- ${label} output ---\n${parsed.text.slice(0, 2000)}`);
    process.exit(1);
  }
}

check("first", first);
check("second", second);
NODE

pass "OpenCode starts a fresh Quest Spec for both substantial turns"

#!/usr/bin/env bash

#############################################################################
# Kimi Quest Cycle Test (Quest v8)
# Verifies every substantial input uses Quest v8, turn one can reach
# COMPLETE/WAITING, and a second input in the same session starts a fresh
# OpenAgent Quest Spec with State: NEW (not plain chat).
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
TEST_DIR="${TMPDIR:-/tmp}/oac-kimi-quest-cycle-$$"
INSTALLED_AGENT_FILE="$HOME/.kimi/agents/openagents-control/openagent.yaml"
AGENT_FILE="${KIMI_OPENAGENT_FILE:-$INSTALLED_AGENT_FILE}"

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1" >&2; }

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
  wait_for_kimi_processes_to_release_dir "$TEST_DIR"
  rm -rf "$TEST_DIR"
}

trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Kimi OpenAgent Quest v8 Cycle Test                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if ! command -v kimi >/dev/null 2>&1; then
  warn "Kimi CLI not found; skipping optional Kimi Quest cycle test"
  exit 0
fi

if [ ! -f "$AGENT_FILE" ]; then
  warn "Kimi OpenAgent adapter not found at $AGENT_FILE; skipping optional Kimi Quest cycle test"
  exit 0
fi

grep -q 'Quest v8 lifecycle' "$AGENT_FILE" \
  || grep -q 'NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING' "$AGENT_FILE" \
  || fail "Kimi adapter missing Quest v8 lifecycle contract"
pass "Kimi adapter documents Quest v8 per-input and post-completion rules"

mkdir -p "$TEST_DIR/work"
printf '# Kimi Quest v8 Cycle Smoke\n' > "$TEST_DIR/work/README.md"

FIRST_OUT="$TEST_DIR/first.txt"
SECOND_OUT="$TEST_DIR/second.txt"

FIRST_PROMPT="Do not use tools. Quest v8 turn one. Start with OpenAgent Quest Spec and State: NEW. Include Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the lifecycle NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING. Close this turn with State: COMPLETE or WAITING and a one-line completion summary."
SECOND_PROMPT="Do not use tools. Quest v8 turn two after the previous request completed in this same session. Start a fresh OpenAgent Quest Spec with State: NEW (not plain chat). Include Scenario, Intensity, Team Lead: active, Experts, Trust Label, Gate, and the full v8 lifecycle line again. Propose a safe validation approach."

if ! run_with_timeout 120 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$FIRST_PROMPT" > "$FIRST_OUT" 2>&1; then
  warn "Kimi invocation failed on turn one; skipping optional live test"
  sed -n '1,80p' "$FIRST_OUT" || true
  exit 0
fi

if ! run_with_timeout 120 kimi \
  --work-dir "$TEST_DIR/work" \
  --agent-file "$AGENT_FILE" \
  --continue \
  --print \
  --final-message-only \
  --max-steps-per-turn 1 \
  --prompt "$SECOND_PROMPT" > "$SECOND_OUT" 2>&1; then
  fail "Second Kimi turn failed"
fi

node - "$FIRST_OUT" "$SECOND_OUT" <<'NODE'
const fs = require("fs");
const [firstPath, secondPath] = process.argv.slice(2);

function check(label, file) {
  const text = fs.readFileSync(file, "utf8").trim();
  const checks = {
    startsWithQuest: /^(?:```(?:text)?\s*)?OpenAgent Quest Spec/m.test(text),
    stateNew: /State:\s*NEW/i.test(text),
    v8Lifecycle:
      /NEW\s*->\s*SPEC\s*->\s*EXECUTE\s*->\s*REVIEW\s*->\s*VERIFY\s*->\s*REFLECT\s*->\s*COMPLETE\s*->\s*WAITING/i.test(
        text,
      ),
    scenario:
      /Scenario:\s*(direct|code_with_spec|prototype_demo|create_tool|research_plan)/i.test(
        text,
      ),
    intensity: /Intensity:\s*(lite|standard|deep)/i.test(text),
    teamLead: /Team Lead:\s*active/i.test(text),
    experts: /Experts:/i.test(text),
    trustLabel:
      /Trust Label:\s*(planned_only|inspected_only|changed|tested|pushed)/i.test(text),
  };
  if (label === "first") {
    checks.completeOrWaiting = /State:\s*(COMPLETE|WAITING)/i.test(text);
  }
  if (label === "second") {
    checks.freshQuestHeader = /^OpenAgent Quest Spec/m.test(
      text.replace(/^```(?:text)?\s*/m, ""),
    );
  }
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${label}_${name}=${ok ? "passed" : "failed"}`);
  }
  if (Object.values(checks).some((ok) => !ok)) {
    console.error(`\n--- ${label} output ---\n${text.slice(0, 2500)}`);
    process.exit(1);
  }
}

check("first", firstPath);
check("second", secondPath);
NODE

pass "Kimi Quest v8: turn one completes; turn two starts fresh State: NEW in same session"

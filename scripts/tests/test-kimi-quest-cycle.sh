#!/usr/bin/env bash

#############################################################################
# Kimi Quest Cycle Test
# Verifies that OpenAgent-on-Kimi starts a fresh Quest Spec for a second
# substantial input in the same resumed Kimi session.
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
TEST_DIR="/tmp/oac-kimi-quest-cycle-$$"
AGENT_FILE="${KIMI_OPENAGENT_FILE:-$REPO_ROOT/plugins/kimi-code/openagent.yaml}"

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
        "$@"
    fi
}

cleanup() {
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Kimi OpenAgent Quest Cycle Test                  ║"
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

mkdir -p "$TEST_DIR/work"
printf '# Kimi Quest Cycle Smoke\n' > "$TEST_DIR/work/README.md"

FIRST_OUT="$TEST_DIR/first.txt"
SECOND_OUT="$TEST_DIR/second.txt"

FIRST_PROMPT="Do not use tools. Treat this as substantial planning work. Start with OpenAgent Quest Spec and include State: NEW, Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. This is turn one; propose a safe repo inspection approach."
SECOND_PROMPT="Do not use tools. This is a second substantial request after the first completed in the same session. Start a fresh OpenAgent Quest Spec with State: NEW and include Scenario, Intensity, Team Lead, Experts, Trust Label, and Gate. Propose a safe validation approach."

if ! run_with_timeout 90 kimi \
    --work-dir "$TEST_DIR/work" \
    --agent-file "$AGENT_FILE" \
    --print \
    --final-message-only \
    --max-steps-per-turn 1 \
    --prompt "$FIRST_PROMPT" > "$FIRST_OUT" 2>&1; then
    warn "Kimi invocation failed; skipping optional live test"
    sed -n '1,80p' "$FIRST_OUT" || true
    exit 0
fi

if ! run_with_timeout 90 kimi \
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

pass "Kimi starts a fresh Quest Spec for both substantial turns"

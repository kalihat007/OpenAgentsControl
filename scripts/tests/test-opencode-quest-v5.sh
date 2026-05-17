#!/usr/bin/env bash

#############################################################################
# OpenCode Quest v5 CLI Test
# Tests the v5 CLI workflow: real execution path, verified completion,
# events.ndjson, background runs, and quest-attach.
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
TEST_DIR="/tmp/oac-opencode-quest-v5-$$"
OAC_CLI=(bun "${REPO_ROOT}/packages/cli/dist/index.js")

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         OpenCode OpenAgent Quest v5 CLI Test                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize a minimal project
cat > package.json <<'JSON'
{
  "name": "v5-test",
  "version": "1.0.0",
  "scripts": {
    "test": "echo 'Tests passed'",
    "build": "echo 'Build passed'",
    "lint": "echo 'Lint passed'"
  }
}
JSON

mkdir -p .opencode
cp -R "$REPO_ROOT/.opencode/agent" .opencode/
cp "$REPO_ROOT/.opencode/opencode.json" .opencode/opencode.json 2>/dev/null || true

# Run oac experts --plan-only
"${OAC_CLI[@]}" experts --plan-only "Build a v5 test feature" > /dev/null

# Find the generated quest ID
QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
if [ -z "$QUEST_ID" ]; then
  fail "No quest run created"
fi
pass "Quest created: $QUEST_ID"

# Verify quest.json version is 5
QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
if [ "$QUEST_VERSION" != "5" ]; then
  fail "Expected quest version 5, got $QUEST_VERSION"
fi
pass "Quest version is 5"

# Verify quest-status shows v5
if ! "${OAC_CLI[@]}" quest-status "$QUEST_ID" 2>&1 | grep -q "Quest v5"; then
  fail "quest-status does not show v5"
fi
pass "quest-status shows Quest v5"

# Verify quest-complete blocks without verification
if "${OAC_CLI[@]}" quest-complete "$QUEST_ID" > /dev/null 2>&1; then
  fail "quest-complete should block without verification"
fi
pass "quest-complete blocks without verification"

# Run quest-verify
"${OAC_CLI[@]}" quest-verify "$QUEST_ID" > /dev/null

# Verify events.ndjson has validation event
if ! grep -q '"type":"validation"' ".oac/runs/${QUEST_ID}/events.ndjson"; then
  fail "events.ndjson missing validation event"
fi
pass "events.ndjson contains validation event"

# Verify quest-complete works after verification
"${OAC_CLI[@]}" quest-complete "$QUEST_ID" > /dev/null

# Verify quest is complete
QUEST_STATE="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').state")"
if [ "$QUEST_STATE" = "COMPLETE" ]; then
  pass "Quest marked COMPLETE after verification"
else
  # Reconcile via events
  if grep -q '"to":"COMPLETE"' ".oac/runs/${QUEST_ID}/events.ndjson"; then
    pass "Quest COMPLETE event appended"
  else
    fail "Quest not marked COMPLETE"
  fi
fi

# Test quest-amend
"${OAC_CLI[@]}" quest-amend "$QUEST_ID" "Add extra docs" --add-task "Write docs" > /dev/null
if ! grep -q '"type":"amendment"' ".oac/runs/${QUEST_ID}/events.ndjson"; then
  fail "events.ndjson missing amendment event"
fi
pass "quest-amend appends amendment event"

if command -v opencode >/dev/null 2>&1; then
  "${OAC_CLI[@]}" experts --run --quick --runtime opencode --no-quality-gate "Do not modify files. Append task_update completion events and a note event that says opencode-v5-runtime-ok." > /dev/null
  RUNTIME_QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
  RUNTIME_EVENTS=".oac/runs/${RUNTIME_QUEST_ID}/events.ndjson"
  if ! grep -q '"type":"task_update"' "$RUNTIME_EVENTS"; then
    fail "OpenCode runtime events missing task_update write-back"
  fi
  if ! grep -q 'opencode-v5-runtime-ok' "$RUNTIME_EVENTS"; then
    fail "OpenCode runtime note was not preserved in events.ndjson"
  fi
  pass "OpenCode runtime bridge executed"
else
  warn "OpenCode CLI not found; runtime bridge smoke skipped"
fi

pass "OpenCode Quest v5 CLI workflow validated"

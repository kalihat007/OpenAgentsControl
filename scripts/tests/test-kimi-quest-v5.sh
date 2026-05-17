#!/usr/bin/env bash

#############################################################################
# Kimi Quest v5/v6 Compatibility Test
# Tests the durable Quest workflow through the Kimi runtime if available,
# or validates the CLI path and artifacts when Kimi is not installed.
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
TEST_DIR="/tmp/oac-kimi-quest-v5-$$"
OAC_CLI=(bun "${REPO_ROOT}/packages/cli/dist/index.js")
AGENT_FILE="${KIMI_OPENAGENT_FILE:-$REPO_ROOT/plugins/kimi-code/openagent.yaml}"

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           Kimi OpenAgent Quest v5/v6 Test                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

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

# Run oac experts --plan-only
"${OAC_CLI[@]}" experts --plan-only "Build a v5 test feature" > /dev/null

QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
if [ -z "$QUEST_ID" ]; then
  fail "No quest run created"
fi
pass "Quest created: $QUEST_ID"

QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
if [ "$QUEST_VERSION" != "5" ] && [ "$QUEST_VERSION" != "6" ]; then
  fail "Expected quest version 5 or 6, got $QUEST_VERSION"
fi
pass "Quest version is $QUEST_VERSION"

if ! "${OAC_CLI[@]}" quest-status "$QUEST_ID" 2>&1 | grep -Eq "Quest v(5|6)"; then
  fail "quest-status does not show a durable Quest version"
fi
pass "quest-status shows durable Quest version"

# Runtime availability check
if ! command -v kimi >/dev/null 2>&1; then
  warn "Kimi CLI not found; skipping live runtime test"
  pass "Kimi Quest CLI artifacts validated"
  exit 0
fi

if [ ! -f "$AGENT_FILE" ]; then
  warn "Kimi OpenAgent adapter not found at $AGENT_FILE; skipping live runtime test"
  pass "Kimi Quest CLI artifacts validated"
  exit 0
fi

KIMI_OPENAGENT_FILE="$AGENT_FILE" "${OAC_CLI[@]}" experts --run --quick --runtime kimi --no-quality-gate "Do not modify files. Append task_update completion events and a note event that says kimi-v5-runtime-ok." > /dev/null

RUNTIME_QUEST_ID="$(ls -1 .oac/runs/ | sort | tail -1)"
RUNTIME_EVENTS=".oac/runs/${RUNTIME_QUEST_ID}/events.ndjson"
if ! grep -q '"type":"task_update"' "$RUNTIME_EVENTS"; then
  fail "Kimi runtime events missing task_update write-back"
fi
if ! grep -q 'kimi-v5-runtime-ok' "$RUNTIME_EVENTS"; then
  fail "Kimi runtime note was not preserved in events.ndjson"
fi

pass "Kimi Quest v5/v6 compatibility workflow validated"

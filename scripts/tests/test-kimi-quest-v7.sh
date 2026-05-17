#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oac-kimi-v7.XXXXXX")"
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
    DAEMON_FILE="$TEST_DIR/.oac/runs/${DAEMON_QUEST_ID}/daemon.json"
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

OAC_CLI=(bun "$REPO_ROOT/packages/cli/src/index.ts")

cat > "$TEST_DIR/package.json" <<'JSON'
{
  "name": "oac-v7-smoke",
  "private": true,
  "scripts": {
    "test": "node -e \"process.exit(0)\"",
    "build": "node -e \"process.exit(0)\""
  }
}
JSON

cd "$TEST_DIR"

printf "\nOpenAgent Quest v7 Kimi smoke\n"
printf "Workspace: %s\n\n" "$TEST_DIR"

"${OAC_CLI[@]}" quest-run --runtime kimi "Plan a no-op Kimi Quest v7 validation. Do not modify files." > quest-run.txt 2>&1
QUEST_ID="$(ls -1 .oac/runs | sort | tail -1)"
[ -n "$QUEST_ID" ] || fail "No v7 Quest created"

QUEST_VERSION="$(node -p "require('./.oac/runs/${QUEST_ID}/quest.json').version")"
[ "$QUEST_VERSION" = "7" ] || fail "Expected Quest version 7, got $QUEST_VERSION"
pass "Quest v7 artifact created"

"${OAC_CLI[@]}" quest-status "$QUEST_ID" --json > status.json
node - "$QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const status = JSON.parse(fs.readFileSync("status.json", "utf8"));
if (status.questId !== questId) throw new Error("questId mismatch");
if (!status.progress || typeof status.progress.total !== "number") throw new Error("missing progress");
if (!Array.isArray(status.tasks)) throw new Error("missing tasks");
NODE
pass "quest-status --json reports v7 progress"

if [ "${RUN_LIVE_KIMI:-0}" != "1" ]; then
  warn "Skipping live Kimi daemon run. Set RUN_LIVE_KIMI=1 to enable it."
  pass "Kimi Quest v7 smoke validated"
  exit 0
fi

if ! command -v kimi >/dev/null 2>&1; then
  warn "Kimi CLI not found; skipping live daemon section"
  pass "Kimi Quest v7 smoke validated"
  exit 0
fi

"${OAC_CLI[@]}" quest-run --background --runtime kimi \
  "Do not modify files. Complete the Kimi Quest v7 daemon smoke by appending task_update completion events and a note kimi-v7-daemon-ok." \
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
node - "$DAEMON_QUEST_ID" <<'NODE'
const fs = require("fs");
const questId = process.argv[2];
const daemon = JSON.parse(fs.readFileSync(`.oac/runs/${questId}/daemon.json`, "utf8"));
if (daemon.questId !== questId) throw new Error("daemon questId mismatch");
if (!["spawned", "running", "paused", "blocked", "crashed", "recovering", "complete", "cancelled"].includes(daemon.status)) {
  throw new Error(`unexpected daemon status ${daemon.status}`);
}
NODE
pass "Live Kimi daemon state created"

DEADLINE=$((SECONDS + 240))
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

[ "$TERMINAL_DAEMON" = "1" ] || fail "Live Kimi daemon did not reach a terminal state"
[ "$DAEMON_STATUS" = "complete" ] || fail "Live Kimi daemon ended as $DAEMON_STATUS"
pass "Live Kimi daemon completed"

DAEMON_EVENTS=".oac/runs/${DAEMON_QUEST_ID}/events.ndjson"
grep -q '"type":"runtime.spawned"' "$DAEMON_EVENTS" || fail "Missing runtime.spawned event"
grep -q '"type":"runtime.completed"' "$DAEMON_EVENTS" || fail "Missing runtime.completed event"
grep -q '"runtime":"kimi"' "$DAEMON_EVENTS" || fail "Runtime events do not identify kimi"
grep -q '"type":"task_update"' "$DAEMON_EVENTS" || fail "Missing Kimi task_update write-back"
grep -q 'kimi-v7-daemon-ok' "$DAEMON_EVENTS" || fail "Missing Kimi v7 note write-back"
pass "Live Kimi daemon write-back verified"

pass "Kimi Quest v7 workflow validated"

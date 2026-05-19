#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALLED_TOML="$HOME/.codex/agents/openagents-control/openagent.toml"
INSTALLED_SYSTEM="$HOME/.codex/agents/openagents-control/openagent-system.md"
LEGACY_AGENT_LINK="$HOME/.codex/agents/openagent.toml"
SOURCE_DIR="$REPO_ROOT/plugins/codex-cli"

pass() { printf "✓ %s\n" "$1"; }
fail() { printf "✗ %s\n" "$1" >&2; exit 1; }
warn() { printf "! %s\n" "$1" >&2; }

printf "\nOpenAgents Control — Codex CLI integration test\n"
printf "Repo: %s\n\n" "$REPO_ROOT"

if [ ! -f "$SOURCE_DIR/openagent.toml" ]; then
  fail "Repo plugin missing: $SOURCE_DIR/openagent.toml"
fi
pass "Repo codex-cli plugin present"

if ! command -v codex >/dev/null 2>&1; then
  warn "Codex CLI not on PATH; install-only checks will still run"
fi

export OAC_CODEX_ONLY=1
export WITH_CODEX=true

cd "$REPO_ROOT"
if ! bash ./update.sh --with-codex; then
  fail "update.sh --with-codex (OAC_CODEX_ONLY=1) failed"
fi
pass "update.sh Codex integration step succeeded"

if [ ! -f "$INSTALLED_TOML" ]; then
  fail "Installed openagent.toml missing at $INSTALLED_TOML"
fi
pass "Installed openagent.toml exists"

if [ ! -f "$INSTALLED_SYSTEM" ]; then
  fail "Installed openagent-system.md missing at $INSTALLED_SYSTEM"
fi
pass "Installed openagent-system.md exists"

if [ -e "$LEGACY_AGENT_LINK" ]; then
  fail "Legacy discovery symlink still present (causes duplicate openagent role): $LEGACY_AGENT_LINK"
fi
pass "No duplicate top-level openagent.toml symlink"

cmp -s "$SOURCE_DIR/openagent.toml" "$INSTALLED_TOML" \
  || fail "Installed openagent.toml differs from repo. Run: ./update.sh --with-codex"
cmp -s "$SOURCE_DIR/openagent-system.md" "$INSTALLED_SYSTEM" \
  || fail "Installed openagent-system.md differs from repo. Run: ./update.sh --with-codex"
pass "Installed files match repo plugin"

grep -q 'name = "openagent"' "$INSTALLED_TOML" || fail "openagent.toml missing name = openagent"
grep -q 'Quest v8' "$INSTALLED_SYSTEM" || fail "openagent-system.md missing Quest v8"
grep -q 'developer_instructions' "$INSTALLED_TOML" || fail "openagent.toml missing developer_instructions"
pass "Agent spec contains required OpenAgent fields"

if command -v codex >/dev/null 2>&1; then
  codex_ver="$(codex --version 2>/dev/null | head -n 1 || true)"
  pass "Codex CLI available: ${codex_ver:-unknown}"
else
  warn "Skipped live Codex CLI version check"
fi

printf "\nAll Codex integration checks passed.\n"

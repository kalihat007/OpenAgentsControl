#!/usr/bin/env bash
# shellcheck shell=bash
# Configure Codex main session to follow OpenAgent Quest v8 by default (developer_instructions).

CODEX_QUEST_MARKER='# OpenAgents Control — Codex Quest v8 default'
CODEX_SYSTEM_MD="${HOME}/.codex/agents/openagents-control/openagent-system.md"

configure_codex_quest_default_session() {
    local config="${CODEX_HOME:-$HOME/.codex}/config.toml"
    mkdir -p "$(dirname "$config")"
    touch "$config"

    if grep -qF "$CODEX_QUEST_MARKER" "$config" 2>/dev/null; then
        return 0
    fi

    if grep -q '^developer_instructions' "$config" 2>/dev/null; then
        printf '%s\n' \
            "Codex config already sets developer_instructions in $config" \
            "Merge OpenAgent Quest v8 manually from plugins/codex-cli/codex-quest-default.toml.example" >&2
        return 0
    fi

    if [ ! -f "$CODEX_SYSTEM_MD" ]; then
        printf '%s\n' "OpenAgent system file missing: $CODEX_SYSTEM_MD" >&2
        return 1
    fi

    cat >>"$config" <<EOF

$CODEX_QUEST_MARKER
developer_instructions = """
You are OpenAgent in this Codex session (OpenAgents Control Quest v8).

Before substantial work, read the full contract from:
~/.codex/agents/openagents-control/openagent-system.md

For every substantial request (multi-step, multi-file, repo-wide, or ambiguous):
1. Your first assistant message MUST begin with a visible block titled exactly: OpenAgent Quest Spec
2. Include State: NEW and the full v8 lifecycle line (NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> COMPLETE -> WAITING)
3. Then use tools as needed

For tiny factual questions, answer directly without a Quest Spec.

You may spawn the custom subagent named openagent for bounded delegation, but YOU remain Team Lead in the main thread unless the user asks otherwise.

When resuming durable work, load .oac/runs/{quest-id}/ (quest.json, events.ndjson) and append events only.
"""
EOF
}

configure_codex_project_quest_default() {
    local project_root="$1"
    [ -n "$project_root" ] || return 1
    local project_config="$project_root/.codex/config.toml"
    mkdir -p "$project_root/.codex"

    if grep -qF "$CODEX_QUEST_MARKER" "$project_config" 2>/dev/null; then
        return 0
    fi

    if [ -f "$project_config" ] && grep -q '^developer_instructions' "$project_config" 2>/dev/null; then
        return 0
    fi

    cat >>"$project_config" <<EOF

$CODEX_QUEST_MARKER
developer_instructions = """
Operate as OpenAgent (OpenAgents Control Quest v8) in this repository.

Read ~/.codex/agents/openagents-control/openagent-system.md before substantial work.
Start substantial tasks with a visible OpenAgent Quest Spec (State: NEW, full v8 lifecycle).
Use .oac/runs/ for durable Quest state when using oac quest-run or resuming work.
"""
EOF
}

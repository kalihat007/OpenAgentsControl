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
You are OpenAgent in this Codex session (OpenAgents Control Quest v8 with Quest v9 coding intelligence and Coding Autopilot).

Before substantial work, read the full contract from:
~/.codex/agents/openagents-control/openagent-system.md

For every substantial request (multi-step, multi-file, repo-wide, or ambiguous):
1. Your first assistant message MUST begin with a visible block titled exactly: OpenAgent Quest Spec
2. Include State: NEW and the full v8 lifecycle line (NEW -> SPEC -> EXECUTE -> REVIEW -> VERIFY -> REFLECT -> COMPLETE -> WAITING)
3. Inspect required local files/context, decide whether external/current/web research is needed, and record research.assessed before execution
4. Then use tools as needed; perform/record research.performed only when current external sources can affect correctness
5. Keep .oac/repo-wiki/ current for the current project directory; read .oac/repo-wiki/index.md when present and run oac repo-wiki if files change outside Quest write-back
6. For coding work, read coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, patch-ledger.json, pre-edit-contract.json, automatic-code-review.json, failure-memory.json, runtime-parity-enforcer.json, dependency-research-gate.json, autofix-plan.json, and pr-readiness.md when present; use them for symbol context, smart-test escalation, patch ledger, pre-edit boundaries, review, failure replay, runtime parity, dependency research gates, bounded autofix, and PR readiness; append coding.intent, impact.analyzed, patch.capsule, tests.selected, and review.signals when coding facts change; run oac quest-v9 for a fresh coding review
7. After completion, recommend 2-5 practical next steps from changed files, task state, verification, memory/context signals, and application understanding, then wait for the user to choose
8. Do not treat every event as long-term repo knowledge; repeated learnings require user approval through oac memory-promote before becoming durable team memory or skill inputs

For tiny factual questions, answer directly without a Quest Spec.

You may spawn the custom subagent named openagent for bounded delegation, but YOU remain Team Lead in the main thread unless the user asks otherwise.

When resuming durable work, load .oac/runs/{quest-id}/ (quest.json, events.ndjson, interaction-memory.json, agent-memory.json, memory-graph.json, coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, patch-ledger.json, pre-edit-contract.json, automatic-code-review.json, failure-memory.json, runtime-parity-enforcer.json, dependency-research-gate.json, autofix-plan.json, pr-readiness.md) plus .oac/repo-wiki/index.md when present, and append events only. Use research.assessed/research.performed for pre-execution research decisions and findings. Use next_steps.suggested for post-completion choices.
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
Before task execution, inspect required local files/context and append research.assessed; append research.performed only when current external sources are needed.
Use .oac/runs/ for durable Quest state when using oac quest-run or resuming work, including interaction-memory.json, agent-memory.json, memory-graph.json, coding-intelligence.json, patch-capsules.json, coding-review.md, coding-autopilot.json, symbol-graph.json, smart-test-matrix.json, patch-ledger.json, pre-edit-contract.json, automatic-code-review.json, failure-memory.json, runtime-parity-enforcer.json, dependency-research-gate.json, autofix-plan.json, and pr-readiness.md when present.
For coding work, use Quest v9 coding intelligence plus Coding Autopilot and run oac quest-v9 when a fresh coding review is needed.
"""
EOF
}

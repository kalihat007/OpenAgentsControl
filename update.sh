#!/usr/bin/env bash

#############################################################################
# OpenAgents Control Updater
# Updates existing OpenCode components to latest versions
#
# Compatible with:
# - macOS (bash 3.2+)
# - Linux (bash 3.2+)
# - Windows (Git Bash, WSL)
#
# Usage:
#   ./update.sh                          # Auto-detect install location
#   ./update.sh --install-dir PATH       # Update a specific install path
#
# Environment variables:
#   OPENCODE_INSTALL_DIR                 # Override default install directory
#   OPENCODE_REPO_OWNER                  # GitHub owner to pull from (default: kalihat007)
#   OPENCODE_REPO_NAME                   # GitHub repo to pull from (default: OpenAgentsControl)
#   OPENCODE_BRANCH                      # Branch to pull from (default: main)
#   OPENCODE_RAW_URL                     # Full raw GitHub base URL override
#   OPENAGENT_MODEL                      # Optional explicit model to pin when creating opencode.json
#   OAC_CURL_MAX_TIME                    # Per-file curl timeout in seconds (default: 60)
#############################################################################

set -e

# Detect platform
PLATFORM="$(uname -s)"
case "$PLATFORM" in
    Linux*)     PLATFORM="Linux";;
    Darwin*)    PLATFORM="macOS";;
    CYGWIN*|MINGW*|MSYS*) PLATFORM="Windows";;
    *)          PLATFORM="Unknown";;
esac

# Colors (disable on Windows terminals without color support)
if [ "$PLATFORM" = "Windows" ] && [ -z "$WT_SESSION" ] && [ -z "$ConEmuPID" ]; then
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    BOLD=''
    NC=''
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
fi

REPO_OWNER="${OPENCODE_REPO_OWNER:-kalihat007}"
REPO_NAME="${OPENCODE_REPO_NAME:-OpenAgentsControl}"
REPO_SLUG="${REPO_OWNER}/${REPO_NAME}"
BRANCH="${OPENCODE_BRANCH:-main}"
REPO_URL="${OPENCODE_RAW_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SOURCE_DIR="${OPENCODE_LOCAL_SOURCE_DIR:-}"
if [ -z "$LOCAL_SOURCE_DIR" ] && [ -d "${SCRIPT_DIR}/.opencode" ]; then
    LOCAL_SOURCE_DIR="$SCRIPT_DIR"
fi
OPENAGENT_SELECTED_MODEL="${OPENAGENT_MODEL:-${OPENAGENT_DEFAULT_MODEL:-}}"
OPENAGENT_SMALL_MODEL="${OPENAGENT_SMALL_MODEL:-$OPENAGENT_SELECTED_MODEL}"

# CLI argument for custom install dir (overrides env var)
CUSTOM_INSTALL_DIR=""
WITH_CLAUDE=false
WITH_KIMI=false
WITH_CODEX=false

# Track backup files for cleanup on exit
BACKUP_FILES=()

# Clean up any leftover backup files on exit/interrupt
cleanup_backups() {
    for f in "${BACKUP_FILES[@]}"; do
        [ -f "$f" ] && rm -f "$f"
    done
    return 0
}
trap cleanup_backups EXIT INT TERM

#############################################################################
# Utility Functions
#############################################################################

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_info()    { echo -e "${BLUE}ℹ${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1" >&2; }
print_step()    { echo -e "\n${CYAN}${BOLD}▶${NC} $1\n"; }

# Remove install targets reliably across platforms (busy/partial rm -rf on nested trees).
safe_rm_rf() {
    local target="$1"
    [ -n "$target" ] || return 0
    [ -e "$target" ] || return 0

    if command -v chmod >/dev/null 2>&1; then
        chmod -R u+w "$target" 2>/dev/null || true
    fi

    if rm -rf "$target" 2>/dev/null; then
        return 0
    fi

    if [ -d "$target" ] && command -v find >/dev/null 2>&1; then
        find "$target" -mindepth 1 -delete 2>/dev/null || true
        rmdir "$target" 2>/dev/null || rm -rf "$target" 2>/dev/null || true
        [ ! -e "$target" ] && return 0
    fi

    local quarantine="${target}.oac-remove.$$"
    if [ -e "$target" ]; then
        mv "$target" "$quarantine" 2>/dev/null || return 1
        rm -rf "$quarantine" 2>/dev/null || true
        [ -e "$quarantine" ] && return 1
    fi
    return 0
}

curl_fetch() {
    curl \
        -fsSL \
        --connect-timeout "${OAC_CURL_CONNECT_TIMEOUT:-10}" \
        --max-time "${OAC_CURL_MAX_TIME:-60}" \
        --retry "${OAC_CURL_RETRIES:-2}" \
        --retry-delay "${OAC_CURL_RETRY_DELAY:-1}" \
        "$@"
}

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║           OpenAgents Control Updater v1.1.0                   ║"
    echo "║       OpenAgent Quest + Experts + Swarm + ISO Compliance      ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_usage() {
    echo "Usage: $0 [--install-dir PATH] [--with-claude] [--with-kimi] [--with-codex]"
    echo ""
    echo "Options:"
    echo "  --install-dir PATH   Update a specific installation directory"
    echo "  --with-claude        Also update Claude Code integration"
    echo "  --with-kimi          Also update Kimi Code direct agent integration"
    echo "  --with-codex         Also update Codex CLI direct agent integration"
    echo "  --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  OPENCODE_INSTALL_DIR   Override the default installation directory"
    echo "  OPENCODE_BRANCH        Branch to pull updates from (default: main)"
    echo "  OPENAGENT_MODEL        Optional explicit model to pin only when creating opencode.json"
    echo "  OAC_CURL_MAX_TIME      Per-file download timeout in seconds (default: 60)"
    echo ""
    echo "Examples:"
    echo "  # Auto-detect and update"
    echo "  $0"
    echo ""
    echo "  # Update with Claude Code integration"
    echo "  $0 --with-claude"
    echo ""
    echo "  # Update with Kimi Code direct integration"
    echo "  $0 --with-kimi"
    echo ""
    echo "  # Update with Codex CLI direct integration"
    echo "  $0 --with-codex"
    echo ""
    echo "  # Update a global installation"
    echo "  $0 --install-dir ~/.config/opencode"
    echo ""
    echo "  # Update via environment variable"
    echo "  export OPENCODE_INSTALL_DIR=~/.config/opencode && $0"
}

#############################################################################
# Path Resolution
#############################################################################

get_global_install_path() {
    # Return platform-appropriate global installation path
    case "$PLATFORM" in
        macOS)
            echo "${HOME}/.config/opencode"
            ;;
        Linux)
            echo "${HOME}/.config/opencode"
            ;;
        Windows)
            # Windows Git Bash/WSL: Use same as Linux
            echo "${HOME}/.config/opencode"
            ;;
        *)
            echo "${HOME}/.config/opencode"
            ;;
    esac
}

normalize_path() {
    local input_path="$1"

    # Handle empty path
    if [ -z "$input_path" ]; then
        echo ""
        return 1
    fi

    local normalized_path

    # Expand tilde to $HOME (works on Linux, macOS, Windows Git Bash)
    if [[ $input_path == ~* ]]; then
        normalized_path="${HOME}${input_path:1}"
    else
        normalized_path="$input_path"
    fi

    # Convert backslashes to forward slashes (Windows compatibility)
    normalized_path="${normalized_path//\\//}"

    # Remove trailing slashes
    normalized_path="${normalized_path%/}"

    # If path is relative, make it absolute based on current directory
    if [[ ! "$normalized_path" = /* ]] && [[ ! "$normalized_path" =~ ^[A-Za-z]: ]]; then
        normalized_path="$(pwd)/${normalized_path}"
    fi

    echo "$normalized_path"
    return 0
}

resolve_install_dir() {
    local custom_dir="$1"

    # Priority: CLI arg → env var → auto-detect (local then global)
    if [ -n "$custom_dir" ]; then
        normalize_path "$custom_dir"
        return
    fi

    if [ -n "$OPENCODE_INSTALL_DIR" ]; then
        normalize_path "$OPENCODE_INSTALL_DIR"
        return
    fi

    # Auto-detect: prefer local project install, fall back to global
    local local_path
    local_path="$(pwd)/.opencode"
    local global_path
    global_path=$(get_global_install_path)

    if [ -d "$local_path" ]; then
        echo "$local_path"
    elif [ -d "$global_path" ]; then
        echo "$global_path"
    else
        # Neither exists — return local path so main() gives a clear error
        echo "$local_path"
    fi
}

#############################################################################
# Claude Integration
#############################################################################

claude_plugin_source_dir() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${script_dir}/plugins/claude-code/.claude-plugin/plugin.json" ]; then
        echo "${script_dir}/plugins/claude-code"
    fi
}

maybe_enable_claude_from_repo() {
    if [ "$WITH_CLAUDE" = true ]; then
        return 0
    fi
    if [ -n "$(claude_plugin_source_dir)" ]; then
        WITH_CLAUDE=true
        print_info "Claude bridge plugin found in repo — refreshing ~/.claude/plugins/openagents-control-bridge"
    fi
}

#############################################################################
# Kimi Code Integration
#############################################################################

kimi_plugin_source_dir() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${script_dir}/plugins/kimi-code/openagent.yaml" ]; then
        echo "${script_dir}/plugins/kimi-code"
    fi
}

maybe_enable_kimi_from_repo() {
    if [ "$WITH_KIMI" = true ]; then
        return 0
    fi
    if [ -n "$(kimi_plugin_source_dir)" ] && { command -v kimi >/dev/null 2>&1 || [ -d "$HOME/.kimi" ]; }; then
        WITH_KIMI=true
        print_info "Kimi Code adapter found in repo — refreshing ~/.kimi/agents/openagents-control"
    fi
}

install_kimi_integration() {
    print_step "Updating Kimi Code integration..."

    local plugin_source
    plugin_source="$(kimi_plugin_source_dir)"
    local plugin_dest="$HOME/.kimi/agents/openagents-control"

    if [ -z "$plugin_source" ]; then
        print_warning "Kimi adapter source not found. Run update.sh from the OpenAgentsControl repository."
        return 1
    fi

    if ! command -v kimi >/dev/null 2>&1; then
        print_warning "Kimi CLI not found on PATH. Updating adapter files anyway."
    fi

    mkdir -p "$HOME/.kimi/agents"
    safe_rm_rf "$plugin_dest"
    mkdir -p "$plugin_dest"
    cp -R "$plugin_source"/. "$plugin_dest"/

    if [ ! -f "$plugin_dest/openagent.yaml" ]; then
        print_warning "Kimi OpenAgent spec missing after update"
        return 1
    fi

    print_success "Kimi Code integration updated!"
    print_info "Agent file: $plugin_dest/openagent.yaml"
    print_info "Run: kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml --max-steps-per-turn 160"
}

#############################################################################
# Codex CLI Integration
#############################################################################

codex_plugin_source_dir() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${script_dir}/plugins/codex-cli/openagent.toml" ]; then
        echo "${script_dir}/plugins/codex-cli"
    fi
}

maybe_enable_codex_from_repo() {
    if [ "$WITH_CODEX" = true ]; then
        return 0
    fi
    if [ -n "$(codex_plugin_source_dir)" ] && { command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; }; then
        WITH_CODEX=true
        print_info "Codex CLI adapter found in repo — refreshing ~/.codex/agents/openagents-control"
    fi
}

install_codex_integration() {
    print_step "Updating Codex CLI integration..."

    local plugin_source
    plugin_source="$(codex_plugin_source_dir)"
    local plugin_dest="$HOME/.codex/agents/openagents-control"
    local legacy_agent_link="$HOME/.codex/agents/openagent.toml"

    if [ -z "$plugin_source" ]; then
        print_warning "Codex adapter source not found. Run update.sh from the OpenAgentsControl repository."
        return 1
    fi

    if ! command -v codex >/dev/null 2>&1; then
        print_warning "Codex CLI not found on PATH. Updating adapter files anyway."
    fi

    mkdir -p "$HOME/.codex/agents"
    safe_rm_rf "$plugin_dest"
    mkdir -p "$plugin_dest"
    cp "$plugin_source/openagent.toml" "$plugin_source/openagent-system.md" "$plugin_dest"/

    if [ ! -f "$plugin_dest/openagent.toml" ]; then
        print_warning "Codex OpenAgent spec missing after update"
        return 1
    fi

    if [ -L "$legacy_agent_link" ] || [ -f "$legacy_agent_link" ]; then
        rm -f "$legacy_agent_link"
    fi

  local codex_cfg_script
  codex_cfg_script="$(codex_plugin_source_dir)/configure-codex-quest-default.sh"
  if [ -f "$codex_cfg_script" ]; then
    # shellcheck source=/dev/null
    . "$codex_cfg_script"
    configure_codex_quest_default_session || print_warning "Could not set Codex Quest v8/v9-v20 default in ~/.codex/config.toml"
  fi

    print_success "Codex CLI integration updated!"
    print_info "Agent file: $plugin_dest/openagent.toml"
    print_info "Run: codex -C .  (Quest v8 lifecycle + Quest v9-v20 sidecars apply to the main session)"
}

install_claude_integration() {
    print_step "Updating Claude Code integration..."

    if ! command -v node >/dev/null 2>&1; then
        print_warning "Node.js not found. Claude integration requires Node.js 18+."
        return 1
    fi

    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local converter_dir="$script_dir/integrations/claude-code/converter"
    local plugin_source="$script_dir/plugins/claude-code"
    local plugin_dest="$HOME/.claude/plugins/openagents-control-bridge"

    if [ ! -f "$converter_dir/src/convert-agents.js" ]; then
        print_warning "Claude converter not found at $converter_dir"
        print_info "Claude integration is available when running update.sh from the OpenAgentsControl repository"
        return 1
    fi

    print_info "Converting agents to Claude format..."
    if ! (cd "$converter_dir" && node src/convert-agents.js 2>&1 | grep -q "Conversion complete"); then
        print_error "Claude agent conversion failed"
        return 1
    fi

    print_info "Installing Claude plugin to ~/.claude/plugins/..."
    mkdir -p "$HOME/.claude/plugins"

    if [ -d "$plugin_dest" ]; then
        safe_rm_rf "$plugin_dest" || {
            print_warning "Could not remove existing Claude plugin; retrying in-place refresh"
            find "$plugin_dest" -mindepth 1 -delete 2>/dev/null || true
        }
    fi

    if [ -d "$plugin_source" ]; then
        cp -r "$plugin_source" "$plugin_dest"
        if [ -L "$plugin_dest/context" ]; then
            rm -f "$plugin_dest/context"
        fi
    else
        mkdir -p "$plugin_dest"
    fi

    if [ -d "$converter_dir/generated/agents" ]; then
        mkdir -p "$plugin_dest/agents"
        cp -r "$converter_dir/generated/agents/"* "$plugin_dest/agents/" 2>/dev/null || true
    fi

    if [ -d "$converter_dir/generated/skills" ]; then
        mkdir -p "$plugin_dest/skills"
        cp -r "$converter_dir/generated/skills/"* "$plugin_dest/skills/" 2>/dev/null || true
    fi

    if [ ! -f "$plugin_dest/.claude-plugin/plugin.json" ]; then
        print_warning "Claude plugin manifest missing"
        return 1
    fi

    print_success "Claude Code integration updated!"
    print_info "Plugin location: $plugin_dest"
}

#############################################################################
# Update Logic
#############################################################################

fetch_opencode_component() {
    local relative_path="$1"
    local dest="$2"
    local source=""

    if [ -n "$LOCAL_SOURCE_DIR" ] && [ -f "${LOCAL_SOURCE_DIR}/.opencode/${relative_path}" ]; then
        source="${LOCAL_SOURCE_DIR}/.opencode/${relative_path}"
        if [ "$source" = "$dest" ]; then
            return 0
        fi
        cp "$source" "$dest"
        return $?
    fi

    curl_fetch "${REPO_URL}/.opencode/${relative_path}" -o "$dest"
}

update_component() {
    local path="$1"
    local install_dir="$2"
    local relative_path="${path#"$install_dir"/}"

    # Guard: reject paths that escaped the install dir
    if [[ "$relative_path" == /* ]] || [[ "$relative_path" == *..* ]]; then
        print_warning "Skipping suspicious path: $path"
        return 1
    fi

    local backup="${path}.backup"

    cp "$path" "$backup"
    BACKUP_FILES+=("$backup")

    if fetch_opencode_component "$relative_path" "$path" 2>/dev/null; then
        print_success "Updated $path"
        rm -f "$backup"
        # Remove from tracking array (bash 3.2 compatible)
        local new_backups=()
        for f in "${BACKUP_FILES[@]}"; do
            [ "$f" != "$backup" ] && new_backups+=("$f")
        done
        BACKUP_FILES=("${new_backups[@]+"${new_backups[@]}"}")
    else
        print_warning "Could not update $path — restoring backup"
        mv "$backup" "$path"
        return 1
    fi
}

update_all_components() {
    local install_dir="$1"
    local updated=0
    local failed=0

    # Update markdown files
    while IFS= read -r -d '' file; do
        if update_component "$file" "$install_dir"; then
            updated=$((updated + 1))
        else
            failed=$((failed + 1))
        fi
    done < <(find "$install_dir" -path "*/node_modules/*" -prune -o -name "*.md" -type f -print0)

    # Update TypeScript files
    while IFS= read -r -d '' file; do
        if update_component "$file" "$install_dir"; then
            updated=$((updated + 1))
        else
            failed=$((failed + 1))
        fi
    done < <(find "$install_dir" -path "*/node_modules/*" -prune -o -name "*.ts" -type f -print0)

    # Update shell scripts inside install dir
    while IFS= read -r -d '' file; do
        if update_component "$file" "$install_dir"; then
            updated=$((updated + 1))
        else
            failed=$((failed + 1))
        fi
    done < <(find "$install_dir" -path "*/node_modules/*" -prune -o -name "*.sh" -type f -print0)

    print_info "Updated: $updated file(s), failed: $failed file(s)"
}

install_missing_component() {
    local install_dir="$1"
    local relative_path="$2"
    local dest="${install_dir}/${relative_path}"

    # Guard: keep updater writes inside the selected install directory.
    if [[ "$relative_path" == /* ]] || [[ "$relative_path" == *..* ]]; then
        print_warning "Skipping suspicious component path: $relative_path"
        return 1
    fi

    if [ -f "$dest" ]; then
        print_info "Component already present: ${relative_path}"
        return 0
    fi

    mkdir -p "$(dirname "$dest")"
    if fetch_opencode_component "$relative_path" "$dest" 2>/dev/null; then
        print_success "Installed missing component: ${relative_path}"
        return 0
    fi

    rm -f "$dest"
    print_warning "Could not install missing component: ${relative_path}"
    return 1
}

ensure_quest_components() {
    local install_dir="$1"

    install_missing_component "$install_dir" "context/core/quest-mode.md" || true
    install_missing_component "$install_dir" "context/core/experts-mode.md" || true
    install_missing_component "$install_dir" "command/experts.md" || true
}

ensure_opencode_config() {
    local install_dir="$1"
    local opencode_config="${install_dir}/opencode.json"
    local legacy_config="${install_dir}/config.json"

    if [ -f "$opencode_config" ]; then
        print_info "OpenCode config already exists: ${opencode_config} (preserving user's selected model)"
    else
        if [ -n "$OPENAGENT_SELECTED_MODEL" ]; then
            cat > "$opencode_config" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "default_agent": "OpenAgent",
  "model": "${OPENAGENT_SELECTED_MODEL}",
  "small_model": "${OPENAGENT_SMALL_MODEL}"
}
EOF
            print_success "Created OpenCode config: ${opencode_config} (model: ${OPENAGENT_SELECTED_MODEL})"
        else
            cat > "$opencode_config" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "default_agent": "OpenAgent"
}
EOF
            print_success "Created OpenCode config: ${opencode_config} (model stays user-selected)"
        fi
    fi

    if [[ "$install_dir" != ".opencode" && "$install_dir" != *"/.opencode" ]]; then
        local compact_legacy_config=""
        local legacy_config_invalid=false
        [ -f "$legacy_config" ] && compact_legacy_config="$(tr -d '[:space:]' < "$legacy_config" 2>/dev/null || true)"
        if [ -f "$legacy_config" ] && command -v node >/dev/null 2>&1; then
            node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$legacy_config" >/dev/null 2>&1 || legacy_config_invalid=true
        fi
        if [ -f "$legacy_config" ] && { grep -Eq '"agent"[[:space:]]*:[[:space:]]*"OpenAgent"' "$legacy_config" || [ "$compact_legacy_config" = '{"$schema":"https://opencode.ai/config.json",}' ] || [ "$legacy_config_invalid" = true ]; }; then
            cp "$legacy_config" "${legacy_config}.legacy-oac-backup.$(date +%Y%m%d-%H%M%S)"
            rm -f "$legacy_config"
            print_warning "Removed invalid legacy OAC config at ${legacy_config}; OpenCode 1.14 uses opencode.json"
        else
            print_info "Skipping legacy OAC config for OpenCode config directory: ${install_dir}"
        fi
    elif [ -f "$legacy_config" ]; then
        print_info "Legacy OpenAgent config already exists: ${legacy_config}"
    else
        cat > "$legacy_config" << EOF
{
  "agent": "OpenAgent"
}
EOF
        print_success "Created legacy OpenAgent config: ${legacy_config}"
    fi
}

ensure_oac_config() {
    local install_dir="$1"
    local base_name
    base_name="$(basename "$install_dir")"

    if [ "$base_name" != ".opencode" ]; then
        print_info "Skipping project .oac config update for non-local install directory: ${install_dir}"
        return 0
    fi

    local project_root
    project_root="$(dirname "$install_dir")"
    local oac_dir="${project_root}/.oac"
    local oac_config="${oac_dir}/config.json"

    if [ ! -f "$oac_config" ]; then
        mkdir -p "$oac_dir"
        mkdir -p "$oac_dir/runs"
        cat > "$oac_config" << 'EOF'
{
  "version": "1",
  "preferences": {
    "yoloMode": false,
    "autoBackup": true,
    "expertMode": true,
    "useAgentSwarm": true,
    "maxParallelAgents": 2,
    "maxApiCallsPerSession": 500
  }
}
EOF
        print_success "Created OAC config: ${oac_config} (Quest + Experts + swarm defaults)"
        return 0
    fi

    if grep -q '"maxParallelAgents"[[:space:]]*:[[:space:]]*4' "$oac_config"; then
        local tmp_file="${oac_config}.tmp.$$"
        sed 's/"maxParallelAgents"[[:space:]]*:[[:space:]]*4/"maxParallelAgents": 2/' "$oac_config" > "$tmp_file"
        mv "$tmp_file" "$oac_config"
        print_success "Updated legacy OAC parallel default"
    else
        print_info "OAC config already customized or current: ${oac_config}"
    fi
}

print_execution_workflow() {
    echo -e "${BOLD}Primary execution (recommended):${NC}"
    echo -e "  OpenCode TUI:  ${CYAN}opencode --agent OpenAgent${NC}"
    echo "                 Quest + Experts Mode + Agent Swarm (see .oac/config.json)"
    if [ -d "$HOME/.claude/plugins/openagents-control-bridge" ]; then
        echo -e "  Claude Code:   ${CYAN}claude --plugin-dir ~/.claude/plugins/openagents-control-bridge --append-system-prompt \"\$(cat ~/.claude/plugins/openagents-control-bridge/openagent-system.md)\"${NC}"
    else
        echo -e "  Claude Code:   ${CYAN}./update.sh --with-claude${NC} (from repo clone)"
        echo "                 then: claude --plugin-dir ~/.claude/plugins/openagents-control-bridge --append-system-prompt \"\$(cat ~/.claude/plugins/openagents-control-bridge/openagent-system.md)\""
    fi
    if [ -f "$HOME/.kimi/agents/openagents-control/openagent.yaml" ]; then
        echo -e "  Kimi Code:     ${CYAN}kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml --max-steps-per-turn 160${NC}"
    else
        echo -e "  Kimi Code:     ${CYAN}./update.sh --with-kimi${NC} (from repo clone)"
        echo "                 then: kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml --max-steps-per-turn 160"
    fi
    if [ -f "$HOME/.codex/agents/openagents-control/openagent.toml" ]; then
        echo -e "  Codex CLI:     ${CYAN}codex -C .${NC}  (operate as openagent — see plugins/codex-cli/README.md)"
    else
        echo -e "  Codex CLI:     ${CYAN}./update.sh --with-codex${NC} (from repo clone)"
        echo "                 then: codex -C .  (see plugins/codex-cli/README.md)"
    fi
    echo ""
    echo -e "${BOLD}CLI orchestration (oac — planning, routing, handoff artifacts):${NC}"
    echo -e "  ${CYAN}oac experts \"<objective>\"${NC}                 Expert roster / routing"
    echo -e "  ${CYAN}oac experts --plan-only \"<objective>\"${NC}       Save structured plan for handoff"
    echo -e "  ${CYAN}oac experts --run \"<objective>\"${NC}             Simulated swarm pipeline (default)"
    echo -e "  ${CYAN}oac experts --run --runtime kimi \"<objective>\"${NC}  Strict Kimi runtime bridge"
    echo -e "  ${CYAN}oac experts --run --runtime opencode \"<objective>\"${NC} Strict OpenCode runtime bridge"
    echo -e "  ${CYAN}oac quest-status${NC}                            List durable Quest runs"
    echo -e "  ${CYAN}oac quest-status <quest-id>${NC}                 Inspect Quest state, tasks, artifacts"
    echo -e "  ${CYAN}oac quest-resume <quest-id>${NC}                 Print runtime resume commands"
    echo ""
    print_info "Use --runtime for strict headless bridge checks; use --live for handoff commands."
    echo ""
}

show_post_update() {
    echo ""
    print_step "Next Steps"
    print_execution_workflow
    print_info "Re-run updates anytime: ${CYAN}./update.sh${NC} or curl update.sh | bash"
    print_info "Fresh install / new components: ${CYAN}curl -fsSL .../install.sh | bash${NC} (defaults to Advanced)"
    print_info "Explicit Advanced profile: ${CYAN}./install.sh advanced${NC}"
    echo ""
}

#############################################################################
# Argument Parsing
#############################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --install-dir=*)
                CUSTOM_INSTALL_DIR="${1#*=}"
                if [ -z "$CUSTOM_INSTALL_DIR" ]; then
                    print_error "--install-dir requires a non-empty path"
                    exit 1
                fi
                shift
                ;;
            --install-dir)
                if [ -n "$2" ] && [ "${2:0:1}" != "-" ]; then
                    CUSTOM_INSTALL_DIR="$2"
                    shift 2
                else
                    print_error "--install-dir requires a path argument"
                    exit 1
                fi
                ;;
            --with-claude)
                WITH_CLAUDE=true
                shift
                ;;
            --with-kimi)
                WITH_KIMI=true
                shift
                ;;
            --with-codex)
                WITH_CODEX=true
                shift
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

#############################################################################
# Main
#############################################################################

main() {
    parse_args "$@"

    if [ "${OAC_CODEX_ONLY:-}" = "1" ]; then
        maybe_enable_codex_from_repo
        install_codex_integration
        exit $?
    fi

    maybe_enable_claude_from_repo
    maybe_enable_kimi_from_repo
    maybe_enable_codex_from_repo

    print_header

    local install_dir
    install_dir=$(resolve_install_dir "$CUSTOM_INSTALL_DIR")

    if [ ! -d "$install_dir" ]; then
        print_error "Installation directory not found: $install_dir"
        echo ""
        echo "Searched locations:"
        echo "  1. --install-dir argument"
        echo "  2. OPENCODE_INSTALL_DIR environment variable"
        echo "  3. Local path:  $(pwd)/.opencode"
        echo "  4. Global path: $(get_global_install_path)"
        echo ""
        echo "Install first (Advanced profile is the default — option 5):"
        echo "  curl -fsSL ${REPO_URL%/}/install.sh | bash"
        echo "  curl -fsSL ${REPO_URL%/}/install.sh | bash -s advanced"
        echo "  ./install.sh advanced"
        echo ""
        echo "Or point this updater at an existing install:"
        echo "  $0 --install-dir PATH"
        exit 1
    fi

    if [ ! -w "$install_dir" ]; then
        print_error "No write permission for: $install_dir"
        exit 1
    fi

    print_info "Updating installation at: ${CYAN}${install_dir}${NC}"
    print_step "Updating components..."

    update_all_components "$install_dir"
    ensure_quest_components "$install_dir"

    print_step "Ensuring latest OpenAgent runtime config..."

    ensure_opencode_config "$install_dir"
    ensure_oac_config "$install_dir"

    if [ "$WITH_CLAUDE" = true ]; then
        install_claude_integration
    fi

    if [ "$WITH_KIMI" = true ]; then
        install_kimi_integration
    fi

    if [ "$WITH_CODEX" = true ]; then
        install_codex_integration
    fi

    print_success "Update complete! OpenAgent Quest Mode + Experts Mode + Agent Swarm + ISO 21434/24089 are active."
    show_post_update
}

main "$@"

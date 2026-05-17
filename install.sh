#!/usr/bin/env bash

#############################################################################
# OpenAgents Control Installer
# Interactive installer for OpenCode agents, commands, tools, and plugins
#
# Compatible with:
# - macOS (bash 3.2+)
# - Linux (bash 3.2+)
# - Windows (Git Bash, WSL)
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

# Colors for output (disable on Windows if not supported)
if [ "$PLATFORM" = "Windows" ] && [ -z "$WT_SESSION" ] && [ -z "$ConEmuPID" ]; then
    # Basic Windows terminal without color support
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    MAGENTA=''
    CYAN=''
    BOLD=''
    NC=''
else
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    MAGENTA='\033[0;35m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
fi

# Configuration
REPO_OWNER="${OPENCODE_REPO_OWNER:-kalihat007}"  # Allow override via environment variable
REPO_NAME="${OPENCODE_REPO_NAME:-OpenAgentsControl}"  # Allow override via environment variable
REPO_SLUG="${REPO_OWNER}/${REPO_NAME}"
REPO_URL="${OPENCODE_REPO_URL:-https://github.com/${REPO_SLUG}}"
BRANCH="${OPENCODE_BRANCH:-main}"  # Allow override via environment variable
RAW_URL="${OPENCODE_RAW_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${BRANCH}}"

# Registry URL - supports local fallback for development
# Priority: 1) REGISTRY_URL env var, 2) Local registry.json, 3) Remote GitHub
if [ -n "$REGISTRY_URL" ]; then
    # Use explicitly set REGISTRY_URL (for testing)
    :
elif [ -f "./registry.json" ]; then
    # Use local registry.json if it exists (for development)
    REGISTRY_URL="file://$(pwd)/registry.json"
else
    # Default to remote GitHub registry
    REGISTRY_URL="${RAW_URL}/registry.json"
fi

LOCAL_SOURCE_DIR=""
if [[ "$REGISTRY_URL" == file://* ]]; then
    LOCAL_SOURCE_DIR="$(dirname "${REGISTRY_URL#file://}")"
fi

INSTALL_DIR="${OPENCODE_INSTALL_DIR:-.opencode}"  # Allow override via environment variable
DEFAULT_PROFILE="${OAC_PROFILE:-${OPENCODE_DEFAULT_PROFILE:-advanced}}"  # Default quick/non-interactive profile (name or 1-5)
OPENAGENT_SELECTED_MODEL="${OPENAGENT_MODEL:-${OPENAGENT_DEFAULT_MODEL:-}}"
OPENAGENT_SMALL_MODEL="${OPENAGENT_SMALL_MODEL:-$OPENAGENT_SELECTED_MODEL}"
TEMP_DIR="/tmp/opencode-installer-$$"

# Cleanup temp directory on exit (success or failure)
trap 'rm -rf "$TEMP_DIR" 2>/dev/null || true' EXIT INT TERM

# Global variables
SELECTED_COMPONENTS=()
INSTALL_MODE=""
PROFILE=""
NON_INTERACTIVE=false
CUSTOM_INSTALL_DIR=""  # Set via --install-dir argument
WITH_CLAUDE=false        # Set via --with-claude flag
WITH_KIMI=false          # Set via --with-kimi flag

#############################################################################
# Utility Functions
#############################################################################

jq_exec() {
    local output
    output=$(jq -r "$@")
    local ret=$?
    printf "%s\n" "$output" | tr -d '\r'
    return $ret
}

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║           OpenAgents Control Installer v1.0.0                 ║"
    echo "║  OpenAgent Quest + Experts Mode + Agent Swarm + ISO Compliance║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_step() {
    echo -e "\n${MAGENTA}${BOLD}▶${NC} $1\n"
}

#############################################################################
# Path Handling (Cross-Platform)
#############################################################################

normalize_and_validate_path() {
    local input_path="$1"
    local normalized_path
    
    # Handle empty path
    if [ -z "$input_path" ]; then
        echo ""
        return 1
    fi
    
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

validate_install_path() {
    local path="$1"
    local parent_dir
    
    # Get parent directory
    parent_dir="$(dirname "$path")"
    
    # Check if parent directory exists
    if [ ! -d "$parent_dir" ]; then
        print_error "Parent directory does not exist: $parent_dir"
        return 1
    fi
    
    # Check if parent directory is writable
    if [ ! -w "$parent_dir" ]; then
        print_error "No write permission for directory: $parent_dir"
        return 1
    fi
    
    # If target directory exists, check if it's writable
    if [ -d "$path" ] && [ ! -w "$path" ]; then
        print_error "No write permission for directory: $path"
        return 1
    fi
    
    return 0
}

get_global_install_path() {
    # Return platform-appropriate global installation path
    case "$PLATFORM" in
        macOS)
            # macOS: Use XDG standard (consistent with Linux)
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

#############################################################################
# Dependency Checks
#############################################################################

check_bash_version() {
    # Check bash version (need 3.2+)
    local bash_version="${BASH_VERSION%%.*}"
    if [ "$bash_version" -lt 3 ]; then
        echo "Error: This script requires Bash 3.2 or higher"
        echo "Current version: $BASH_VERSION"
        echo ""
        echo "Please upgrade bash or use a different shell:"
        echo "  macOS:   brew install bash"
        echo "  Linux:   Use your package manager to update bash"
        echo "  Windows: Use Git Bash or WSL"
        exit 1
    fi
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        echo ""
        echo "Please install them:"
        case "$PLATFORM" in
            macOS)
                echo "  brew install ${missing_deps[*]}"
                ;;
            Linux)
                echo "  Ubuntu/Debian: sudo apt-get install ${missing_deps[*]}"
                echo "  Fedora/RHEL:   sudo dnf install ${missing_deps[*]}"
                echo "  Arch:          sudo pacman -S ${missing_deps[*]}"
                ;;
            Windows)
                echo "  Git Bash: Install via https://git-scm.com/"
                echo "  WSL:      sudo apt-get install ${missing_deps[*]}"
                echo "  Scoop:    scoop install ${missing_deps[*]}"
                ;;
            *)
                echo "  Use your package manager to install: ${missing_deps[*]}"
                ;;
        esac
        exit 1
    fi
    
    print_success "All dependencies found"
}

#############################################################################
# Registry Functions
#############################################################################

fetch_registry() {
    print_step "Fetching component registry..."
    
    mkdir -p "$TEMP_DIR"
    
    # Handle local file:// URLs
    if [[ "$REGISTRY_URL" == file://* ]]; then
        local local_path="${REGISTRY_URL#file://}"
        if [ -f "$local_path" ]; then
            cp "$local_path" "$TEMP_DIR/registry.json"
            print_success "Using local registry: $local_path"
        else
            print_error "Local registry not found: $local_path"
            exit 1
        fi
    else
        # Fetch from remote URL
        if ! curl -fsSL "$REGISTRY_URL" -o "$TEMP_DIR/registry.json"; then
            print_error "Failed to fetch registry from $REGISTRY_URL"
            exit 1
        fi
        print_success "Registry fetched successfully"
    fi
}

resolve_profile_name() {
    case "$1" in
        1|essential) echo "essential" ;;
        2|developer) echo "developer" ;;
        3|business) echo "business" ;;
        4|full) echo "full" ;;
        5|advanced) echo "advanced" ;;
        *) echo "$1" ;;
    esac
}

get_profile_components() {
    local profile=$1
    jq_exec ".profiles.${profile}.components[]?" "$TEMP_DIR/registry.json"
}

get_component_info() {
    local component_id=$1
    local component_type=$2
    
    if [ "$component_type" = "context" ] && [[ "$component_id" == */* ]]; then
        jq_exec "first(.components.contexts[]? | select(.path == \".opencode/context/${component_id}.md\"))" "$TEMP_DIR/registry.json"
        return
    fi

    jq_exec ".components.${component_type}[]? | select(.id == \"${component_id}\" or (.aliases // [] | index(\"${component_id}\")))" "$TEMP_DIR/registry.json"
}

resolve_component_path() {
    local component_type=$1
    local component_id=$2
    local registry_key
    registry_key=$(get_registry_key "$component_type")

    if [ "$component_type" = "context" ] && [[ "$component_id" == */* ]]; then
        # Try .md extension first (most context files), then fall back to the
        # path as-is for non-markdown files (e.g. paths.json). Fixes #251.
        local result
        result=$(jq_exec "first(.components.contexts[]? | select(.path == \".opencode/context/${component_id}.md\") | .path)" "$TEMP_DIR/registry.json")
        if [ -z "$result" ] || [ "$result" = "null" ]; then
            result=$(jq_exec "first(.components.contexts[]? | select(.path == \".opencode/context/${component_id}\") | .path)" "$TEMP_DIR/registry.json")
        fi
        echo "$result"
        return
    fi

    jq_exec ".components.${registry_key}[]? | select(.id == \"${component_id}\" or (.aliases // [] | index(\"${component_id}\"))) | .path" "$TEMP_DIR/registry.json"
}

# Helper function to get the correct registry key for a component type
get_registry_key() {
    local type=$1
    # Handle both singular and plural forms
    # Registry uses plural keys: agents, contexts, skills
    case "$type" in
        config) echo "config" ;;
        # Already plural forms - use as-is
        agents|contexts|skills) echo "$type" ;;
        # Singular forms - pluralize them
        agent) echo "agents" ;;
        context) echo "contexts" ;;
        skill) echo "skills" ;;
        # Fallback: if already ends with 's', assume plural
        *s) echo "$type" ;;
        # Default: add 's' to make plural
        *) echo "${type}s" ;;
    esac
}

# Helper function to convert registry path to installation path
# Registry paths are like ".opencode/agent/foo.md"
# We need to replace ".opencode" with the actual INSTALL_DIR
get_install_path() {
    local registry_path=$1
    # Strip leading .opencode/ if present
    local relative_path="${registry_path#.opencode/}"
    # Return INSTALL_DIR + relative path
    echo "${INSTALL_DIR}/${relative_path}"
}

install_source_file() {
    local source_path=$1
    local dest=$2

    if [ -n "$LOCAL_SOURCE_DIR" ] && [ -f "${LOCAL_SOURCE_DIR}/${source_path}" ]; then
        cp "${LOCAL_SOURCE_DIR}/${source_path}" "$dest"
        return $?
    fi

    curl -fsSL "${RAW_URL}/${source_path}" -o "$dest"
}

expand_context_wildcard() {
    local pattern=$1
    local prefix="${pattern%%\**}"

    prefix="${prefix%/}"
    if [ -n "$prefix" ]; then
        prefix="${prefix}/"
    fi

    jq_exec ".components.contexts[]? | select(.path | startswith(\".opencode/context/${prefix}\")) | .path | sub(\"^\\\\.opencode/context/\"; \"\") | sub(\"\\\\.md$\"; \"\")" "$TEMP_DIR/registry.json"
}

expand_selected_components() {
    local expanded=()

    for comp in "${SELECTED_COMPONENTS[@]}"; do
        local type="${comp%%:*}"
        local id="${comp##*:}"

        if [[ "$id" == *"*"* ]]; then
            if [ "$type" != "context" ]; then
                print_warning "Wildcard only supported for context components: ${comp}"
                continue
            fi

            local matches
            matches=$(expand_context_wildcard "$id")

            if [ -z "$matches" ]; then
                print_warning "No contexts matched: ${comp}"
                continue
            fi

            while IFS= read -r match; do
                [ -n "$match" ] && expanded+=("context:${match}")
            done <<< "$matches"
            continue
        fi

        expanded+=("$comp")
    done

    local deduped=()
    for comp in "${expanded[@]}"; do
        local found=0
        for existing in "${deduped[@]}"; do
            if [ "$existing" = "$comp" ]; then
                found=1
                break
            fi
        done
        if [ "$found" -eq 0 ]; then
            deduped+=("$comp")
        fi
    done

    SELECTED_COMPONENTS=("${deduped[@]}")
}

resolve_dependencies() {
    local component=$1
    local type="${component%%:*}"
    local id="${component##*:}"
    
    # Get the correct registry key (handles singular/plural)
    local registry_key
    registry_key=$(get_registry_key "$type")
    
    # Get dependencies for this component
    local deps
    deps=$(jq_exec ".components.${registry_key}[] | select(.id == \"${id}\" or (.aliases // [] | index(\"${id}\"))) | .dependencies[]?" "$TEMP_DIR/registry.json" 2>/dev/null || echo "")
    
    if [ -n "$deps" ]; then
        for dep in $deps; do
            if [[ "$dep" == *"*"* ]]; then
                local dep_type="${dep%%:*}"
                local dep_id="${dep##*:}"

                if [ "$dep_type" = "context" ]; then
                    local matched
                    matched=$(expand_context_wildcard "$dep_id")

                    if [ -z "$matched" ]; then
                        print_warning "No contexts matched dependency: ${dep}"
                        continue
                    fi

                    while IFS= read -r match; do
                        local expanded_dep="context:${match}"
                        local found=0
                        for existing in "${SELECTED_COMPONENTS[@]}"; do
                            if [ "$existing" = "$expanded_dep" ]; then
                                found=1
                                break
                            fi
                        done
                        if [ "$found" -eq 0 ]; then
                            SELECTED_COMPONENTS+=("$expanded_dep")
                            resolve_dependencies "$expanded_dep"
                        fi
                    done <<< "$matched"
                    continue
                fi
            fi

            # Add dependency if not already in list
            local found=0
            for existing in "${SELECTED_COMPONENTS[@]}"; do
                if [ "$existing" = "$dep" ]; then
                    found=1
                    break
                fi
            done
            if [ "$found" -eq 0 ]; then
                SELECTED_COMPONENTS+=("$dep")
                # Recursively resolve dependencies
                resolve_dependencies "$dep"
            fi
        done
    fi
}

#############################################################################
# Installation Mode Selection
#############################################################################

check_interactive_mode() {
    # Check if stdin is a terminal (not piped from curl)
    if [ ! -t 0 ]; then
        print_header
        print_error "Interactive mode requires a terminal"
        echo ""
        echo "You're running this script in a pipe (e.g., curl | bash)"
        echo "For interactive mode, download the script first:"
        echo ""
        echo -e "${CYAN}# Download the script${NC}"
        echo "curl -fsSL ${RAW_URL}/install.sh -o install.sh"
        echo ""
        echo -e "${CYAN}# Run interactively${NC}"
        echo "bash install.sh"
        echo ""
        echo "Or use a profile directly:"
        echo ""
        echo -e "${CYAN}# Quick install with profile${NC}"
        echo "curl -fsSL ${RAW_URL}/install.sh | bash -s advanced"
        echo ""
        echo "Available profiles: essential, developer, business, full, advanced"
        echo "Recommended/default: advanced (complete OpenAgent Quest + Experts Mode + agent swarm + ISO 21434/24089 compliance)"
        echo ""
        cleanup_and_exit 1
    fi
}

show_install_location_menu() {
    check_interactive_mode
    
    clear
    print_header
    
    local global_path
    global_path=$(get_global_install_path)
    
    echo -e "${BOLD}Choose installation location:${NC}\n"
    echo -e "  ${GREEN}1) Local${NC} - Install to ${CYAN}.opencode/${NC} in current directory"
    echo "     (Best for project-specific agents)"
    echo ""
    echo -e "  ${BLUE}2) Global${NC} - Install to ${CYAN}${global_path}${NC}"
    echo "     (Best for user-wide agents available everywhere)"
    echo ""
    echo -e "  ${MAGENTA}3) Custom${NC} - Enter exact path"
    echo "     Examples:"
    case "$PLATFORM" in
        Windows)
            echo -e "       ${CYAN}C:/Users/username/my-agents${NC} or ${CYAN}~/my-agents${NC}"
            ;;
        *)
            echo -e "       ${CYAN}/home/username/my-agents${NC} or ${CYAN}~/my-agents${NC}"
            ;;
    esac
    echo ""
    echo "  4) Back / Exit"
    echo ""
    read -r -p "Enter your choice [1-4, default 1]: " location_choice
    location_choice="${location_choice:-1}"
    
    case $location_choice in
        1)
            INSTALL_DIR=".opencode"
            print_success "Installing to local directory: .opencode/"
            sleep 1
            ;;
        2)
            INSTALL_DIR="$global_path"
            print_success "Installing to global directory: $global_path"
            sleep 1
            ;;
        3)
            echo ""
            read -r -p "Enter installation path: " custom_path
            
            if [ -z "$custom_path" ]; then
                print_error "No path entered"
                sleep 2
                show_install_location_menu
                return
            fi
            
            local normalized_path
            normalized_path=$(normalize_and_validate_path "$custom_path")
            
            if ! normalize_and_validate_path "$custom_path" > /dev/null; then
                print_error "Invalid path"
                sleep 2
                show_install_location_menu
                return
            fi
            
            if ! validate_install_path "$normalized_path"; then
                echo ""
                read -r -p "Continue anyway? [y/N]: " continue_choice
                if [[ ! $continue_choice =~ ^[Yy] ]]; then
                    show_install_location_menu
                    return
                fi
            fi
            
            INSTALL_DIR="$normalized_path"
            print_success "Installing to custom directory: $INSTALL_DIR"
            sleep 1
            ;;
        4)
            cleanup_and_exit 0
            ;;
        *)
            print_error "Invalid choice"
            sleep 2
            show_install_location_menu
            return
            ;;
    esac
}

show_main_menu() {
    check_interactive_mode
    
    clear
    print_header
    
    echo -e "${BOLD}Choose installation mode:${NC}\n"
    echo "  1) Quick Install (Advanced profile — OpenAgent Quest + Experts Mode + Agent Swarm + ISO 21434/24089)"
    echo "  2) Custom Install (Pick individual components)"
    echo "  3) List Available Components"
    echo "  4) Exit"
    echo ""
    read -r -p "Enter your choice [1-4, default 1]: " choice
    choice="${choice:-1}"
    
    case $choice in
        1) INSTALL_MODE="profile" ;;
        2) INSTALL_MODE="custom" ;;
        3) list_components; read -r -p "Press Enter to continue..."; show_main_menu ;;
        4) cleanup_and_exit 0 ;;
        *) print_error "Invalid choice"; sleep 2; show_main_menu ;;
    esac
}

#############################################################################
# Profile Installation
#############################################################################

show_profile_menu() {
    clear
    print_header
    
    echo -e "${BOLD}Available Installation Profiles:${NC}\n"
    
    # Essential profile
    local essential_name
    essential_name=$(jq_exec '.profiles.essential.name' "$TEMP_DIR/registry.json")
    local essential_desc
    essential_desc=$(jq_exec '.profiles.essential.description' "$TEMP_DIR/registry.json")
    local essential_count
    essential_count=$(jq_exec '.profiles.essential.components | length' "$TEMP_DIR/registry.json")
    echo -e "  ${GREEN}1) ${essential_name}${NC}"
    echo -e "     ${essential_desc}"
    echo -e "     Components: ${essential_count}\n"
    
    # Developer profile
    local dev_desc
    dev_desc=$(jq_exec '.profiles.developer.description' "$TEMP_DIR/registry.json")
    local dev_count
    dev_count=$(jq_exec '.profiles.developer.components | length' "$TEMP_DIR/registry.json")
    local dev_badge
    dev_badge=$(jq_exec '.profiles.developer.badge // ""' "$TEMP_DIR/registry.json")
    if [ -n "$dev_badge" ]; then
        echo -e "  ${BLUE}2) Developer ${GREEN}[${dev_badge}]${NC}"
    else
        echo -e "  ${BLUE}2) Developer${NC}"
    fi
    echo -e "     ${dev_desc}"
    echo -e "     Components: ${dev_count}\n"
    
    # Business profile
    local business_name
    business_name=$(jq_exec '.profiles.business.name' "$TEMP_DIR/registry.json")
    local business_desc
    business_desc=$(jq_exec '.profiles.business.description' "$TEMP_DIR/registry.json")
    local business_count
    business_count=$(jq_exec '.profiles.business.components | length' "$TEMP_DIR/registry.json")
    echo -e "  ${CYAN}3) ${business_name}${NC}"
    echo -e "     ${business_desc}"
    echo -e "     Components: ${business_count}\n"
    
    # Full profile
    local full_name
    full_name=$(jq_exec '.profiles.full.name' "$TEMP_DIR/registry.json")
    local full_desc
    full_desc=$(jq_exec '.profiles.full.description' "$TEMP_DIR/registry.json")
    local full_count
    full_count=$(jq_exec '.profiles.full.components | length' "$TEMP_DIR/registry.json")
    echo -e "  ${MAGENTA}4) ${full_name}${NC}"
    echo -e "     ${full_desc}"
    echo -e "     Components: ${full_count}\n"
    
    # Advanced profile
    local adv_name
    adv_name=$(jq_exec '.profiles.advanced.name' "$TEMP_DIR/registry.json")
    local adv_desc
    adv_desc=$(jq_exec '.profiles.advanced.description' "$TEMP_DIR/registry.json")
    local adv_count
    adv_count=$(jq_exec '.profiles.advanced.components | length' "$TEMP_DIR/registry.json")
    local adv_badge
    adv_badge=$(jq_exec '.profiles.advanced.badge // ""' "$TEMP_DIR/registry.json")
    if [ -n "$adv_badge" ]; then
        echo -e "  ${YELLOW}5) ${adv_name} ${GREEN}[${adv_badge}]${NC} ${BOLD}(default)${NC}"
    else
        echo -e "  ${YELLOW}5) ${adv_name}${NC} ${BOLD}(default)${NC}"
    fi
    echo -e "     ${adv_desc}"
    echo -e "     Components: ${adv_count}\n"
    
    echo "  6) Back to main menu"
    echo ""
    read -r -p "Enter your choice [1-6, default 5]: " choice
    choice="${choice:-5}"
    
    case $choice in
        1) PROFILE="essential" ;;
        2) PROFILE="developer" ;;
        3) PROFILE="business" ;;
        4) PROFILE="full" ;;
        5) PROFILE="advanced" ;;
        6) show_main_menu; return ;;
        *) print_error "Invalid choice"; sleep 2; show_profile_menu; return ;;
    esac
    
    # Load profile components (compatible with bash 3.2+)
    SELECTED_COMPONENTS=()
    local temp_file="$TEMP_DIR/components.tmp"
    get_profile_components "$PROFILE" > "$temp_file"
    while IFS= read -r component; do
        [ -n "$component" ] && SELECTED_COMPONENTS+=("$component")
    done < "$temp_file"

    expand_selected_components
    
    # Resolve dependencies for profile installs
    print_step "Resolving dependencies..."
    local original_count=${#SELECTED_COMPONENTS[@]}
    for comp in "${SELECTED_COMPONENTS[@]}"; do
        resolve_dependencies "$comp"
    done
    
    local new_count=${#SELECTED_COMPONENTS[@]}
    if [ "$new_count" -gt "$original_count" ]; then
        local added=$((new_count - original_count))
        print_info "Added $added dependencies"
    fi
    
    show_installation_preview
}

#############################################################################
# Custom Component Selection
#############################################################################

show_custom_menu() {
    clear
    print_header
    
    echo -e "${BOLD}Select component categories to install:${NC}\n"
    echo "Use space to toggle, Enter to continue"
    echo ""
    
    local categories=("agents" "subagents" "commands" "tools" "plugins" "skills" "contexts" "config")
    local selected_categories=()
    
    # Simple selection (for now, we'll make it interactive later)
    echo "Available categories:"
    for i in "${!categories[@]}"; do
        local cat="${categories[$i]}"
        local count
        count=$(jq_exec ".components.${cat} | length" "$TEMP_DIR/registry.json")
        local cat_display
        cat_display=$(echo "$cat" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
        echo "  $((i+1))) ${cat_display} (${count} available)"
    done
    echo "  $((${#categories[@]}+1))) Select All"
    echo "  $((${#categories[@]}+2))) Continue to component selection"
    echo "  $((${#categories[@]}+3))) Back to main menu"
    echo ""
    
    read -r -p "Enter category numbers (space-separated) or option: " -a selections
    
    for sel in "${selections[@]}"; do
        if [ "$sel" -eq $((${#categories[@]}+1)) ]; then
            selected_categories=("${categories[@]}")
            break
        elif [ "$sel" -eq $((${#categories[@]}+2)) ]; then
            break
        elif [ "$sel" -eq $((${#categories[@]}+3)) ]; then
            show_main_menu
            return
        elif [ "$sel" -ge 1 ] && [ "$sel" -le ${#categories[@]} ]; then
            selected_categories+=("${categories[$((sel-1))]}")
        fi
    done
    
    if [ ${#selected_categories[@]} -eq 0 ]; then
        print_warning "No categories selected"
        sleep 2
        show_custom_menu
        return
    fi
    
    show_component_selection "${selected_categories[@]}"
}

show_component_selection() {
    local categories=("$@")
    clear
    print_header
    
    echo -e "${BOLD}Select components to install:${NC}\n"
    
    local all_components=()
    local component_details=()
    
    for category in "${categories[@]}"; do
        local cat_display
        cat_display=$(echo "$category" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
        echo -e "${CYAN}${BOLD}${cat_display}:${NC}"
        
        local components
        components=$(jq_exec ".components.${category}[]? | .id" "$TEMP_DIR/registry.json")
        
        local idx=1
        while IFS= read -r comp_id; do
            local comp_name
            comp_name=$(jq_exec ".components.${category}[]? | select(.id == \"${comp_id}\") | .name" "$TEMP_DIR/registry.json")
            local comp_desc
            comp_desc=$(jq_exec ".components.${category}[]? | select(.id == \"${comp_id}\") | .description" "$TEMP_DIR/registry.json")
            
            echo "  ${idx}) ${comp_name}"
            echo "     ${comp_desc}"
            
            all_components+=("${category}:${comp_id}")
            component_details+=("${comp_name}|${comp_desc}")
            
            idx=$((idx+1))
        done <<< "$components"
        
        echo ""
    done
    
    echo "Enter component numbers (space-separated), 'all' for all, or 'done' to continue:"
    read -r -a selections
    
    for sel in "${selections[@]}"; do
        if [ "$sel" = "all" ]; then
            SELECTED_COMPONENTS=("${all_components[@]}")
            break
        elif [ "$sel" = "done" ]; then
            break
        elif [ "$sel" -ge 1 ] && [ "$sel" -le ${#all_components[@]} ]; then
            SELECTED_COMPONENTS+=("${all_components[$((sel-1))]}")
        fi
    done
    
    if [ ${#SELECTED_COMPONENTS[@]} -eq 0 ]; then
        print_warning "No components selected"
        sleep 2
        show_custom_menu
        return
    fi
    
    # Resolve dependencies
    print_step "Resolving dependencies..."
    local original_count=${#SELECTED_COMPONENTS[@]}
    for comp in "${SELECTED_COMPONENTS[@]}"; do
        resolve_dependencies "$comp"
    done
    
    if [ ${#SELECTED_COMPONENTS[@]} -gt "$original_count" ]; then
        print_info "Added $((${#SELECTED_COMPONENTS[@]} - original_count)) dependencies"
    fi
    
    show_installation_preview
}

#############################################################################
# Installation Preview & Confirmation
#############################################################################

show_installation_preview() {
    # Only clear screen in interactive mode
    if [ "$NON_INTERACTIVE" != true ]; then
        clear
    fi
    print_header
    
    echo -e "${BOLD}Installation Preview${NC}\n"
    
    if [ -n "$PROFILE" ]; then
        echo -e "Profile: ${GREEN}${PROFILE}${NC}"
    else
        echo -e "Mode: ${GREEN}Custom${NC}"
    fi
    
    echo -e "Installation directory: ${CYAN}${INSTALL_DIR}${NC}"
    
    echo -e "\nComponents to install (${#SELECTED_COMPONENTS[@]} total):\n"
    
    # Group by type
    local agents=()
    local subagents=()
    local commands=()
    local tools=()
    local plugins=()
    local skills=()
    local contexts=()
    local configs=()
    
    for comp in "${SELECTED_COMPONENTS[@]}"; do
        local type="${comp%%:*}"
        case $type in
            agent) agents+=("$comp") ;;
            subagent) subagents+=("$comp") ;;
            command) commands+=("$comp") ;;
            tool) tools+=("$comp") ;;
            plugin) plugins+=("$comp") ;;
            skill) skills+=("$comp") ;;
            context) contexts+=("$comp") ;;
            config) configs+=("$comp") ;;
        esac
    done
    
    [ ${#agents[@]} -gt 0 ] && echo -e "${CYAN}Agents (${#agents[@]}):${NC} ${agents[*]##*:}"
    [ ${#subagents[@]} -gt 0 ] && echo -e "${CYAN}Subagents (${#subagents[@]}):${NC} ${subagents[*]##*:}"
    [ ${#commands[@]} -gt 0 ] && echo -e "${CYAN}Commands (${#commands[@]}):${NC} ${commands[*]##*:}"
    [ ${#tools[@]} -gt 0 ] && echo -e "${CYAN}Tools (${#tools[@]}):${NC} ${tools[*]##*:}"
    [ ${#plugins[@]} -gt 0 ] && echo -e "${CYAN}Plugins (${#plugins[@]}):${NC} ${plugins[*]##*:}"
    [ ${#skills[@]} -gt 0 ] && echo -e "${CYAN}Skills (${#skills[@]}):${NC} ${skills[*]##*:}"
    [ ${#contexts[@]} -gt 0 ] && echo -e "${CYAN}Contexts (${#contexts[@]}):${NC} ${contexts[*]##*:}"
    [ ${#configs[@]} -gt 0 ] && echo -e "${CYAN}Config (${#configs[@]}):${NC} ${configs[*]##*:}"
    
    echo ""
    
    # Skip confirmation if profile was provided via command line
    if [ "$NON_INTERACTIVE" = true ]; then
        print_info "Installing automatically (profile selected)..."
        perform_installation
    else
        # Ask about Claude integration
        if [ "$WITH_CLAUDE" != true ]; then
            echo ""
            read -r -p "Also install Claude Code integration? [y/N]: " claude_choice
            if [[ $claude_choice =~ ^[Yy] ]]; then
                WITH_CLAUDE=true
            fi
        fi

        if [ "$WITH_KIMI" != true ]; then
            echo ""
            read -r -p "Also install Kimi Code integration? [y/N]: " kimi_choice
            if [[ $kimi_choice =~ ^[Yy] ]]; then
                WITH_KIMI=true
            fi
        fi

        read -r -p "Proceed with installation? [Y/n]: " confirm
        
        if [[ $confirm =~ ^[Nn] ]]; then
            print_info "Installation cancelled"
            cleanup_and_exit 0
        fi
        
        perform_installation
    fi
}

#############################################################################
# Collision Detection
#############################################################################

show_collision_report() {
    local collision_count=$1
    shift
    local collisions=("$@")
    
    echo ""
    print_warning "Found ${collision_count} file collision(s):"
    echo ""
    
    # Group by type
    local agents=()
    local subagents=()
    local commands=()
    local tools=()
    local plugins=()
    local skills=()
    local contexts=()
    local configs=()
    
    for file in "${collisions[@]}"; do
        # Skip empty entries
        [ -z "$file" ] && continue
        
        if [[ $file == *"/agent/subagents/"* ]]; then
            subagents+=("$file")
        elif [[ $file == *"/agent/"* ]]; then
            agents+=("$file")
        elif [[ $file == *"/command/"* ]]; then
            commands+=("$file")
        elif [[ $file == *"/tool/"* ]]; then
            tools+=("$file")
        elif [[ $file == *"/plugin/"* ]]; then
            plugins+=("$file")
        elif [[ $file == *"/skills/"* ]]; then
            skills+=("$file")
        elif [[ $file == *"/context/"* ]]; then
            contexts+=("$file")
        else
            configs+=("$file")
        fi
    done
    
    # Display grouped collisions
    [ ${#agents[@]} -gt 0 ] && echo -e "${YELLOW}  Agents (${#agents[@]}):${NC}" && printf '    %s\n' "${agents[@]}"
    [ ${#subagents[@]} -gt 0 ] && echo -e "${YELLOW}  Subagents (${#subagents[@]}):${NC}" && printf '    %s\n' "${subagents[@]}"
    [ ${#commands[@]} -gt 0 ] && echo -e "${YELLOW}  Commands (${#commands[@]}):${NC}" && printf '    %s\n' "${commands[@]}"
    [ ${#tools[@]} -gt 0 ] && echo -e "${YELLOW}  Tools (${#tools[@]}):${NC}" && printf '    %s\n' "${tools[@]}"
    [ ${#plugins[@]} -gt 0 ] && echo -e "${YELLOW}  Plugins (${#plugins[@]}):${NC}" && printf '    %s\n' "${plugins[@]}"
    [ ${#skills[@]} -gt 0 ] && echo -e "${YELLOW}  Skills (${#skills[@]}):${NC}" && printf '    %s\n' "${skills[@]}"
    [ ${#contexts[@]} -gt 0 ] && echo -e "${YELLOW}  Context (${#contexts[@]}):${NC}" && printf '    %s\n' "${contexts[@]}"
    [ ${#configs[@]} -gt 0 ] && echo -e "${YELLOW}  Config (${#configs[@]}):${NC}" && printf '    %s\n' "${configs[@]}"
    
    echo ""
}

get_install_strategy() {
    echo -e "${BOLD}How would you like to proceed?${NC}\n" >&2
    echo "  1) ${GREEN}Skip existing${NC} - Only install new files, keep all existing files unchanged" >&2
    echo "  2) ${YELLOW}Overwrite all${NC} - Replace existing files with new versions (your changes will be lost)" >&2
    echo "  3) ${CYAN}Backup & overwrite${NC} - Backup existing files, then install new versions" >&2
    echo "  4) ${RED}Cancel${NC} - Exit without making changes" >&2
    echo "" >&2
    read -r -p "Enter your choice [1-4]: " strategy_choice
    
    case $strategy_choice in
        1) echo "skip" ;;
        2) 
            echo "" >&2
            print_warning "This will overwrite existing files. Your changes will be lost!"
            read -r -p "Are you sure? Type 'yes' to confirm: " confirm
            if [ "$confirm" = "yes" ]; then
                echo "overwrite"
            else
                echo "cancel"
            fi
            ;;
        3) echo "backup" ;;
        4) echo "cancel" ;;
        *) echo "cancel" ;;
    esac
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
        print_info "Claude bridge plugin found in repo — installing to ~/.claude/plugins/openagents-control-bridge"
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
        print_info "Kimi Code adapter found in repo — installing to ~/.kimi/agents/openagents-control"
    fi
}

install_kimi_integration() {
    print_step "Setting up Kimi Code integration..."

    local plugin_source
    plugin_source="$(kimi_plugin_source_dir)"
    local plugin_dest="$HOME/.kimi/agents/openagents-control"

    if [ -z "$plugin_source" ]; then
        print_warning "Kimi adapter source not found. Run install.sh from the OpenAgentsControl repository."
        return 1
    fi

    if ! command -v kimi >/dev/null 2>&1; then
        print_warning "Kimi CLI not found on PATH. Installing adapter files anyway."
        print_info "Install/login to Kimi CLI, then run: kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml"
    fi

    mkdir -p "$HOME/.kimi/agents"
    rm -rf "$plugin_dest"
    mkdir -p "$plugin_dest"
    cp -R "$plugin_source"/. "$plugin_dest"/

    if [ ! -f "$plugin_dest/openagent.yaml" ]; then
        print_warning "Kimi OpenAgent spec missing after install"
        return 1
    fi

    print_success "Kimi Code integration installed!"
    print_info "Agent file: $plugin_dest/openagent.yaml"
    print_info "Run: kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml"
}

install_claude_integration() {
    print_step "Setting up Claude Code integration..."
    
    # Check prerequisites
    if ! command -v node >/dev/null 2>&1; then
        print_warning "Node.js not found. Claude integration requires Node.js 18+."
        print_info "Install from https://nodejs.org/ and re-run with --with-claude"
        return 1
    fi
    
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local converter_dir="$script_dir/integrations/claude-code/converter"
    local plugin_source="$script_dir/plugins/claude-code"
    local plugin_dest="$HOME/.claude/plugins/openagents-control-bridge"
    
    # Check if converter exists (local run from repo)
    if [ ! -f "$converter_dir/src/convert-agents.js" ]; then
        print_warning "Claude converter not found at $converter_dir"
        print_info "Claude integration is available when running install.sh from the OpenAgentsControl repository"
        return 1
    fi
    
    # Run converter
    print_info "Converting agents to Claude format..."
    if ! (cd "$converter_dir" && node src/convert-agents.js 2>&1 | grep -q "Conversion complete"); then
        print_error "Claude agent conversion failed"
        return 1
    fi
    
    # Install plugin
    print_info "Installing Claude plugin to ~/.claude/plugins/..."
    mkdir -p "$HOME/.claude/plugins"
    
    if [ -d "$plugin_dest" ]; then
        rm -rf "$plugin_dest"
    fi
    
    # Copy the proper plugin structure (includes manifest, hooks, scripts, skills)
    if [ -d "$plugin_source" ]; then
        cp -r "$plugin_source" "$plugin_dest"
        # Remove symlinked context (will use local .opencode/context instead)
        if [ -L "$plugin_dest/context" ]; then
            rm -f "$plugin_dest/context"
        fi
    else
        mkdir -p "$plugin_dest"
    fi
    
    # Merge converted agents into the plugin
    if [ -d "$converter_dir/generated/agents" ]; then
        mkdir -p "$plugin_dest/agents"
        cp -r "$converter_dir/generated/agents/"* "$plugin_dest/agents/" 2>/dev/null || true
    fi
    
    # Merge converted skills into the plugin
    if [ -d "$converter_dir/generated/skills" ]; then
        mkdir -p "$plugin_dest/skills"
        cp -r "$converter_dir/generated/skills/"* "$plugin_dest/skills/" 2>/dev/null || true
    fi
    
    # Verify manifest exists
    if [ ! -f "$plugin_dest/.claude-plugin/plugin.json" ]; then
        print_warning "Claude plugin manifest missing"
        return 1
    fi
    
    print_success "Claude Code integration installed!"
    print_info "Plugin location: $plugin_dest"
}

#############################################################################
# Installation
#############################################################################

perform_installation() {
    print_step "Preparing installation..."
    
    # Create base directory only - subdirectories created on-demand when files are installed
    mkdir -p "$INSTALL_DIR"
    
    # Check for collisions
    local collisions=()
    for comp in "${SELECTED_COMPONENTS[@]}"; do
        local type="${comp%%:*}"
        local id="${comp##*:}"
        local registry_key
        registry_key=$(get_registry_key "$type")
        local path
        path=$(resolve_component_path "$type" "$id")
        
        if [ -n "$path" ] && [ "$path" != "null" ]; then
            local install_path
            install_path=$(get_install_path "$path")
            if [ -f "$install_path" ]; then
                collisions+=("$install_path")
            fi
        fi
    done
    
    # Determine installation strategy
    local install_strategy="fresh"
    
    if [ ${#collisions[@]} -gt 0 ]; then
        # In non-interactive mode, use default strategy (skip existing files)
        if [ "$NON_INTERACTIVE" = true ]; then
            print_info "Found ${#collisions[@]} existing file(s) - using 'skip' strategy (non-interactive mode)"
            print_info "To overwrite, download script and run interactively, or delete existing files first"
            install_strategy="skip"
        else
            show_collision_report ${#collisions[@]} "${collisions[@]}"
            install_strategy=$(get_install_strategy)
            
            if [ "$install_strategy" = "cancel" ]; then
                print_info "Installation cancelled by user"
                cleanup_and_exit 0
            fi
        fi
        
        # Handle backup strategy
        if [ "$install_strategy" = "backup" ]; then
            local backup_dir
            backup_dir="${INSTALL_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
            print_step "Creating backup..."
            
            # Only backup files that will be overwritten
            local backup_count=0
            for file in "${collisions[@]}"; do
                if [ -f "$file" ]; then
                    local backup_file="${backup_dir}/${file}"
                    mkdir -p "$(dirname "$backup_file")"
                    if cp "$file" "$backup_file" 2>/dev/null; then
                        backup_count=$((backup_count + 1))
                    else
                        print_warning "Failed to backup: $file"
                    fi
                fi
            done
            
            if [ $backup_count -gt 0 ]; then
                print_success "Backed up ${backup_count} file(s) to $backup_dir"
                install_strategy="overwrite"  # Now we can overwrite
            else
                print_error "Backup failed. Installation cancelled."
                cleanup_and_exit 1
            fi
        fi
    fi
    
    # Perform installation
    print_step "Installing components..."
    
    local installed=0
    local skipped=0
    local failed=0
    
    for comp in "${SELECTED_COMPONENTS[@]}"; do
        local type="${comp%%:*}"
        local id="${comp##*:}"
        
        # Get the correct registry key (handles singular/plural)
        local registry_key
        registry_key=$(get_registry_key "$type")
        
        # Get component path
        local path
        path=$(resolve_component_path "$type" "$id")
        
        if [ -z "$path" ] || [ "$path" = "null" ]; then
            print_warning "Could not find path for ${comp}"
            failed=$((failed + 1))
            continue
        fi
        
        # Check if component has additional files (for skills)
        local files_array
        files_array=$(jq_exec ".components.${registry_key}[]? | select(.id == \"${id}\") | .files[]?" "$TEMP_DIR/registry.json")
        
        if [ -n "$files_array" ]; then
            # Component has multiple files - download all of them
            local component_installed=0
            local component_failed=0
            
            while IFS= read -r file_path; do
                [ -z "$file_path" ] && continue
                
                local dest
                dest=$(get_install_path "$file_path")
                
                # Check if file exists and we're in skip mode
                if [ -f "$dest" ] && [ "$install_strategy" = "skip" ]; then
                    continue
                fi
                
                mkdir -p "$(dirname "$dest")"
                
                if install_source_file "$file_path" "$dest"; then
                    # Transform paths for global installation
                    if [[ "$INSTALL_DIR" != ".opencode" ]] && [[ "$INSTALL_DIR" != *"/.opencode" ]]; then
                        local expanded_path="${INSTALL_DIR/#\~/$HOME}"
                        sed -i.bak -e "s|@\.opencode/context/|@${expanded_path}/context/|g" \
                                   -e "s|\.opencode/context|${expanded_path}/context|g" "$dest" 2>/dev/null || true
                        rm -f "${dest}.bak" 2>/dev/null || true
                    fi
                    component_installed=$((component_installed + 1))
                else
                    component_failed=$((component_failed + 1))
                fi
            done <<< "$files_array"
            
            if [ $component_failed -eq 0 ]; then
                print_success "Installed ${type}: ${id} (${component_installed} files)"
                installed=$((installed + 1))
            else
                print_error "Failed to install ${type}: ${id} (${component_failed} files failed)"
                failed=$((failed + 1))
            fi
        else
            # Single file component - original logic
            local dest
            dest=$(get_install_path "$path")
            
            # Check if file exists before we install (for proper messaging)
            local file_existed=false
            if [ -f "$dest" ]; then
                file_existed=true
            fi
            
            # Check if file exists and we're in skip mode
            if [ "$file_existed" = true ] && [ "$install_strategy" = "skip" ]; then
                print_info "Skipped existing: ${type}:${id}"
                skipped=$((skipped + 1))
                continue
            fi
            
            # Create parent directory if needed
            mkdir -p "$(dirname "$dest")"
            
            if install_source_file "$path" "$dest"; then
                # Transform paths for global installation (any non-local path)
                # Local paths: .opencode or */.opencode
                if [[ "$INSTALL_DIR" != ".opencode" ]] && [[ "$INSTALL_DIR" != *"/.opencode" ]]; then
                    # Expand tilde and get absolute path for transformation
                    local expanded_path="${INSTALL_DIR/#\~/$HOME}"
                    # Transform @.opencode/context/ references to actual install path
                    sed -i.bak -e "s|@\.opencode/context/|@${expanded_path}/context/|g" \
                               -e "s|\.opencode/context|${expanded_path}/context|g" "$dest" 2>/dev/null || true
                    rm -f "${dest}.bak" 2>/dev/null || true
                fi
                
                # Show appropriate message based on whether file existed before
                if [ "$file_existed" = true ]; then
                    print_success "Updated ${type}: ${id}"
                else
                    print_success "Installed ${type}: ${id}"
                fi
                installed=$((installed + 1))
            else
                print_error "Failed to install ${type}: ${id}"
                failed=$((failed + 1))
            fi
        fi
    done
    
    # Handle additional paths for advanced profile
    if [ "$PROFILE" = "advanced" ]; then
        local additional_paths
        additional_paths=$(jq_exec '.profiles.advanced.additionalPaths[]?' "$TEMP_DIR/registry.json")
        if [ -n "$additional_paths" ]; then
            print_step "Installing additional paths..."
            while IFS= read -r path; do
                # For directories, we'd need to recursively download
                # For now, just note them
                print_info "Additional path: $path (manual download required)"
            done <<< "$additional_paths"
        fi
    fi
    
    # Create OAC config if it doesn't exist
    create_oac_config
    
    # Create OpenCode agent default config if it doesn't exist
    create_opencode_config
    
    echo ""
    print_success "Installation complete!"
    echo -e "  Installed: ${GREEN}${installed}${NC}"
    [ $skipped -gt 0 ] && echo -e "  Skipped: ${CYAN}${skipped}${NC}"
    [ $failed -gt 0 ] && echo -e "  Failed: ${RED}${failed}${NC}"
    
    # Install Claude integration if requested
    if [ "$WITH_CLAUDE" = true ]; then
        install_claude_integration
    fi

    if [ "$WITH_KIMI" = true ]; then
        install_kimi_integration
    fi
    
    show_post_install
}

#############################################################################
# Config Creation
#############################################################################

create_oac_config() {
    local oac_dir=".oac"
    local oac_config="${oac_dir}/config.json"
    
    if [ -f "$oac_config" ]; then
        print_info "OAC config already exists: ${oac_config}"
        return 0
    fi
    
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
    print_success "Created OAC config: ${oac_config} (expertMode + agent swarm enabled by default)"
}

create_opencode_config() {
    local opencode_dir="$INSTALL_DIR"
    local opencode_config="${opencode_dir}/opencode.json"
    local legacy_config="${opencode_dir}/config.json"

    mkdir -p "$opencode_dir"

    if [ -f "$opencode_config" ]; then
        print_info "OpenCode config already exists: ${opencode_config}"
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
            print_success "Created OpenCode config: ${opencode_config} (default agent: OpenAgent, model: ${OPENAGENT_SELECTED_MODEL})"
        else
            cat > "$opencode_config" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "default_agent": "OpenAgent"
}
EOF
            print_success "Created OpenCode config: ${opencode_config} (default agent: OpenAgent; model: user-selected OpenCode default)"
        fi
    fi

    if [[ "$opencode_dir" != ".opencode" && "$opencode_dir" != *"/.opencode" ]]; then
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
            print_info "Skipping legacy OAC config for OpenCode config directory: ${opencode_dir}"
        fi
    elif [ -f "$legacy_config" ]; then
        print_info "OAC legacy OpenCode config already exists: ${legacy_config}"
    else
        if [ -n "$OPENAGENT_SELECTED_MODEL" ]; then
            cat > "$legacy_config" << EOF
{
  "agent": "OpenAgent",
  "model": "${OPENAGENT_SELECTED_MODEL}"
}
EOF
        else
            cat > "$legacy_config" << EOF
{
  "agent": "OpenAgent"
}
EOF
        fi
        print_success "Created OAC legacy config: ${legacy_config}"
    fi
}

#############################################################################
# Post-Installation
#############################################################################

print_execution_workflow() {
    echo -e "${BOLD}Primary execution (recommended):${NC}"
    echo -e "  OpenCode TUI:  ${CYAN}opencode --agent OpenAgent${NC}"
    echo "                 Quest + Experts Mode + Agent Swarm (see .oac/config.json)"
    if [ -d "$HOME/.claude/plugins/openagents-control-bridge" ]; then
        echo -e "  Claude Code:   ${CYAN}claude --plugin-dir ~/.claude/plugins/openagents-control-bridge${NC}"
    else
        echo -e "  Claude Code:   ${CYAN}./install.sh advanced --with-claude${NC} (from repo clone)"
        echo "                 then: claude --plugin-dir ~/.claude/plugins/openagents-control-bridge"
    fi
    if [ -f "$HOME/.kimi/agents/openagents-control/openagent.yaml" ]; then
        echo -e "  Kimi Code:     ${CYAN}kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml${NC}"
    else
        echo -e "  Kimi Code:     ${CYAN}./install.sh advanced --with-kimi${NC} (from repo clone)"
        echo "                 then: kimi --work-dir . --agent-file ~/.kimi/agents/openagents-control/openagent.yaml"
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
    print_info "Use install.sh / update.sh + OpenCode TUI, Claude, or Kimi for day-to-day execution."
    echo ""
    echo "  If a provider is overloaded, retry after a pause or pick a model explicitly:"
    echo -e "  ${CYAN}opencode --agent OpenAgent --model <provider/model>${NC}"
    echo ""
}

show_post_install() {
    echo ""
    print_step "Next Steps"
    
    echo "1. Review the installed components in ${CYAN}${INSTALL_DIR}/${NC}"
    
    local step_num=2
    if [ -f "${INSTALL_DIR}/env.example" ] || [ -f "env.example" ]; then
        echo "${step_num}. Copy env.example to .env and configure:"
        echo -e "   ${CYAN}cp env.example .env${NC}"
        step_num=$((step_num + 1))
    fi
    
    echo "${step_num}. Run the recommended workflow:"
    echo ""
    print_execution_workflow
    
    # Show installation location info
    print_info "Installation directory: ${CYAN}${INSTALL_DIR}${NC}"
    print_info "OAC config: ${CYAN}.oac/config.json${NC} (Quest + Experts + swarm defaults)"
    if [ -n "$OPENAGENT_SELECTED_MODEL" ]; then
        print_info "OpenCode config: ${CYAN}.opencode/opencode.json${NC} (default agent: OpenAgent, model: ${OPENAGENT_SELECTED_MODEL})"
    else
        print_info "OpenCode config: ${CYAN}.opencode/opencode.json${NC} (default agent: OpenAgent; model stays user-selected)"
    fi
    print_info "OAC legacy config: ${CYAN}.opencode/config.json${NC} (OpenAgent compatibility metadata)"
    print_info "Keep components current: ${CYAN}./update.sh${NC} (from project root) or curl update.sh | bash"
    
    # Check for backup directories
    local has_backup=0
    local backup_dir
    local backup_dirs=()

    shopt -s nullglob
    backup_dirs=("${INSTALL_DIR}.backup."*)
    shopt -u nullglob

    for backup_dir in "${backup_dirs[@]}"; do
        if [ -d "$backup_dir" ]; then
            has_backup=1
            break
        fi
    done
    if [ "$has_backup" -eq 1 ]; then
        print_info "Backup created - you can restore files from ${INSTALL_DIR}.backup.* if needed"
    fi
    
    print_info "Documentation: ${REPO_URL}"
    echo ""
    
    cleanup_and_exit 0
}

#############################################################################
# Component Listing
#############################################################################

list_components() {
    clear || true
    print_header
    
    echo -e "${BOLD}Available Components${NC}\n"
    
    local categories=("agents" "subagents" "commands" "tools" "plugins" "skills" "contexts")
    
    for category in "${categories[@]}"; do
        local cat_display
        cat_display=$(echo "$category" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
        echo -e "${CYAN}${BOLD}${cat_display}:${NC}"
        
        local components
        components=$(jq_exec ".components.${category}[]? | \"\(.id)|\(.name)|\(.description)\"" "$TEMP_DIR/registry.json")
        
        while IFS='|' read -r id name desc; do
            echo -e "  ${GREEN}${name}${NC} (${id})"
            echo -e "    ${desc}"
        done <<< "$components"
        
        echo ""
    done
}

#############################################################################
# Cleanup
#############################################################################

cleanup_and_exit() {
    rm -rf "$TEMP_DIR"
    exit "$1"
}

trap 'cleanup_and_exit 1' INT TERM

#############################################################################
# Main
#############################################################################

main() {
    # Parse command line arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --install-dir=*)
                CUSTOM_INSTALL_DIR="${1#*=}"
                # Basic validation - check not empty
                if [ -z "$CUSTOM_INSTALL_DIR" ]; then
                    echo "Error: --install-dir requires a non-empty path"
                    exit 1
                fi
                shift
                ;;
            --install-dir)
                if [ -n "$2" ] && [ "${2:0:1}" != "-" ]; then
                    CUSTOM_INSTALL_DIR="$2"
                    shift 2
                else
                    echo "Error: --install-dir requires a path argument"
                    exit 1
                fi
                ;;
            essential|--essential)
                INSTALL_MODE="profile"
                PROFILE="essential"
                NON_INTERACTIVE=true
                shift
                ;;
            developer|--developer)
                INSTALL_MODE="profile"
                PROFILE="developer"
                NON_INTERACTIVE=true
                shift
                ;;
            business|--business)
                INSTALL_MODE="profile"
                PROFILE="business"
                NON_INTERACTIVE=true
                shift
                ;;
            full|--full)
                INSTALL_MODE="profile"
                PROFILE="full"
                NON_INTERACTIVE=true
                shift
                ;;
            advanced|--advanced)
                INSTALL_MODE="profile"
                PROFILE="advanced"
                NON_INTERACTIVE=true
                shift
                ;;
            list|--list)
                check_dependencies
                fetch_registry
                list_components
                cleanup_and_exit 0
                ;;
            --with-claude)
                WITH_CLAUDE=true
                shift
                ;;
            --with-kimi)
                WITH_KIMI=true
                shift
                ;;
            --help|-h|help)
                print_header
                echo "Usage: $0 [PROFILE] [OPTIONS]"
                echo ""
                echo -e "${BOLD}Profiles:${NC}"
                echo "  essential, --essential    Minimal OpenAgent setup with Quest + Experts Mode defaults"
                echo "  developer, --developer    Coding setup with Quest + Experts Mode + swarm"
                echo "  business, --business      Business/revenue/investor workflows under OpenAgent"
                echo "  full, --full              Everything under one OpenAgent entrypoint"
                echo "  advanced, --advanced      Recommended/default full system plus meta/system-builder and ISO 21434/24089 compliance"
                echo ""
                echo -e "${BOLD}Options:${NC}"
                echo "  --install-dir PATH        Custom installation directory"
                echo "                            (default: .opencode)"
                echo "  --with-claude             Also install Claude Code integration"
                echo "  --with-kimi               Also install Kimi Code direct agent integration"
                echo "  list, --list              List all available components"
                echo "  help, --help, -h          Show this help message"
                echo ""
                echo -e "${BOLD}Environment Variables:${NC}"
                echo "  OPENCODE_INSTALL_DIR      Installation directory"
                echo "  OPENCODE_DEFAULT_PROFILE  Profile when non-interactive with no profile arg (default: advanced)"
                echo "  OAC_PROFILE               Alias for OPENCODE_DEFAULT_PROFILE (name or 1-5)"
                echo "  OPENCODE_BRANCH           Git branch to install from (default: main)"
                echo "  OPENAGENT_MODEL           Optional explicit model to pin in .opencode/opencode.json"
                echo "                            (default: unset; use the user's OpenCode-selected model)"
                echo "  OPENAGENT_SMALL_MODEL     Optional small model for lightweight OpenCode tasks"
                echo "                            (default: same as OPENAGENT_MODEL when set)"
                echo ""
                echo -e "${BOLD}Examples:${NC}"
                echo ""
                echo -e "  ${CYAN}# Interactive mode (choose location and components)${NC}"
                echo "  $0"
                echo ""
                echo -e "  ${CYAN}# Quick install with default location (.opencode/)${NC}"
                echo "  $0 advanced"
                echo ""
                echo -e "  ${CYAN}# Install with Claude Code support${NC}"
                echo "  $0 advanced --with-claude"
                echo ""
                echo -e "  ${CYAN}# Install with Kimi Code direct support${NC}"
                echo "  $0 advanced --with-kimi"
                echo ""
                echo -e "  ${CYAN}# Install to global location (Linux/macOS)${NC}"
                echo "  $0 advanced --install-dir ~/.config/opencode"
                echo ""
                echo -e "  ${CYAN}# Install to global location (Windows Git Bash)${NC}"
                echo "  $0 advanced --install-dir ~/.config/opencode"
                echo ""
                echo -e "  ${CYAN}# Install to custom location${NC}"
                echo "  $0 essential --install-dir ~/my-agents"
                echo ""
                echo -e "  ${CYAN}# Using environment variable${NC}"
                echo "  export OPENCODE_INSTALL_DIR=~/.config/opencode"
                echo "  $0 advanced"
                echo ""
                echo -e "  ${CYAN}# Install with a custom default model${NC}"
                echo "  OPENAGENT_MODEL=provider/model-id $0 advanced"
                echo ""
                echo -e "  ${CYAN}# Install from URL (non-interactive)${NC}"
                echo "  curl -fsSL ${RAW_URL}/install.sh | bash -s advanced"
                echo ""
                echo -e "${BOLD}Platform Support:${NC}"
                echo "  ✓ Linux (bash 3.2+)"
                echo "  ✓ macOS (bash 3.2+)"
                echo "  ✓ Windows (Git Bash, WSL)"
                echo ""
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run '$0 --help' for usage information"
                exit 1
                ;;
        esac
    done
    
    # Apply custom install directory if specified (CLI arg overrides env var)
    if [ -n "$CUSTOM_INSTALL_DIR" ]; then
        local normalized_path
        if normalize_and_validate_path "$CUSTOM_INSTALL_DIR" > /dev/null; then
            normalized_path=$(normalize_and_validate_path "$CUSTOM_INSTALL_DIR")
            INSTALL_DIR="$normalized_path"
            if ! validate_install_path "$INSTALL_DIR"; then
                print_warning "Installation path may have issues, but continuing..."
            fi
        else
            print_error "Invalid installation directory: $CUSTOM_INSTALL_DIR"
            exit 1
        fi
    fi
    
    check_bash_version
    check_dependencies
    maybe_enable_claude_from_repo
    maybe_enable_kimi_from_repo
    fetch_registry

    if [ -z "$PROFILE" ] && [ ! -t 0 ]; then
        INSTALL_MODE="profile"
        PROFILE="$(resolve_profile_name "$DEFAULT_PROFILE")"
        NON_INTERACTIVE=true
        print_info "No profile provided in non-interactive mode; defaulting to ${PROFILE} (profile 5 / advanced)"
    fi
    
    if [ -n "$PROFILE" ]; then
        # Non-interactive mode (compatible with bash 3.2+)
        SELECTED_COMPONENTS=()
        local temp_file="$TEMP_DIR/components.tmp"
        get_profile_components "$PROFILE" > "$temp_file"
        while IFS= read -r component; do
            [ -n "$component" ] && SELECTED_COMPONENTS+=("$component")
        done < "$temp_file"

        expand_selected_components

        # Resolve dependencies for profile installs
        print_step "Resolving dependencies..."
        local original_count=${#SELECTED_COMPONENTS[@]}
        for comp in "${SELECTED_COMPONENTS[@]}"; do
            resolve_dependencies "$comp"
        done

        local new_count=${#SELECTED_COMPONENTS[@]}
        if [ "$new_count" -gt "$original_count" ]; then
            local added=$((new_count - original_count))
            print_info "Added $added dependencies"
        fi

        show_installation_preview
    else
        # Interactive mode - show location menu first
        show_install_location_menu
        show_main_menu
        
        if [ "$INSTALL_MODE" = "profile" ]; then
            # Quick Install always maps to the Advanced profile (option 5).
            PROFILE="advanced"
            print_info "Auto-selecting advanced profile (OpenAgent Quest + Experts Mode + Agent Swarm + ISO 21434/24089)..."

            SELECTED_COMPONENTS=()
            local temp_file="$TEMP_DIR/components.tmp"
            get_profile_components "$PROFILE" > "$temp_file"
            while IFS= read -r component; do
                [ -n "$component" ] && SELECTED_COMPONENTS+=("$component")
            done < "$temp_file"

            expand_selected_components

            print_step "Resolving dependencies..."
            local original_count=${#SELECTED_COMPONENTS[@]}
            for comp in "${SELECTED_COMPONENTS[@]}"; do
                resolve_dependencies "$comp"
            done

            local new_count=${#SELECTED_COMPONENTS[@]}
            if [ "$new_count" -gt "$original_count" ]; then
                local added=$((new_count - original_count))
                print_info "Added $added dependencies"
            fi

            show_installation_preview
        elif [ "$INSTALL_MODE" = "custom" ]; then
            show_custom_menu
        fi
    fi
}

main "$@"

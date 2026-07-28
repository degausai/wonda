#!/usr/bin/env bash
# Wonda CLI installer — https://wondercat.ai
# https://github.com/degausai/wonda
set -euo pipefail

APP="wonda"
REPO="degausai/wonda"

MUTED='\033[0;2m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m'

usage() {
    cat <<EOF
Wonda Installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 0.1.0)
    --no-modify-path        Don't modify shell config files
    --no-app                Don't offer to install the wonda desktop app
                            (also skipped via WONDA_NO_AUTO_SETUP=1)

Examples:
    curl -fsSL https://wonda.sh/install.sh | bash
    curl -fsSL https://wonda.sh/install.sh | bash -s -- --version 0.1.0
EOF
}

requested_version=""
no_modify_path=false
no_app=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                echo -e "${RED}Error: --version requires a version argument${NC}"
                exit 1
            fi
            ;;
        --no-modify-path) no_modify_path=true; shift ;;
        --no-app) no_app=true; shift ;;
        *) echo -e "${RED}Unknown option: $1${NC}" >&2; shift ;;
    esac
done

# Detect OS
raw_os=$(uname -s)
case "$raw_os" in
    Darwin*) os="darwin" ;;
    Linux*)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) echo -e "${RED}Unsupported OS: $raw_os${NC}"; exit 1 ;;
esac

# Detect architecture
arch=$(uname -m)
case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    arm64)   arch="arm64" ;;
    *) echo -e "${RED}Unsupported architecture: $arch${NC}"; exit 1 ;;
esac

# Rosetta detection on macOS
if [ "$os" = "darwin" ] && [ "$arch" = "amd64" ]; then
    rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
    if [ "$rosetta_flag" = "1" ]; then
        arch="arm64"
    fi
fi

# Determine version
if [ -n "$requested_version" ]; then
    requested_version="${requested_version#v}"
    version="v${requested_version}"

    http_status=$(curl -sI -o /dev/null -w "%{http_code}" "https://github.com/$REPO/releases/tag/${version}")
    if [ "$http_status" = "404" ]; then
        echo -e "${RED}Error: Release ${version} not found${NC}"
        echo -e "${MUTED}Available releases: https://github.com/$REPO/releases${NC}"
        exit 1
    fi
else
    version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | \
        sed -n 's/.*"tag_name": *"\(v[^"]*\)".*/\1/p' | head -1)
    if [ -z "$version" ]; then
        echo -e "${RED}Error: No release found${NC}"
        exit 1
    fi
fi

# Set up install directory
INSTALL_DIR="$HOME/.wonda/bin"
mkdir -p "$INSTALL_DIR"

# Download
archive="${APP}_${version#v}_${os}_${arch}.tar.gz"
if [ "$os" = "windows" ]; then
    archive="${APP}_${version#v}_${os}_${arch}.zip"
fi

url="https://github.com/$REPO/releases/download/${version}/${archive}"

echo -e "\n${MUTED}Installing ${NC}wonda ${MUTED}version: ${NC}${version}"
echo -e "${MUTED}Platform: ${NC}${os}/${arch}"

tmp_dir=$(mktemp -d)
trap "rm -rf '$tmp_dir'" EXIT

if ! curl -# -fSL -o "$tmp_dir/$archive" "$url"; then
    echo -e "${RED}Error: Failed to download ${url}${NC}"
    exit 1
fi

# Verify checksum
checksums_url="https://github.com/$REPO/releases/download/${version}/checksums.txt"
if curl -fsSL -o "$tmp_dir/checksums.txt" "$checksums_url" 2>/dev/null; then
    expected=$(grep -F "$archive" "$tmp_dir/checksums.txt" | awk '{print $1}' || true)
    if [ -n "$expected" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
            actual=$(sha256sum "$tmp_dir/$archive" | awk '{print $1}')
        elif command -v shasum >/dev/null 2>&1; then
            actual=$(shasum -a 256 "$tmp_dir/$archive" | awk '{print $1}')
        else
            actual=""
        fi

        if [ -n "$actual" ]; then
            if [ "$actual" != "$expected" ]; then
                echo -e "${RED}Error: Checksum verification failed${NC}"
                echo -e "${MUTED}Expected: ${NC}${expected}"
                echo -e "${MUTED}Actual:   ${NC}${actual}"
                exit 1
            fi
            echo -e "${MUTED}Checksum: ${NC}verified"
        fi
    fi
fi

# Extract
if [ "$os" = "windows" ]; then
    unzip -q "$tmp_dir/$archive" -d "$tmp_dir"
else
    tar -xzf "$tmp_dir/$archive" -C "$tmp_dir"
fi

# Install
mv "$tmp_dir/$APP" "$INSTALL_DIR/$APP"
chmod 755 "$INSTALL_DIR/$APP"

# Add to PATH
if [[ "$no_modify_path" != "true" ]]; then
    current_shell=$(basename "${SHELL:-bash}")
    config_file=""

    case $current_shell in
        fish) config_files="$HOME/.config/fish/config.fish" ;;
        zsh)  config_files="${ZDOTDIR:-$HOME}/.zshrc" ;;
        bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile" ;;
        *)    config_files="$HOME/.bashrc $HOME/.profile" ;;
    esac

    for file in $config_files; do
        if [[ -f "$file" ]]; then
            config_file="$file"
            break
        fi
    done

    if [[ -n "$config_file" ]] && [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        if ! grep -q "$INSTALL_DIR" "$config_file" 2>/dev/null; then
            case $current_shell in
                fish) echo "fish_add_path $INSTALL_DIR" >> "$config_file" ;;
                *)    echo -e "\n# wonda\nexport PATH=$INSTALL_DIR:\$PATH" >> "$config_file" ;;
            esac
            echo -e "${MUTED}Added to PATH in ${NC}${config_file}"
        fi
    fi
fi

# GitHub Actions support
if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" = "true" ]; then
    echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

# ---------------------------------------------------------------------------
# Detect existing installs from other methods
# ---------------------------------------------------------------------------

# npm global install
npm_wonda=""
if command -v npm >/dev/null 2>&1; then
    npm_wonda=$(npm list -g @degausai/wonda --depth=0 2>/dev/null | grep -c "@degausai/wonda" || true)
fi
if [ "${npm_wonda:-0}" -gt 0 ]; then
    echo -e "${RED}⚠  wonda is also installed via npm.${NC}"
    echo -e "${MUTED}  The shell-installed version will take precedence on PATH.${NC}"
    echo -e "${MUTED}  To avoid conflicts, remove the npm version:${NC}"
    echo -e ""
    echo -e "  npm uninstall -g @degausai/wonda"
    echo -e ""
fi

# Homebrew install
if command -v brew >/dev/null 2>&1 && brew list wonda >/dev/null 2>&1; then
    echo -e "${RED}⚠  wonda is also installed via Homebrew.${NC}"
    echo -e "${MUTED}  The shell-installed version will take precedence on PATH.${NC}"
    echo -e "${MUTED}  To avoid conflicts, remove the Homebrew version:${NC}"
    echo -e ""
    echo -e "  brew uninstall wonda"
    echo -e ""
fi

# Done
echo -e ""
echo -e "${PURPLE}               l███+.        ~█▓▓>"
echo -e "              .█▒░░▒█@████████░░░█,"
echo -e "              I█░░██████████████▓█\\"
echo -e "              \\███████████████████>"
echo -e "            :<██████\\ ,,+███>:+! I@="
echo -e "        :<████████@,:@:>#|█@_- _% /█|"
echo -e "      i#██████████# /@\\*%/█@/#~~= |█<"
echo -e "     <█████████████- _>>!=██=I+_,:@█<"
echo -e "    *███████████████@<<<@█████@#████!"
echo -e "   ~███████████████████████████████~"
echo -e "  .██████████████████████████████@:"
echo -e "  /██████████████████████████████%"
echo -e "  _██████████████████████████████@,"
echo -e "  !█████@*█████*\\i.l<█████████████:"
echo -e "   %██████*~|/-<@███\\i███████████%"
echo -e "   ;█████████████████I+█████████+"
echo -e "     %███████████████.#██████@I"
echo -e "       _#█████████@-"
echo -e "           ,iIi:${NC}"
echo -e ""
echo -e "${MUTED}wonda ${NC}${version}${MUTED} installed successfully${NC}"
echo -e "${MUTED}Binary: ${NC}${INSTALL_DIR}/${APP}"
echo -e ""

# ---------------------------------------------------------------------------
# Desktop app install (relay + tray icon + open at login), with consent
# ---------------------------------------------------------------------------
# This is our interactive installer, so it may offer the full experience:
# 'wonda app install' downloads this version's signed desktop installer,
# verifies it against the release checksums, and runs it (macOS asks the
# normal sudo password). Consent-gated, default yes; skipped entirely when
# non-interactive (curl|bash keeps stdin on the script pipe, so the prompt
# and the CLI both talk to /dev/tty), in CI, with --no-app, or via
# WONDA_NO_AUTO_SETUP=1. Linux has no desktop app.
offer_app=true
if [ "$os" = "linux" ] || [ "$no_app" = "true" ]; then
    offer_app=false
elif [ -n "${WONDA_NO_AUTO_SETUP:-}" ] && [ "${WONDA_NO_AUTO_SETUP}" != "0" ] && [ "${WONDA_NO_AUTO_SETUP}" != "false" ]; then
    offer_app=false
elif [ -n "${CI:-}" ] && [ "${CI}" != "0" ] && [ "${CI}" != "false" ]; then
    offer_app=false
elif [ ! -t 2 ] || ! { : < /dev/tty; } 2>/dev/null; then
    # No terminal to prompt on (piped stderr, or no controlling tty).
    offer_app=false
fi

if [ "$offer_app" = "true" ]; then
    printf "Install the wonda desktop app and menu bar? (always-on relay, starts at login) [Y/n] " >&2
    IFS= read -r app_answer < /dev/tty || app_answer=""
    case "$(printf '%s' "$app_answer" | tr '[:upper:]' '[:lower:]')" in
        n|no)
            echo -e "${MUTED}Skipped. Get it any time with: ${NC}${APP} app install"
            ;;
        *)
            # stdin from /dev/tty so the CLI sees a real terminal (curl|bash
            # leaves stdin on the script pipe) and sudo can prompt.
            if ! "$INSTALL_DIR/$APP" app install < /dev/tty; then
                echo -e "${RED}The desktop app install did not finish.${NC} Retry with: ${APP} app install"
            fi
            ;;
    esac
    echo -e ""
elif [ "$os" != "linux" ]; then
    echo -e "${MUTED}Get the desktop app (menu bar + always-on relay) with: ${NC}${APP} app install"
    echo -e ""
fi

# Tell the user how to activate in the current shell
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${MUTED}To use wonda in this shell session:${NC}"
    echo -e ""
    echo -e "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo -e ""
    echo -e "${MUTED}Or reload your shell config:${NC}"
    if [ -n "${config_file:-}" ]; then
        echo -e ""
        echo -e "  source ${config_file}"
    else
        echo -e ""
        echo -e "  source ~/.bashrc  ${MUTED}# or ~/.zshrc${NC}"
    fi
    echo -e ""
fi

echo -e "${MUTED}Get started:${NC}"
echo -e ""
echo -e "  wonda auth login          ${MUTED}# Authenticate${NC}"
if [ "$os" != "linux" ]; then
    echo -e "  wonda app install         ${MUTED}# Desktop app: menu bar icon + always-on relay${NC}"
fi
echo -e "  wonda skill install -o .  ${MUTED}# Install skill file${NC}"
echo -e ""
echo -e "${MUTED}For more information: ${NC}https://wonda.sh/docs"
echo -e ""

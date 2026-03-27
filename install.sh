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

Examples:
    curl -fsSL https://wonda.sh/install.sh | bash
    curl -fsSL https://wonda.sh/install.sh | bash -s -- --version 0.1.0
EOF
}

requested_version=""
no_modify_path=false

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
echo -e "  wonda skill install -o .  ${MUTED}# Install skill file${NC}"
echo -e ""
echo -e "${MUTED}For more information: ${NC}https://wonda.sh/docs"
echo -e ""

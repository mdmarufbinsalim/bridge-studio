#!/usr/bin/env bash
# BridgeAudio installer/updater for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/mdmarufbinsalim/bridge-studio/main/install.sh | bash
#
# Re-running this script updates an existing install in place (fetches latest, rebuilds).
set -euo pipefail

REPO_URL="https://github.com/mdmarufbinsalim/bridge-studio.git"
INSTALL_DIR="${BRIDGE_AUDIO_INSTALL_DIR:-$HOME/.local/share/bridgeaudio}"
BIN_DIR="${BRIDGE_AUDIO_BIN_DIR:-$HOME/.local/bin}"
MIN_NODE_MAJOR=18
PNPM_VERSION="9.15.0"

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }

if [ "$(uname -s)" != "Linux" ]; then
  err "BridgeAudio's desktop side only runs on Linux (it drives PipeWire via pactl/pw-cat). Detected: $(uname -s)"
  exit 1
fi

# --- Node.js: required, not auto-installed (versions/managers vary too much to do this safely) ---
if ! command -v node >/dev/null 2>&1; then
  err "Node.js ${MIN_NODE_MAJOR}+ is required but wasn't found."
  err "Install it from https://nodejs.org/ or via nvm (https://github.com/nvm-sh/nvm), then re-run this installer."
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
  err "Node.js ${MIN_NODE_MAJOR}+ is required (found $(node -v))."
  exit 1
fi

# --- pnpm: small enough to bootstrap ourselves via corepack (ships with Node) ---
if ! command -v pnpm >/dev/null 2>&1; then
  log "pnpm not found — installing it..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
  else
    npm install -g pnpm
  fi
fi

# --- PipeWire (pactl + pw-cat): the actual audio backend, install via the system package manager ---
if ! command -v pactl >/dev/null 2>&1 || ! command -v pw-cat >/dev/null 2>&1; then
  if [ "${BRIDGE_AUDIO_SKIP_PIPEWIRE_INSTALL:-0}" = "1" ]; then
    err "PipeWire tools (pactl/pw-cat) not found, and BRIDGE_AUDIO_SKIP_PIPEWIRE_INSTALL=1 is set."
    err "Install pipewire + pipewire-pulse (and wireplumber) yourself before running bridgeaudio."
    exit 1
  fi
  log "PipeWire tools (pactl/pw-cat) not found — attempting to install them via your package manager..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y pipewire pipewire-pulse pipewire-audio-client-libraries wireplumber
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y pipewire pipewire-pulseaudio wireplumber
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --needed --noconfirm pipewire pipewire-pulse wireplumber
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y pipewire pipewire-pulseaudio wireplumber
  elif command -v apk >/dev/null 2>&1; then
    sudo apk add pipewire pipewire-pulse wireplumber
  else
    err "Could not detect a supported package manager (apt/dnf/pacman/zypper/apk) to install PipeWire automatically."
    err "Please install PipeWire yourself (with its PulseAudio-compat layer: pactl, pw-cat), then re-run this installer."
    exit 1
  fi
  if ! command -v pactl >/dev/null 2>&1 || ! command -v pw-cat >/dev/null 2>&1; then
    err "PipeWire tools still aren't on PATH after installing — you may need to start a new shell session, or install manually."
    exit 1
  fi
fi

# --- clone, or update an existing install (this is also how re-running this script upgrades) ---
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --depth 1 origin main
  git -C "$INSTALL_DIR" reset --hard origin/main
else
  log "Cloning BridgeAudio into $INSTALL_DIR..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

log "Installing dependencies (this can take a minute)..."
(cd "$INSTALL_DIR" && pnpm install)

log "Building..."
(cd "$INSTALL_DIR" && pnpm --filter desktop... build)

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/bridgeaudio" <<WRAPPER
#!/usr/bin/env bash
exec node "$INSTALL_DIR/apps/desktop/dist/cli.js" "\$@"
WRAPPER
chmod +x "$BIN_DIR/bridgeaudio"

log ""
log "BridgeAudio installed."
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    log "Note: $BIN_DIR isn't on your PATH yet. Add this to your shell profile (~/.bashrc, ~/.zshrc, ...):"
    log "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
log "Run 'bridgeaudio' to start, 'bridgeaudio stop' to stop, 'bridgeaudio --help' for more."
log "Re-run this installer any time to update."

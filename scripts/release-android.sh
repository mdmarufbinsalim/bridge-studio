#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/apps/android"
RELEASE_APK="$REPO_ROOT/releases/bridge-audio.apk"
RELEASE_TAG="android-latest"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$1"; }
fail() { printf "\n\033[1;31mERROR:\033[0m %s\n" "$1"; exit 1; }

command -v pnpm >/dev/null || fail "pnpm not found."
command -v gh >/dev/null || fail "GitHub CLI (gh) not found — needed to publish the APK as a release asset (it's too large for a normal git commit)."
[[ -f "$ANDROID_DIR/package.json" ]] || fail "Android app not found at $ANDROID_DIR."

log "Running expo prebuild (android)..."
cd "$ANDROID_DIR"
npx expo prebuild --platform android --no-install

[[ -f "$ANDROID_DIR/android/local.properties" ]] || {
  ANDROID_SDK_DIR="${ANDROID_HOME:-$HOME/Android/Sdk}"
  echo "sdk.dir=$ANDROID_SDK_DIR" > "$ANDROID_DIR/android/local.properties"
}

log "Building release APK with Gradle..."
cd "$ANDROID_DIR/android"
./gradlew assembleRelease --console=plain

BUILT_APK="$ANDROID_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$BUILT_APK" ]] || fail "Build succeeded but APK not found at $BUILT_APK."

mkdir -p "$(dirname "$RELEASE_APK")"
cp "$BUILT_APK" "$RELEASE_APK"

# GitHub rejects any git-committed file over 100MB, and this APK runs well past that (it bundles
# all four Android ABIs). Published as a GitHub Release asset instead, under a fixed tag so the
# download URL never changes between releases.
log "Publishing to GitHub Release \"$RELEASE_TAG\"..."
if gh release view "$RELEASE_TAG" --repo mdmarufbinsalim/bridge-studio >/dev/null 2>&1; then
  gh release upload "$RELEASE_TAG" "$RELEASE_APK" --repo mdmarufbinsalim/bridge-studio --clobber
else
  gh release create "$RELEASE_TAG" "$RELEASE_APK" \
    --repo mdmarufbinsalim/bridge-studio \
    --title "BridgeAudio Android (latest)" \
    --notes "Automatically published by \`pnpm release:android\`. Always the latest build — this release is overwritten in place, not versioned."
fi

log "Done! Available at:"
echo "  https://github.com/mdmarufbinsalim/bridge-studio/releases/download/$RELEASE_TAG/bridge-audio.apk"

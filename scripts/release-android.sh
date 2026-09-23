#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/apps/android"
RELEASE_APK="$REPO_ROOT/releases/bridge-audio.apk"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$1"; }
fail() { printf "\n\033[1;31mERROR:\033[0m %s\n" "$1"; exit 1; }

command -v pnpm >/dev/null || fail "pnpm not found."
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

log "Publishing to releases/bridge-audio.apk..."
mkdir -p "$(dirname "$RELEASE_APK")"
cp "$BUILT_APK" "$RELEASE_APK"
git -C "$REPO_ROOT" add "$RELEASE_APK"

log "Done! Staged $RELEASE_APK — review and commit when ready:"
echo "  git commit -m \"Release Android app\""

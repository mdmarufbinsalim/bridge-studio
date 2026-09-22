#!/usr/bin/env bash

set -Eeuo pipefail

#############################################
# Configuration
#############################################

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$REPO_ROOT/apps/android"
RELEASES_DIR="$REPO_ROOT/releases"
RELEASE_PREFIX="bridge-audio"

#############################################
# Helpers
#############################################

log() {
  printf "\n\033[1;34m==>\033[0m %s\n" "$1"
}

fail() {
  printf "\n\033[1;31mERROR:\033[0m %s\n" "$1"
  exit 1
}

command -v pnpm >/dev/null || fail "pnpm not found."
[[ -f "$ANDROID_DIR/package.json" ]] || fail "Android app not found at $ANDROID_DIR."

#############################################
# Regenerate native project
#############################################

log "Running expo prebuild (android)..."

cd "$ANDROID_DIR"
npx expo prebuild --platform android --no-install

[[ -f "$ANDROID_DIR/android/local.properties" ]] || {
  ANDROID_SDK_DIR="${ANDROID_HOME:-$HOME/Android/Sdk}"
  echo "sdk.dir=$ANDROID_SDK_DIR" > "$ANDROID_DIR/android/local.properties"
}

#############################################
# Build
#############################################

log "Building debug APK with Gradle..."

cd "$ANDROID_DIR/android"
./gradlew assembleDebug --console=plain

BUILT_APK="$ANDROID_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
[[ -f "$BUILT_APK" ]] || fail "Build succeeded but APK not found at $BUILT_APK."

#############################################
# Publish with an incrementing release number
#############################################

log "Publishing to releases/..."

mkdir -p "$RELEASES_DIR"

NEXT_NUMBER=1
for existing in "$RELEASES_DIR/${RELEASE_PREFIX}-"*.apk; do
  [[ -e "$existing" ]] || continue
  number="$(basename "$existing" .apk)"
  number="${number#"${RELEASE_PREFIX}"-}"
  if [[ "$number" =~ ^[0-9]+$ ]] && (( number >= NEXT_NUMBER )); then
    NEXT_NUMBER=$((number + 1))
  fi
done

RELEASE_APK="$RELEASES_DIR/${RELEASE_PREFIX}-${NEXT_NUMBER}.apk"
cp "$BUILT_APK" "$RELEASE_APK"

log "Done!"
echo "$RELEASE_APK"

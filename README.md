# BridgeAudio

Use Bluetooth earbuds paired to your phone as your Linux desktop's speakers
and microphone, over your local network — no cables, no re-pairing.

- **Playback:** Linux desktop audio → PC → Wi-Fi → phone → Bluetooth earbuds
- **Microphone:** Bluetooth earbuds → phone → Wi-Fi → PC → Linux microphone

*(Screenshots coming soon.)*

## Install

**Desktop (Linux):**

```bash
curl -fsSL https://raw.githubusercontent.com/mdmarufbinsalim/bridge-studio/main/install.sh | bash
```

Installs a `bridgeaudio` command. Requires Node.js 18+ (installed separately)
and PipeWire, which the installer will try to install for you if missing.

**Android:** download the latest APK —
[bridge-audio.apk](https://github.com/mdmarufbinsalim/bridge-studio/releases/download/android-latest/bridge-audio.apk)
— and install it (you'll need to allow installs from your browser/file
manager the first time). A Play Store listing isn't available yet.

## Use it

```bash
bridgeaudio
```

This prints a QR code and starts listening on your local network. Open the
BridgeAudio app on your phone, scan the code (or enter the IP/port shown
manually), and audio starts flowing.

```bash
bridgeaudio stop      # stop it, from any terminal
bridgeaudio status    # check whether it's running
bridgeaudio --verbose # start with full debug logging
```

## How it works

The desktop side creates a virtual PipeWire audio device; whatever your
Linux system plays gets captured, framed, and sent over the network (UDP,
with a jitter buffer and loss concealment on the receiving end) to the phone,
which plays it through whatever output it's currently routed to — your
earbuds, if connected. See [docs/architecture.md](docs/architecture.md) for
the full package layout and data flow.

## Monorepo layout

```
apps/
  desktop/      Node.js server + bridgeaudio CLI (Linux)
  android/      Expo/React Native app + Kotlin native module
packages/
  audio-core/   AudioFormat, AudioFrame, jitter buffer, stream interfaces
  protocol/     wire format: handshake, control messages, frame codec
  transport/    generic Transport interface + TCP/UDP implementations
  session/      session lifecycle, reconnection, per-direction streams
platform/
  linux/        PipeWire capture + virtual mic/speaker sinks
docs/
scripts/        release-android.sh (pnpm release:android)
install.sh      Linux installer/updater for the desktop CLI
```

## Development

Requires pnpm (`packageManager` pins `pnpm@9.15.0`).

```bash
pnpm install
pnpm build
pnpm --filter desktop start:dev   # run the server without installing the CLI
```

## Releasing the Android app

```bash
pnpm release:android
```

Builds a release APK and publishes it as the `android-latest` GitHub
Release asset (a fixed tag/filename, overwritten in place, so the download
link above never changes) — it's too large for a normal git commit
(GitHub's 100MB file limit; this APK bundles all four Android ABIs).

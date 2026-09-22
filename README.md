# BridgeAudio

An open-source Linux ↔ Android audio bridge: use Bluetooth earbuds paired to
your phone as your Linux desktop's speakers and microphone, over the local
network.

- **Playback:** Linux desktop audio → PC server → LAN → Android → Bluetooth earbuds
- **Microphone:** Bluetooth earbuds → Android → LAN → PC server → Linux microphone

V1 targets Linux + Android over TCP/LAN. The architecture (`audio-core`,
`protocol`, `transport`, `session`) is platform- and transport-agnostic so
Windows/macOS/iOS and other transports can be added later without rewrites.
See [docs/architecture.md](docs/architecture.md) for the full design and
current implementation status.

## Monorepo layout

```
apps/
  desktop/      Node.js server (Linux)
  android/      Expo/React Native app + Kotlin native module
packages/
  audio-core/   AudioFormat, AudioFrame, bounded buffers, stream interfaces
  protocol/     wire format: handshake, control messages, frame codec
  transport/    generic Transport interface + TCP implementation
  session/      session lifecycle, reconnection, per-direction streams
platform/
  linux/        PipeWire capture + virtual microphone (isolated here)
docs/
tests/
```

## Development

Requires pnpm (`packageManager` pins `pnpm@9.15.0`).

```bash
pnpm install
pnpm build
```

Try the current milestone — a desktop server and a test client that
establish a session over TCP and exchange framed audio data:

```bash
pnpm --filter desktop start:dev      # terminal 1
pnpm --filter desktop test-client    # terminal 2
```

The Android app (`pnpm --filter android start`) currently ships UI and state
only; its native audio path and TCP transport land in a later phase (see
docs/architecture.md).

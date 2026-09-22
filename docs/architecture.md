# BridgeAudio Architecture

BridgeAudio bridges Linux desktop audio and Android, so Bluetooth earbuds
paired to the phone can be used as the PC's speakers and microphone over the
local network.

## Data flow

**Playback:** Linux app → PipeWire → `platform/linux` → `audio-core` →
`protocol` → TCP (`transport`) → Android → Kotlin native module → Bluetooth
earbuds.

**Microphone:** Bluetooth earbuds → Android Bluetooth input → Kotlin native
module → `audio-core`/`protocol` → TCP → desktop server → `platform/linux` →
virtual microphone → Linux app.

Playback and microphone are independent logical streams (distinguished by
`StreamKind`), each with its own buffering, enable/disable state, and error
handling, so either direction can run, fail, or be toggled without affecting
the other.

## Package boundaries

- `audio-core` — `AudioFormat`, `AudioFrame`, bounded buffers (`RingBuffer`,
  `JitterBuffer`), and the `AudioSource`/`AudioSink` interfaces platform
  implementations fulfill. No transport, protocol, or platform knowledge.
- `protocol` — wire format: protocol version, handshake, control messages,
  binary `AudioFrame` encode/decode, and stream framing over an arbitrary
  byte stream. Depends only on `audio-core`. Knows nothing about TCP.
- `transport` — the generic `Transport`/`TransportConnector`/
  `TransportListener` interfaces plus the v1 TCP implementation. Knows
  nothing about audio or the BridgeAudio protocol.
- `session` — client/server session lifecycle (handshake, state machine,
  reconnection with backoff) and per-direction (`DirectionalStream`)
  buffering. Composes `protocol` + `transport`.
- `platform/linux` — PipeWire capture and virtual-microphone sink. All
  PipeWire-specific types stay inside this package; it only exposes
  `audio-core`'s `AudioSource`/`AudioSink` interfaces outward. This isolation
  is what lets future Windows/macOS platform packages slot in without
  touching `audio-core`, `protocol`, `transport`, or `session`.
- `apps/desktop` — plain Node.js server composing `session` + `transport` +
  (eventually) `platform/linux`.
- `apps/android` — Expo/React Native UI, Redux Toolkit connection state, and
  a Kotlin native module (Expo Modules API) for Bluetooth-routed microphone
  capture and PCM playback.

## Why TCP first, and why the abstraction

V1 uses TCP because it's simple to get correct (ordered, reliable) while the
rest of the architecture is proven out. `transport` is a generic interface
specifically so a future UDP (or other) transport can be added without
touching `protocol`, `session`, or any platform code — but UDP is
out of scope until TCP latency has been measured.

## Current status

Implemented: monorepo skeleton, `audio-core`, `protocol` (framing + codec),
`transport` (interface + TCP), `session` (handshake, framing routing,
reconnection), a minimal desktop server, and a Node test client that proves
the TCP handshake + audio-frame exchange end-to-end.

Not yet implemented (later phases per the roadmap): PipeWire capture/sink,
the Android Kotlin native module, and the Android TCP transport
(`RnTcpConnector`) — these currently throw "not implemented yet" so the
package boundaries exist without pretending the platform code works.

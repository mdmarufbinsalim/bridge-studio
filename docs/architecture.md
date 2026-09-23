# BridgeAudio Architecture

BridgeAudio bridges Linux desktop audio and Android, so Bluetooth earbuds
paired to the phone can be used as the PC's speakers and microphone over the
local network.

## Data flow

**Playback:** Linux app → PipeWire → `platform/linux` (capture from a
dedicated virtual sink) → `audio-core` (chunking) → `protocol` (framing) →
UDP (`transport`) → Android → Kotlin native module → `AudioTrack` →
Bluetooth earbuds. A jitter buffer with loss concealment smooths out network
jitter and drops on the receiving end.

**Microphone:** Bluetooth earbuds → Android `AudioRecord` → Kotlin native
module → `audio-core`/`protocol` → UDP → desktop server → `platform/linux`
(virtual microphone sink) → Linux app.

TCP carries the handshake and control messages; once a session is active,
audio frames switch to UDP so a single lost packet is just a dropped frame
instead of head-of-line-blocking everything behind it. Playback and
microphone are independent logical streams (`StreamKind`), each with its own
lifecycle, so either direction can run, fail, or be toggled without
affecting the other.

## Package boundaries

- `audio-core` — `AudioFormat`, `AudioFrame`, bounded buffers (`RingBuffer`,
  `JitterBuffer`), `PcmChunker`, and the `AudioSource`/`AudioSink` interfaces
  platform implementations fulfill. No transport, protocol, or platform
  knowledge.
- `protocol` — wire format: protocol version, handshake, control messages,
  binary `AudioFrame` encode/decode. Depends only on `audio-core`.
- `transport` — the generic `Transport`/`TransportConnector`/
  `TransportListener` interfaces plus TCP and UDP implementations. Knows
  nothing about audio or the BridgeAudio protocol.
- `session` — client/server session lifecycle (handshake, state machine,
  reconnection with backoff), switching audio onto UDP once a peer address is
  known. Composes `protocol` + `transport`.
- `platform/linux` — all PipeWire-specific code (via `pactl`/`pw-cat`):
  a dedicated, always-present virtual speaker sink for capture (rather than
  chasing PipeWire's "default sink", which is unreliable without persistent
  real hardware) and a virtual microphone sink other apps can select as
  input. Only exposes `audio-core`'s `AudioSource`/`AudioSink` interfaces
  outward, so future Windows/macOS platform packages can slot in without
  touching anything above this layer.
- `apps/desktop` — the Node.js server and the `bridgeaudio` CLI (start/stop/
  status via a pidfile), composing `session` + `transport` + `platform/linux`.
- `apps/android` — Expo/React Native UI, Redux Toolkit connection state, and
  a Kotlin native module (Expo Modules API) for Bluetooth-routed audio
  capture/playback and a raw UDP socket (no base64 overhead on the JS
  thread).

## Why UDP for audio, TCP for everything else

TCP's head-of-line blocking meant one lost segment stalled every audio frame
behind it, audible as stutter. UDP has no such ordering guarantee, so a lost
packet is just a dropped frame — the jitter buffer conceals it with a
gain-ramped repeat instead of waiting. TCP stays for the handshake/control
channel, where ordering and delivery guarantees matter and the data volume
is tiny.

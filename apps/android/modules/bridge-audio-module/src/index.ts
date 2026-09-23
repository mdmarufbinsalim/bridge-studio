import { NativeModule, requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface MicrophoneChunkEvent {
  /** Raw PCM bytes captured since the previous event, passed as a typed array with no serialization step. */
  chunk: Uint8Array;
}

export interface UdpMessageEvent {
  data: Uint8Array;
  host: string;
  port: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required to satisfy expo-modules-core's EventsMap constraint
interface BridgeAudioEvents extends Record<string, (...args: any[]) => void> {
  onMicrophoneChunk: (event: MicrophoneChunkEvent) => void;
  onUdpMessage: (event: UdpMessageEvent) => void;
}

/**
 * TypeScript surface for the native Kotlin module (Expo Modules API). Kotlin
 * owns Bluetooth-route selection, microphone capture (AudioRecord), PCM
 * playback (AudioTrack), and raw UDP send/receive — nothing here
 * reimplements that logic in JS. See android/src/main/java/com/bridgeaudio/module
 * for the implementation.
 *
 * Audio bytes and UDP datagrams cross the bridge as raw Uint8Array/ByteArray
 * (JSI-backed), never as base64 — base64 round-tripping per packet was a
 * measurable source of added latency and JS-thread jank, and the reason
 * this module owns UDP directly rather than using a third-party library
 * (react-native-udp) that base64-encodes every packet on the JS thread.
 */
declare class NativeBridgeAudioModule extends NativeModule<BridgeAudioEvents> {
  startMicrophoneCapture(sampleRate: number, channels: number, bitsPerSample: number): Promise<void>;
  stopMicrophoneCapture(): Promise<void>;
  startPlayback(sampleRate: number, channels: number, bitsPerSample: number): Promise<void>;
  stopPlayback(): Promise<void>;
  writePlaybackChunk(chunk: Uint8Array): void;
  openUdpSocket(): Promise<number>;
  sendUdp(host: string, port: number, data: Uint8Array): void;
  closeUdpSocket(): Promise<void>;
}

const native = requireNativeModule<NativeBridgeAudioModule>('BridgeAudioModule');

export function startMicrophoneCapture(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Promise<void> {
  return native.startMicrophoneCapture(sampleRate, channels, bitsPerSample);
}

export function stopMicrophoneCapture(): Promise<void> {
  return native.stopMicrophoneCapture();
}

export function startPlayback(sampleRate: number, channels: number, bitsPerSample: number): Promise<void> {
  return native.startPlayback(sampleRate, channels, bitsPerSample);
}

export function stopPlayback(): Promise<void> {
  return native.stopPlayback();
}

/** `chunk` is written to the native AudioTrack for Bluetooth-routed playback. */
export function writePlaybackChunk(chunk: Uint8Array): void {
  native.writePlaybackChunk(chunk);
}

export function onMicrophoneChunk(listener: (event: MicrophoneChunkEvent) => void): EventSubscription {
  return native.addListener('onMicrophoneChunk', listener);
}

/** Binds a UDP socket to an OS-assigned ephemeral port and starts receiving. Returns the bound port. */
export function openUdpSocket(): Promise<number> {
  return native.openUdpSocket();
}

export function sendUdp(host: string, port: number, data: Uint8Array): void {
  native.sendUdp(host, port, data);
}

export function closeUdpSocket(): Promise<void> {
  return native.closeUdpSocket();
}

export function onUdpMessage(listener: (event: UdpMessageEvent) => void): EventSubscription {
  return native.addListener('onUdpMessage', listener);
}

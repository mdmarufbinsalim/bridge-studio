import { NativeModule, requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface MicrophoneChunkEvent {
  /** Base64-encoded PCM bytes captured since the previous event. */
  base64Chunk: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required to satisfy expo-modules-core's EventsMap constraint
interface BridgeAudioEvents extends Record<string, (...args: any[]) => void> {
  onMicrophoneChunk: (event: MicrophoneChunkEvent) => void;
}

/**
 * TypeScript surface for the native Kotlin module (Expo Modules API). Kotlin
 * owns Bluetooth-route selection, microphone capture (AudioRecord), and PCM
 * playback (AudioTrack) — nothing here reimplements that logic in JS.
 * See android/src/main/java/com/bridgeaudio/module for the implementation.
 */
declare class NativeBridgeAudioModule extends NativeModule<BridgeAudioEvents> {
  startMicrophoneCapture(sampleRate: number, channels: number, bitsPerSample: number): Promise<void>;
  stopMicrophoneCapture(): Promise<void>;
  startPlayback(sampleRate: number, channels: number, bitsPerSample: number): Promise<void>;
  stopPlayback(): Promise<void>;
  writePlaybackChunk(base64Chunk: string): void;
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
  native.writePlaybackChunk(base64Encode(chunk));
}

export function onMicrophoneChunk(listener: (event: MicrophoneChunkEvent) => void): EventSubscription {
  return native.addListener('onMicrophoneChunk', listener);
}

export function decodeMicrophoneChunk(event: MicrophoneChunkEvent): Uint8Array {
  return base64Decode(event.base64Chunk);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

import { requireNativeModule } from 'expo-modules-core';

/**
 * TypeScript surface for the native Kotlin module (Expo Modules API). The
 * Kotlin side owns Bluetooth-route selection, microphone capture, and PCM
 * playback — nothing here reimplements that logic in JS. See
 * apps/android/modules/bridge-audio-module for the native implementation
 * (added in a later phase; this module is not registered yet).
 */
export interface BridgeAudioNativeModule {
  startMicrophoneCapture(): Promise<void>;
  stopMicrophoneCapture(): Promise<void>;
  startPlayback(sampleRate: number, channels: number, bitsPerSample: number): Promise<void>;
  stopPlayback(): Promise<void>;
  writePlaybackChunk(chunk: Uint8Array): void;
}

export function getBridgeAudioNativeModule(): BridgeAudioNativeModule {
  return requireNativeModule<BridgeAudioNativeModule>('BridgeAudioModule');
}

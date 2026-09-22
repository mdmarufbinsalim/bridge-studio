import type { AudioFormat } from './AudioFormat.js';

/** A source of raw PCM audio (e.g. desktop capture, Android microphone). Platform-agnostic. */
export interface AudioSource {
  readonly format: AudioFormat;
  start(onData: (chunk: Uint8Array) => void): Promise<void>;
  stop(): Promise<void>;
}

/** A sink that plays or forwards raw PCM audio (e.g. desktop virtual mic, Android speaker/earbuds). */
export interface AudioSink {
  readonly format: AudioFormat;
  start(): Promise<void>;
  write(chunk: Uint8Array): void;
  stop(): Promise<void>;
}

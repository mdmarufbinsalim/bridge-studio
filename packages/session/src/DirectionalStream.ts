import type { AudioFrame, StreamKind } from '@bridge-audio/audio-core';
import { JitterBuffer } from '@bridge-audio/audio-core';

/**
 * State and bounded buffering for one logical direction (playback or
 * microphone). Independent per direction so either can be enabled/disabled,
 * fail, or be buffered without affecting the other.
 */
export class DirectionalStream {
  private readonly buffer: JitterBuffer;
  private enabled = false;
  private lastError: Error | undefined;

  constructor(
    readonly streamId: string,
    readonly streamKind: StreamKind,
    bufferCapacity = 64,
  ) {
    this.buffer = new JitterBuffer(bufferCapacity);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get error(): Error | undefined {
    return this.lastError;
  }

  enable(): void {
    this.enabled = true;
    this.lastError = undefined;
  }

  disable(): void {
    this.enabled = false;
    this.buffer.reset();
  }

  ingest(frame: AudioFrame): void {
    if (!this.enabled) return;
    this.buffer.push(frame);
  }

  drainReady(): AudioFrame[] {
    return this.buffer.drain();
  }

  setError(error: Error): void {
    this.lastError = error;
  }

  get stats(): { pending: number; dropped: number } {
    return { pending: this.buffer.pendingCount, dropped: this.buffer.dropped };
  }
}

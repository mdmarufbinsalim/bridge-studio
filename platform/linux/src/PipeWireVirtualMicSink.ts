import type { AudioFormat, AudioSink } from '@bridge-audio/audio-core';

/**
 * Publishes received PCM audio as a PipeWire virtual microphone source that
 * other Linux applications can select as an input device. PipeWire specifics
 * stay isolated here; see PipeWireAudioSource for the boundary rationale.
 *
 * Not yet implemented — lands alongside PipeWireAudioSource in a later phase.
 */
export class PipeWireVirtualMicSink implements AudioSink {
  constructor(readonly format: AudioFormat) {}

  async start(): Promise<void> {
    throw new Error('PipeWireVirtualMicSink is not implemented yet');
  }

  write(_chunk: Uint8Array): void {
    throw new Error('PipeWireVirtualMicSink is not implemented yet');
  }

  async stop(): Promise<void> {
    throw new Error('PipeWireVirtualMicSink is not implemented yet');
  }
}

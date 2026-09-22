import type { AudioFormat, AudioSource } from '@bridge-audio/audio-core';

/**
 * Captures desktop playback audio via PipeWire. All PipeWire-specific
 * concepts (nodes, ports, links) are confined to this file — nothing here
 * is imported outside `platform/linux`, so audio-core/protocol/transport/
 * session stay free of PipeWire assumptions.
 *
 * Not yet implemented — PipeWire integration lands in a later phase, once
 * the transport/session/protocol path is proven end-to-end with a
 * synthetic AudioSource.
 */
export class PipeWireAudioSource implements AudioSource {
  constructor(readonly format: AudioFormat) {}

  async start(_onData: (chunk: Uint8Array) => void): Promise<void> {
    throw new Error('PipeWireAudioSource is not implemented yet');
  }

  async stop(): Promise<void> {
    throw new Error('PipeWireAudioSource is not implemented yet');
  }
}

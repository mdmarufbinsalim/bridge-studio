import { bytesPerFrame, createAudioFrame, PcmChunker, type AudioFormat } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import { PipeWireAudioSource } from '@bridge-audio/platform-linux';

// 5ms @ 48kHz. Audio now travels over UDP (see server.ts), so each frame must fit in one IP
// packet — a datagram that gets fragmented loses everything if any one fragment is lost, which
// defeats the point of using UDP instead of TCP in the first place. 480 samples (10ms, the old
// TCP-era size) produced a ~1990-byte datagram, over the common 1500-byte Ethernet MTU; 240
// keeps the whole frame (payload + protocol header + UDP/IP headers) safely under it.
const SAMPLES_PER_CHUNK = 240;
export const PLAYBACK_STREAM_ID = 'desktop-playback';

/**
 * Captures desktop audio via PipeWire and forwards it to the connected
 * session as framed playback frames. Independent of the microphone
 * direction — its own buffering, its own lifecycle.
 */
export async function startPlaybackForwarding(
  session: Session,
  format: AudioFormat,
): Promise<() => Promise<void>> {
  const source = new PipeWireAudioSource(format);
  const chunker = new PcmChunker(bytesPerFrame(format) * SAMPLES_PER_CHUNK);
  let seq = 0;

  session.sendControl({
    type: 'stream_start',
    streamId: PLAYBACK_STREAM_ID,
    streamKind: 'playback',
    format,
  });

  await source.start((chunk) => {
    for (const frameBytes of chunker.push(chunk)) {
      session.sendAudioFrame(
        createAudioFrame({
          streamId: PLAYBACK_STREAM_ID,
          streamKind: 'playback',
          seq: seq++,
          timestamp: Date.now(),
          format,
          payload: frameBytes,
        }),
      );
    }
  });

  return async () => {
    await source.stop();
    session.sendControl({ type: 'stream_stop', streamId: PLAYBACK_STREAM_ID });
  };
}

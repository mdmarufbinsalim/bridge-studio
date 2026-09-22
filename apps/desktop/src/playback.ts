import { bytesPerFrame, createAudioFrame, PcmChunker, type AudioFormat } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import { PipeWireAudioSource } from '@bridge-audio/platform-linux';

const SAMPLES_PER_CHUNK = 480; // 10ms @ 48kHz
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

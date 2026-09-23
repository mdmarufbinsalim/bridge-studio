import { bytesPerFrame, createAudioFrame, PcmChunker, type AudioFormat } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import { PipeWireAudioSource } from '@bridge-audio/platform-linux';

// 5ms @ 48kHz. Audio travels over UDP (see server.ts), so each frame must fit in one IP packet —
// a fragmented datagram loses everything if any one fragment is lost. 480 samples (10ms, the old
// TCP-era size) produced a ~1990-byte datagram, over the common 1500-byte Ethernet MTU; 240
// keeps the whole frame safely under it.
//
// 10,000 samples (~208ms/chunk) was tried here to reduce packet-loss frequency by cutting the
// packet rate way down — it sounded smoother, but silently added 1.5-2 seconds of real lag. The
// jitter buffer's max-wait is capped in *frame count* (6 frames), not time, so at 208ms/frame a
// single lost frame means waiting up to 6×208ms (~1.25s) before giving up — on top of ~208ms of
// pure capture-side buffering before a chunk is even sent in the first place. Small chunks keep
// every one of those latency budgets small too. The actual bugs behind that session's audio
// problems (real routing, persisted volume corruption, a UDP crash — see git history) are now
// fixed independently, so the tradeoff 10,000 was papering over shouldn't be needed here.
//
// A paced sender (queue + setInterval, decoupling "when PipeWire produced this" from "when we
// transmit it") was also tried and made things worse — its small bounded queue dropped
// legitimate audio whenever PipeWire delivered a burst bigger than the queue's capacity, which
// happens routinely. Sending immediately as PcmChunker produces frames, no queue in between, is
// correct: never drops anything that wasn't actually late/stale.
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

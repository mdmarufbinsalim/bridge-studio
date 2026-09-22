import { DEFAULT_AUDIO_FORMAT, createAudioFrame } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { TcpConnector } from '@bridge-audio/transport';

const HOST = process.env.BRIDGE_AUDIO_HOST ?? '127.0.0.1';
const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);
const STREAM_ID = 'test-playback-stream';
const FRAME_COUNT = 10;
const SAMPLES_PER_FRAME = 480; // 10ms @ 48kHz

function makeSyntheticPcmChunk(): Uint8Array {
  const bytesPerSample = 2;
  const channels = DEFAULT_AUDIO_FORMAT.channels;
  const chunk = new Uint8Array(SAMPLES_PER_FRAME * channels * bytesPerSample);
  return chunk; // silence is sufficient to prove the framing/transport path
}

async function main(): Promise<void> {
  const connector = new TcpConnector();
  const transport = await connector.connect({ host: HOST, port: PORT });
  const session = new Session(transport, 'client', 'test-client');

  session.onStateChange((state) => console.log(`[test-client] session state: ${state}`));

  await session.handshake();
  console.log('[test-client] handshake complete');

  session.sendControl({
    type: 'stream_start',
    streamId: STREAM_ID,
    streamKind: 'playback',
    format: DEFAULT_AUDIO_FORMAT,
  });

  for (let seq = 0; seq < FRAME_COUNT; seq += 1) {
    const frame = createAudioFrame({
      streamId: STREAM_ID,
      streamKind: 'playback',
      seq,
      timestamp: Date.now(),
      format: DEFAULT_AUDIO_FORMAT,
      payload: makeSyntheticPcmChunk(),
    });
    session.sendAudioFrame(frame);
    console.log(`[test-client] sent frame seq=${seq}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  session.sendControl({ type: 'stream_stop', streamId: STREAM_ID });
  console.log('[test-client] stream stopped, closing session');
  session.close();
}

main().catch((error: unknown) => {
  console.error('[test-client] error:', error);
  process.exitCode = 1;
});

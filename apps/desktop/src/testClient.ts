import { DEFAULT_AUDIO_FORMAT, createAudioFrame } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { TcpConnector } from '@bridge-audio/transport';

const HOST = process.env.BRIDGE_AUDIO_HOST ?? '127.0.0.1';
const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);
const MIC_STREAM_ID = 'test-mic-stream';
const FRAME_COUNT = 20;
const SAMPLES_PER_FRAME = 480; // 10ms @ 48kHz
const RUN_DURATION_MS = 3000;

function makeSyntheticPcmChunk(): Uint8Array {
  const bytesPerSample = 2;
  const channels = DEFAULT_AUDIO_FORMAT.channels;
  const chunk = new Uint8Array(SAMPLES_PER_FRAME * channels * bytesPerSample);
  return chunk; // silence is sufficient to prove the framing/transport/pipewire-write path
}

async function main(): Promise<void> {
  const connector = new TcpConnector();
  const transport = await connector.connect({ host: HOST, port: PORT });
  const session = new Session(transport, 'client', 'test-client');

  session.onStateChange((state) => console.log(`[test-client] session state: ${state}`));

  let playbackFramesReceived = 0;
  session.onAudioFrame((frame) => {
    if (frame.streamKind === 'playback') {
      playbackFramesReceived += 1;
      if (playbackFramesReceived === 1 || playbackFramesReceived % 20 === 0) {
        console.log(
          `[test-client] received playback frame #${playbackFramesReceived} ` +
            `(seq=${frame.seq}, bytes=${frame.payload.length})`,
        );
      }
    }
  });

  await session.handshake();
  console.log('[test-client] handshake complete, waiting for server to activate streams...');

  session.sendControl({
    type: 'stream_start',
    streamId: MIC_STREAM_ID,
    streamKind: 'microphone',
    format: DEFAULT_AUDIO_FORMAT,
  });

  for (let seq = 0; seq < FRAME_COUNT; seq += 1) {
    const frame = createAudioFrame({
      streamId: MIC_STREAM_ID,
      streamKind: 'microphone',
      seq,
      timestamp: Date.now(),
      format: DEFAULT_AUDIO_FORMAT,
      payload: makeSyntheticPcmChunk(),
    });
    session.sendAudioFrame(frame);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  console.log(`[test-client] sent ${FRAME_COUNT} synthetic microphone frames`);

  await new Promise((resolve) => setTimeout(resolve, RUN_DURATION_MS));

  session.sendControl({ type: 'stream_stop', streamId: MIC_STREAM_ID });
  console.log(`[test-client] total playback frames received: ${playbackFramesReceived}`);
  console.log('[test-client] closing session');
  session.close();
}

main().catch((error: unknown) => {
  console.error('[test-client] error:', error);
  process.exitCode = 1;
});

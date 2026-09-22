import { DEFAULT_AUDIO_FORMAT } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { TcpListener } from '@bridge-audio/transport';

const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);

async function main(): Promise<void> {
  const listener = new TcpListener(PORT);

  await listener.start((transport) => {
    const session = new Session(transport, 'server', 'desktop-server');
    console.log('[bridge-audio] client connecting...');

    session.onStateChange((state) => {
      console.log(`[bridge-audio] session state: ${state}`);
    });

    session.onControlMessage((message) => {
      console.log('[bridge-audio] control message:', message);
      if (message.type === 'stream_start') {
        console.log(
          `[bridge-audio] stream started: ${message.streamKind} (${message.streamId}) ` +
            `${message.format.sampleRate}Hz/${message.format.channels}ch`,
        );
      }
    });

    session.onAudioFrame((frame) => {
      console.log(
        `[bridge-audio] audio frame: stream=${frame.streamId} kind=${frame.streamKind} ` +
          `seq=${frame.seq} bytes=${frame.payload.length}`,
      );
    });

    session.handshake().catch((error: unknown) => {
      console.error('[bridge-audio] handshake failed:', error);
    });
  });

  console.log(`[bridge-audio] server listening on port ${PORT}`);
  console.log(`[bridge-audio] default format: ${JSON.stringify(DEFAULT_AUDIO_FORMAT)}`);
}

main().catch((error: unknown) => {
  console.error('[bridge-audio] fatal startup error:', error);
  process.exitCode = 1;
});

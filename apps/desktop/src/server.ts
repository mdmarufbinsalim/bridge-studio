import { DEFAULT_AUDIO_FORMAT } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { TcpListener } from '@bridge-audio/transport';
import { startPlaybackForwarding } from './playback.js';
import { startMicrophoneReceiving } from './microphone.js';

const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);
const PLAYBACK_ENABLED = process.env.BRIDGE_AUDIO_PLAYBACK !== '0';
const MICROPHONE_ENABLED = process.env.BRIDGE_AUDIO_MIC !== '0';

async function main(): Promise<void> {
  const listener = new TcpListener(PORT);

  await listener.start((transport) => {
    const session = new Session(transport, 'server', 'desktop-server');
    console.log('[bridge-audio] client connecting...');

    let framesSinceLog = 0;
    const stopFns: (() => Promise<void>)[] = [];

    session.onStateChange((state) => {
      console.log(`[bridge-audio] session state: ${state}`);

      if (state === 'active') {
        void activateStreams();
      }

      if (state === 'closed') {
        void Promise.all(stopFns.map((stop) => stop())).catch((error: unknown) => {
          console.error('[bridge-audio] error tearing down streams:', error);
        });
      }
    });

    session.onControlMessage((message) => {
      console.log('[bridge-audio] control message:', message);
    });

    session.onAudioFrame((frame) => {
      framesSinceLog += 1;
      if (framesSinceLog % 100 === 0) {
        console.log(
          `[bridge-audio] ${framesSinceLog} frames received so far (last: stream=${frame.streamId} ` +
            `kind=${frame.streamKind} seq=${frame.seq} bytes=${frame.payload.length})`,
        );
      }
    });

    async function activateStreams(): Promise<void> {
      try {
        if (PLAYBACK_ENABLED) {
          stopFns.push(await startPlaybackForwarding(session, DEFAULT_AUDIO_FORMAT));
        }
        if (MICROPHONE_ENABLED) {
          stopFns.push(await startMicrophoneReceiving(session, DEFAULT_AUDIO_FORMAT));
        }
      } catch (error) {
        console.error('[bridge-audio] failed to activate audio streams:', error);
      }
    }

    session.handshake().catch((error: unknown) => {
      console.error('[bridge-audio] handshake failed:', error);
    });
  });

  console.log(`[bridge-audio] server listening on port ${PORT}`);
  console.log(`[bridge-audio] default format: ${JSON.stringify(DEFAULT_AUDIO_FORMAT)}`);
  console.log(
    `[bridge-audio] playback=${PLAYBACK_ENABLED ? 'on' : 'off'} microphone=${MICROPHONE_ENABLED ? 'on' : 'off'}`,
  );
}

main().catch((error: unknown) => {
  console.error('[bridge-audio] fatal startup error:', error);
  process.exitCode = 1;
});

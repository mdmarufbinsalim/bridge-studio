import { DEFAULT_AUDIO_FORMAT } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { NodeUdpChannel, TcpListener } from '@bridge-audio/transport';
import { startPlaybackForwarding } from './playback.js';
import { startMicrophoneReceiving } from './microphone.js';
import { getLanIPv4Address, printConnectionQrCode } from './connectionInfo.js';

const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);
const PLAYBACK_ENABLED = process.env.BRIDGE_AUDIO_PLAYBACK !== '0';
const MICROPHONE_ENABLED = process.env.BRIDGE_AUDIO_MIC !== '0';

// Every currently-active session's teardown functions (which unload its PipeWire virtual mic
// sink and stop its capture process) live here so a signal handler can run them all on shutdown.
// Without this, killing the server (even a plain Ctrl+C, not just kill -9) leaves the virtual
// mic sink loaded forever — Node exits on SIGINT/SIGTERM by default without running any cleanup
// unless something explicitly listens for the signal and does it.
const activeStopFns = new Set<() => Promise<void>>();

async function shutdown(): Promise<void> {
  console.log('[bridge-audio] shutting down, cleaning up active streams...');
  await Promise.all([...activeStopFns].map((stop) => stop())).catch((error: unknown) => {
    console.error('[bridge-audio] error during shutdown cleanup:', error);
  });
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

async function main(): Promise<void> {
  const listener = new TcpListener(PORT);
  // Shared with every session: audio frames switch onto this the moment we learn the
  // client's UDP address (its first "hello" datagram), so a lost frame just gets dropped
  // instead of head-of-line-blocking every frame behind it the way a lost TCP segment does.
  const udpChannel = await NodeUdpChannel.bind(PORT);
  console.log(`[bridge-audio] UDP audio channel listening on port ${PORT}`);

  await listener.start((transport) => {
    const session = new Session(transport, 'server', 'desktop-server');
    console.log('[bridge-audio] client connecting...');

    let framesSinceLog = 0;
    let udpAttached = false;
    const stopFns: (() => Promise<void>)[] = [];

    udpChannel.onMessage((_data, remoteHost, remotePort) => {
      if (udpAttached) return;
      udpAttached = true;
      session.attachUdpAudio(udpChannel, remoteHost, remotePort);
      console.log(`[bridge-audio] audio switched to UDP (peer ${remoteHost}:${remotePort})`);
    });

    session.onStateChange((state) => {
      console.log(`[bridge-audio] session state: ${state}`);

      if (state === 'active') {
        void activateStreams();
      }

      if (state === 'closed') {
        void Promise.all(stopFns.map((stop) => stop()))
          .catch((error: unknown) => {
            console.error('[bridge-audio] error tearing down streams:', error);
          })
          .finally(() => {
            for (const stop of stopFns) activeStopFns.delete(stop);
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
          const stop = await startPlaybackForwarding(session, DEFAULT_AUDIO_FORMAT);
          stopFns.push(stop);
          activeStopFns.add(stop);
        }
        if (MICROPHONE_ENABLED) {
          const stop = await startMicrophoneReceiving(session, DEFAULT_AUDIO_FORMAT);
          stopFns.push(stop);
          activeStopFns.add(stop);
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

  const lanAddress = getLanIPv4Address();
  if (lanAddress) {
    printConnectionQrCode(lanAddress, PORT);
  } else {
    console.warn('[bridge-audio] no LAN IPv4 address found; enter the IP and port manually in the app');
  }
}

main().catch((error: unknown) => {
  console.error('[bridge-audio] fatal startup error:', error);
  process.exitCode = 1;
});

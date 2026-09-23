import { fileURLToPath } from 'node:url';
import { DEFAULT_AUDIO_FORMAT } from '@bridge-audio/audio-core';
import { Session } from '@bridge-audio/session';
import { NodeUdpChannel, TcpListener } from '@bridge-audio/transport';
import { OWN_SPEAKER_SINK_NAME, setDefaultSink, info, log, warn, error as logError } from '@bridge-audio/platform-linux';
import { startPlaybackForwarding } from './playback.js';
import { startMicrophoneReceiving } from './microphone.js';
import { getLanIPv4Address, printConnectionQrCode } from './connectionInfo.js';
import { clearOwnPidfile, writeOwnPid } from './pidfile.js';

const PORT = Number(process.env.BRIDGE_AUDIO_PORT ?? 7711);
const PLAYBACK_ENABLED = process.env.BRIDGE_AUDIO_PLAYBACK !== '0';
const MICROPHONE_ENABLED = process.env.BRIDGE_AUDIO_MIC !== '0';

// Every currently-active session's teardown functions (which unload its PipeWire virtual mic
// sink and stop its capture process) live here so a signal handler can run them all on shutdown.
// Without this, killing the server (even a plain Ctrl+C, not just kill -9) leaves the virtual
// mic sink loaded forever — Node exits on SIGINT/SIGTERM by default without running any cleanup
// unless something explicitly listens for the signal and does it.
const activeStopFns = new Set<() => Promise<void>>();

/**
 * If any individual stop() hangs (e.g. waiting on a child process 'exit'
 * event that never fires), the cleanup below could wait forever and
 * process.exit() would never run — observed in testing as a server that
 * logged "shutting down" but never actually exited, forcing a kill -9,
 * which is exactly what skips this cleanup and leaks the virtual mic sink
 * in the first place. A hard timeout guarantees the process always exits.
 */
const SHUTDOWN_TIMEOUT_MS = 5000;

async function shutdown(): Promise<void> {
  info('[bridge-audio] shutting down...');
  const cleanup = Promise.all([...activeStopFns].map((stop) => stop())).catch((error: unknown) => {
    logError('[bridge-audio] error during shutdown cleanup:', error);
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS));
  await Promise.race([cleanup, timeout]);
  clearOwnPidfile();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

export async function startServer(): Promise<void> {
  writeOwnPid();

  const listener = new TcpListener(PORT);
  // Shared with every session: audio frames switch onto this the moment we learn the
  // client's UDP address (its first "hello" datagram), so a lost frame just gets dropped
  // instead of head-of-line-blocking every frame behind it the way a lost TCP segment does.
  const udpChannel = await NodeUdpChannel.bind(PORT);
  log(`[bridge-audio] UDP audio channel listening on port ${PORT}`);

  await listener.start((transport) => {
    const session = new Session(transport, 'server', 'desktop-server');
    log('[bridge-audio] client connecting...');

    let framesSinceLog = 0;
    let udpAttached = false;
    const stopFns: (() => Promise<void>)[] = [];

    udpChannel.onMessage((_data, remoteHost, remotePort) => {
      if (udpAttached) return;
      udpAttached = true;
      session.attachUdpAudio(udpChannel, remoteHost, remotePort);
      log(`[bridge-audio] audio switched to UDP (peer ${remoteHost}:${remotePort})`);
    });

    session.onStateChange((state) => {
      log(`[bridge-audio] session state: ${state}`);

      if (state === 'active') {
        info('[bridge-audio] connected');
        void activateStreams();
      }

      if (state === 'closed') {
        info('[bridge-audio] disconnected');
        void Promise.all(stopFns.map((stop) => stop()))
          .catch((error: unknown) => {
            logError('[bridge-audio] error tearing down streams:', error);
          })
          .finally(() => {
            for (const stop of stopFns) activeStopFns.delete(stop);
          });
      }
    });

    session.onControlMessage((message) => {
      log('[bridge-audio] control message:', message);
    });

    session.onAudioFrame((frame) => {
      framesSinceLog += 1;
      if (framesSinceLog % 100 === 0) {
        log(
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
        if (PLAYBACK_ENABLED) {
          // PipeWireVirtualSpeakerSink already gives the speaker sink a priority high enough that
          // the session manager's own default-sink ranking picks it over the microphone sink on
          // its own (see SINK_PRIORITY there and in PipeWireVirtualMicSink) — that's the durable
          // fix, since that ranking recomputes on its own on every new node and a one-off
          // set-default-sink call here can only ever win until the next such recompute. This is
          // just a fast nudge in case the microphone sink (created just above) briefly holds
          // default until the session manager's next recompute; confirmed in real-world testing
          // that without the priority fix, that gap let real app audio and the phone's live mic
          // input mix into the same sink (heard as your own voice echoed back, and playback
          // sounding quieter — two streams summed together).
          await setDefaultSink(OWN_SPEAKER_SINK_NAME).catch((error: unknown) => {
            logError('[bridge-audio] could not re-assert speaker sink as default:', error);
          });
        }
      } catch (error) {
        logError('[bridge-audio] failed to activate audio streams:', error);
      }
    }

    session.handshake().catch((error: unknown) => {
      logError('[bridge-audio] handshake failed:', error);
    });
  });

  log(`[bridge-audio] server listening on port ${PORT}`);
  log(`[bridge-audio] default format: ${JSON.stringify(DEFAULT_AUDIO_FORMAT)}`);
  log(`[bridge-audio] playback=${PLAYBACK_ENABLED ? 'on' : 'off'} microphone=${MICROPHONE_ENABLED ? 'on' : 'off'}`);

  const lanAddress = getLanIPv4Address();
  if (lanAddress) {
    printConnectionQrCode(lanAddress, PORT);
  } else {
    warn('[bridge-audio] no LAN IPv4 address found; enter the IP and port manually in the app');
  }
}

// Only self-run when this file is the actual entrypoint (`node dist/server.js` /
// `tsx src/server.ts`), not when cli.ts imports startServer() — otherwise the server would start
// twice.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    logError('[bridge-audio] fatal startup error:', error);
    process.exitCode = 1;
  });
}

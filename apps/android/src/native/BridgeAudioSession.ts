import { ClientSession, type Session } from '@bridge-audio/session';
import type { TransportAddress } from '@bridge-audio/transport';
import { RnTcpConnector } from './RnTcpTransport.js';
import { AudioBridge } from './AudioBridge.js';

export interface BridgeAudioConnection {
  clientSession: ClientSession;
  getAudioBridge(): AudioBridge | undefined;
}

/**
 * Wires the shared ClientSession (reconnection, handshake, framing) to the
 * Android-specific RnTcpConnector, and attaches a fresh AudioBridge to every
 * session the ClientSession establishes (including on reconnect). UI code
 * calls this instead of touching session/transport/native internals
 * directly.
 */
export async function connectToServer(address: TransportAddress): Promise<BridgeAudioConnection> {
  let audioBridge: AudioBridge | undefined;

  const clientSession = new ClientSession({
    connector: new RnTcpConnector(),
    address,
    clientId: 'bridge-audio-android',
  });

  clientSession.onSessionEstablished((session: Session) => {
    audioBridge = new AudioBridge(session);
    session.onStateChange((state) => {
      if (state === 'closed') {
        void audioBridge?.teardown();
      }
    });
  });

  await clientSession.start();

  return {
    clientSession,
    getAudioBridge: () => audioBridge,
  };
}

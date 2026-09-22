import { ClientSession, type Session } from '@bridge-audio/session';
import type { TransportAddress } from '@bridge-audio/transport';
import { RnTcpConnector } from './RnTcpTransport';
import { RnUdpChannel } from './RnUdpChannel';
import { AudioBridge } from './AudioBridge';

export interface BridgeAudioConnection {
  clientSession: ClientSession;
  getAudioBridge(): AudioBridge | undefined;
  /** Intentional, user-initiated disconnect — unlike a network drop, this does not reconnect. */
  disconnect(): Promise<void>;
}

const HELLO_DATAGRAM = new TextEncoder().encode('bridgeaudio-hello');

/**
 * Wires the shared ClientSession (reconnection, handshake, framing) to the
 * Android-specific RnTcpConnector, and attaches a fresh AudioBridge to every
 * session the ClientSession establishes (including on reconnect). UI code
 * calls this instead of touching session/transport/native internals
 * directly.
 *
 * Once each session is active, also opens a UDP channel and sends one
 * "hello" datagram to the server's UDP port (same port number as TCP) so
 * the server learns this socket's address and switches audio onto UDP —
 * see Session.attachUdpAudio and apps/desktop/src/server.ts.
 */
export async function connectToServer(address: TransportAddress): Promise<BridgeAudioConnection> {
  let audioBridge: AudioBridge | undefined;
  let udpChannel: RnUdpChannel | undefined;

  const clientSession = new ClientSession({
    connector: new RnTcpConnector(),
    address,
    clientId: 'bridge-audio-android',
  });

  clientSession.onSessionEstablished((session: Session) => {
    audioBridge = new AudioBridge(session);

    session.onStateChange((state) => {
      if (state === 'active') {
        void setUpUdpAudio(session, address).then((channel) => {
          udpChannel = channel;
        });
      }
      if (state === 'closed') {
        udpChannel?.close();
        udpChannel = undefined;
        void audioBridge?.teardown();
      }
    });
  });

  await clientSession.start();

  return {
    clientSession,
    getAudioBridge: () => audioBridge,
    disconnect: async () => {
      clientSession.stop();
      udpChannel?.close();
      udpChannel = undefined;
      await audioBridge?.teardown();
    },
  };
}

async function setUpUdpAudio(session: Session, address: TransportAddress): Promise<RnUdpChannel> {
  const channel = new RnUdpChannel();
  await channel.whenReady();
  session.attachUdpAudio(channel, address.host, address.port);
  channel.send(address.host, address.port, HELLO_DATAGRAM);
  return channel;
}

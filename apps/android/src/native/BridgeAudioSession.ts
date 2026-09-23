import { ClientSession, type Session } from '@bridge-audio/session';
import type { TransportAddress } from '@bridge-audio/transport';
import { RnTcpConnector } from './RnTcpTransport';
import { RnUdpChannel } from './RnUdpChannel';
import { AudioBridge } from './AudioBridge';

export interface BridgeAudioConnection {
  clientSession: ClientSession;
  getAudioBridge(): AudioBridge | undefined;
  /** Fires once if the server drops the connection (not a user-initiated disconnect()). */
  onConnectionLost(listener: () => void): void;
  disconnect(): Promise<void>;
}

const HELLO_DATAGRAM = new TextEncoder().encode('bridgeaudio-hello');

export async function connectToServer(address: TransportAddress): Promise<BridgeAudioConnection> {
  let audioBridge: AudioBridge | undefined;
  let udpChannel: RnUdpChannel | undefined;
  let userInitiatedDisconnect = false;
  const lostListeners: (() => void)[] = [];

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
        if (!userInitiatedDisconnect) {
          // The server went away unexpectedly — stop ClientSession's own silent background
          // retry loop and let the UI reset to the initial connect screen instead.
          clientSession.stop();
          for (const listener of lostListeners) listener();
        }
      }
    });
  });

  await clientSession.start();

  return {
    clientSession,
    getAudioBridge: () => audioBridge,
    onConnectionLost: (listener) => lostListeners.push(listener),
    disconnect: async () => {
      userInitiatedDisconnect = true;
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

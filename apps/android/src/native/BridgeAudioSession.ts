import { ClientSession } from '@bridge-audio/session';
import type { TransportAddress } from '@bridge-audio/transport';
import { RnTcpConnector } from './RnTcpTransport.js';

/**
 * Wires the shared ClientSession (reconnection, handshake, framing) to the
 * Android-specific RnTcpConnector. UI code calls this instead of touching
 * session/transport internals directly.
 */
export async function connectToServer(address: TransportAddress): Promise<ClientSession> {
  const clientSession = new ClientSession({
    connector: new RnTcpConnector(),
    address,
    clientId: 'bridge-audio-android',
  });
  await clientSession.start();
  return clientSession;
}

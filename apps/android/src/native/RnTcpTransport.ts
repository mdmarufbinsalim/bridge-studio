import type { Transport, TransportAddress, TransportConnector } from '@bridge-audio/transport';

/**
 * React Native has no `node:net`, so @bridge-audio/transport's TcpConnector
 * (Node sockets) cannot run here. This implements the same Transport
 * interface for Android using a React Native TCP socket library, keeping
 * session/protocol/audio-core untouched — only the transport layer differs
 * per platform.
 *
 * Not yet implemented: wire up react-native-tcp-socket (or a Kotlin-backed
 * socket via the native module) in a later phase.
 */
export class RnTcpConnector implements TransportConnector {
  async connect(_address: TransportAddress): Promise<Transport> {
    throw new Error('RnTcpConnector is not implemented yet');
  }
}

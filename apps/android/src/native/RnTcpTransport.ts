import TcpSocket from 'react-native-tcp-socket';
import type { Transport, TransportAddress, TransportConnector } from '@bridge-audio/transport';

/**
 * React Native has no `node:net`, so @bridge-audio/transport's Node-based
 * TcpConnector can't run here. This implements the same Transport interface
 * for Android using react-native-tcp-socket, keeping session/protocol/
 * audio-core untouched — only the transport layer differs per platform.
 */
class RnTcpTransport implements Transport {
  private dataListeners: ((data: Uint8Array) => void)[] = [];
  private closeListeners: ((reason?: Error) => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];
  private connected = true;

  constructor(private readonly socket: TcpSocket.Socket) {
    this.socket.on('data', (chunk) => {
      const bytes =
        typeof chunk === 'string'
          ? new TextEncoder().encode(chunk)
          : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (const listener of this.dataListeners) listener(bytes);
    });
    this.socket.on('close', () => {
      this.connected = false;
      for (const listener of this.closeListeners) listener();
    });
    this.socket.on('error', (error: Error) => {
      for (const listener of this.errorListeners) listener(error);
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  send(data: Uint8Array): void {
    if (!this.connected) return;
    this.socket.write(data);
  }

  onData(listener: (data: Uint8Array) => void): void {
    this.dataListeners.push(listener);
  }

  onClose(listener: (reason?: Error) => void): void {
    this.closeListeners.push(listener);
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  close(): void {
    this.connected = false;
    this.socket.destroy();
  }
}

export class RnTcpConnector implements TransportConnector {
  connect(address: TransportAddress): Promise<Transport> {
    return new Promise((resolve, reject) => {
      const socket = TcpSocket.createConnection(
        { host: address.host, port: address.port, tls: false },
        () => resolve(new RnTcpTransport(socket)),
      );
      socket.on('error', (error: Error) => reject(error));
    });
  }
}

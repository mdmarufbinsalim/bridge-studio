import { createSocket, type Socket } from 'node:dgram';
import type { UdpChannel } from './UdpChannel.js';

/** Node `dgram`-backed UdpChannel — desktop only (Android has its own RN implementation). */
export class NodeUdpChannel implements UdpChannel {
  private readonly socket: Socket;
  private readonly messageListeners: ((data: Uint8Array, remoteHost: string, remotePort: number) => void)[] = [];

  private constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on('message', (msg, rinfo) => {
      for (const listener of this.messageListeners) {
        listener(new Uint8Array(msg), rinfo.address, rinfo.port);
      }
    });
  }

  static bind(port: number, host = '0.0.0.0'): Promise<NodeUdpChannel> {
    return new Promise((resolve, reject) => {
      const socket = createSocket('udp4');
      socket.once('error', reject);
      socket.bind(port, host, () => {
        socket.off('error', reject);
        resolve(new NodeUdpChannel(socket));
      });
    });
  }

  send(host: string, port: number, data: Uint8Array): void {
    this.socket.send(data, port, host);
  }

  onMessage(listener: (data: Uint8Array, remoteHost: string, remotePort: number) => void): void {
    this.messageListeners.push(listener);
  }

  close(): void {
    this.socket.close();
  }
}

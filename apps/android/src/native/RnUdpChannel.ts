import dgram from 'react-native-udp';
import type { UdpChannel } from '@bridge-audio/transport';

/**
 * React Native has no `node:dgram`, so `@bridge-audio/transport`'s
 * NodeUdpChannel can't run here — this implements the same UdpChannel
 * interface for Android using react-native-udp, keeping session/protocol
 * untouched. Bound to an OS-assigned ephemeral port; the server learns this
 * socket's address from the "hello" datagram sent right after connecting
 * (see BridgeAudioSession.ts), the same way NAT/firewall hole-punching
 * works for any UDP peer that doesn't know its own public/local port ahead
 * of time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-udp's JSDoc-generated
// .d.ts doesn't propagate EventEmitter's inherited on/once methods onto UdpSocket's type.
type UdpSocketWithEvents = ReturnType<typeof dgram.createSocket> & {
  once(event: string, listener: (...args: any[]) => void): void;
  on(event: string, listener: (...args: any[]) => void): void;
};

export class RnUdpChannel implements UdpChannel {
  private readonly socket = dgram.createSocket({ type: 'udp4' }) as UdpSocketWithEvents;
  private ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.socket.once('listening', () => resolve());
      this.socket.once('error', reject);
      this.socket.bind(0);
    });
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  send(host: string, port: number, data: Uint8Array): void {
    this.socket.send(data, 0, data.byteLength, port, host);
  }

  onMessage(listener: (data: Uint8Array, remoteHost: string, remotePort: number) => void): void {
    this.socket.on('message', (msg: Uint8Array, rinfo: { address: string; port: number }) => {
      listener(msg, rinfo.address, rinfo.port);
    });
  }

  close(): void {
    this.socket.close();
  }
}

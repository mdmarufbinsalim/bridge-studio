import type { Socket } from 'node:net';
import type { Transport } from './Transport.js';

export class TcpTransport implements Transport {
  private dataListeners: ((data: Uint8Array) => void)[] = [];
  private closeListeners: ((reason?: Error) => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];
  private connected = true;

  constructor(private readonly socket: Socket) {
    this.socket.on('data', (chunk: Buffer) => {
      for (const listener of this.dataListeners) listener(new Uint8Array(chunk));
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

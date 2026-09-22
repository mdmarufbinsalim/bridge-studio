import { createServer, type Server, type Socket } from 'node:net';
import type { Transport, TransportListener } from './Transport.js';
import { TcpTransport } from './TcpTransport.js';

export class TcpListener implements TransportListener {
  private server: Server | undefined;

  constructor(private readonly port: number, private readonly host = '0.0.0.0') {}

  get isListening(): boolean {
    return this.server?.listening ?? false;
  }

  start(onConnection: (transport: Transport) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket: Socket) => {
        socket.setNoDelay(true);
        onConnection(new TcpTransport(socket));
      });
      server.once('error', reject);
      server.listen(this.port, this.host, () => {
        server.off('error', reject);
        this.server = server;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

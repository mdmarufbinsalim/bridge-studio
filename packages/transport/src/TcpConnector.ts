import { Socket } from 'node:net';
import type { Transport, TransportAddress, TransportConnector } from './Transport.js';
import { TcpTransport } from './TcpTransport.js';

export class TcpConnector implements TransportConnector {
  connect(address: TransportAddress): Promise<Transport> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      socket.setNoDelay(true);

      const onConnect = (): void => {
        socket.off('error', onError);
        resolve(new TcpTransport(socket));
      };
      const onError = (error: Error): void => {
        socket.off('connect', onConnect);
        reject(error);
      };

      socket.once('connect', onConnect);
      socket.once('error', onError);
      socket.connect(address.port, address.host);
    });
  }
}

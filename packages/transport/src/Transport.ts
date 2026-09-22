/**
 * A single, ordered, reliable-or-not byte-stream connection between two
 * endpoints. Implementations (TCP now, UDP or others later) hide their
 * transport-specific details behind this interface so session/protocol code
 * never depends on sockets directly.
 */
export interface Transport {
  readonly isConnected: boolean;
  send(data: Uint8Array): void;
  onData(listener: (data: Uint8Array) => void): void;
  onClose(listener: (reason?: Error) => void): void;
  onError(listener: (error: Error) => void): void;
  close(): void;
}

/** Client side: establishes an outgoing connection to a fixed address. */
export interface TransportConnector {
  connect(address: TransportAddress): Promise<Transport>;
}

/** Server side: accepts incoming connections and hands each off as a Transport. */
export interface TransportListener {
  readonly isListening: boolean;
  start(onConnection: (transport: Transport) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface TransportAddress {
  readonly host: string;
  readonly port: number;
}

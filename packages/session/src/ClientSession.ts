import type { TransportAddress, TransportConnector } from '@bridge-audio/transport';
import { Session } from './Session.js';
import type { SessionState } from './SessionState.js';

export interface ClientSessionOptions {
  connector: TransportConnector;
  address: TransportAddress;
  clientId: string;
  /** Delays between reconnect attempts, in ms; the last value repeats for further attempts. */
  reconnectDelaysMs?: number[];
}

const DEFAULT_RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000];

/**
 * Owns the client-side connect → handshake → active lifecycle and retries
 * with backoff on disconnect, handing each successfully established
 * connection off as a fresh Session.
 */
export class ClientSession {
  private session: Session | undefined;
  private stopped = false;
  private readonly sessionListeners: ((session: Session) => void)[] = [];

  constructor(private readonly options: ClientSessionOptions) {}

  onSessionEstablished(listener: (session: Session) => void): void {
    this.sessionListeners.push(listener);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connectWithRetry(0);
  }

  stop(): void {
    this.stopped = true;
    this.session?.close();
  }

  private async connectWithRetry(attempt: number): Promise<void> {
    if (this.stopped) return;

    try {
      const transport = await this.options.connector.connect(this.options.address);
      const session = new Session(transport, 'client', this.options.clientId);
      this.session = session;

      session.onStateChange((state: SessionState) => {
        if (state === 'closed' && !this.stopped) {
          void this.connectWithRetry(0);
        }
      });

      await session.handshake();
      for (const listener of this.sessionListeners) listener(session);
    } catch {
      if (this.stopped) return;
      const delays = this.options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));
      await this.connectWithRetry(attempt + 1);
    }
  }
}

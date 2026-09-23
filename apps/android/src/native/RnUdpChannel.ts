import { closeUdpSocket, onUdpMessage, openUdpSocket, sendUdp } from 'bridge-audio-module';
import type { EventSubscription } from 'expo-modules-core';
import type { UdpChannel } from '@bridge-audio/transport';

/**
 * React Native has no `node:dgram`. This used to wrap react-native-udp, but
 * that library base64-encodes every packet on the JS thread — real
 * per-packet overhead that, combined with full-duplex audio (mic + playback
 * both active roughly doubles total packet count), was the suspected cause
 * of jitter/quality regressions in real-world testing. UDP now lives in our
 * own native module instead (see bridge-audio-module), passing raw
 * Uint8Array/ByteArray through Expo's JSI-backed bridge with no
 * serialization step — same fix already applied to mic/playback audio data.
 */
export class RnUdpChannel implements UdpChannel {
  private readonly ready: Promise<void>;
  private messageSubscription: EventSubscription | undefined;
  private readonly messageListeners: ((data: Uint8Array, remoteHost: string, remotePort: number) => void)[] = [];

  constructor() {
    this.ready = openUdpSocket().then(() => {
      this.messageSubscription = onUdpMessage((event) => {
        for (const listener of this.messageListeners) listener(event.data, event.host, event.port);
      });
    });
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  send(host: string, port: number, data: Uint8Array): void {
    sendUdp(host, port, data);
  }

  onMessage(listener: (data: Uint8Array, remoteHost: string, remotePort: number) => void): void {
    this.messageListeners.push(listener);
  }

  close(): void {
    this.messageSubscription?.remove();
    this.messageSubscription = undefined;
    void closeUdpSocket();
  }
}

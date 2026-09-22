import { networkInterfaces } from 'node:os';
import qrcodeTerminal from 'qrcode-terminal';

/** First non-internal IPv4 address found, e.g. on the LAN Wi-Fi/Ethernet interface. */
export function getLanIPv4Address(): string | undefined {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return undefined;
}

export function buildConnectionUri(host: string, port: number): string {
  return `bridgeaudio://${host}:${port}`;
}

/** Prints the connection URI as both text and a scannable terminal QR code. */
export function printConnectionQrCode(host: string, port: number): void {
  const uri = buildConnectionUri(host, port);
  console.log(`[bridge-audio] connect from the app by scanning this QR code, or entering ${host}:${port} manually:`);
  qrcodeTerminal.generate(uri, { small: true }, (qrCode: string) => {
    console.log(qrCode);
  });
}

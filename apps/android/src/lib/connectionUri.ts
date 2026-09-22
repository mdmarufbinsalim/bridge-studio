export interface ParsedConnectionUri {
  host: string;
  port: number;
}

/** Parses the `bridgeaudio://<host>:<port>` URI the desktop server prints as a QR code. */
export function parseConnectionUri(value: string): ParsedConnectionUri | undefined {
  const match = /^bridgeaudio:\/\/([^:/]+):(\d+)\/?$/.exec(value.trim());
  if (!match) return undefined;

  const host = match[1];
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;

  return { host, port };
}

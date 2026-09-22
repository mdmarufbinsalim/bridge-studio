/**
 * A connectionless datagram channel used only for audio frames. Unlike
 * Transport (TCP), there is no persistent per-peer connection: send()
 * targets an explicit address every time, and onMessage() delivers
 * datagrams from whoever sent them, tagged with their address. Audio
 * frames are encoded as complete, self-delimiting datagrams (see
 * protocol's encodeAudioFrame) — no stream framing is needed here the way
 * TcpTransport needs it, because UDP preserves message boundaries.
 *
 * A lost or reordered datagram is simply a dropped or late audio frame,
 * not a stall in everything behind it the way a lost TCP segment would be
 * — that head-of-line-blocking behavior is what UDP is used here to avoid.
 */
export interface UdpChannel {
  send(host: string, port: number, data: Uint8Array): void;
  onMessage(listener: (data: Uint8Array, remoteHost: string, remotePort: number) => void): void;
  close(): void;
}

export type WireMessageKind = 'audio_frame' | 'control';

const KIND_CODES: Record<WireMessageKind, number> = { audio_frame: 1, control: 2 };
const KIND_BY_CODE: WireMessageKind[] = [];
KIND_BY_CODE[1] = 'audio_frame';
KIND_BY_CODE[2] = 'control';

export interface WireMessage {
  kind: WireMessageKind;
  payload: Uint8Array;
}

/** Wraps an already-encoded message body with a [1 kind][4 length LE] header for stream framing. */
export function frameMessage(kind: WireMessageKind, payload: Uint8Array): Uint8Array {
  const framed = new Uint8Array(1 + 4 + payload.length);
  const view = new DataView(framed.buffer);
  view.setUint8(0, KIND_CODES[kind]);
  view.setUint32(1, payload.length, true);
  framed.set(payload, 5);
  return framed;
}

/**
 * Accumulates raw bytes from a stream-oriented transport (TCP may split or
 * coalesce writes arbitrarily) and emits complete WireMessages as they
 * become available.
 */
export class MessageStreamDecoder {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): WireMessage[] {
    this.buffer = concat(this.buffer, chunk);
    const messages: WireMessage[] = [];

    for (;;) {
      if (this.buffer.length < 5) break;
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const kindCode = view.getUint8(0);
      const length = view.getUint32(1, true);
      const totalLength = 5 + length;
      if (this.buffer.length < totalLength) break;

      const kind = KIND_BY_CODE[kindCode];
      if (kind === undefined) {
        throw new Error(`Unknown wire message kind code: ${kindCode}`);
      }
      const payload = this.buffer.subarray(5, totalLength);
      messages.push({ kind, payload });
      this.buffer = this.buffer.subarray(totalLength);
    }

    return messages;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

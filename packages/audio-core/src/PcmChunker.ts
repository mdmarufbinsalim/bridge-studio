/**
 * Accumulates arbitrarily-sized PCM byte chunks (as arrive from a capture
 * source) and re-slices them into fixed-size frames suitable for framing
 * into AudioFrames. Keeps at most one partial frame buffered.
 */
export class PcmChunker {
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(private readonly frameByteSize: number) {
    if (!Number.isInteger(frameByteSize) || frameByteSize <= 0) {
      throw new RangeError('frameByteSize must be a positive integer');
    }
  }

  /** Feeds new bytes in and returns however many complete fixed-size frames are now available. */
  push(chunk: Uint8Array): Uint8Array[] {
    const combined = new Uint8Array(this.buffer.length + chunk.length);
    combined.set(this.buffer, 0);
    combined.set(chunk, this.buffer.length);

    const frames: Uint8Array[] = [];
    let offset = 0;
    while (combined.length - offset >= this.frameByteSize) {
      frames.push(combined.slice(offset, offset + this.frameByteSize));
      offset += this.frameByteSize;
    }

    this.buffer = combined.slice(offset);
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}

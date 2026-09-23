import type { AudioFrame } from './AudioFrame.js';

/**
 * Reorders frames that arrive out of sequence within a bounded window and
 * skips forward over frames that are too late (or never arrive at all —
 * routine with UDP, which has no retransmission) to reconstruct in order.
 * Capacity bounds memory and, just as importantly, bounds how long drain()
 * will wait for a missing frame before giving up on it.
 */
export class JitterBuffer {
  private readonly pending = new Map<number, AudioFrame>();
  private nextSeq: number | undefined;
  private droppedLateCount = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('JitterBuffer capacity must be a positive integer');
    }
  }

  push(frame: AudioFrame): void {
    if (this.nextSeq === undefined) {
      this.nextSeq = frame.seq;
    }
    if (frame.seq < this.nextSeq) {
      this.droppedLateCount += 1;
      return;
    }
    if (this.pending.has(frame.seq)) return;
    this.pending.set(frame.seq, frame);
    if (this.pending.size > this.capacity) {
      this.skipToOldestPending();
    }
  }

  /** Pops frames that are ready to play in order; may return an empty array. */
  drain(): AudioFrame[] {
    if (this.nextSeq === undefined) return [];
    const ready: AudioFrame[] = [];
    let frame = this.pending.get(this.nextSeq);
    while (frame !== undefined) {
      ready.push(frame);
      this.pending.delete(this.nextSeq);
      this.nextSeq += 1;
      frame = this.pending.get(this.nextSeq);
    }
    return ready;
  }

  /**
   * Called when the buffer is over capacity, meaning nextSeq's frame is
   * either lost or too delayed to keep waiting for. Jumps nextSeq forward
   * to the oldest frame actually on hand — merely deleting a pending entry
   * without also advancing nextSeq (the previous behavior) never unblocks
   * drain() once the frame it's waiting on is the one that's missing, so
   * every push past that point would just accumulate and get evicted again,
   * draining nothing, forever.
   */
  private skipToOldestPending(): void {
    let oldestSeq: number | undefined;
    for (const seq of this.pending.keys()) {
      if (oldestSeq === undefined || seq < oldestSeq) oldestSeq = seq;
    }
    if (oldestSeq !== undefined && this.nextSeq !== undefined && oldestSeq > this.nextSeq) {
      this.droppedLateCount += oldestSeq - this.nextSeq;
      this.nextSeq = oldestSeq;
    }
  }

  get dropped(): number {
    return this.droppedLateCount;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  reset(): void {
    this.pending.clear();
    this.nextSeq = undefined;
    this.droppedLateCount = 0;
  }
}

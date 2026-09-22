import type { AudioFrame } from './AudioFrame.js';

/**
 * Reorders frames that arrive out of sequence within a bounded window and
 * drops frames that are too late to reconstruct in order. Capacity bounds
 * memory; it does not guarantee playout timing on its own.
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
    while (this.pending.size > this.capacity) {
      this.dropOldestPending();
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

  private dropOldestPending(): void {
    let oldestSeq: number | undefined;
    for (const seq of this.pending.keys()) {
      if (oldestSeq === undefined || seq < oldestSeq) oldestSeq = seq;
    }
    if (oldestSeq !== undefined) {
      this.pending.delete(oldestSeq);
      this.droppedLateCount += 1;
      if (this.nextSeq !== undefined && oldestSeq === this.nextSeq) {
        this.nextSeq += 1;
      }
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

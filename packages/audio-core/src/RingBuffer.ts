/**
 * Bounded FIFO buffer of items. When full, the oldest item is dropped to make
 * room for the newest — real-time audio must never block or grow unbounded.
 */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private head = 0;
  private count = 0;
  private droppedCount = 0;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('RingBuffer capacity must be a positive integer');
    }
    this.items = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    const tail = (this.head + this.count) % this.capacity;
    if (this.count === this.capacity) {
      this.head = (this.head + 1) % this.capacity;
      this.droppedCount += 1;
    } else {
      this.count += 1;
    }
    this.items[tail] = item;
  }

  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.items[this.head];
    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;
    return item;
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  /** Total items dropped due to capacity overflow since construction. */
  get dropped(): number {
    return this.droppedCount;
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}

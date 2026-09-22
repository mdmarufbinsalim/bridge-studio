/** RMS level of 16-bit PCM samples, normalized to 0..1. Cheap enough to run on every frame. */
export function computePcmLevel(bytes: Uint8Array): number {
  const sampleCount = bytes.byteLength >> 1;
  if (sampleCount === 0) return 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = view.getInt16(i * 2, true);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / sampleCount);
  return Math.min(1, rms / 32768);
}

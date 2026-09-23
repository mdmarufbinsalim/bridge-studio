/**
 * Applies a linear gain ramp (from startGain to endGain, across the buffer)
 * to 16-bit PCM samples. Used to fade repeated packet-loss-concealment
 * audio toward silence: holding a repeated chunk at full volume and then
 * splicing straight back into real audio creates an abrupt amplitude jump
 * at the splice point — audible as a short click/static "tick." Fading the
 * repeat toward zero means that splice happens from near-silence instead,
 * which shrinks the jump (and the click) down to nearly nothing.
 */
export function applyGainRamp(bytes: Uint8Array, startGain: number, endGain: number): Uint8Array {
  const sampleCount = bytes.byteLength >> 1;
  const out = new Uint8Array(bytes.byteLength);
  const srcView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dstView = new DataView(out.buffer);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = sampleCount <= 1 ? 0 : i / (sampleCount - 1);
    const gain = startGain + (endGain - startGain) * t;
    const sample = srcView.getInt16(i * 2, true);
    const scaled = Math.max(-32768, Math.min(32767, Math.round(sample * gain)));
    dstView.setInt16(i * 2, scaled, true);
  }

  return out;
}

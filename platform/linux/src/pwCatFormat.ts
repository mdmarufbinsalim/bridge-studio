import type { AudioFormat } from '@bridge-audio/audio-core';

/** Maps our AudioFormat onto pw-cat's --format values. Only pcm_s16le is supported today. */
export function pwCatSampleFormat(format: AudioFormat): string {
  if (format.encoding !== 'pcm_s16le' || format.bitsPerSample !== 16) {
    throw new Error(`Unsupported audio format for pw-cat: ${JSON.stringify(format)}`);
  }
  return 's16';
}

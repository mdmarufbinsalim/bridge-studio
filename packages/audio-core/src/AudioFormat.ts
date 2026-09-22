export type SampleEncoding = 'pcm_s16le';

export interface AudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly encoding: SampleEncoding;
}

export function bytesPerSample(format: AudioFormat): number {
  return format.bitsPerSample / 8;
}

export function bytesPerFrame(format: AudioFormat): number {
  return bytesPerSample(format) * format.channels;
}

export function isValidAudioFormat(format: AudioFormat): boolean {
  return (
    Number.isInteger(format.sampleRate) &&
    format.sampleRate > 0 &&
    Number.isInteger(format.channels) &&
    format.channels > 0 &&
    Number.isInteger(format.bitsPerSample) &&
    format.bitsPerSample > 0 &&
    format.bitsPerSample % 8 === 0 &&
    format.encoding === 'pcm_s16le'
  );
}

export function audioFormatsEqual(a: AudioFormat, b: AudioFormat): boolean {
  return (
    a.sampleRate === b.sampleRate &&
    a.channels === b.channels &&
    a.bitsPerSample === b.bitsPerSample &&
    a.encoding === b.encoding
  );
}

export const DEFAULT_AUDIO_FORMAT: AudioFormat = {
  sampleRate: 48000,
  channels: 2,
  bitsPerSample: 16,
  encoding: 'pcm_s16le',
};

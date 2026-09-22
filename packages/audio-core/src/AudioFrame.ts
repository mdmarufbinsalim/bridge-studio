import type { AudioFormat } from './AudioFormat.js';
import { bytesPerFrame, isValidAudioFormat } from './AudioFormat.js';
import type { StreamKind } from './StreamKind.js';

export interface AudioFrame {
  readonly streamId: string;
  readonly streamKind: StreamKind;
  readonly seq: number;
  readonly timestamp: number;
  readonly format: AudioFormat;
  readonly payload: Uint8Array;
}

export interface CreateAudioFrameInput {
  streamId: string;
  streamKind: StreamKind;
  seq: number;
  timestamp: number;
  format: AudioFormat;
  payload: Uint8Array;
}

export function createAudioFrame(input: CreateAudioFrameInput): AudioFrame {
  return {
    streamId: input.streamId,
    streamKind: input.streamKind,
    seq: input.seq,
    timestamp: input.timestamp,
    format: input.format,
    payload: input.payload,
  };
}

export function isValidAudioFrame(frame: AudioFrame): boolean {
  if (frame.streamId.length === 0) return false;
  if (!Number.isInteger(frame.seq) || frame.seq < 0) return false;
  if (!Number.isFinite(frame.timestamp) || frame.timestamp < 0) return false;
  if (!isValidAudioFormat(frame.format)) return false;
  if (frame.payload.length === 0) return false;
  const frameSize = bytesPerFrame(frame.format);
  if (frame.payload.length % frameSize !== 0) return false;
  return true;
}

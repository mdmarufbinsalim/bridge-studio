import type { AudioFormat, AudioFrame, SampleEncoding, StreamKind } from '@bridge-audio/audio-core';
import { createAudioFrame } from '@bridge-audio/audio-core';
import { PROTOCOL_VERSION } from './version.js';

const STREAM_KIND_CODES: Record<StreamKind, number> = { playback: 0, microphone: 1 };
const STREAM_KIND_BY_CODE: StreamKind[] = ['playback', 'microphone'];

const ENCODING_CODES: Record<SampleEncoding, number> = { pcm_s16le: 0 };
const ENCODING_BY_CODE: SampleEncoding[] = ['pcm_s16le'];

const MAX_STREAM_ID_BYTES = 255;

/**
 * Binary wire format for a single audio frame, independent of any transport:
 * [1 protocolVersion][1 streamKind][1 streamIdLen][streamId utf8]
 * [4 seq LE][8 timestamp LE double][4 sampleRate LE][1 channels][1 bitsPerSample][1 encoding]
 * [4 payloadLength LE][payload]
 */
export function encodeAudioFrame(frame: AudioFrame): Uint8Array {
  const streamIdBytes = new TextEncoder().encode(frame.streamId);
  if (streamIdBytes.length > MAX_STREAM_ID_BYTES) {
    throw new RangeError('streamId exceeds maximum encodable length');
  }

  const headerLength = 1 + 1 + 1 + streamIdBytes.length + 4 + 8 + 4 + 1 + 1 + 1 + 4;
  const buffer = new Uint8Array(headerLength + frame.payload.length);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  view.setUint8(offset, PROTOCOL_VERSION);
  offset += 1;
  view.setUint8(offset, STREAM_KIND_CODES[frame.streamKind]);
  offset += 1;
  view.setUint8(offset, streamIdBytes.length);
  offset += 1;
  buffer.set(streamIdBytes, offset);
  offset += streamIdBytes.length;
  view.setUint32(offset, frame.seq, true);
  offset += 4;
  view.setFloat64(offset, frame.timestamp, true);
  offset += 8;
  view.setUint32(offset, frame.format.sampleRate, true);
  offset += 4;
  view.setUint8(offset, frame.format.channels);
  offset += 1;
  view.setUint8(offset, frame.format.bitsPerSample);
  offset += 1;
  view.setUint8(offset, ENCODING_CODES[frame.format.encoding]);
  offset += 1;
  view.setUint32(offset, frame.payload.length, true);
  offset += 4;
  buffer.set(frame.payload, offset);

  return buffer;
}

export function decodeAudioFrame(bytes: Uint8Array): AudioFrame {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const protocolVersion = view.getUint8(offset);
  offset += 1;
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${protocolVersion}`);
  }

  const streamKindCode = view.getUint8(offset);
  offset += 1;
  const streamKind = STREAM_KIND_BY_CODE[streamKindCode];
  if (streamKind === undefined) {
    throw new Error(`Unknown stream kind code: ${streamKindCode}`);
  }

  const streamIdLength = view.getUint8(offset);
  offset += 1;
  const streamId = new TextDecoder().decode(bytes.subarray(offset, offset + streamIdLength));
  offset += streamIdLength;

  const seq = view.getUint32(offset, true);
  offset += 4;
  const timestamp = view.getFloat64(offset, true);
  offset += 8;
  const sampleRate = view.getUint32(offset, true);
  offset += 4;
  const channels = view.getUint8(offset);
  offset += 1;
  const bitsPerSample = view.getUint8(offset);
  offset += 1;
  const encodingCode = view.getUint8(offset);
  offset += 1;
  const encoding = ENCODING_BY_CODE[encodingCode];
  if (encoding === undefined) {
    throw new Error(`Unknown encoding code: ${encodingCode}`);
  }
  const payloadLength = view.getUint32(offset, true);
  offset += 4;

  const format: AudioFormat = { sampleRate, channels, bitsPerSample, encoding };
  const payload = bytes.subarray(offset, offset + payloadLength);
  if (payload.length !== payloadLength) {
    throw new Error('Truncated audio frame payload');
  }

  return createAudioFrame({ streamId, streamKind, seq, timestamp, format, payload });
}

import type { AudioFormat } from '@bridge-audio/audio-core';
import type { StreamKind } from '@bridge-audio/audio-core';
import { PROTOCOL_VERSION } from './version.js';

export interface HandshakeRequest {
  type: 'handshake_request';
  protocolVersion: number;
  clientId: string;
}

export interface HandshakeResponse {
  type: 'handshake_response';
  protocolVersion: number;
  accepted: boolean;
  reason?: string;
}

export interface StreamStart {
  type: 'stream_start';
  streamId: string;
  streamKind: StreamKind;
  format: AudioFormat;
}

export interface StreamStop {
  type: 'stream_stop';
  streamId: string;
}

export interface Ping {
  type: 'ping';
  nonce: number;
}

export interface Pong {
  type: 'pong';
  nonce: number;
}

export interface ProtocolError {
  type: 'error';
  message: string;
}

export type ControlMessage =
  | HandshakeRequest
  | HandshakeResponse
  | StreamStart
  | StreamStop
  | Ping
  | Pong
  | ProtocolError;

export function createHandshakeRequest(clientId: string): HandshakeRequest {
  return { type: 'handshake_request', protocolVersion: PROTOCOL_VERSION, clientId };
}

export function createHandshakeResponse(accepted: boolean, reason?: string): HandshakeResponse {
  return { type: 'handshake_response', protocolVersion: PROTOCOL_VERSION, accepted, reason };
}

export function encodeControlMessage(message: ControlMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

export function decodeControlMessage(bytes: Uint8Array): ControlMessage {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
    throw new Error('Invalid control message: missing type');
  }
  return parsed as ControlMessage;
}

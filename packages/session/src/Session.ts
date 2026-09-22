import type { AudioFrame, StreamKind } from '@bridge-audio/audio-core';
import {
  type ControlMessage,
  MessageStreamDecoder,
  createHandshakeRequest,
  createHandshakeResponse,
  decodeAudioFrame,
  decodeControlMessage,
  encodeAudioFrame,
  encodeControlMessage,
  frameMessage,
  PROTOCOL_VERSION,
} from '@bridge-audio/protocol';
import type { Transport } from '@bridge-audio/transport';
import type { SessionState } from './SessionState.js';

export type SessionRole = 'server' | 'client';

/**
 * Wraps a single already-connected Transport with protocol-level framing,
 * handshake, and audio-frame/control-message routing. Playback and
 * microphone frames are independent logical streams distinguished by
 * StreamKind — neither is aware of the other's buffering or lifecycle.
 */
export class Session {
  private readonly decoder = new MessageStreamDecoder();
  private state: SessionState = 'idle';
  private readonly stateListeners: ((state: SessionState) => void)[] = [];
  private readonly audioFrameListeners: ((frame: AudioFrame) => void)[] = [];
  private readonly controlListeners: ((message: ControlMessage) => void)[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly role: SessionRole,
    private readonly localId: string,
  ) {
    this.transport.onData((data) => this.handleData(data));
    this.transport.onClose(() => this.setState('closed'));
  }

  get currentState(): SessionState {
    return this.state;
  }

  onStateChange(listener: (state: SessionState) => void): void {
    this.stateListeners.push(listener);
  }

  onAudioFrame(listener: (frame: AudioFrame) => void): void {
    this.audioFrameListeners.push(listener);
  }

  onControlMessage(listener: (message: ControlMessage) => void): void {
    this.controlListeners.push(listener);
  }

  /** Performs the handshake. Server waits for a request and replies; client sends the request. */
  async handshake(): Promise<void> {
    this.setState('handshaking');

    if (this.role === 'client') {
      this.sendControl(createHandshakeRequest(this.localId));
      await this.waitForControl('handshake_response');
      this.setState('active');
      return;
    }

    const request = await this.waitForControl('handshake_request');
    if (request.type !== 'handshake_request') return;
    const accepted = request.protocolVersion === PROTOCOL_VERSION;
    this.sendControl(createHandshakeResponse(accepted, accepted ? undefined : 'protocol version mismatch'));
    if (!accepted) {
      this.transport.close();
      this.setState('closed');
      throw new Error('Handshake rejected: protocol version mismatch');
    }
    this.setState('active');
  }

  sendAudioFrame(frame: AudioFrame): void {
    this.transport.send(frameMessage('audio_frame', encodeAudioFrame(frame)));
  }

  sendControl(message: ControlMessage): void {
    this.transport.send(frameMessage('control', encodeControlMessage(message)));
  }

  close(): void {
    this.transport.close();
    this.setState('closed');
  }

  private handleData(data: Uint8Array): void {
    const messages = this.decoder.push(data);
    for (const message of messages) {
      if (message.kind === 'audio_frame') {
        const frame = decodeAudioFrame(message.payload);
        for (const listener of this.audioFrameListeners) listener(frame);
      } else {
        const control = decodeControlMessage(message.payload);
        for (const listener of this.controlListeners) listener(control);
      }
    }
  }

  private waitForControl(type: ControlMessage['type']): Promise<ControlMessage> {
    return new Promise((resolve) => {
      const listener = (message: ControlMessage): void => {
        if (message.type === type) resolve(message);
      };
      this.controlListeners.push(listener);
    });
  }

  private setState(state: SessionState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

export function streamKindOf(frame: AudioFrame): StreamKind {
  return frame.streamKind;
}

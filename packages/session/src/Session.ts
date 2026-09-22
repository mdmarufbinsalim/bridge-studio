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
import type { Transport, UdpChannel } from '@bridge-audio/transport';
import type { SessionState } from './SessionState.js';

export type SessionRole = 'server' | 'client';

interface UdpPeer {
  channel: UdpChannel;
  host: string;
  port: number;
}

/**
 * Wraps a single already-connected Transport with protocol-level framing,
 * handshake, and audio-frame/control-message routing. Playback and
 * microphone frames are independent logical streams distinguished by
 * StreamKind — neither is aware of the other's buffering or lifecycle.
 *
 * Control messages (handshake, stream lifecycle) always go over the
 * reliable TCP-based Transport — losing or reordering those would break
 * session state. Audio frames go over TCP too *until* attachUdpAudio() is
 * called, after which they switch to UDP: a lost or late audio frame is
 * just a dropped frame, not a head-of-line block on every frame behind it
 * the way a lost TCP segment would be, which is what real-time audio
 * actually wants.
 */
export class Session {
  private readonly decoder = new MessageStreamDecoder();
  private state: SessionState = 'idle';
  private readonly stateListeners: ((state: SessionState) => void)[] = [];
  private readonly audioFrameListeners: ((frame: AudioFrame) => void)[] = [];
  private readonly controlListeners: ((message: ControlMessage) => void)[] = [];
  private udpPeer: UdpPeer | undefined;

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

  /** Switches outgoing/incoming audio frames onto UDP. Call after the peer's UDP address is known. */
  attachUdpAudio(channel: UdpChannel, host: string, port: number): void {
    this.udpPeer = { channel, host, port };
    channel.onMessage((data) => {
      const frame = decodeAudioFrame(data);
      for (const listener of this.audioFrameListeners) listener(frame);
    });
  }

  sendAudioFrame(frame: AudioFrame): void {
    if (this.udpPeer) {
      this.udpPeer.channel.send(this.udpPeer.host, this.udpPeer.port, encodeAudioFrame(frame));
      return;
    }
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

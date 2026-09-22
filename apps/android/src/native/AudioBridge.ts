import { DEFAULT_AUDIO_FORMAT, createAudioFrame } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import type { EventSubscription } from 'expo-modules-core';
import {
  decodeMicrophoneChunk,
  onMicrophoneChunk,
  startMicrophoneCapture,
  startPlayback,
  stopMicrophoneCapture,
  stopPlayback,
  writePlaybackChunk,
} from 'bridge-audio-module';
import { requestMicrophonePermissions } from './permissions';

const MIC_STREAM_ID = 'android-microphone';

/**
 * Wires an established Session to the native audio module: forwards
 * playback frames from the PC into AudioTrack, and forwards captured
 * microphone chunks from AudioRecord to the PC as framed audio. Playback
 * and microphone are started/stopped independently so either direction can
 * be toggled without touching the other.
 */
export class AudioBridge {
  private micSeq = 0;
  private micSubscription: EventSubscription | undefined;
  private playbackActive = false;
  private micActive = false;

  constructor(private readonly session: Session) {
    this.session.onAudioFrame((frame) => {
      if (frame.streamKind === 'playback') {
        writePlaybackChunk(frame.payload);
      }
    });
  }

  async enablePlayback(): Promise<void> {
    if (this.playbackActive) return;
    // The foreground service declares type "microphone|mediaPlayback" together, so Android
    // requires RECORD_AUDIO to be granted before starting it even for playback-only use.
    await requestMicrophonePermissions();
    const { sampleRate, channels, bitsPerSample } = DEFAULT_AUDIO_FORMAT;
    await startPlayback(sampleRate, channels, bitsPerSample);
    this.playbackActive = true;
  }

  async disablePlayback(): Promise<void> {
    if (!this.playbackActive) return;
    await stopPlayback();
    this.playbackActive = false;
  }

  async enableMicrophone(): Promise<void> {
    if (this.micActive) return;
    await requestMicrophonePermissions();
    const format = DEFAULT_AUDIO_FORMAT;

    this.session.sendControl({
      type: 'stream_start',
      streamId: MIC_STREAM_ID,
      streamKind: 'microphone',
      format,
    });

    this.micSubscription = onMicrophoneChunk((event) => {
      this.session.sendAudioFrame(
        createAudioFrame({
          streamId: MIC_STREAM_ID,
          streamKind: 'microphone',
          seq: this.micSeq++,
          timestamp: Date.now(),
          format,
          payload: decodeMicrophoneChunk(event),
        }),
      );
    });

    await startMicrophoneCapture(format.sampleRate, format.channels, format.bitsPerSample);
    this.micActive = true;
  }

  async disableMicrophone(): Promise<void> {
    if (!this.micActive) return;
    await stopMicrophoneCapture();
    this.micSubscription?.remove();
    this.micSubscription = undefined;
    this.session.sendControl({ type: 'stream_stop', streamId: MIC_STREAM_ID });
    this.micActive = false;
  }

  async teardown(): Promise<void> {
    await this.disableMicrophone();
    await this.disablePlayback();
  }
}

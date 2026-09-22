import { DEFAULT_AUDIO_FORMAT, PcmChunker, bytesPerFrame, createAudioFrame } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import type { EventSubscription } from 'expo-modules-core';
import {
  onMicrophoneChunk,
  startMicrophoneCapture,
  startPlayback,
  stopMicrophoneCapture,
  stopPlayback,
  writePlaybackChunk,
} from 'bridge-audio-module';
import { requestMicrophonePermissions } from './permissions';
import { computePcmLevel } from '../lib/audioLevel';

const MIC_STREAM_ID = 'android-microphone';
// Matches apps/desktop/src/playback.ts: audio now travels over UDP, so each frame must fit in
// one IP packet. AudioRecord hands back whatever chunk size the OS buffer produced (often
// several KB, well over the ~1500-byte Ethernet MTU) — this re-slices it into MTU-safe pieces
// before framing, the same way desktop capture already does.
const SAMPLES_PER_CHUNK = 240; // 5ms @ 48kHz

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
  private micChunker: PcmChunker | undefined;
  private playbackActive = false;
  private micActive = false;
  private playbackLevel = 0;
  private micLevel = 0;

  constructor(private readonly session: Session) {
    this.session.onAudioFrame((frame) => {
      if (frame.streamKind === 'playback') {
        this.playbackLevel = computePcmLevel(frame.payload);
        writePlaybackChunk(frame.payload);
      }
    });
  }

  /** Current 0..1 output (playback) and input (microphone) levels, updated on every audio frame. */
  getLevels(): { playback: number; mic: number } {
    return { playback: this.playbackLevel, mic: this.micLevel };
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
    this.playbackLevel = 0;
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

    this.micChunker = new PcmChunker(bytesPerFrame(format) * SAMPLES_PER_CHUNK);
    this.micSubscription = onMicrophoneChunk((event) => {
      this.micLevel = computePcmLevel(event.chunk);
      for (const payload of this.micChunker!.push(event.chunk)) {
        this.session.sendAudioFrame(
          createAudioFrame({
            streamId: MIC_STREAM_ID,
            streamKind: 'microphone',
            seq: this.micSeq++,
            timestamp: Date.now(),
            format,
            payload,
          }),
        );
      }
    });

    await startMicrophoneCapture(format.sampleRate, format.channels, format.bitsPerSample);
    this.micActive = true;
  }

  async disableMicrophone(): Promise<void> {
    if (!this.micActive) return;
    await stopMicrophoneCapture();
    this.micSubscription?.remove();
    this.micSubscription = undefined;
    this.micChunker = undefined;
    this.session.sendControl({ type: 'stream_stop', streamId: MIC_STREAM_ID });
    this.micActive = false;
    this.micLevel = 0;
  }

  async teardown(): Promise<void> {
    await this.disableMicrophone();
    await this.disablePlayback();
  }
}

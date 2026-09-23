import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { AudioFormat, AudioSink } from '@bridge-audio/audio-core';
import { OWN_VIRTUAL_SINK_NAME, loadNullSink, loadRemapSource, unloadModule } from './pactlHelpers.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

export interface PipeWireVirtualMicSinkOptions {
  sinkName?: string;
  description?: string;
}

// No space — see PipeWireVirtualSpeakerSink's DEFAULT_DESCRIPTION for why.
const DEFAULT_DESCRIPTION = 'BridgeAudio-Microphone';

/**
 * Deliberately low — this sink exists only to carry the phone's mic audio into a source other
 * apps can select as their microphone; it should never win the session manager's default-*output*
 * sink ranking. See PipeWireVirtualSpeakerSink's SINK_PRIORITY and loadNullSink's priority docs:
 * confirmed in real-world testing that without an explicit low priority here, this sink (being
 * created after the speaker sink) kept winning that ranking on its own recomputes — silently
 * mixing real app audio into the same sink as the phone's live mic input.
 */
const SINK_PRIORITY = 0;

/**
 * Publishes received PCM as a PipeWire virtual microphone: loads a
 * null-sink via `pactl`, then streams written chunks into it via
 * `pw-cat --playback`. The sink's `.monitor` source carries the audio, but
 * simplified device pickers (GNOME Settings, and — per real-world testing
 * with a Meet call — Chrome's own microphone list) filter out monitor-class
 * sources entirely, so it never shows up as a selectable microphone there.
 * A module-remap-source wraps that monitor into a proper, non-monitor
 * source (see loadRemapSource) that other apps actually select as their
 * microphone. PipeWire/Pulse specifics stay isolated here — see
 * PipeWireAudioSource for the boundary rationale.
 */
export class PipeWireVirtualMicSink implements AudioSink {
  private nullSinkModuleId: number | undefined;
  private remapSourceModuleId: number | undefined;
  private process: ChildProcessByStdio<Writable, null, Readable> | undefined;
  private readonly sinkName: string;
  private readonly sourceName: string;
  private readonly description: string;

  constructor(readonly format: AudioFormat, options: PipeWireVirtualMicSinkOptions = {}) {
    this.sinkName = options.sinkName ?? OWN_VIRTUAL_SINK_NAME;
    this.sourceName = `${this.sinkName}_input`;
    this.description = options.description ?? DEFAULT_DESCRIPTION;
  }

  /** The source other apps select as their microphone. */
  get microphoneSourceName(): string {
    return this.sourceName;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('PipeWireVirtualMicSink already started');
    }

    this.nullSinkModuleId = await loadNullSink(this.sinkName, this.description, SINK_PRIORITY);
    this.remapSourceModuleId = await loadRemapSource(
      `${this.sinkName}.monitor`,
      this.sourceName,
      this.description,
    );

    const args = [
      '--playback',
      '--rate',
      String(this.format.sampleRate),
      '--channels',
      String(this.format.channels),
      '--format',
      pwCatSampleFormat(this.format),
      '--target',
      this.sinkName,
      '--latency',
      '20ms',
      '-',
    ];

    const child = spawn('pw-cat', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.process = child;

    child.stderr.on('data', (chunk: Buffer) => {
      console.error(`[platform-linux] pw-cat playback stderr: ${chunk.toString('utf8').trim()}`);
    });
    child.on('error', (error) => {
      console.error('[platform-linux] pw-cat playback process error:', error);
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
  }

  write(chunk: Uint8Array): void {
    if (!this.process?.stdin.writable) return;
    this.process.stdin.write(chunk);
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    if (child) {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.stdin.end();
        child.kill('SIGTERM');
      });
    }

    if (this.remapSourceModuleId !== undefined) {
      await unloadModule(this.remapSourceModuleId);
      this.remapSourceModuleId = undefined;
    }
    if (this.nullSinkModuleId !== undefined) {
      await unloadModule(this.nullSinkModuleId);
      this.nullSinkModuleId = undefined;
    }
  }
}

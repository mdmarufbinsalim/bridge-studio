import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { AudioFormat, AudioSink } from '@bridge-audio/audio-core';
import { loadNullSink, unloadModule } from './pactlHelpers.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

export interface PipeWireVirtualMicSinkOptions {
  sinkName?: string;
  description?: string;
}

const DEFAULT_SINK_NAME = 'bridgeaudio_mic';
const DEFAULT_DESCRIPTION = 'BridgeAudio Microphone';

/**
 * Publishes received PCM as a PipeWire virtual microphone: loads a
 * null-sink via `pactl`, then streams written chunks into it via
 * `pw-cat --playback`. Other Linux apps select `<sinkName>.monitor` as
 * their input device. PipeWire/Pulse specifics stay isolated here — see
 * PipeWireAudioSource for the boundary rationale.
 */
export class PipeWireVirtualMicSink implements AudioSink {
  private moduleId: number | undefined;
  private process: ChildProcessByStdio<Writable, null, Readable> | undefined;
  private readonly sinkName: string;
  private readonly description: string;

  constructor(readonly format: AudioFormat, options: PipeWireVirtualMicSinkOptions = {}) {
    this.sinkName = options.sinkName ?? DEFAULT_SINK_NAME;
    this.description = options.description ?? DEFAULT_DESCRIPTION;
  }

  /** The source other apps select as their microphone. */
  get monitorSourceName(): string {
    return `${this.sinkName}.monitor`;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('PipeWireVirtualMicSink already started');
    }

    this.moduleId = await loadNullSink(this.sinkName, this.description);

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

    if (this.moduleId !== undefined) {
      await unloadModule(this.moduleId);
      this.moduleId = undefined;
    }
  }
}

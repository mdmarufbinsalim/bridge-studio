import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { AudioFormat, AudioSink } from '@bridge-audio/audio-core';
import { OWN_VIRTUAL_SINK_NAME, loadNullSink, loadRemapSource, unloadModule } from './pactlHelpers.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

export interface PipeWireVirtualMicSinkOptions {
  sinkName?: string;
  description?: string;
}

// No space — pactl's module-arg parser truncates values at the first space.
const DEFAULT_DESCRIPTION = 'BridgeAudio-Microphone';

/** Deliberately low — this sink must never win the session manager's default-output ranking. */
const SINK_PRIORITY = 0;

/**
 * Publishes received PCM as a PipeWire virtual microphone: loads a null-sink, streams written
 * chunks into it via `pw-cat --playback`, and wraps its monitor with module-remap-source so it
 * shows up as a normal, selectable microphone (device pickers filter out raw monitor sources).
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
    // Without this, a write() racing the child's exit (e.g. during shutdown) throws EPIPE as an
    // unhandled 'error' event — fatal in Node. The `writable` check in write() is the primary
    // guard; this is the safety net for when that check is stale.
    child.stdin.on('error', (error) => {
      console.error('[platform-linux] pw-cat playback stdin error:', error);
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

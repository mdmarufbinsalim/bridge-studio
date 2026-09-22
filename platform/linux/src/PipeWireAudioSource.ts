import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { AudioFormat, AudioSource } from '@bridge-audio/audio-core';
import { getDefaultSinkMonitorName } from './pactlHelpers.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

export interface PipeWireAudioSourceOptions {
  /** PipeWire/Pulse node to capture from, e.g. "alsa_output.foo.monitor". Defaults to the current default sink's monitor. */
  target?: string;
}

/**
 * Captures desktop playback audio via `pw-cat --record`, targeting the
 * default sink's monitor so whatever Linux apps are playing becomes this
 * source's output. All PipeWire-specific concepts (targets, monitors, the
 * `pw-cat` CLI itself) are confined to this file — audio-core/protocol/
 * transport/session only ever see the platform-agnostic AudioSource
 * interface.
 */
export class PipeWireAudioSource implements AudioSource {
  private process: ChildProcessByStdio<null, Readable, Readable> | undefined;

  constructor(readonly format: AudioFormat, private readonly options: PipeWireAudioSourceOptions = {}) {}

  async start(onData: (chunk: Uint8Array) => void): Promise<void> {
    if (this.process) {
      throw new Error('PipeWireAudioSource already started');
    }

    const target = this.options.target ?? (await getDefaultSinkMonitorName());
    const args = [
      '--record',
      '--rate',
      String(this.format.sampleRate),
      '--channels',
      String(this.format.channels),
      '--format',
      pwCatSampleFormat(this.format),
      '--target',
      target,
      '--media-category',
      'Capture',
      '-',
    ];

    const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = child;

    child.stdout.on('data', (chunk: Buffer) => onData(new Uint8Array(chunk)));
    child.stderr.on('data', (chunk: Buffer) => {
      console.error(`[platform-linux] pw-cat record stderr: ${chunk.toString('utf8').trim()}`);
    });
    child.on('error', (error) => {
      console.error('[platform-linux] pw-cat record process error:', error);
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    if (!child) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  }
}

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { AudioFormat, AudioSource } from '@bridge-audio/audio-core';
import { waitForDefaultSinkMonitor } from './pactlHelpers.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

export interface PipeWireAudioSourceOptions {
  /** PipeWire/Pulse node to capture from, e.g. "alsa_output.foo.monitor". Defaults to the current default sink's monitor. */
  target?: string;
  /** How many times to retry if the capture target isn't ready yet. */
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 300;
/** pw-cat exits almost immediately when its target is missing; surviving this long means it actually attached. */
const STARTUP_GRACE_MS = 500;

/**
 * Captures desktop playback audio via `pw-cat --record`, targeting the
 * default sink's monitor so whatever Linux apps are playing becomes this
 * source's output. All PipeWire-specific concepts (targets, monitors, the
 * `pw-cat` CLI itself) are confined to this file — audio-core/protocol/
 * transport/session only ever see the platform-agnostic AudioSource
 * interface.
 *
 * The default sink's monitor can be transiently unavailable — PipeWire
 * still settling at startup, or a fallback/dummy sink flapping in and out
 * when no other sink exists yet — and pw-cat fails at runtime rather than
 * at spawn, so a bad attempt looks like a normal launch followed by an
 * near-immediate exit. start() retries against a freshly re-resolved
 * target when that happens instead of silently leaving no data flowing.
 */
export class PipeWireAudioSource implements AudioSource {
  private process: ChildProcessByStdio<null, Readable, Readable> | undefined;

  constructor(readonly format: AudioFormat, private readonly options: PipeWireAudioSourceOptions = {}) {}

  async start(onData: (chunk: Uint8Array) => void): Promise<void> {
    if (this.process) {
      throw new Error('PipeWireAudioSource already started');
    }

    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        this.process = await this.spawnAndVerify(onData);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    throw new Error(`PipeWireAudioSource failed to start after ${maxAttempts} attempts: ${lastError?.message}`);
  }

  private async spawnAndVerify(
    onData: (chunk: Uint8Array) => void,
  ): Promise<ChildProcessByStdio<null, Readable, Readable>> {
    const target = this.options.target ?? (await waitForDefaultSinkMonitor());
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
    let lastStderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      lastStderr = chunk.toString('utf8').trim();
      console.error(`[platform-linux] pw-cat record stderr: ${lastStderr}`);
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });

    const survivedGracePeriod = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(true), STARTUP_GRACE_MS);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });

    if (!survivedGracePeriod) {
      throw new Error(`pw-cat exited immediately (target: ${target}): ${lastStderr || 'no output'}`);
    }

    child.stdout.on('data', (chunk: Buffer) => onData(new Uint8Array(chunk)));
    child.on('error', (error) => {
      console.error('[platform-linux] pw-cat record process error:', error);
    });

    return child;
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

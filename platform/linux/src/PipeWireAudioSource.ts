import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { AudioFormat, AudioSource } from '@bridge-audio/audio-core';
import { linkPorts } from './pactlHelpers.js';
import { log } from './log.js';
import { pwCatSampleFormat } from './pwCatFormat.js';

const HEALTH_CHECK_INTERVAL_MS = 3000;
/** Unique so linkPorts can target this exact stream — pw-cat's default "pw-cat" name is ambiguous. */
const CAPTURE_NODE_NAME = 'bridgeaudio-desktop-capture';
const CHANNEL_PORT_SUFFIXES = ['FL', 'FR'] as const;

export interface PipeWireAudioSourceOptions {
  /** PipeWire/Pulse node to capture from, e.g. "bridgeaudio_speaker.monitor". Required. */
  target: string;
  /** How many times to retry if the capture target isn't ready yet. */
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 300;
/** pw-cat exits almost immediately when its target is missing; surviving this long means it actually attached. */
const STARTUP_GRACE_MS = 500;

/**
 * Captures desktop playback audio via `pw-cat --record` from a fixed, caller-owned sink's monitor.
 * A periodic health check restarts pw-cat if it dies mid-session, so capture doesn't stay silently
 * dead until a full app reconnect.
 */
export class PipeWireAudioSource implements AudioSource {
  private process: ChildProcessByStdio<null, Readable, Readable> | undefined;
  private healthCheckTimer: NodeJS.Timeout | undefined;
  private onDataCallback: ((chunk: Uint8Array) => void) | undefined;
  private restarting = false;
  private active = false;
  private readonly target: string;

  constructor(readonly format: AudioFormat, private readonly options: PipeWireAudioSourceOptions) {
    this.target = options.target;
  }

  async start(onData: (chunk: Uint8Array) => void): Promise<void> {
    if (this.process) {
      throw new Error('PipeWireAudioSource already started');
    }
    this.onDataCallback = onData;
    this.active = true;

    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        this.process = await this.spawnAndVerify(onData);
        this.startHealthCheck();
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

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      void this.checkForDeadProcessAndRestart();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private async checkForDeadProcessAndRestart(): Promise<void> {
    if (this.restarting || !this.active || !this.onDataCallback || this.process) return;

    this.restarting = true;
    const onData = this.onDataCallback;
    try {
      this.process = await this.spawnAndVerify(onData);
      log('[platform-linux] capture recovered');
    } catch (error) {
      // Target still not ready — logged, not thrown; the next health-check tick retries.
      console.error('[platform-linux] capture (re)start attempt failed, will retry:', error);
    } finally {
      this.restarting = false;
    }
  }

  private async spawnAndVerify(
    onData: (chunk: Uint8Array) => void,
  ): Promise<ChildProcessByStdio<null, Readable, Readable>> {
    const target = this.target;
    log(`[platform-linux] capturing desktop audio from: ${target}`);
    const args = [
      '--record',
      '--rate',
      String(this.format.sampleRate),
      '--channels',
      String(this.format.channels),
      '--format',
      pwCatSampleFormat(this.format),
      // "0" = don't auto-link (unreliable — observed linking to the wrong node entirely).
      // Every link comes from our own explicit linkPorts calls below instead.
      '--target',
      '0',
      '--media-category',
      'Capture',
      '--latency',
      '20ms',
      '-P',
      `node.name=${CAPTURE_NODE_NAME}`,
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

    if (this.format.channels === 1 || this.format.channels === 2) {
      const suffixes = this.format.channels === 1 ? (['MONO'] as const) : CHANNEL_PORT_SUFFIXES;
      try {
        await Promise.all(
          suffixes.map((suffix) =>
            linkPorts(`${target}:monitor_${suffix}`, `${CAPTURE_NODE_NAME}:input_${suffix}`).catch((error) => {
              // "File exists" means the link is already there — e.g. pw-cat's own --target/
              // --media-category auto-link already won this time. That's the desired end state,
              // not a failure; only a genuinely failed link should abort this attempt.
              if (!String(error).includes('File exists')) throw error;
            }),
          ),
        );
      } catch (error) {
        child.kill('SIGTERM');
        throw new Error(`could not link capture to "${target}"'s monitor ports: ${String(error)}`);
      }
    } else {
      console.warn(
        `[platform-linux] unrecognized channel count (${this.format.channels}) for explicit port linking — ` +
          'relying on auto-link, which may silently produce no audio if something else already holds the monitor',
      );
    }

    child.stdout.on('data', (chunk: Buffer) => onData(new Uint8Array(chunk)));
    child.on('error', (error) => {
      console.error('[platform-linux] pw-cat record process error:', error);
    });
    child.once('exit', () => {
      // Let the health check notice via `this.process` and restart, rather than reacting here —
      // a single source of truth for "is capture currently running."
      if (this.process === child) this.process = undefined;
    });

    return child;
  }

  async stop(): Promise<void> {
    this.active = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    this.onDataCallback = undefined;
    await this.killProcess();
  }

  private async killProcess(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    if (!child) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  }
}

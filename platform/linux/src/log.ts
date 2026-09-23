/**
 * Quiet by default — the CLI is meant to run unattended without a wall of scrolling text.
 * `log()` is for anything routine (per-session state transitions, per-frame counters, retry
 * attempts); it only prints with --verbose or BRIDGE_AUDIO_VERBOSE=1. `info()`/`warn()`/`error()`
 * always print, since startup confirmation, connection status, and problems should never be
 * silently swallowed just because verbose mode is off.
 */
const VERBOSE = process.argv.includes('--verbose') || process.env.BRIDGE_AUDIO_VERBOSE === '1';

export function log(...args: unknown[]): void {
  if (VERBOSE) console.log(...args);
}

export function info(...args: unknown[]): void {
  console.log(...args);
}

export function warn(...args: unknown[]): void {
  console.warn(...args);
}

export function error(...args: unknown[]): void {
  console.error(...args);
}

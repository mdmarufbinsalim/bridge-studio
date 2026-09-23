import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Lets `bridgeaudio stop`/`status` find a running server without the caller needing to hunt for
 * it with lsof/ps/kill by hand — the exact friction that came up repeatedly developing this app.
 */
const STATE_DIR = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, 'bridgeaudio')
  : join(homedir(), '.local', 'state', 'bridgeaudio');
const PIDFILE = join(STATE_DIR, 'server.pid');

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the PID of a currently-running server, or undefined if none is running. A pidfile left
 * behind by a crash or `kill -9` (which skips our own cleanup) points at a PID that's no longer
 * alive — that's treated as "not running" and the stale file is removed, so it never blocks a
 * fresh start.
 */
export function readRunningPid(): number | undefined {
  if (!existsSync(PIDFILE)) return undefined;
  const pid = Number.parseInt(readFileSync(PIDFILE, 'utf8').trim(), 10);
  if (!Number.isFinite(pid) || !isProcessAlive(pid)) {
    try {
      unlinkSync(PIDFILE);
    } catch {
      // Already gone — fine.
    }
    return undefined;
  }
  return pid;
}

export function writeOwnPid(): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(PIDFILE, String(process.pid));
}

/** Only removes the pidfile if it still points at this process — never clobbers a newer instance's. */
export function clearOwnPidfile(): void {
  if (!existsSync(PIDFILE)) return;
  const pid = Number.parseInt(readFileSync(PIDFILE, 'utf8').trim(), 10);
  if (pid === process.pid) {
    try {
      unlinkSync(PIDFILE);
    } catch {
      // Already gone — fine.
    }
  }
}

/** Signals a running server to stop and waits (up to 5s) for it to actually exit. */
export async function stopRunningServer(pid: number): Promise<boolean> {
  process.kill(pid, 'SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return !isProcessAlive(pid);
}

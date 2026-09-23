#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readRunningPid, stopRunningServer } from './pidfile.js';

function readVersion(): string {
  try {
    const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      return String((parsed as { version: unknown }).version);
    }
  } catch {
    // Fall through to the placeholder below — not knowing the exact version isn't fatal.
  }
  return 'unknown';
}

const VERSION = readVersion();

const USAGE = `Usage: bridgeaudio [start|stop|status|version] [--verbose]

  start      Start the BridgeAudio server (default if no command given)
  stop       Stop a running server
  status     Check whether a server is currently running
  version    Print the version

  --verbose  Show detailed per-connection logs (or set BRIDGE_AUDIO_VERBOSE=1)`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.find((arg) => !arg.startsWith('-')) ?? 'start';

  switch (command) {
    case 'start': {
      const existingPid = readRunningPid();
      if (existingPid !== undefined) {
        console.error(`bridgeaudio: already running (pid ${existingPid}). Run "bridgeaudio stop" first.`);
        process.exitCode = 1;
        return;
      }
      const { startServer } = await import('./server.js');
      await startServer();
      break;
    }

    case 'stop': {
      const pid = readRunningPid();
      if (pid === undefined) {
        console.log('bridgeaudio: not running.');
        return;
      }
      console.log(`bridgeaudio: stopping (pid ${pid})...`);
      const stopped = await stopRunningServer(pid);
      if (stopped) {
        console.log('bridgeaudio: stopped.');
      } else {
        console.error('bridgeaudio: could not confirm shutdown — it may still be running.');
        process.exitCode = 1;
      }
      break;
    }

    case 'status': {
      const pid = readRunningPid();
      console.log(pid !== undefined ? `bridgeaudio: running (pid ${pid}).` : 'bridgeaudio: not running.');
      break;
    }

    case 'version':
    case '--version':
      console.log(`bridgeaudio ${VERSION}`);
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      break;

    default:
      console.error(`bridgeaudio: unknown command "${command}"\n`);
      console.error(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('bridgeaudio: fatal error:', error);
  process.exitCode = 1;
});

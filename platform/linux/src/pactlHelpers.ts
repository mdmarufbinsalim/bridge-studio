import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const OWN_VIRTUAL_SINK_NAME = 'bridgeaudio_mic';
export const OWN_SPEAKER_SINK_NAME = 'bridgeaudio_speaker';

/** Clears stale modules a crash or `kill -9` left behind, so startup is self-healing. */
async function unloadStaleNullSinks(sinkName: string): Promise<void> {
  const { stdout } = await execFileAsync('pactl', ['list', 'modules', 'short']);
  const staleModuleIds = stdout
    .split('\n')
    .filter((line) => line.includes('module-null-sink') && line.includes(`sink_name=${sinkName} `))
    .map((line) => Number.parseInt(line.split('\t')[0], 10))
    .filter((id) => Number.isFinite(id));

  for (const moduleId of staleModuleIds) {
    await unloadModule(moduleId).catch(() => {});
  }
}

/**
 * `priority` sets priority.driver/priority.session, which is what the session manager uses when
 * it recomputes a default sink (an event-driven recompute, not a one-time choice) — without a
 * distinct priority between our two sinks, whichever was created most recently kept winning that
 * recompute, silently mixing app audio into the microphone sink.
 */
export async function loadNullSink(sinkName: string, description: string, priority?: number): Promise<number> {
  await unloadStaleNullSinks(sinkName);

  const properties = [`device.description=${description}`];
  if (priority !== undefined) {
    properties.push(`priority.driver=${priority}`, `priority.session=${priority}`);
  }

  const { stdout } = await execFileAsync('pactl', [
    'load-module',
    'module-null-sink',
    `sink_name=${sinkName}`,
    `sink_properties=${properties.join(' ')}`,
  ]);
  const moduleId = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(moduleId)) {
    throw new Error(`Unexpected pactl load-module output: ${stdout}`);
  }

  // PipeWire/WirePlumber persists volume (including balance) per device *name*, so a sink
  // recreated with the same name can inherit a stale muted-channel balance from an earlier run.
  await execFileAsync('pactl', ['set-sink-volume', sinkName, '100%', '100%']).catch((error: unknown) => {
    console.error(`[platform-linux] could not reset volume/balance on "${sinkName}":`, error);
  });

  return moduleId;
}

/**
 * A null-sink's raw `.monitor` source is filtered out of simplified device pickers (GNOME
 * Settings, Chrome's mic list) since monitors aren't normally meant to be selected as input.
 * module-remap-source wraps it into a normal-looking, selectable source.
 */
export async function loadRemapSource(
  masterMonitorName: string,
  sourceName: string,
  description: string,
): Promise<number> {
  await unloadStaleRemapSources(sourceName);

  const { stdout } = await execFileAsync('pactl', [
    'load-module',
    'module-remap-source',
    `master=${masterMonitorName}`,
    `source_name=${sourceName}`,
    `source_properties=device.description="${description}"`,
  ]);
  const moduleId = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(moduleId)) {
    throw new Error(`Unexpected pactl load-module output: ${stdout}`);
  }
  return moduleId;
}

async function unloadStaleRemapSources(sourceName: string): Promise<void> {
  const { stdout } = await execFileAsync('pactl', ['list', 'modules', 'short']);
  const staleModuleIds = stdout
    .split('\n')
    .filter((line) => line.includes('module-remap-source') && line.includes(`source_name=${sourceName} `))
    .map((line) => Number.parseInt(line.split('\t')[0], 10))
    .filter((id) => Number.isFinite(id));

  for (const moduleId of staleModuleIds) {
    await unloadModule(moduleId).catch(() => {});
  }
}

export async function unloadModule(moduleId: number): Promise<void> {
  await execFileAsync('pactl', ['unload-module', String(moduleId)]);
}

/**
 * `pw-cat --target <sink> --media-category Capture` auto-linking to a sink's monitor is
 * unreliable (something else already consuming the monitor can silently win the link, leaving
 * capture alive but receiving nothing) — an explicit link avoids that race entirely.
 */
export async function linkPorts(outputPort: string, inputPort: string): Promise<void> {
  await execFileAsync('pw-link', [outputPort, inputPort]);
}

/** Best-effort: apps that don't pick an output device explicitly follow whatever this is set to. */
export async function setDefaultSink(sinkName: string): Promise<void> {
  await execFileAsync('pactl', ['set-default-sink', sinkName]);
}

/** Prefers real ALSA hardware; used to loop our speaker sink's audio back out for local monitoring. */
export async function findRealOutputSink(excludeNames: string[]): Promise<string | undefined> {
  const { stdout } = await execFileAsync('pactl', ['list', 'short', 'sinks']);
  const sinks = stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t')[1])
    .filter((name): name is string => !!name && !excludeNames.includes(name));
  return sinks.find((name) => name.startsWith('alsa_output.')) ?? sinks[0];
}

/**
 * Unlike pw-cat's native --target resolution, module-loopback goes through the PulseAudio-compat
 * layer, which does resolve monitor sources by their pulse-style "<sink>.monitor" name.
 */
export async function loadLoopback(sourceMonitorName: string, sinkName: string): Promise<number> {
  const { stdout } = await execFileAsync('pactl', [
    'load-module',
    'module-loopback',
    `source=${sourceMonitorName}`,
    `sink=${sinkName}`,
    'latency_msec=20',
  ]);
  const moduleId = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(moduleId)) {
    throw new Error(`Unexpected pactl load-module output: ${stdout}`);
  }
  return moduleId;
}

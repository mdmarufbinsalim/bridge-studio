import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Name of the virtual sink PipeWireVirtualMicSink creates.
 */
export const OWN_VIRTUAL_SINK_NAME = 'bridgeaudio_mic';

/**
 * Name of the PipeWire monitor source that carries whatever the default sink
 * is playing.
 *
 * On a machine with no other real audio hardware, our own virtual sink
 * becoming the system default is expected and correct — there's nothing
 * else for PipeWire to prefer. (An earlier version of this function refused
 * to resolve to our own sink name, on the mistaken assumption that it always
 * indicated a bug; it doesn't on a speaker-less machine, and the guard just
 * broke capture entirely for that legitimate case. See loadNullSink for the
 * actual bug that was causing broken audio in that scenario.)
 */
export async function getDefaultSinkMonitorName(): Promise<string> {
  const { stdout } = await execFileAsync('pactl', ['get-default-sink']);
  const sinkName = stdout.trim();
  return `${sinkName}.monitor`;
}

async function sourceExists(sourceName: string): Promise<boolean> {
  const { stdout } = await execFileAsync('pactl', ['list', 'short', 'sources']);
  return stdout.split('\n').some((line) => line.split('\t')[1] === sourceName);
}

/**
 * The default sink (and therefore its monitor source) can be transiently
 * absent or mid-change right after startup or a rapid reconnect — PipeWire
 * settling, or a fallback/dummy sink briefly disappearing when no other
 * sink exists yet. Polls until the resolved monitor source actually exists
 * (or the timeout elapses) instead of handing back a name that doesn't
 * resolve to anything yet.
 */
export async function waitForDefaultSinkMonitor(
  timeoutMs = 3000,
  pollIntervalMs = 150,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastMonitorName = '';

  while (Date.now() < deadline) {
    lastMonitorName = await getDefaultSinkMonitorName();
    if (await sourceExists(lastMonitorName)) {
      return lastMonitorName;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for capture target "${lastMonitorName}" to become available`);
}

/**
 * Unloads any already-loaded null-sink modules with this exact sink_name.
 * Normal shutdown (see stop()/unloadModule callers) removes the sink it
 * created, but a crash or a forceful kill (kill -9, which can't be caught
 * or cleaned up after) leaves it loaded forever. Several stale sinks all
 * sharing the same name is exactly the kind of thing that breaks device
 * enumeration for apps picking a microphone (multiple identically-named
 * candidates, only one of which is actually live) — so every fresh sink
 * creation clears out any leftovers with the same name first, making
 * startup self-healing regardless of how the previous run ended.
 */
async function unloadStaleNullSinks(sinkName: string): Promise<void> {
  const { stdout } = await execFileAsync('pactl', ['list', 'modules', 'short']);
  const staleModuleIds = stdout
    .split('\n')
    .filter((line) => line.includes('module-null-sink') && line.includes(`sink_name=${sinkName} `))
    .map((line) => Number.parseInt(line.split('\t')[0], 10))
    .filter((id) => Number.isFinite(id));

  for (const moduleId of staleModuleIds) {
    await unloadModule(moduleId).catch(() => {
      // Already gone, or otherwise unloadable — nothing more we can do about it.
    });
  }
}

/**
 * Loads a null-sink module so its `<name>.monitor` source can be selected by
 * other apps as a microphone input. Returns the loaded module id, needed to
 * unload it again on stop.
 *
 * PipeWire/WirePlumber persists volume (including balance) per device
 * *name*, not per module instance — so a sink recreated with the same name
 * inherits whatever balance was last set for a device called that, from any
 * source (GNOME Settings, pavucontrol, a previous debugging session). That
 * produced real one-sided audio in testing: the sink came back with one
 * channel muted (balance -1.0) despite our code never setting a balance at
 * all. Forcing both channels to equal volume right after creation guarantees
 * a clean, centered starting point every time, regardless of what a stale
 * persisted preference says.
 */
export async function loadNullSink(sinkName: string, description: string): Promise<number> {
  await unloadStaleNullSinks(sinkName);

  const { stdout } = await execFileAsync('pactl', [
    'load-module',
    'module-null-sink',
    `sink_name=${sinkName}`,
    `sink_properties=device.description=${description}`,
  ]);
  const moduleId = Number.parseInt(stdout.trim(), 10);
  if (!Number.isFinite(moduleId)) {
    throw new Error(`Unexpected pactl load-module output: ${stdout}`);
  }

  await execFileAsync('pactl', ['set-sink-volume', sinkName, '100%', '100%']).catch((error: unknown) => {
    console.error(`[platform-linux] could not reset volume/balance on "${sinkName}":`, error);
  });

  return moduleId;
}

/**
 * Wraps a monitor source with module-remap-source to produce a proper,
 * non-monitor source backed by it. A null-sink's `.monitor` source works
 * fine for anything that lists every PipeWire/Pulse source (pactl, OBS),
 * but simplified device pickers — GNOME Settings' Sound panel, and
 * (per real-world testing) Chrome's microphone list for a Meet call —
 * deliberately filter out monitor-class sources, since a monitor is
 * normally meant for "record what's playing," not for picking as a mic.
 * The remapped source carries the same audio but isn't flagged as a
 * monitor, so it shows up as a normal-looking microphone everywhere.
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
    `source_properties=device.description=${description}`,
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
    await unloadModule(moduleId).catch(() => {
      // Already gone, or otherwise unloadable — nothing more we can do about it.
    });
  }
}

export async function unloadModule(moduleId: number): Promise<void> {
  await execFileAsync('pactl', ['unload-module', String(moduleId)]);
}

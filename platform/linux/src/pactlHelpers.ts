import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Name of the virtual sink PipeWireVirtualMicSink creates (the microphone
 * direction: audio received from the phone, exposed to Linux apps as a mic).
 */
export const OWN_VIRTUAL_SINK_NAME = 'bridgeaudio_mic';

/**
 * Name of the virtual sink PipeWireVirtualSpeakerSink creates (the playback
 * direction: apps output here, and it's captured and sent to the phone).
 * A dedicated sink rather than capturing whatever PipeWire's "default sink"
 * currently is — confirmed unreliable in real-world testing on machines
 * without persistently-active real audio hardware: "default sink" can be
 * absent entirely, can point at a sink that no longer exists, or can drift
 * onto our own microphone sink (a direct feedback loop — hearing your own
 * voice). Owning a fixed, always-present sink removes that whole class of
 * problem: there is always something to capture from, and it's never
 * confusable with the microphone sink since they're different sinks
 * entirely.
 */
export const OWN_SPEAKER_SINK_NAME = 'bridgeaudio_speaker';

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
 * other apps as a microphone input, or written to directly as a playback
 * target. Returns the loaded module id, needed to unload it again on stop.
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
 *
 * `priority` sets `priority.driver`/`priority.session`, which is what the
 * session manager actually uses to pick a default sink when it recomputes
 * one — confirmed in real-world testing that this recompute is event-driven
 * (fires again whenever a new node appears) and, among sinks it considers
 * equally eligible, favors whichever was created more recently. Explicitly
 * calling pactl set-default-sink only wins until the next such recompute;
 * without a distinct priority the two sinks this app creates raced for
 * default on every reconnect, and the more-recently-created one (the
 * microphone sink) kept winning — silently mixing real app audio into the
 * same sink as the phone's live mic input. A real priority value makes our
 * choice the answer the session manager arrives at on its own, not just
 * something we have to keep re-asserting and losing.
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
    await unloadModule(moduleId).catch(() => {
      // Already gone, or otherwise unloadable — nothing more we can do about it.
    });
  }
}

export async function unloadModule(moduleId: number): Promise<void> {
  await execFileAsync('pactl', ['unload-module', String(moduleId)]);
}

/**
 * Explicitly links two PipeWire ports (e.g. "bridgeaudio_speaker:monitor_FL" to
 * "some-node:input_FL"). PipeWireAudioSource needs this because relying on `pw-cat --target
 * <sink> --media-category Capture` to auto-link to a sink's monitor ports turned out to be
 * unreliable in real-world testing: something else already consuming that monitor (confirmed with
 * GNOME Settings' Sound panel open, showing its own level meter) can silently win whatever
 * auto-linking race decides who gets connected, leaving our own capture process alive but
 * receiving nothing — not an error, just permanent silence. An explicit link isn't subject to that
 * race at all.
 */
export async function linkPorts(outputPort: string, inputPort: string): Promise<void> {
  await execFileAsync('pw-link', [outputPort, inputPort]);
}

/**
 * Sets the given sink as PipeWire's default output — so apps that don't
 * explicitly pick an output device (the common case) automatically start
 * routing to it. Used to make our speaker sink "just work" for a call the
 * moment a session goes active, without asking the user to manually change
 * their system output device. Best-effort: failing to set a default isn't
 * fatal, since the sink still works for anything that does target it
 * explicitly (or gets manually selected).
 */
export async function setDefaultSink(sinkName: string): Promise<void> {
  await execFileAsync('pactl', ['set-default-sink', sinkName]);
}

/**
 * Finds a real (non-virtual) sink to loop our speaker sink's audio back out
 * to, so switching the system default to our sink (see setDefaultSink)
 * doesn't silence local playback — confirmed in real-world testing to be a
 * jarring regression otherwise: audio kept playing but produced no sound at
 * all until the user manually picked their output device again. Prefers
 * real ALSA hardware; best-effort — returns undefined if none is currently
 * available, in which case local monitoring is simply skipped (forwarding
 * to the phone, the actual point of this app, is unaffected either way
 * since that path captures from our own fixed sink, not this one).
 */
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
 * Loads a loopback from a monitor source to a real sink, so our speaker
 * sink's audio is also heard locally, not just forwarded to the phone.
 * Unlike pw-cat's native --target resolution (see PipeWireVirtualSpeakerSink
 * for why that doesn't resolve "<sink>.monitor" as a real node),
 * module-loopback goes through the PulseAudio-compat layer, which does
 * resolve monitor sources by their pulse-style name normally.
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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Name of the PipeWire monitor source that carries whatever the default sink is playing. */
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
 * Loads a null-sink module so its `<name>.monitor` source can be selected by
 * other apps as a microphone input. Returns the loaded module id, needed to
 * unload it again on stop.
 */
export async function loadNullSink(sinkName: string, description: string): Promise<number> {
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
  return moduleId;
}

export async function unloadModule(moduleId: number): Promise<void> {
  await execFileAsync('pactl', ['unload-module', String(moduleId)]);
}

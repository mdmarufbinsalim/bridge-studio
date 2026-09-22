import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Name of the PipeWire monitor source that carries whatever the default sink is playing. */
export async function getDefaultSinkMonitorName(): Promise<string> {
  const { stdout } = await execFileAsync('pactl', ['get-default-sink']);
  const sinkName = stdout.trim();
  return `${sinkName}.monitor`;
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

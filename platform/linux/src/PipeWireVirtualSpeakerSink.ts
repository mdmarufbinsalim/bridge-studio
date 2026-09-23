import {
  OWN_SPEAKER_SINK_NAME,
  OWN_VIRTUAL_SINK_NAME,
  findRealOutputSink,
  loadLoopback,
  loadNullSink,
  setDefaultSink,
  unloadModule,
} from './pactlHelpers.js';

export interface PipeWireVirtualSpeakerSinkOptions {
  sinkName?: string;
  description?: string;
  /** Whether to make this sink the system default output on start. Defaults to true. */
  makeDefault?: boolean;
  /**
   * Whether to also loop this sink's audio back out to real hardware, so local playback keeps
   * being audible instead of going silent once makeDefault redirects the system's default output
   * here. Defaults to true.
   */
  loopbackToHardware?: boolean;
}

// No space: confirmed pactl's module-arg parser doesn't honor quoting or backslash-escaping for
// this property, so a spaced value silently truncates at the first word — both our sinks showed
// up as the identical bare "BridgeAudio" in GNOME Settings, impossible to tell apart.
const DEFAULT_DESCRIPTION = 'BridgeAudio-Speaker';

/**
 * Higher than real hardware sinks typically carry (usually ~1000-2009) so the session manager's
 * own default-sink ranking picks this sink on its own, including on its own later recomputes —
 * see loadNullSink's priority docs for why just calling set-default-sink once isn't durable.
 */
const SINK_PRIORITY = 2500;

/**
 * Loads a dedicated null-sink for the playback direction: apps output here
 * (directly, or via makeDefault making it the system default), and
 * PipeWireAudioSource captures its `.monitor` and forwards it to the phone.
 *
 * A fixed, always-present sink rather than capturing whatever PipeWire's
 * "default sink" happens to be — see pactlHelpers.OWN_SPEAKER_SINK_NAME for
 * why that was unreliable in practice. This class only owns the sink's
 * lifecycle (load/set-default/unload); PipeWireAudioSource still does the
 * actual `pw-cat --record` capture against its monitor.
 */
export class PipeWireVirtualSpeakerSink {
  private nullSinkModuleId: number | undefined;
  private loopbackModuleId: number | undefined;
  private readonly sinkName: string;
  private readonly description: string;
  private readonly makeDefault: boolean;
  private readonly loopbackToHardware: boolean;

  constructor(options: PipeWireVirtualSpeakerSinkOptions = {}) {
    this.sinkName = options.sinkName ?? OWN_SPEAKER_SINK_NAME;
    this.description = options.description ?? DEFAULT_DESCRIPTION;
    this.makeDefault = options.makeDefault ?? true;
    this.loopbackToHardware = options.loopbackToHardware ?? true;
  }

  /** The sink apps should output to; also what PipeWireAudioSource should capture `${name}.monitor` from. */
  get sinkNameValue(): string {
    return this.sinkName;
  }

  /**
   * What PipeWireAudioSource should pass as --target to capture this sink's monitor. A null-sink's
   * monitor isn't a separately-named PipeWire node the way the "<name>.monitor" naming convention
   * (borrowed from PulseAudio's source list) implies — it's monitor ports on the *same* node.
   * Confirmed via `pw-link -l`: targeting "<name>.monitor" with pw-cat resolves to nothing and the
   * record stream links to no ports at all (silently producing zeros, not an error) — targeting
   * the bare sink name for a Capture-category stream is what PipeWire actually resolves to the
   * sink's monitor_FL/monitor_FR ports.
   */
  get monitorName(): string {
    return this.sinkName;
  }

  async start(): Promise<void> {
    if (this.nullSinkModuleId !== undefined) {
      throw new Error('PipeWireVirtualSpeakerSink already started');
    }

    this.nullSinkModuleId = await loadNullSink(this.sinkName, this.description, SINK_PRIORITY);

    if (this.makeDefault) {
      await setDefaultSink(this.sinkName).catch((error: unknown) => {
        console.error(`[platform-linux] could not set "${this.sinkName}" as default sink:`, error);
      });
    }

    if (this.loopbackToHardware) {
      // Never our own mic sink — looping our own microphone-direction audio back into the
      // speaker-direction sink would be a direct feedback path (hearing your own voice).
      const realSink = await findRealOutputSink([this.sinkName, OWN_VIRTUAL_SINK_NAME]).catch(() => undefined);
      if (realSink) {
        this.loopbackModuleId = await loadLoopback(`${this.sinkName}.monitor`, realSink).catch((error: unknown) => {
          console.error(`[platform-linux] could not set up local loopback to "${realSink}":`, error);
          return undefined;
        });
      } else {
        console.warn('[platform-linux] no real output device found — skipping local loopback (phone forwarding is unaffected)');
      }
    }
  }

  async stop(): Promise<void> {
    if (this.loopbackModuleId !== undefined) {
      await unloadModule(this.loopbackModuleId);
      this.loopbackModuleId = undefined;
    }
    if (this.nullSinkModuleId !== undefined) {
      await unloadModule(this.nullSinkModuleId);
      this.nullSinkModuleId = undefined;
    }
  }
}

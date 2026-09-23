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

// No space — pactl's module-arg parser truncates values at the first space.
const DEFAULT_DESCRIPTION = 'BridgeAudio-Speaker';

/** Higher than typical hardware sinks (~1000-2009) so the session manager picks this by default. */
const SINK_PRIORITY = 2500;

/**
 * Loads a dedicated, always-present null-sink for the playback direction: apps output here, and
 * PipeWireAudioSource captures its monitor and forwards it to the phone. This class only owns the
 * sink's lifecycle; PipeWireAudioSource does the actual capture.
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

  /** A null-sink's monitor ports live on this same node, not a separately-named "<name>.monitor" node. */
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
      // Excludes our own mic sink too — looping mic audio back into the speaker sink would be a
      // direct feedback path (hearing your own voice).
      const realSink = await findRealOutputSink([this.sinkName, OWN_VIRTUAL_SINK_NAME]).catch(() => undefined);
      if (realSink) {
        this.loopbackModuleId = await loadLoopback(`${this.sinkName}.monitor`, realSink).catch((error: unknown) => {
          console.error(`[platform-linux] could not set up local loopback to "${realSink}":`, error);
          return undefined;
        });
      } else {
        console.warn('[platform-linux] no real output device found — skipping local loopback');
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

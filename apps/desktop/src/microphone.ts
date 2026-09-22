import type { AudioFormat } from '@bridge-audio/audio-core';
import type { Session } from '@bridge-audio/session';
import { PipeWireVirtualMicSink } from '@bridge-audio/platform-linux';

/**
 * Publishes audio frames received from the Android microphone stream as a
 * PipeWire virtual microphone other Linux apps can select as input.
 * Independent of the playback direction — its own lifecycle, its own errors.
 */
export async function startMicrophoneReceiving(
  session: Session,
  format: AudioFormat,
): Promise<() => Promise<void>> {
  const sink = new PipeWireVirtualMicSink(format);
  await sink.start();
  console.log(`[bridge-audio] virtual microphone ready: ${sink.monitorSourceName}`);

  session.onAudioFrame((frame) => {
    if (frame.streamKind === 'microphone') {
      sink.write(frame.payload);
    }
  });

  return async () => {
    await sink.stop();
  };
}

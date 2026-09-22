/** Logical, independent audio directions. Playback and microphone never share buffering or lifecycle. */
export type StreamKind = 'playback' | 'microphone';

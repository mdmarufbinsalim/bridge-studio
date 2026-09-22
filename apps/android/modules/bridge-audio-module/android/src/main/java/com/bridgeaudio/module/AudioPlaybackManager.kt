package com.bridgeaudio.module

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Plays received PCM16 audio via AudioTrack in streaming mode, routed to
 * whatever output Android currently considers active (Bluetooth earbuds
 * when connected via A2DP, matching how any other media app would sound).
 * `write` is called from the network-receive path — it must never block on
 * anything beyond AudioTrack's own internal buffer.
 */
class AudioPlaybackManager {
  private var audioTrack: AudioTrack? = null

  fun start(sampleRate: Int, channels: Int, bitsPerSample: Int) {
    check(audioTrack == null) { "AudioPlaybackManager already started" }

    val channelConfig = if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
    val encoding = if (bitsPerSample == 16) AudioFormat.ENCODING_PCM_16BIT else error("Unsupported bitsPerSample: $bitsPerSample")

    val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, encoding)
    require(minBufferSize > 0) { "Unsupported AudioTrack configuration for this device" }
    val bufferSize = minBufferSize * 2

    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build(),
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(encoding)
          .setSampleRate(sampleRate)
          .setChannelMask(channelConfig)
          .build(),
      )
      .setBufferSizeInBytes(bufferSize)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    audioTrack = track
    track.play()
  }

  fun write(chunk: ByteArray) {
    audioTrack?.write(chunk, 0, chunk.size)
  }

  fun stop() {
    audioTrack?.apply {
      stop()
      release()
    }
    audioTrack = null
  }
}

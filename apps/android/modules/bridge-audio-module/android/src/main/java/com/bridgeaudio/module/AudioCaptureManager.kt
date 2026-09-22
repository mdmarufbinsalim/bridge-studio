package com.bridgeaudio.module

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Captures PCM16 audio from the active Bluetooth microphone (routed via SCO
 * by BluetoothRouteManager) using AudioRecord, and hands fixed-size chunks
 * to a callback on a dedicated capture thread. Bounded: it never buffers
 * more than one AudioRecord-internal buffer's worth of audio — callers are
 * responsible for forwarding chunks promptly (e.g. straight onto the
 * network session) rather than accumulating them here.
 */
class AudioCaptureManager {
  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null
  private val running = AtomicBoolean(false)

  @SuppressLint("MissingPermission") // caller (BridgeAudioModule) verifies RECORD_AUDIO before calling
  fun start(sampleRate: Int, channels: Int, bitsPerSample: Int, onChunk: (ByteArray) -> Unit) {
    check(audioRecord == null) { "AudioCaptureManager already started" }

    val channelConfig = if (channels == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO
    val encoding = if (bitsPerSample == 16) AudioFormat.ENCODING_PCM_16BIT else error("Unsupported bitsPerSample: $bitsPerSample")

    val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)
    require(minBufferSize > 0) { "Unsupported AudioRecord configuration for this device" }
    // Kept at the device minimum — see AudioPlaybackManager for why padding this "for safety"
    // was tried and made real-world lag worse rather than better.
    val bufferSize = minBufferSize

    val record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      sampleRate,
      channelConfig,
      encoding,
      bufferSize,
    )
    check(record.state == AudioRecord.STATE_INITIALIZED) { "AudioRecord failed to initialize" }

    audioRecord = record
    running.set(true)
    record.startRecording()

    captureThread = thread(name = "BridgeAudioCapture") {
      val readBuffer = ByteArray(bufferSize)
      while (running.get()) {
        val bytesRead = record.read(readBuffer, 0, readBuffer.size)
        if (bytesRead > 0) {
          onChunk(readBuffer.copyOf(bytesRead))
        }
      }
    }
  }

  fun stop() {
    running.set(false)
    captureThread?.join(500)
    captureThread = null
    audioRecord?.apply {
      stop()
      release()
    }
    audioRecord = null
  }
}

package com.bridgeaudio.module

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Chunks queued for playback beyond this are dropped oldest-first. Kept
 * deliberately tight: raising this to add "jitter headroom" was tried and
 * made real-world lag *worse*, not better — it turned out the pipeline
 * wasn't just occasionally jittery, it was chronically running behind
 * real time, so a bigger allowance just became a bigger steady-state
 * delay. Staying tight means we drop back to fresh audio sooner.
 */
private const val MAX_QUEUED_CHUNKS = 4

/**
 * Plays received PCM16 audio via AudioTrack in streaming mode, routed to
 * whatever output Android currently considers active (Bluetooth earbuds
 * when connected via A2DP, matching how any other media app would sound).
 *
 * `write()` is called synchronously from the JS bridge thread on every
 * incoming network frame, so it must never block. AudioTrack.write() *does*
 * block when its internal buffer is full (e.g. a brief Bluetooth stall) —
 * calling it directly from write() would stall the JS thread, which also
 * handles incoming network data, so a backlog builds up and is played back
 * in full afterward instead of being caught up to real time. Real
 * AudioTrack writes happen on a dedicated thread instead; write() only
 * enqueues, dropping the oldest queued chunk when the (small, bounded)
 * queue is full so playback always tracks the live stream rather than
 * accumulating a growing delay.
 */
class AudioPlaybackManager {
  private var audioTrack: AudioTrack? = null
  private val queue = LinkedBlockingDeque<ByteArray>()
  private var writerThread: Thread? = null
  private val running = AtomicBoolean(false)

  fun start(sampleRate: Int, channels: Int, bitsPerSample: Int) {
    check(audioTrack == null) { "AudioPlaybackManager already started" }

    val channelConfig = if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
    val encoding = if (bitsPerSample == 16) AudioFormat.ENCODING_PCM_16BIT else error("Unsupported bitsPerSample: $bitsPerSample")

    val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, encoding)
    require(minBufferSize > 0) { "Unsupported AudioTrack configuration for this device" }
    // Once handed to track.write(), audio sits in AudioTrack's own internal buffer, which our
    // drop-oldest queue above has no reach into — a bigger buffer here is pure added latency
    // that plays out sequentially at hardware rate. Doubling it was tried and measurably made
    // real-world lag worse, so this stays at the device minimum.
    val bufferSize = minBufferSize

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
      .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
      .build()

    audioTrack = track
    track.play()

    running.set(true)
    writerThread = thread(name = "BridgeAudioPlayback") {
      while (running.get()) {
        val chunk = queue.pollFirst(100, TimeUnit.MILLISECONDS) ?: continue
        track.write(chunk, 0, chunk.size)
      }
    }
  }

  /** Never blocks: enqueues for the writer thread, dropping the oldest chunk if the queue is full. */
  fun write(chunk: ByteArray) {
    while (queue.size >= MAX_QUEUED_CHUNKS) {
      queue.pollFirst()
    }
    queue.addLast(chunk)
  }

  fun stop() {
    running.set(false)
    writerThread?.join(500)
    writerThread = null
    queue.clear()
    audioTrack?.apply {
      stop()
      release()
    }
    audioTrack = null
  }
}

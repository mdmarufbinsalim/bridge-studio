package com.bridgeaudio.module

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Chunks queued for playback beyond this are dropped oldest-first.
 * Previously kept at 4 (20ms) after doubling this made real-world lag
 * worse — but that test happened while audio still traveled over TCP,
 * where a lost packet stalled everything behind it and the pipeline ran
 * chronically behind real time, so any extra slack just became steady-state
 * delay. Audio now travels over UDP (a lost packet is just a dropped
 * frame, not a stall) and drops are also concealed rather than left silent,
 * so a little more slack here is safe to try again — it should only
 * absorb brief underrun-causing hiccups, not accumulate a backlog.
 */
private const val MAX_QUEUED_CHUNKS = 6

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
    // The bare minimum leaves zero headroom: any brief delay in the writer thread reaching
    // track.write() again (thread scheduling, a GC pause) drains the hardware buffer dry mid
    // playback, which is audible as a click/pop — independent of anything network-related.
    // A modest (not doubled) increase absorbs that without reintroducing the chronic-backlog
    // problem the old TCP-era doubling caused (see MAX_QUEUED_CHUNKS above for why that's fixed).
    // AudioTrack requires the buffer size to be a whole multiple of the frame size (channels *
    // bytes/sample) — minBufferSize always satisfies this, but an arbitrary multiple of it (e.g.
    // *1.5) isn't guaranteed to; on some devices' minBufferSize values that misalignment throws
    // at construction. Round down to the nearest valid frame boundary to guarantee it doesn't.
    val bytesPerFrame = channels * (bitsPerSample / 8)
    val bufferSize = ((minBufferSize * 3 / 2) / bytesPerFrame) * bytesPerFrame

    val track = AudioTrack.Builder()
      .setAudioAttributes(
        // USAGE_VOICE_COMMUNICATION, not USAGE_MEDIA: when the microphone direction is also
        // active, BluetoothRouteManager puts the device in MODE_IN_COMMUNICATION (required for
        // Bluetooth SCO mic access) — Android's OS-level audio pipeline treats that as an active
        // call and applies echo-cancellation/gain processing across the whole session. A stream
        // tagged as generic media gets treated as something competing with "the call" and gets
        // ducked; tagging this stream as voice communication too tells Android it *is* the call
        // audio, which avoids that ducking. This is a genuine architectural match too — this app
        // relays call/voice audio, not generic media.
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
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

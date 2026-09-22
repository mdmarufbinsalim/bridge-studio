package com.bridgeaudio.module

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Modules API surface for BridgeAudio's native audio path. Owns
 * Bluetooth routing, microphone capture, and PCM playback — the JS side
 * (see modules/bridge-audio-module/src/index.ts) only calls these functions
 * and listens for the onMicrophoneChunk event; it never touches AudioRecord/
 * AudioTrack/Bluetooth APIs directly.
 *
 * Playback and microphone are independent: either can be started/stopped
 * without affecting the other, and each owns its own manager instance.
 */
class BridgeAudioModule : Module() {
  private val bluetoothRoute by lazy { BluetoothRouteManager(appContext.reactContext!!) }
  private val captureManager = AudioCaptureManager()
  private val playbackManager = AudioPlaybackManager()

  private var capturing = false
  private var playing = false

  override fun definition() = ModuleDefinition {
    Name("BridgeAudioModule")

    Events("onMicrophoneChunk")

    AsyncFunction("startMicrophoneCapture") { sampleRate: Int, channels: Int, bitsPerSample: Int ->
      if (capturing) return@AsyncFunction
      bluetoothRoute.startBluetoothScoForCapture()
      ensureForegroundServiceRunning()
      captureManager.start(sampleRate, channels, bitsPerSample) { chunk ->
        sendEvent("onMicrophoneChunk", mapOf("chunk" to chunk))
      }
      capturing = true
    }

    AsyncFunction("stopMicrophoneCapture") {
      if (capturing) {
        captureManager.stop()
        bluetoothRoute.stopBluetoothSco()
        capturing = false
        stopForegroundServiceIfIdle()
      }
    }

    AsyncFunction("startPlayback") { sampleRate: Int, channels: Int, bitsPerSample: Int ->
      if (playing) return@AsyncFunction
      ensureForegroundServiceRunning()
      playbackManager.start(sampleRate, channels, bitsPerSample)
      playing = true
    }

    AsyncFunction("stopPlayback") {
      if (playing) {
        playbackManager.stop()
        playing = false
        stopForegroundServiceIfIdle()
      }
    }

    Function("writePlaybackChunk") { chunk: ByteArray ->
      playbackManager.write(chunk)
    }

    OnDestroy {
      if (capturing) captureManager.stop()
      if (playing) playbackManager.stop()
      bluetoothRoute.stopBluetoothSco()
    }
  }

  private fun ensureForegroundServiceRunning() {
    if (!capturing && !playing) {
      BridgeAudioForegroundService.start(appContext.reactContext!!)
    }
  }

  private fun stopForegroundServiceIfIdle() {
    if (!capturing && !playing) {
      BridgeAudioForegroundService.stop(appContext.reactContext!!)
    }
  }
}

package com.bridgeaudio.module

import android.content.Context
import android.media.AudioManager

/**
 * Owns Bluetooth audio routing. Earbuds are paired to Android normally (this
 * module never does pairing) — this class only makes sure capture/playback
 * go through the active Bluetooth route once connected.
 *
 * Playback of MUSIC-type audio already routes to an A2DP-connected headset
 * automatically. Capturing the earbuds' microphone requires the phone call
 * (SCO/HFP) audio path, since A2DP is output-only — so mic capture starts
 * Bluetooth SCO and playback during a mic session rides along the same SCO
 * link; a playback-only session doesn't need SCO.
 */
class BluetoothRouteManager(context: Context) {
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var scoStarted = false

  fun startBluetoothScoForCapture() {
    if (scoStarted) return
    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    audioManager.startBluetoothSco()
    audioManager.isBluetoothScoOn = true
    scoStarted = true
  }

  fun stopBluetoothSco() {
    if (!scoStarted) return
    audioManager.isBluetoothScoOn = false
    audioManager.stopBluetoothSco()
    audioManager.mode = AudioManager.MODE_NORMAL
    scoStarted = false
  }

  /** True once the OS reports a Bluetooth SCO audio connection is actually up (there's a delay after starting it). */
  fun isScoConnected(): Boolean = audioManager.isBluetoothScoOn
}

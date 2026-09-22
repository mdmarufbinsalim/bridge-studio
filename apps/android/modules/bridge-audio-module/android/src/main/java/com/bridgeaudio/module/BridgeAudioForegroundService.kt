package com.bridgeaudio.module

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the process alive and audio flowing while the app is backgrounded.
 * Started when either an audio stream (playback or microphone) is active,
 * stopped once both are stopped — see BridgeAudioModule.
 */
class BridgeAudioForegroundService : Service() {
  companion object {
    private const val CHANNEL_ID = "bridge_audio_streaming"
    private const val NOTIFICATION_ID = 1001

    fun start(context: Context) {
      context.startForegroundService(Intent(context, BridgeAudioForegroundService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, BridgeAudioForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification())
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "BridgeAudio streaming", NotificationManager.IMPORTANCE_LOW),
    )
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("BridgeAudio")
      .setContentText("Streaming audio with your PC")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .build()
}

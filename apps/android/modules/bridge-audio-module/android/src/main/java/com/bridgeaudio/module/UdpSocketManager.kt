package com.bridgeaudio.module

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private const val MAX_UDP_PACKET_SIZE = 65507

/**
 * Raw UDP send/receive via java.net.DatagramSocket, replacing
 * react-native-udp. That library's JS↔native bridge base64-encodes every
 * packet on the JS thread — real per-packet overhead that, combined with
 * full-duplex audio (mic + playback both active roughly doubles total
 * packet count), was the suspected cause of jitter/quality regressions
 * seen in real-world testing. This exposes data as raw ByteArray through
 * Expo's JSI-backed bridge instead (same pattern already used for
 * microphone/playback chunks in BridgeAudioModule) — no serialization step.
 */
class UdpSocketManager {
  private var socket: DatagramSocket? = null
  private var receiveThread: Thread? = null
  private val running = AtomicBoolean(false)

  /** Binds to an OS-assigned ephemeral port and starts receiving. Returns the bound port. */
  fun open(onMessage: (data: ByteArray, host: String, port: Int) -> Unit): Int {
    check(socket == null) { "UdpSocketManager already open" }

    val newSocket = DatagramSocket(0)
    socket = newSocket
    running.set(true)

    receiveThread = thread(name = "BridgeAudioUdpReceive") {
      val buffer = ByteArray(MAX_UDP_PACKET_SIZE)
      while (running.get()) {
        try {
          val packet = DatagramPacket(buffer, buffer.size)
          newSocket.receive(packet)
          val data = packet.data.copyOfRange(packet.offset, packet.offset + packet.length)
          onMessage(data, packet.address?.hostAddress ?: "", packet.port)
        } catch (error: Exception) {
          // socket.close() during close() causes receive() to throw — expected, not an error,
          // once running has already been set to false. Anything else is a real receive
          // failure; the loop just continues rather than tearing down the whole socket over it.
          if (running.get()) {
            System.err.println("[bridge-audio-module] UDP receive error: ${error.message}")
          }
        }
      }
    }

    return newSocket.localPort
  }

  fun send(host: String, port: Int, data: ByteArray) {
    val currentSocket = socket ?: return
    currentSocket.send(DatagramPacket(data, data.size, InetSocketAddress(host, port)))
  }

  fun close() {
    running.set(false)
    socket?.close()
    receiveThread?.join(500)
    receiveThread = null
    socket = null
  }
}

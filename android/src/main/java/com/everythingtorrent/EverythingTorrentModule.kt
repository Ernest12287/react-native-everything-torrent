package com.everythingtorrent

import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.libtorrent4j.*
import org.libtorrent4j.alerts.*
import java.io.File

class EverythingTorrentModule(private val reactContext: ReactApplicationContext) :
  NativeEverythingTorrentSpec(reactContext) {

  companion object {
    const val NAME = NativeEverythingTorrentSpec.NAME
  }

  private var session: SessionManager? = null
  // sha1hash hex -> TorrentHandle
  private val handles = mutableMapOf<String, TorrentHandle>()

  // ─── Session ─────────────────────────────────────────────────────────────

  override fun startSession() {
    if (session != null) return
    val mgr = SessionManager()

    mgr.addListener(object : AlertListener {
      override fun types(): IntArray? = null

      override fun alert(alert: Alert<*>) {
        when (alert.type()) {

          AlertType.METADATA_RECEIVED -> {
            val a = alert as MetadataReceivedAlert
            val handle = a.handle()
            val torrentInfo = handle.torrentFile() ?: return
            val id = handle.infoHash().toHex()
            handles[id] = handle

            val filesArr = Arguments.createArray()
            val storage = torrentInfo.files()
            for (i in 0 until torrentInfo.numFiles()) {
              val map = Arguments.createMap()
              map.putInt("index", i)
              map.putString("name", storage.fileName(i))
              map.putDouble("size", storage.fileSize(i).toDouble())
              map.putString("path", storage.filePath(i))
              filesArr.pushMap(map)
            }
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putArray("files", filesArr)
            emit("torrent_metadata_ready", payload)
          }

          AlertType.BLOCK_DOWNLOADING -> {
            val a = alert as BlockDownloadingAlert
            val handle = a.handle()
            if (!handle.isValid) return
            val status = handle.status()
            val id = handle.infoHash().toHex()
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putDouble("percent", (status.progress() * 100).toDouble())
            payload.putDouble("speed", status.downloadPayloadRate().toDouble())
            payload.putDouble("downloaded", status.allTimeDownload().toDouble())
            payload.putInt("peers", status.numPeers())
            emit("torrent_progress", payload)
          }

          AlertType.TORRENT_FINISHED -> {
            val a = alert as TorrentFinishedAlert
            val handle = a.handle()
            val id = handle.infoHash().toHex()
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putString("folder", handle.savePath())
            emit("torrent_done", payload)
          }

          AlertType.TORRENT_ERROR -> {
            val a = alert as TorrentErrorAlert
            val payload = Arguments.createMap()
            payload.putString("message", a.error().message())
            emit("torrent_error", payload)
          }

          else -> {}
        }
      }
    })

    mgr.start()
    session = mgr
  }

  override fun stopSession() {
    session?.stop()
    session = null
    handles.clear()
  }

  // ─── Add magnet ───────────────────────────────────────────────────────────

  override fun addMagnet(magnet: String, savePath: String) {
    val mgr = session ?: throw RuntimeException("Call startSession() first")
    File(savePath).mkdirs()
    // fetch metadata only — no data downloaded yet
    mgr.fetchMagnet(magnet, 60, File(savePath))
  }

  // ─── Start download with selected file indices ────────────────────────────

  override fun startDownload(torrentId: String, fileIndices: ReadableArray) {
    val handle = handles[torrentId] ?: throw RuntimeException("Torrent not found: $torrentId")
    val info = handle.torrentFile() ?: throw RuntimeException("Metadata not ready")

    val count = info.numFiles()
    val priorities = Array(count) { Priority.IGNORE }
    for (i in 0 until fileIndices.size()) {
      val idx = fileIndices.getInt(i)
      if (idx in 0 until count) priorities[idx] = Priority.DEFAULT
    }
    handle.prioritizeFiles(priorities)
    handle.resume()
  }

  // ─── Controls ─────────────────────────────────────────────────────────────

  override fun pauseTorrent(torrentId: String) {
    handles[torrentId]?.pause()
  }

  override fun resumeTorrent(torrentId: String) {
    handles[torrentId]?.resume()
  }

  override fun removeTorrent(torrentId: String) {
    val handle = handles.remove(torrentId) ?: return
    session?.remove(handle)
  }

  // ─── Download path ────────────────────────────────────────────────────────

  override fun getDownloadPath(promise: Promise) {
    val path = reactContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)?.absolutePath
      ?: reactContext.filesDir.absolutePath
    promise.resolve(path)
  }

  // ─── Event emitter boilerplate ────────────────────────────────────────────

  override fun addListener(eventName: String) {}
  override fun removeListeners(count: Double) {}

  private fun emit(event: String, payload: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }
}
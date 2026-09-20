package com.everythingtorrent

import android.os.Environment
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.libtorrent4j.Priority
import java.io.File
import java.util.Arrays

class EverythingTorrentModule(private val reactContext: ReactApplicationContext) :
    NativeEverythingTorrentSpec(reactContext) {

    companion object {
        const val NAME = NativeEverythingTorrentSpec.NAME
    }

    // ─── Session ──────────────────────────────────────────────────────────────

    override fun startSession() {
        Session.start()
        TorrentManager.init()
        TorrentManager.addListener(torrentListener)
    }

    override fun stopSession() {
        TorrentManager.removeListener(torrentListener)
        TorrentManager.destroy()
        Session.stop()
    }

    // ─── Add magnet ───────────────────────────────────────────────────────────

    override fun addMagnet(magnet: String, savePath: String) {
        TorrentManager.addMagnet(magnet, File(savePath), false, false)
    }

    // ─── Start download ───────────────────────────────────────────────────────

    override fun startDownload(torrentId: String, fileIndices: ReadableArray) {
        val handle = TorrentManager.getHandle(torrentId) ?: return
        if (!handle.isValid) return

        val info = handle.torrentFile() ?: return
        val fileCount = info.numFiles()
        if (fileCount == 0) return

        val selectedIndices = mutableListOf<Int>()
        for (i in 0 until fileIndices.size()) {
            selectedIndices.add(fileIndices.getInt(i))
        }
        if (selectedIndices.isEmpty()) return

        val priorities = Array(fileCount) { Priority.IGNORE }
        if (selectedIndices.size == fileCount) {
            Arrays.fill(priorities, Priority.DEFAULT)
        } else {
            for (index in selectedIndices) {
                if (index in 0 until fileCount) priorities[index] = Priority.DEFAULT
            }
        }

        handle.prioritizeFiles(priorities)
        handle.resume()
    }

    // ─── Controls ─────────────────────────────────────────────────────────────

    override fun pauseTorrent(torrentId: String) {
        TorrentManager.pause(torrentId)
    }

    override fun resumeTorrent(torrentId: String) {
        TorrentManager.resume(torrentId)
    }

    override fun removeTorrent(torrentId: String) {
        TorrentManager.remove(torrentId, false)
    }

    // ─── Stream ───────────────────────────────────────────────────────────────
    // No HTTP server, no second download.
    // We just find the file on disk that libtorrent is already writing to
    // and return a file:// URI. react-native-video opens it directly.
    // As more pieces download, the file grows and the player reads ahead.

    override fun startStream(torrentId: String, fileIndex: Double, promise: Promise) {
        try {
            val handle = TorrentManager.getHandle(torrentId)
            if (handle == null || !handle.isValid) {
                promise.reject("STREAM_ERROR", "Torrent handle not found")
                return
            }

            val info = handle.torrentFile()
            if (info == null) {
                promise.reject("STREAM_ERROR", "Metadata not ready yet")
                return
            }

            val idx = fileIndex.toInt()
            if (idx < 0 || idx >= info.numFiles()) {
                promise.reject("STREAM_ERROR", "File index out of range")
                return
            }

            // Build the full path: savePath + relative file path inside torrent
            val savePath = handle.savePath()
            val relativePath = info.files().filePath(idx)
            val fullPath = "$savePath/$relativePath"

            val file = File(fullPath)
            if (!file.parentFile?.exists()!!) {
                promise.reject("STREAM_ERROR", "File not started downloading yet")
                return
            }

            // Enable sequential download so pieces come in order for smooth playback
            handle.setFlags(org.libtorrent4j.TorrentFlags.SEQUENTIAL_DOWNLOAD)

            // Prioritize this specific file to TOP so it downloads fast
            val priorities = Array(info.numFiles()) { Priority.IGNORE }
            priorities[idx] = Priority.TOP_PRIORITY
            handle.prioritizeFiles(priorities)

            promise.resolve("file://$fullPath")

        } catch (e: Exception) {
            promise.reject("STREAM_ERROR", e.message)
        }
    }

    // ─── Download path ────────────────────────────────────────────────────────

    override fun getDownloadPath(promise: Promise) {
        val path = reactContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)?.absolutePath
            ?: reactContext.filesDir.absolutePath
        promise.resolve(path)
    }

    // ─── Event emitter ────────────────────────────────────────────────────────

    override fun addListener(eventName: String) {}
    override fun removeListeners(count: Double) {}

    private fun emit(event: String, payload: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    // ─── TorrentManager listener ──────────────────────────────────────────────

    private val torrentListener = object : TorrentManager.Listener {
        override fun onTorrentAdded(id: String, name: String) {}

        override fun onMetadataReceived(id: String, name: String) {
            val handle = TorrentManager.getHandle(id) ?: return
            val info = handle.torrentFile() ?: return
            val storage = info.files()
            val filesArr = Arguments.createArray()
            for (i in 0 until info.numFiles()) {
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

        override fun onTorrentStateChanged(
            id: String, state: String, progress: Float,
            downloadSpeed: Long, uploadSpeed: Long,
            totalSize: Long, downloaded: Long,
            peers: Int, seeds: Int,
            fileProgress: LongArray
        ) {
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putDouble("percent", (progress * 100).toDouble())
            payload.putDouble("speed", downloadSpeed.toDouble())
            payload.putDouble("downloaded", downloaded.toDouble())
            payload.putInt("peers", peers)

            val fileProgressArr = Arguments.createArray()
            for (bytes in fileProgress) fileProgressArr.pushDouble(bytes.toDouble())
            payload.putArray("fileProgress", fileProgressArr)

            emit("torrent_progress", payload)
        }

        override fun onTorrentFinished(id: String) {
            val handle = TorrentManager.getHandle(id) ?: return
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putString("folder", handle.savePath())
            emit("torrent_done", payload)
        }

        override fun onTorrentError(id: String, error: String) {
            val payload = Arguments.createMap()
            payload.putString("torrentId", id)
            payload.putString("message", error)
            emit("torrent_error", payload)
        }
    }
}
package com.everythingtorrent;

import android.util.Log;

import org.libtorrent4j.Priority;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;

import java.util.Arrays;
import java.util.List;

/**
 * Downloader — handles selective file download from a torrent.
 *
 * Their way (LibreTorrent):
 *   1. Build a Priority[] array the same size as the total file count
 *   2. Fill everything with Priority.IGNORE
 *   3. Flip only the selected file indices to Priority.DEFAULT
 *   4. If ALL files are selected just fill everything DEFAULT (skip the loop)
 *   5. Call handle.prioritizeFiles(priorities) then handle.resume()
 */
public class Downloader {

    private static final String TAG = "Downloader";

    /**
     * Start downloading only the files at the given indices.
     *
     * @param torrentId   The info-hash hex string (from torrent_metadata_ready event)
     * @param fileIndices The list of file indices the user selected
     */
    public static void startDownload(String torrentId, List<Integer> fileIndices) {
        // ── 1. Get the handle ────────────────────────────────────────────────
        TorrentHandle handle = TorrentManager.getHandle(torrentId);
        if (handle == null || !handle.isValid()) {
            Log.e(TAG, "startDownload: invalid handle for " + torrentId);
            return;
        }

        // ── 2. Get torrent file info (has the file count) ────────────────────
        TorrentInfo info = handle.torrentFile();
        if (info == null) {
            Log.e(TAG, "startDownload: torrentFile() is null for " + torrentId
                    + " — metadata not ready yet?");
            return;
        }

        int fileCount = info.numFiles();
        if (fileCount == 0) {
            Log.w(TAG, "startDownload: torrent has no files?");
            return;
        }

        if (fileIndices == null || fileIndices.isEmpty()) {
            Log.w(TAG, "startDownload: no files selected, nothing to do");
            return;
        }

        // ── 3. Build Priority[] — their exact approach ───────────────────────
        Priority[] priorities = new Priority[fileCount];

        if (fileIndices.size() == fileCount) {
            // ALL files selected → just fill DEFAULT, skip the loop
            Arrays.fill(priorities, Priority.DEFAULT);
            Log.d(TAG, "startDownload: all " + fileCount + " files selected");
        } else {
            // SOME files → IGNORE everything first, then flip selected to DEFAULT
            Arrays.fill(priorities, Priority.IGNORE);
            for (int index : fileIndices) {
                if (index >= 0 && index < fileCount) {
                    priorities[index] = Priority.DEFAULT;
                } else {
                    Log.w(TAG, "startDownload: index " + index + " out of range, skipping");
                }
            }
            Log.d(TAG, "startDownload: " + fileIndices.size() + " of " + fileCount + " files selected");
        }

        // ── 4. Apply priorities + resume ─────────────────────────────────────
        handle.prioritizeFiles(priorities);
        handle.resume();

        Log.d(TAG, "startDownload: priorities applied and torrent resumed [" + torrentId + "]");
    }

    /**
     * Pause a torrent.
     *
     * @param torrentId The info-hash hex string
     */
    public static void pause(String torrentId) {
        TorrentHandle handle = TorrentManager.getHandle(torrentId);
        if (handle != null && handle.isValid()) {
            handle.pause();
            Log.d(TAG, "pause: " + torrentId);
        } else {
            Log.w(TAG, "pause: handle not found for " + torrentId);
        }
    }

    /**
     * Resume a torrent.
     *
     * @param torrentId The info-hash hex string
     */
    public static void resume(String torrentId) {
        TorrentHandle handle = TorrentManager.getHandle(torrentId);
        if (handle != null && handle.isValid()) {
            handle.resume();
            Log.d(TAG, "resume: " + torrentId);
        } else {
            Log.w(TAG, "resume: handle not found for " + torrentId);
        }
    }

    /**
     * Remove a torrent (keeps downloaded files).
     *
     * @param torrentId The info-hash hex string
     */
    public static void remove(String torrentId) {
        TorrentManager.remove(torrentId, false);
        Log.d(TAG, "remove: " + torrentId);
    }

    /**
     * Log all files inside a torrent with their indices.
     * Useful for debugging — call after metadata is ready.
     *
     * @param torrentId The info-hash hex string
     */
    public static void logFiles(String torrentId) {
        TorrentHandle handle = TorrentManager.getHandle(torrentId);
        if (handle == null || !handle.isValid()) {
            Log.e(TAG, "logFiles: invalid handle for " + torrentId);
            return;
        }

        TorrentInfo info = handle.torrentFile();
        if (info == null) {
            Log.e(TAG, "logFiles: no torrent info yet");
            return;
        }

        var storage = info.files();
        int count = info.numFiles();
        Log.d(TAG, "logFiles: " + count + " files in torrent [" + torrentId + "]");
        for (int i = 0; i < count; i++) {
            Log.d(TAG, "  [" + i + "] " + storage.fileName(i)
                    + " (" + storage.fileSize(i) + " bytes)");
        }
    }
}
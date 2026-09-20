package com.everythingtorrent;

import android.util.Log;

import org.libtorrent4j.AlertListener;
import org.libtorrent4j.SessionHandle;
import org.libtorrent4j.TorrentFlags;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;
import org.libtorrent4j.TorrentStatus;
import org.libtorrent4j.alerts.AddTorrentAlert;
import org.libtorrent4j.alerts.Alert;
import org.libtorrent4j.alerts.AlertType;
import org.libtorrent4j.alerts.MetadataReceivedAlert;
import org.libtorrent4j.alerts.PieceFinishedAlert;
import org.libtorrent4j.alerts.StateChangedAlert;
import org.libtorrent4j.alerts.TorrentErrorAlert;
import org.libtorrent4j.alerts.TorrentFinishedAlert;
import org.libtorrent4j.swig.add_torrent_params;
import org.libtorrent4j.swig.error_code;
import org.libtorrent4j.swig.libtorrent;
import org.libtorrent4j.swig.torrent_flags_t;
import org.libtorrent4j.swig.torrent_handle;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TorrentManager {

    private static final String TAG = "TorrentManager";

    public interface Listener {
        void onTorrentAdded(String id, String name);
        void onTorrentStateChanged(String id, String state, float progress,
                                   long downloadSpeed, long uploadSpeed,
                                   long totalSize, long downloaded,
                                   int peers, int seeds,
                                   long[] fileProgress);   // ← per-file bytes downloaded
        void onTorrentFinished(String id);
        void onTorrentError(String id, String error);
        void onMetadataReceived(String id, String name);
    }

    private static final Map<String, TorrentHandle> handles = new HashMap<>();
    private static final List<Listener> listeners = new ArrayList<>();

    private static final AlertListener alertListener = new AlertListener() {
        @Override
        public int[] types() {
            return new int[]{
                AlertType.ADD_TORRENT.swig(),
                AlertType.STATE_CHANGED.swig(),
                AlertType.TORRENT_FINISHED.swig(),
                AlertType.METADATA_RECEIVED.swig(),
                AlertType.TORRENT_ERROR.swig(),
                AlertType.PIECE_FINISHED.swig(),
            };
        }

        @Override
        public void alert(Alert<?> alert) {
            switch (alert.type()) {
                case ADD_TORRENT:
                    handleAddTorrent((AddTorrentAlert) alert);
                    break;
                case STATE_CHANGED:
                    handleStateChanged((StateChangedAlert) alert);
                    break;
                case TORRENT_FINISHED:
                    handleFinished((TorrentFinishedAlert) alert);
                    break;
                case METADATA_RECEIVED:
                    handleMetadata((MetadataReceivedAlert) alert);
                    break;
                case PIECE_FINISHED:
                    PieceFinishedAlert pieceAlert = (PieceFinishedAlert) alert;
                    TorrentHandle pieceHandle = pieceAlert.handle();
                    if (!pieceHandle.isValid()) return;
                    notifyStateChanged(pieceHandle.infoHash().toHex(), pieceHandle);
                    break;
                case TORRENT_ERROR:
                    TorrentErrorAlert errorAlert = (TorrentErrorAlert) alert;
                    TorrentHandle errHandle = errorAlert.handle();
                    if (!errHandle.isValid()) return;
                    String errId = errHandle.infoHash().toHex();
                    if (errorAlert.error().isError()) {
                        String msg = errorAlert.error().getMessage();
                        Log.e(TAG, "Torrent error [" + errId + "]: " + msg);
                        for (Listener l : listeners) l.onTorrentError(errId, msg);
                    }
                    break;
                default:
                    break;
            }
        }
    };

    public static void init() {
        Session.INSTANCE.get().addListener(alertListener);
    }

    public static void destroy() {
        Session.INSTANCE.get().removeListener(alertListener);
        handles.clear();
        listeners.clear();
    }

    public static void addListener(Listener l)    { listeners.add(l); }
    public static void removeListener(Listener l) { listeners.remove(l); }

    public static void addMagnet(String magnetUri, File saveDir,
                                 boolean paused, boolean sequential) {
        if (!Session.INSTANCE.isRunning()) { Log.e(TAG, "Session not running"); return; }

        error_code ec = new error_code();
        add_torrent_params p = libtorrent.parse_magnet_uri(magnetUri, ec);
        if (ec.value() != 0) { Log.e(TAG, "Bad magnet URI: " + ec.message()); return; }

        saveDir.mkdirs();
        p.setSave_path(saveDir.getAbsolutePath());
        p.setFlags(buildFlags(p.getFlags(), paused, sequential));

        Session.INSTANCE.get().swig().async_add_torrent(p);
        Log.d(TAG, "Magnet queued");
    }

    public static void addTorrentFile(String filePath, File saveDir,
                                      boolean paused, boolean sequential) {
        if (!Session.INSTANCE.isRunning()) { Log.e(TAG, "Session not running"); return; }

        File file = new File(filePath);
        if (!file.exists()) { Log.e(TAG, "File not found: " + filePath); return; }

        TorrentInfo ti = new TorrentInfo(file);
        if (!ti.isValid()) { Log.e(TAG, "Invalid torrent file"); return; }

        if (Session.INSTANCE.get().swig().find_torrent(ti.swig().info_hash()).is_valid()) {
            Log.w(TAG, "Already added: " + ti.name());
            return;
        }

        add_torrent_params p = new add_torrent_params();
        p.set_ti(ti.swig());
        saveDir.mkdirs();
        p.setSave_path(saveDir.getAbsolutePath());
        p.setFlags(buildFlags(p.getFlags(), paused, sequential));

        Session.INSTANCE.get().swig().async_add_torrent(p);
        Log.d(TAG, "Torrent file queued: " + ti.name());
    }

    public static void pause(String id) {
        TorrentHandle h = handles.get(id);
        if (h != null) h.pause(); else Log.w(TAG, "pause: not found " + id);
    }

    public static void resume(String id) {
        TorrentHandle h = handles.get(id);
        if (h != null) h.resume(); else Log.w(TAG, "resume: not found " + id);
    }

    public static void remove(String id, boolean withFiles) {
        TorrentHandle h = handles.remove(id);
        if (h == null) return;
        if (withFiles) Session.INSTANCE.get().remove(h, SessionHandle.DELETE_FILES);
        else Session.INSTANCE.get().remove(h, SessionHandle.DELETE_PARTFILE);
    }

    public static TorrentHandle getHandle(String id) {
        return handles.get(id);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private static void handleAddTorrent(AddTorrentAlert alert) {
        if (alert.error().isError()) {
            Log.e(TAG, "Failed to add: " + alert.error().getMessage());
            return;
        }
        TorrentHandle handle = alert.handle();
        String id = handle.infoHash().toHex();
        handles.put(id, handle);
        handle.resume();
        String name = handle.getName();
        Log.d(TAG, "Torrent added: " + name + " [" + id + "]");
        for (Listener l : listeners) l.onTorrentAdded(id, name);
    }

    private static void handleStateChanged(StateChangedAlert alert) {
        TorrentHandle handle = alert.handle();
        if (!handle.isValid()) return;
        String id = handle.infoHash().toHex();
        notifyStateChanged(id, handle);
    }

    private static void handleFinished(TorrentFinishedAlert alert) {
        TorrentHandle handle = alert.handle();
        if (!handle.isValid()) return;
        String id = handle.infoHash().toHex();
        Log.d(TAG, "Finished: " + id);
        for (Listener l : listeners) l.onTorrentFinished(id);
    }

    private static void handleMetadata(MetadataReceivedAlert alert) {
        TorrentHandle handle = alert.handle();
        if (!handle.isValid()) return;
        String id = handle.infoHash().toHex();
        String name = handle.getName();
        Log.d(TAG, "Metadata received: " + name + " [" + id + "]");
        for (Listener l : listeners) l.onMetadataReceived(id, name);
    }

    private static void notifyStateChanged(String id, TorrentHandle handle) {
        TorrentStatus s = handle.status();
        String stateStr;
        switch (s.state()) {
            case DOWNLOADING:          stateStr = "DOWNLOADING"; break;
            case SEEDING:              stateStr = "SEEDING";     break;
            case CHECKING_FILES:       stateStr = "CHECKING";    break;
            case FINISHED:             stateStr = "FINISHED";    break;
            case DOWNLOADING_METADATA: stateStr = "METADATA";    break;
            default:                   stateStr = "UNKNOWN";     break;
        }

        // ── per-file bytes downloaded ─────────────────────────────────────────
        // fileProgress[i] = bytes downloaded for file at index i
        long[] fileProgress = handle.fileProgress(torrent_handle.piece_granularity);

        for (Listener l : listeners) {
            l.onTorrentStateChanged(
                id, stateStr, s.progress(),
                s.downloadRate(), s.uploadRate(),
                s.totalWanted(), s.totalWantedDone(),
                s.numPeers(), s.numSeeds(),
                fileProgress
            );
        }
    }

    private static torrent_flags_t buildFlags(torrent_flags_t flags,
                                              boolean paused, boolean sequential) {
        flags = flags.or_(TorrentFlags.NEED_SAVE_RESUME);
        flags = flags.and_(TorrentFlags.AUTO_MANAGED.inv());
        flags = paused
            ? flags.or_(TorrentFlags.PAUSED)
            : flags.and_(TorrentFlags.PAUSED.inv());
        flags = sequential
            ? flags.or_(TorrentFlags.SEQUENTIAL_DOWNLOAD)
            : flags.and_(TorrentFlags.SEQUENTIAL_DOWNLOAD.inv());
        return flags;
    }
}
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  NativeEventEmitter,
  Alert,
} from 'react-native';
import { EverythingTorrent } from 'react-native-everything-torrent';
import Player from './Player';

const C = {
  bg: '#0D0705',
  card: '#1A0E0A',
  card2: '#2a1a1a',
  yellow: '#F4C542',
  cream: '#FFF8E7',
  muted: '#8A7A6A',
  border: 'rgba(244,197,66,0.2)',
  green: '#00ff88',
};

interface TorrentFile {
  index: number;
  name: string;
  size: number;
  path: string;
}

export interface DownloadProps {
  magnet: string;
  title: string;
  visible: boolean;
  onClose: () => void;
}

type Phase = 'fetching' | 'picking' | 'downloading' | 'paused' | 'done' | 'error';

function fmtSize(b: number) {
  if (!b) return '—';
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`;
}

function fmtSpeed(bps: number) {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} KB/s`;
  return `${bps} B/s`;
}

// Stream button appears once at least 5% of the file is downloaded
const STREAM_THRESHOLD_PCT = 5;

export default function Download({ magnet, title, visible, onClose }: DownloadProps) {
  const [phase, setPhase] = useState<Phase>('fetching');
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [torrentId, setTorrentId] = useState('');
  const [percent, setPercent] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [peers, setPeers] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [fileProgress, setFileProgress] = useState<number[]>([]);
  const [doneFolder, setDoneFolder] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ─── Player state ──────────────────────────────────────────────────────────
  const [playerVisible, setPlayerVisible] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);

  // ─── Start session + add magnet ───────────────────────────────────────────
  useEffect(() => {
    if (!visible || !magnet) return;

    setPhase('fetching');
    setFiles([]);
    setSelected(new Set());
    setTorrentId('');
    setPercent(0);
    setSpeed(0);
    setPeers(0);
    setDownloaded(0);
    setTotalSize(0);
    setFileProgress([]);
    setDoneFolder('');
    setErrorMsg('');
    setStreamingIndex(null);

    let cancelled = false;
    const run = async () => {
      try {
        EverythingTorrent.startSession();
        const savePath = await EverythingTorrent.getDownloadPath();
        if (!cancelled) EverythingTorrent.addMagnet(magnet, savePath);
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(e.message || 'Failed to start');
          setPhase('error');
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [visible, magnet]);

  // ─── Event listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const emitter = new NativeEventEmitter(EverythingTorrent as any);

    const onMetadata = emitter.addListener('torrent_metadata_ready', (data) => {
      setTorrentId(data.torrentId);
      setFiles(data.files || []);
      setSelected(new Set((data.files || []).map((f: TorrentFile) => f.index)));
      setTotalSize((data.files || []).reduce((acc: number, f: TorrentFile) => acc + f.size, 0));
      setPhase('picking');
    });

    const onProgress = emitter.addListener('torrent_progress', (data) => {
      setPercent(data.percent || 0);
      setSpeed(data.speed || 0);
      setPeers(data.peers || 0);
      setDownloaded(data.downloaded || 0);
      if (data.fileProgress) setFileProgress(data.fileProgress);
    });

    const onDone = emitter.addListener('torrent_done', (data) => {
      setDoneFolder(data.folder || '');
      setPercent(100);
      setPhase('done');
    });

    const onError = emitter.addListener('torrent_error', (data) => {
      setErrorMsg(data.message || 'Unknown error');
      setPhase('error');
    });

    return () => {
      onMetadata.remove();
      onProgress.remove();
      onDone.remove();
      onError.remove();
    };
  }, [visible]);

  // ─── File selection ───────────────────────────────────────────────────────
  const toggleFile = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const confirmDownload = () => {
    if (selected.size === 0) {
      Alert.alert('Pick at least one file');
      return;
    }
    EverythingTorrent.startDownload(torrentId, Array.from(selected));
    setPhase('downloading');
  };

  // ─── Pause / Resume ───────────────────────────────────────────────────────
  const handlePause = () => {
    if (!torrentId) return;
    EverythingTorrent.pauseTorrent(torrentId);
    setPhase('paused');
  };

  const handleResume = () => {
    if (!torrentId) return;
    EverythingTorrent.resumeTorrent(torrentId);
    setPhase('downloading');
  };

  // ─── Stream ───────────────────────────────────────────────────────────────
  const handleStream = async (file: TorrentFile) => {
    try {
      setStreamingIndex(file.index);
      const url = await EverythingTorrent.startStream(torrentId, file.index);
      setStreamUrl(url);
      setStreamTitle(file.name);
      setPlayerVisible(true);
    } catch (e: any) {
      Alert.alert('Stream failed', e.message || 'Could not start stream');
    } finally {
      setStreamingIndex(null);
    }
  };

  // ─── Close ────────────────────────────────────────────────────────────────
  const handleClose = () => {
    if (phase === 'downloading' || phase === 'paused') {
      Alert.alert('Cancel download?', 'This will stop the download.', [
        { text: 'Keep downloading', style: 'cancel' },
        {
          text: 'Cancel', style: 'destructive', onPress: () => {
            if (torrentId) EverythingTorrent.removeTorrent(torrentId);
            onClose();
          }
        },
      ]);
    } else {
      if (torrentId && phase !== 'done') EverythingTorrent.removeTorrent(torrentId);
      onClose();
    }
  };

  const selectedFiles = files.filter(f => selected.has(f.index));

  // ─── Render ───────────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (phase) {
      case 'fetching':
        return (
          <View style={s.centered}>
            <ActivityIndicator color={C.yellow} size="large" />
            <Text style={s.phaseText}>Fetching torrent info...</Text>
            <Text style={s.phaseSub}>Connecting to peers to get file list</Text>
          </View>
        );

      case 'picking':
        return (
          <View style={s.pickingContainer}>
            <Text style={s.sectionLabel}>Select files to download</Text>
            <Text style={s.totalSize}>Total: {fmtSize(totalSize)}</Text>
            <ScrollView style={s.fileList} showsVerticalScrollIndicator={false}>
              {files.map((f) => {
                const isSelected = selected.has(f.index);
                return (
                  <TouchableOpacity
                    key={f.index}
                    style={[s.fileRow, isSelected && s.fileRowSelected]}
                    onPress={() => toggleFile(f.index)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                      {isSelected && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <View style={s.fileInfo}>
                      <Text style={s.fileName} numberOfLines={2}>{f.name}</Text>
                      <Text style={s.fileSize}>{fmtSize(f.size)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.confirmBtn} onPress={confirmDownload} activeOpacity={0.8}>
              <Text style={s.confirmBtnText}>
                Download {selected.size} file{selected.size !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case 'downloading':
      case 'paused':
      case 'done':
        const isPaused = phase === 'paused';
        const isDone = phase === 'done';
        return (
          <View style={{ flex: 1 }}>
            {/* ── Global speed + pause button (hidden when done) ── */}
            {!isDone && (
              <View style={s.globalRow}>
                <Text style={s.globalSpeed}>
                  {isPaused ? '⏸ Paused' : `⬇ ${fmtSpeed(speed)}`}
                </Text>
                <Text style={s.globalPeers}>👥 {peers}</Text>
                <TouchableOpacity
                  style={[s.pauseBtn, isPaused && s.resumeBtn]}
                  onPress={isPaused ? handleResume : handlePause}
                  activeOpacity={0.8}
                >
                  <Text style={s.pauseBtnText}>{isPaused ? '▶ Resume' : '⏸ Pause'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {isDone && (
              <View style={s.doneRow}>
                <Text style={s.doneIcon}>✅</Text>
                <Text style={s.phaseText}>Download complete!</Text>
              </View>
            )}

            {/* ── Per-file cards ── */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {selectedFiles.map((f) => {
                const dlBytes = fileProgress[f.index] ?? 0;
                const filePct = f.size > 0 ? Math.min((dlBytes / f.size) * 100, 100) : 0;
                const isFileDone = filePct >= 100 || isDone;
                const canStream = filePct >= STREAM_THRESHOLD_PCT || isDone;
                const isStreaming = streamingIndex === f.index;

                return (
                  <View key={f.index} style={s.fileCard}>
                    {/* name */}
                    <Text style={s.fileName} numberOfLines={2}>{f.name}</Text>

                    {/* progress bar */}
                    <View style={s.fileBarBg}>
                      <View style={[
                        s.fileBarFill,
                        { width: `${filePct}%` as any },
                        isFileDone && s.fileBarDone,
                      ]} />
                    </View>

                    {/* percentage + sizes + stream button */}
                    <View style={s.fileStatsRow}>
                      <Text style={[s.filePct, isFileDone && s.filePctDone]}>
                        {isFileDone ? '✓ Done' : `${filePct.toFixed(1)}%`}
                      </Text>
                      <Text style={s.fileSizeText}>
                        {fmtSize(dlBytes)} / {fmtSize(f.size)}
                      </Text>
                    </View>

                    {/* ── Stream button — shows once enough is buffered ── */}
                    {canStream && (
                      <TouchableOpacity
                        style={s.streamBtn}
                        onPress={() => handleStream(f)}
                        activeOpacity={0.8}
                        disabled={isStreaming}
                      >
                        {isStreaming ? (
                          <ActivityIndicator color={C.bg} size="small" />
                        ) : (
                          <Text style={s.streamBtnText}>▶ Stream</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        );

      case 'error':
        return (
          <View style={s.centered}>
            <Text style={s.errorIcon}>❌</Text>
            <Text style={s.phaseText}>Error</Text>
            <Text style={s.phaseSub}>{errorMsg}</Text>
          </View>
        );
    }
  };

  const headerSub = () => {
    switch (phase) {
      case 'fetching':    return 'Getting metadata...';
      case 'picking':     return `${files.length} files found`;
      case 'downloading': return `${percent.toFixed(0)}% · ⬇ ${fmtSpeed(speed)}`;
      case 'paused':      return `Paused at ${percent.toFixed(0)}%`;
      case 'done':        return 'Complete';
      case 'error':       return 'Error';
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <View style={s.backdrop}>
          <View style={s.panel}>
            <View style={s.header}>
              <View style={s.headerText}>
                <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
                <Text style={s.headerSub}>{headerSub()}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
                <Text style={s.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.content}>
              {renderContent()}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Player — sits outside Download modal so it can go fullscreen ── */}
      <Player
        visible={playerVisible}
        url={streamUrl}
        title={streamTitle}
        onClose={() => setPlayerVisible(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  panel: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, maxHeight: '85%', minHeight: 300 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  headerText: { flex: 1, marginRight: 12 },
  headerTitle: { color: C.yellow, fontSize: 17, fontWeight: '900' },
  headerSub: { color: C.muted, fontSize: 12, marginTop: 3 },
  closeBtn: { padding: 4 },
  closeBtnText: { color: C.yellow, fontSize: 20, fontWeight: '800' },
  content: { flex: 1, padding: 20 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  phaseText: { color: C.cream, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  phaseSub: { color: C.muted, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  errorIcon: { fontSize: 48 },

  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  doneIcon: { fontSize: 28 },

  globalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  globalSpeed: { color: C.cream, fontSize: 13, fontWeight: '700', flex: 1 },
  globalPeers: { color: C.muted, fontSize: 12 },
  pauseBtn: { backgroundColor: C.card2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  resumeBtn: { borderColor: C.yellow },
  pauseBtnText: { color: C.yellow, fontSize: 13, fontWeight: '800' },

  fileCard: { backgroundColor: C.card2, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, gap: 8 },
  fileBarBg: { height: 5, backgroundColor: '#3a2a2a', borderRadius: 3, overflow: 'hidden' },
  fileBarFill: { height: '100%', backgroundColor: C.yellow, borderRadius: 3 },
  fileBarDone: { backgroundColor: C.green },
  fileStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filePct: { color: C.yellow, fontSize: 13, fontWeight: '800' },
  filePctDone: { color: C.green },
  fileSizeText: { color: C.muted, fontSize: 11 },

  // ── Stream button ──────────────────────────────────────────────────────────
  streamBtn: {
    backgroundColor: C.yellow,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  streamBtnText: { color: C.bg, fontSize: 13, fontWeight: '900' },

  sectionLabel: { color: C.yellow, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  pickingContainer: { flex: 1, gap: 10 },
  totalSize: { color: C.muted, fontSize: 12 },
  fileList: { flex: 1 },
  fileRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 10, marginBottom: 8, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, gap: 12 },
  fileRowSelected: { borderColor: C.yellow },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxSelected: { backgroundColor: C.yellow, borderColor: C.yellow },
  checkmark: { color: C.bg, fontSize: 13, fontWeight: '900' },
  fileInfo: { flex: 1 },
  fileName: { color: C.cream, fontSize: 13, fontWeight: '600' },
  fileSize: { color: C.muted, fontSize: 11, marginTop: 3 },
  confirmBtn: { backgroundColor: C.yellow, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  confirmBtnText: { color: C.bg, fontSize: 15, fontWeight: '900' },
});
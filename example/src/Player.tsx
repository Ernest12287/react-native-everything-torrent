import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import Video, { VideoRef, OnLoadData, OnProgressData } from 'react-native-video';

const C = {
  bg: '#000000',
  yellow: '#F4C542',
  cream: '#FFF8E7',
  muted: '#8A7A6A',
};

interface PlayerProps {
  visible: boolean;
  url: string;
  title: string;
  onClose: () => void;
}

function fmtTime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Player({ visible, url, title, onClose }: PlayerProps) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = duration > 0 ? currentTime / duration : 0;

  const onLoad = (data: OnLoadData) => {
    setDuration(data.duration);
    setLoading(false);
  };

  const onProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);
  };

  const togglePlay = () => {
    setPaused(p => !p);
    showControlsTemporarily();
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleTap = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    } else {
      showControlsTemporarily();
    }
  };

  const handleClose = () => {
    setPaused(true);
    setLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setShowControls(true);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={handleClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar hidden />
      <View style={s.container}>
        {/* ── Video ── */}
        <TouchableOpacity
          style={s.videoWrapper}
          onPress={handleTap}
          activeOpacity={1}
        >
          <Video
            ref={videoRef}
            source={{ uri: url }}
            style={s.video}
            paused={paused}
            resizeMode="contain"
            onLoad={onLoad}
            onProgress={onProgress}
            onBuffer={({ isBuffering }) => setLoading(isBuffering)}
            onError={(e) => console.warn('Video error', e)}
            progressUpdateInterval={1000}
          />

          {/* ── Buffering spinner ── */}
          {loading && (
            <View style={s.loadingOverlay}>
              <ActivityIndicator color={C.yellow} size="large" />
              <Text style={s.loadingText}>Buffering...</Text>
            </View>
          )}

          {/* ── Controls overlay ── */}
          {showControls && (
            <View style={s.controlsOverlay}>
              {/* top bar */}
              <View style={s.topBar}>
                <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={s.titleText} numberOfLines={1}>{title}</Text>
              </View>

              {/* centre play/pause */}
              <TouchableOpacity style={s.playBtn} onPress={togglePlay}>
                <Text style={s.playBtnText}>{paused ? '▶' : '⏸'}</Text>
              </TouchableOpacity>

              {/* bottom progress */}
              <View style={s.bottomBar}>
                <Text style={s.timeText}>{fmtTime(currentTime)}</Text>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
                </View>
                <Text style={s.timeText}>{fmtTime(duration)}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  videoWrapper: { flex: 1 },
  video: { flex: 1 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: C.muted, fontSize: 13 },

  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  closeBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: C.yellow, fontSize: 16, fontWeight: '800' },
  titleText: { color: C.cream, fontSize: 14, fontWeight: '700', flex: 1 },

  playBtn: {
    alignSelf: 'center',
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: C.yellow, fontSize: 28 },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  timeText: { color: C.cream, fontSize: 12, fontWeight: '600', minWidth: 40 },
  progressBg: {
    flex: 1, height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.yellow, borderRadius: 2 },
});
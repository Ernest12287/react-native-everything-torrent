import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import Download from './Download';

const TMDB_API_KEY = 'd64117f26031a428449f102ced3aba73';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const YTS_BASE = 'https://en.yts-official.com/';

const C = {
  bg: '#0D0705',
  card: '#1A0E0A',
  card2: '#2a1a1a',
  yellow: '#F4C542',
  cream: '#FFF8E7',
  muted: '#8A7A6A',
  border: 'rgba(244,197,66,0.2)',
};

interface SearchResult {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
}

interface Torrent {
  magnet_url: string;
  quality: string;
  size: string;
  seeds: number;
  title: string;
}

function fmtBytes(b: number) {
  if (!b) return '—';
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`;
}

function extractQuality(t: string) {
  const m = t.match(/\b(2160p|1080p|720p|480p)\b/i);
  return m ? m[1] : 'unknown';
}

async function searchTMDB(query: string): Promise<SearchResult[]> {
  const url = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1&api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const d = await res.json();
  return (d.results || []).filter(
    (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
  );
}

async function getTitleYear(id: number, type: 'movie' | 'tv') {
  const url = `${TMDB_BASE}/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US`;
  const res = await fetch(url);
  const d = await res.json();
  const title = d.title || d.name || '';
  const dateStr = d.release_date || d.first_air_date || '';
  const year = dateStr ? Number(dateStr.slice(0, 4)) : undefined;
  return { title, year };
}

async function fetchTorrents(id: number, type: 'movie' | 'tv'): Promise<Torrent[]> {
  const { title, year } = await getTitleYear(id, type);
  const params = new URLSearchParams({
    api: 'torrents',
    mode: type === 'movie' ? 'movie' : 'tv',
    name: title,
    quality: 'all',
  });
  if (year) params.set('year', String(year));
  const res = await fetch(`${YTS_BASE}?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  const hits: any[] = (json?.hits ?? []).filter((h: any) => h.magnetUrl);
  return hits
    .map((h) => ({
      magnet_url: h.magnetUrl,
      quality: h.quality || extractQuality(h.title),
      size: fmtBytes(h.bytes),
      seeds: h.seeds ?? 0,
      title: h.title,
    }))
    .sort((a, b) => b.seeds - a.seeds);
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [torrentModalVisible, setTorrentModalVisible] = useState(false);

  // Download component state
  const [downloadVisible, setDownloadVisible] = useState(false);
  const [downloadMagnet, setDownloadMagnet] = useState('');
  const [downloadTitle, setDownloadTitle] = useState('');

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    setSelected(null);
    setTorrents([]);
    try {
      const r = await searchTMDB(query.trim());
      setResults(r.slice(0, 12));
    } catch (e: any) {
      Alert.alert('Search failed', e.message);
    } finally {
      setSearching(false);
    }
  };

  const pickResult = async (r: SearchResult) => {
    setSelected(r);
    setTorrents([]);
    setLoadingT(true);
    try {
      const t = await fetchTorrents(r.id, r.media_type);
      setTorrents(t);
      setTorrentModalVisible(true);
    } catch (e: any) {
      Alert.alert('Torrent fetch failed', e.message);
    } finally {
      setLoadingT(false);
    }
  };

  const startDownload = (magnet: string, torrentTitle: string) => {
    setTorrentModalVisible(false);
    setDownloadMagnet(magnet);
    setDownloadTitle(torrentTitle);
    setDownloadVisible(true);
  };

  const displayName = (r: SearchResult) => r.title || r.name || '—';
  const displayYear = (r: SearchResult) =>
    (r.release_date || r.first_air_date || '').slice(0, 4);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={s.header}>
        <Text style={s.headerTitle}>🧲 Torrent Test App</Text>
        <Text style={s.headerSub}>react-native-everything-torrent</Text>
      </View>

      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          placeholder="Search movie or TV show..."
          placeholderTextColor={C.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={s.searchBtn} onPress={doSearch} disabled={searching}>
          {searching ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <Text style={s.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => `${r.id}-${r.media_type}`}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !searching && results.length === 0 ? (
            <Text style={s.emptyText}>Search something above ↑</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.resultCard}
            onPress={() => pickResult(item)}
            activeOpacity={0.75}
          >
            <View style={s.resultBadge}>
              <Text style={s.resultBadgeText}>
                {item.media_type === 'movie' ? '🎬' : '📺'}
              </Text>
            </View>
            <View style={s.resultInfo}>
              <Text style={s.resultTitle} numberOfLines={1}>
                {displayName(item)}
              </Text>
              <Text style={s.resultMeta}>
                {displayYear(item)} · ⭐ {item.vote_average.toFixed(1)}
              </Text>
            </View>
            {loadingT && selected?.id === item.id ? (
              <ActivityIndicator color={C.yellow} size="small" />
            ) : (
              <Text style={s.arrow}>›</Text>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Torrent quality picker */}
      <Modal
        visible={torrentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTorrentModalVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalPanel}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Select Quality</Text>
                <Text style={s.modalSub} numberOfLines={1}>
                  {selected ? displayName(selected) : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTorrentModalVisible(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalScroll}>
              {torrents.length === 0 ? (
                <Text style={s.emptyText}>No torrents found</Text>
              ) : (
                torrents.map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    style={s.torrentRow}
                    onPress={() => startDownload(t.magnet_url, t.title)}
                    activeOpacity={0.8}
                  >
                    <View style={s.torrentInfo}>
                      <Text style={s.torrentQuality}>{t.quality.toUpperCase()}</Text>
                      <Text style={s.torrentMeta} numberOfLines={1}>{t.title}</Text>
                      <Text style={s.torrentStats}>{t.size} · 🌱 {t.seeds}</Text>
                    </View>
                    <Text style={s.arrow}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Download component */}
      <Download
        visible={downloadVisible}
        magnet={downloadMagnet}
        title={downloadTitle}
        onClose={() => setDownloadVisible(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  headerTitle: { color: C.yellow, fontSize: 22, fontWeight: '900' },
  headerSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  input: { flex: 1, backgroundColor: C.card, color: C.cream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: C.border },
  searchBtn: { backgroundColor: C.yellow, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  searchBtnText: { color: C.bg, fontWeight: '900', fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyText: { color: C.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: C.border, gap: 12 },
  resultBadge: { width: 40, height: 40, backgroundColor: C.card2, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  resultBadgeText: { fontSize: 20 },
  resultInfo: { flex: 1 },
  resultTitle: { color: C.cream, fontSize: 14, fontWeight: '700' },
  resultMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  arrow: { color: C.yellow, fontSize: 22, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalPanel: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { color: C.yellow, fontSize: 18, fontWeight: '900' },
  modalSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  modalClose: { color: C.yellow, fontSize: 20, fontWeight: '800', padding: 4 },
  modalScroll: { padding: 16 },
  torrentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  torrentInfo: { flex: 1 },
  torrentQuality: { color: C.yellow, fontSize: 15, fontWeight: '900' },
  torrentMeta: { color: C.cream, fontSize: 11, marginTop: 2 },
  torrentStats: { color: C.muted, fontSize: 11, marginTop: 4 },
});
# react-native-everything-torrent

Full-featured BitTorrent client for React Native, powered by libtorrent4j. Android only.

> **11 hours of pain, sweat and `cannot find symbol` errors went into this.** Respect the README.

---

## Installation

```sh
npm install react-native-everything-torrent
# or
yarn add react-native-everything-torrent
```

### Android Setup

Add to your app's `android/build.gradle`:

```gradle
android {
  packagingOptions {
    pickFirst 'lib/arm64-v8a/libjlibtorrent.so'
    pickFirst 'lib/x86_64/libjlibtorrent.so'
  }
}

dependencies {
  implementation "org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-30"
}
```

---

## Quick Start

```typescript
import { EverythingTorrent } from 'react-native-everything-torrent';
import { NativeEventEmitter } from 'react-native';

// 1. Start the session once
EverythingTorrent.startSession();

// 2. Set up event listeners
const emitter = new NativeEventEmitter(EverythingTorrent as any);

emitter.addListener('torrent_metadata_ready', (data) => {
  // data.torrentId — your key for everything
  // data.files — [{ index, name, size, path }]
  console.log('Files:', data.files);

  // Download only the files you want by index
  EverythingTorrent.startDownload(data.torrentId, [0, 2]);
});

emitter.addListener('torrent_progress', (data) => {
  // data.percent, data.speed, data.peers, data.downloaded
  // data.fileProgress — array of bytes downloaded per file
  console.log(`${data.percent.toFixed(1)}%`);
});

emitter.addListener('torrent_done', (data) => {
  console.log('Saved to:', data.folder);
});

emitter.addListener('torrent_error', (data) => {
  console.error('Error:', data.message);
});

// 3. Add a magnet
const savePath = await EverythingTorrent.getDownloadPath();
EverythingTorrent.addMagnet('magnet:?xt=urn:btih:...', savePath);

// 4. Control
EverythingTorrent.pauseTorrent(torrentId);
EverythingTorrent.resumeTorrent(torrentId);
EverythingTorrent.removeTorrent(torrentId);

// 5. Cleanup
EverythingTorrent.stopSession();
```

---

## API

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `startSession` | `() => void` | Start the libtorrent session. Call once at app launch. |
| `stopSession` | `() => void` | Stop all downloads and clean up. Call on app quit. |
| `addMagnet` | `(magnet: string, savePath: string) => void` | Add a torrent via magnet link. Fires `torrent_metadata_ready` when file list is available. |
| `startDownload` | `(torrentId: string, fileIndices: number[]) => void` | Start downloading selected files by index. Call after metadata is ready. |
| `pauseTorrent` | `(torrentId: string) => void` | Pause a torrent. |
| `resumeTorrent` | `(torrentId: string) => void` | Resume a paused torrent. |
| `removeTorrent` | `(torrentId: string) => void` | Remove torrent from session. |
| `getDownloadPath` | `() => Promise<string>` | Get the default save path for downloads. |
| `startStream` | `(torrentId: string, fileIndex: number) => Promise<string>` | ⚠️ See streaming note below. |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `torrent_metadata_ready` | `{ torrentId: string, files: TorrentFile[] }` | Fired when metadata is fetched. Contains full file list. |
| `torrent_progress` | `{ torrentId, percent, speed, downloaded, peers, fileProgress: number[] }` | Fired on every piece completion. `fileProgress[i]` = bytes downloaded for file at index `i`. |
| `torrent_done` | `{ torrentId, folder }` | All selected files finished downloading. |
| `torrent_error` | `{ torrentId, message }` | Something went wrong. |

### Types

```typescript
interface TorrentFile {
  index: number;   // use this with startDownload and fileProgress
  name: string;    // filename e.g. "S01E01.mkv"
  size: number;    // bytes
  path: string;    // relative path inside torrent folder
}
```

---

## The torrentId

The `torrentId` is the **info-hash hex** of the torrent — your golden key for all operations. You first receive it in `torrent_metadata_ready`. Save it and use it for `startDownload`, `pauseTorrent`, `resumeTorrent`, `removeTorrent`, and `startStream`.

---

## Per-File Progress

`torrent_progress` includes a `fileProgress` array. Each index maps to a file:

```typescript
emitter.addListener('torrent_progress', (data) => {
  const file = files[0]; // from torrent_metadata_ready
  const downloaded = data.fileProgress[file.index]; // bytes downloaded
  const percent = (downloaded / file.size) * 100;
  console.log(`${file.name}: ${percent.toFixed(1)}%`);
});
```

---

## ⚠️ Streaming

`startStream(torrentId, fileIndex)` is defined in the API but **currently does not work reliably**.

Streaming torrent files while they are still downloading is a hard problem — it requires prioritizing pieces in sequential order, handling seek requests (HTTP Range headers), and coordinating between the download engine and a local HTTP server. Getting all of that to play nicely with `react-native-video` without stalling or buffering forever is non-trivial.

**Current status:** The method exists and will attempt to return a `file://` path to the partially downloaded file. In practice, most video players will fail to play a file that is still being written to, or will play only the portion already on disk and then stop.

**A proper fix will be made when:**
- A clean, battle-tested approach is identified (likely a local HTTP server that serves pieces on demand)
- Or a future version of libtorrent4j exposes a better streaming API
- Or the author gets financially stable enough to build a proper torrent-to-HLS transcoding server 😅

Until then, the recommended workflow is: **download first, play after.**

```typescript
emitter.addListener('torrent_done', async (data) => {
  // ✅ Safe to play now — file is fully on disk
  const url = `file://${data.folder}/filename.mkv`;
  // pass to react-native-video
});
```

---

## Implementation Status

| Feature | Status |
|---------|--------|
| Session management | ✅ Working |
| Magnet metadata fetching | ✅ Working |
| Selective file download | ✅ Working |
| Real-time progress (overall + per-file) | ✅ Working |
| Pause / Resume | ✅ Working |
| Remove torrent | ✅ Working |
| Completion event | ✅ Working |
| Error handling | ✅ Working |
| Streaming while downloading | ❌ Not working — see above |
| iOS support | ❌ Not started |

---

## Troubleshooting

**No metadata / stuck on "Fetching..."**
The magnet needs peers to fetch metadata from. Dead or obscure torrents with no seeders will never get past this stage. Try a popular torrent to confirm it works.

**Progress stuck at 0%**
No peers are connected. Check your internet connection and make sure the torrent has active seeders.

**"Torrent handle not found"**
You're calling `startDownload` or `startStream` before `torrent_metadata_ready` fires, or with the wrong `torrentId`. Always use the `torrentId` from the event.

**App crashes on download**
libtorrent4j uses native C++ under the hood and can crash on storage permission issues or missing directories. Ensure the `savePath` you pass to `addMagnet` actually exists and is writable.

---

## Architecture

```
React Native (TypeScript)
        ↕ TurboModule bridge
EverythingTorrentModule.kt   ← Session lifecycle, event emission
        ↕
TorrentManager.java          ← Alert listener, handle registry
        ↕
Session.kt                   ← libtorrent4j SessionManager wrapper
        ↕
libtorrent4j (C++ / JNI)    ← The actual BitTorrent engine
```

The download logic follows the same Priority[] array approach used by [libretorrent](https://github.com/proninyaroslav/libretorrent):
- All files default to `Priority.IGNORE`
- Only user-selected file indices are set to `Priority.DEFAULT`
- Applied via `handle.prioritizeFiles(priorities)` at download start

---

## License

MIT

---

*Android only. Built with libtorrent4j. Inspired by libretorrent's architecture.*

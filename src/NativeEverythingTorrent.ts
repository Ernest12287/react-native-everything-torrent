import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
  path: string;
}

export interface Spec extends TurboModule {
  // Session lifecycle
  startSession(): void;
  stopSession(): void;

  // Add torrent by magnet — fetches metadata first
  addMagnet(magnet: string, savePath: string): void;

  // After metadata is ready, start downloading selected file indices
  startDownload(torrentId: string, fileIndices: number[]): void;

  // Pause / resume / remove
  pauseTorrent(torrentId: string): void;
  resumeTorrent(torrentId: string): void;
  removeTorrent(torrentId: string): void;

  // Streaming — returns stream URL
  startStream(torrentId: string, fileIndex: number): Promise<string>;

  // Get download save path
  getDownloadPath(): Promise<string>;

  // Events — use RN event emitter on JS side
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('EverythingTorrent');

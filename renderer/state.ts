namespace DexuXRenderer {
  export type ThemeName = 'sunset' | 'ocean' | 'forest' | 'midnight';

  export type FeedMode = 'search' | 'direct' | null;

  export interface AppState {
    searchItems: SearchResult[];
    downloadQueue: QueuedVideo[];
    selectedUrl: string | null;
    currentVideoInfo: VideoInfo | null;
    selectionStatus: 'idle' | 'loading';
    currentQuality: string;
    downloadFolder: string;
    lastSearchQuery: string;
    feedMode: FeedMode;
    hasAttemptedSearch: boolean;
    isBusy: boolean;
    parallelDownloadLimit: number;
    queueRunDownloadIds: string[];
    queueRunTotal: number;
    completedQueueCount: number;
    backgroundOpacity: number;
    theme: ThemeName;
  }

  export interface AppearanceSettings {
    backgroundOpacity: number;
    theme: ThemeName;
  }

  export interface SelectionSnapshot {
    selectedUrl: string | null;
    currentVideoInfo: VideoInfo | null;
  }

  export const BEST_QUALITY = 'best';

  export const CARD_HEIGHTS = ['240px', '312px', '272px', '336px', '286px'] as const;

  export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeName; label: string }> = [
    { value: 'sunset', label: 'Sunset' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'forest', label: 'Forest' },
    { value: 'midnight', label: 'Midnight' },
  ] as const;

  export const state: AppState = {
    searchItems: [],
    downloadQueue: [],
    selectedUrl: null,
    currentVideoInfo: null,
    selectionStatus: 'idle',
    currentQuality: BEST_QUALITY,
    downloadFolder: '',
    lastSearchQuery: '',
    feedMode: null,
    hasAttemptedSearch: false,
    isBusy: false,
    parallelDownloadLimit: 2,
    queueRunDownloadIds: [],
    queueRunTotal: 0,
    completedQueueCount: 0,
    backgroundOpacity: 100,
    theme: 'sunset',
  };

  export function getErrorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  export function isProbablyUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  export function getCardHeight(index: number): string {
    return CARD_HEIGHTS[index % CARD_HEIGHTS.length];
  }

  export function getQualityLabel(quality: string): string {
    return quality === BEST_QUALITY ? 'Best available' : `Up to ${quality}`;
  }

  export function getQualityOptions(videoInfo: VideoInfo | null): Array<{ value: string; label: string }> {
    const qualities = new Set<string>();

    for (const quality of videoInfo?.availableQualities ?? []) {
      const normalizedQuality = quality.toLowerCase();

      if (/^\d{3,4}p$/.test(normalizedQuality)) {
        qualities.add(normalizedQuality);
      }
    }

    return [
      { value: BEST_QUALITY, label: getQualityLabel(BEST_QUALITY) },
      ...Array.from(qualities)
        .sort((left, right) => Number(right.replace('p', '')) - Number(left.replace('p', '')))
        .map((quality) => ({ value: quality, label: getQualityLabel(quality) })),
    ];
  }

  export function getValidQualityForVideo(videoInfo: VideoInfo | null, preferredQuality: string): string {
    const options = getQualityOptions(videoInfo);

    return options.some((option) => option.value === preferredQuality) ? preferredQuality : BEST_QUALITY;
  }

  export function getQueueStatusDetail(item: QueuedVideo): QueueItemStatusDetail {
    switch (item.status) {
      case 'downloading':
        return { label: 'Downloading', tone: 'active' };
      case 'processing':
        return { label: 'Finalizing', tone: 'active' };
      case 'complete':
        return { label: 'Done', tone: 'complete' };
      case 'failed':
        return { label: 'Failed', tone: 'failed' };
      default:
        return { label: 'Queued', tone: 'queued' };
    }
  }

  export function formatSearchMeta(result: SearchResult): string {
    return `${result.uploader} • ${result.duration}`;
  }

  export function getFeedTitle(): string {
    return state.feedMode === 'direct' ? 'Direct Pick' : 'Inspiration Board';
  }

  export function getSearchSummary(): string {
    if (state.feedMode === 'direct' && state.searchItems.length > 0) {
      return 'Loaded from the direct link you pasted.';
    }

    if (state.searchItems.length > 0) {
      const count = state.searchItems.length;
      return `Found ${count} video${count === 1 ? '' : 's'} for "${state.lastSearchQuery}".`;
    }

    if (state.hasAttemptedSearch) {
      return `No results for "${state.lastSearchQuery}".`;
    }

    return '';
  }

  export function getSelectionSnapshot(): SelectionSnapshot {
    return {
      selectedUrl: state.selectedUrl,
      currentVideoInfo: state.currentVideoInfo,
    };
  }

  export function restoreSelection(snapshot: SelectionSnapshot): void {
    state.selectedUrl = snapshot.selectedUrl;
    state.currentVideoInfo = snapshot.currentVideoInfo;
  }

  export function isQueued(url: string): boolean {
    return state.downloadQueue.some((item) => item.webpageUrl === url);
  }

  export function getQueueItemById(downloadId: string | undefined): QueuedVideo | null {
    if (!downloadId) {
      return null;
    }

    return state.downloadQueue.find((item) => item.downloadId === downloadId) ?? null;
  }

  export function enqueueVideo(result: SearchResult, quality: string): boolean {
    if (isQueued(result.webpageUrl)) {
      return false;
    }

    state.downloadQueue.push({
      downloadId: crypto.randomUUID(),
      ...result,
      quality,
      status: 'queued',
      progressPercent: null,
      progressText: `Ready at ${getQualityLabel(quality)}`,
    });

    return true;
  }

  export function removeQueuedVideo(downloadId: string): void {
    const itemIndex = state.downloadQueue.findIndex((item) => item.downloadId === downloadId);

    if (itemIndex >= 0) {
      state.downloadQueue.splice(itemIndex, 1);
    }
  }

  export function clearQueue(): void {
    state.downloadQueue = [];
    state.queueRunDownloadIds = [];
    state.queueRunTotal = 0;
    state.completedQueueCount = 0;
  }

  export function getRunnableQueueItems(): QueuedVideo[] {
    return state.downloadQueue.filter((item) => item.status === 'queued' || item.status === 'failed');
  }

  export function getActiveQueueItems(): QueuedVideo[] {
    return state.downloadQueue.filter((item) => item.status === 'downloading' || item.status === 'processing');
  }

  export function calculateQueueProgressPercent(): number | null {
    if (state.queueRunTotal <= 0) {
      return null;
    }

    const queueProgressTotal = state.downloadQueue.reduce((total, item) => {
      if (!state.queueRunDownloadIds.includes(item.downloadId)) {
        return total;
      }

      if (item.status === 'complete') {
        return total + 100;
      }

      if (item.status === 'processing') {
        return total + 100;
      }

      if (item.status === 'downloading' && item.progressPercent != null) {
        return total + item.progressPercent;
      }

      return total;
    }, 0);

    return Math.round((queueProgressTotal / state.queueRunTotal) * 100);
  }

  export function upsertResult(nextItem: SearchResult): void {
    const existingIndex = state.searchItems.findIndex((item) => item.webpageUrl === nextItem.webpageUrl);

    if (existingIndex >= 0) {
      state.searchItems.splice(existingIndex, 1, nextItem);
      return;
    }

    state.searchItems.unshift(nextItem);
  }
}

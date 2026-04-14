namespace DexuXRenderer {
  export type FeedMode = 'search' | 'direct' | null;

  export interface AppState {
    searchItems: SearchResult[];
    selectedUrl: string | null;
    currentVideoInfo: VideoInfo | null;
    currentQuality: string;
    downloadFolder: string;
    lastSearchQuery: string;
    feedMode: FeedMode;
    hasAttemptedSearch: boolean;
    isBusy: boolean;
  }

  export interface SelectionSnapshot {
    selectedUrl: string | null;
    currentVideoInfo: VideoInfo | null;
  }

  export const QUALITY_OPTIONS = [
    { value: 'best', label: 'Best available' },
    { value: '1080p', label: 'Up to 1080p' },
    { value: '720p', label: 'Up to 720p' },
    { value: '480p', label: 'Up to 480p' },
  ] as const;

  export const CARD_HEIGHTS = ['240px', '312px', '272px', '336px', '286px'] as const;

  export const state: AppState = {
    searchItems: [],
    selectedUrl: null,
    currentVideoInfo: null,
    currentQuality: 'best',
    downloadFolder: '',
    lastSearchQuery: '',
    feedMode: null,
    hasAttemptedSearch: false,
    isBusy: false,
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

  export function upsertResult(nextItem: SearchResult): void {
    const existingIndex = state.searchItems.findIndex((item) => item.webpageUrl === nextItem.webpageUrl);

    if (existingIndex >= 0) {
      state.searchItems.splice(existingIndex, 1, nextItem);
      return;
    }

    state.searchItems.unshift(nextItem);
  }
}

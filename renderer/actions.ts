namespace DexuXRenderer {
  export function clearSelection(): void {
    state.selectedUrl = null;
    state.currentVideoInfo = null;
    renderFeed();
  }

  export async function loadDirectVideo(url: string, pendingMessage: string, successMessage: string): Promise<void> {
    if (!url) {
      return;
    }

    setBusy(true);
    setStatus(pendingMessage);

    try {
      const info = await window.downloaderApi.fetchVideoInfo(url);
      state.feedMode = 'direct';
      state.hasAttemptedSearch = true;
      state.lastSearchQuery = url;
      state.selectedUrl = info.webpageUrl;
      state.currentVideoInfo = info;
      state.searchItems = [info];
      ui.queryInput.value = info.webpageUrl;
      renderFeed();
      setStatus(successMessage);
    } catch (error) {
      setStatus(getErrorMessage(error, 'Could not inspect the video.'));
    } finally {
      setBusy(false);
    }
  }

  export async function searchVideos(query: string): Promise<void> {
    const previousSelection = getSelectionSnapshot();
    setBusy(true);
    setStatus(`Searching YouTube for "${query}"...`);

    try {
      const results = await window.downloaderApi.searchVideos(query);
      state.feedMode = 'search';
      state.hasAttemptedSearch = true;
      state.lastSearchQuery = query;
      state.searchItems = results;
      state.selectedUrl = null;
      state.currentVideoInfo = null;
      renderFeed();
      setStatus(results.length > 0 ? 'Search results loaded. Select a video to continue.' : 'No videos matched your search.');
    } catch (error) {
      restoreSelection(previousSelection);
      renderFeed();
      setStatus(getErrorMessage(error, 'Search failed.'));
    } finally {
      setBusy(false);
    }
  }

  export async function handleSearch(): Promise<void> {
    const query = ui.queryInput.value.trim();

    if (!query) {
      setStatus('Search by video name or paste a YouTube URL first.');
      return;
    }

    if (isProbablyUrl(query)) {
      await loadDirectVideo(query, 'Inspecting pasted link...', 'Video details loaded.');
      return;
    }

    await searchVideos(query);
  }

  export async function selectSearchResult(url: string): Promise<void> {
    const previousSelection = getSelectionSnapshot();

    state.selectedUrl = url;
    state.currentVideoInfo = state.currentVideoInfo?.webpageUrl === url ? state.currentVideoInfo : null;
    renderFeed();

    if (state.currentVideoInfo) {
      setStatus('Selected video ready to download.');
      return;
    }

    setBusy(true);
    setStatus('Loading video details...');

    try {
      const info = await window.downloaderApi.fetchVideoInfo(url);
      state.currentVideoInfo = info;
      upsertResult(info);
      ui.queryInput.value = info.webpageUrl;
      renderFeed();
      setStatus('Selected video ready to download.');
    } catch (error) {
      restoreSelection(previousSelection);
      renderFeed();
      setStatus(getErrorMessage(error, 'Could not load that video.'));
    } finally {
      setBusy(false);
    }
  }

  export async function chooseFolder(): Promise<void> {
    const selected = await window.downloaderApi.selectDownloadDirectory();

    if (!selected) {
      return;
    }

    state.downloadFolder = selected;
    renderFeed();
    setStatus(`Download folder set to ${selected}`);
  }

  export async function ensureSelectedVideoInfo(url: string): Promise<void> {
    if (state.currentVideoInfo && state.currentVideoInfo.webpageUrl === state.selectedUrl) {
      return;
    }

    const info = await window.downloaderApi.fetchVideoInfo(url);
    state.currentVideoInfo = info;
    upsertResult(info);
    renderFeed();
  }

  export async function downloadSelectedVideo(url: string): Promise<void> {
    if (!state.selectedUrl || state.selectedUrl !== url) {
      setStatus('Select a video card first.');
      return;
    }

    if (!state.downloadFolder) {
      setStatus('Choose a download folder first.');
      return;
    }

    setBusy(true);
    setStatus('Starting download...');

    try {
      await ensureSelectedVideoInfo(url);

      const result = await window.downloaderApi.downloadVideo({
        url,
        outputDir: state.downloadFolder,
        quality: state.currentQuality,
      });

      setStatus(`Saved to ${result.path}`, 100);
    } catch (error) {
      setStatus(getErrorMessage(error, 'Download failed.'));
    } finally {
      setBusy(false);
    }
  }

  export function handleDownloadProgress(progress: DownloadProgress): void {
    if (progress.status === 'processing') {
      setStatus(progress.message || 'Finalizing file...', 100);
      return;
    }

    const parts = ['Downloading'];

    if (progress.percent != null) {
      parts.push(`${progress.percent}%`);
    }

    if (progress.downloaded && progress.total) {
      parts.push(`(${progress.downloaded} / ${progress.total})`);
    }

    if (progress.speed) {
      parts.push(`at ${progress.speed}`);
    }

    setStatus(parts.join(' '), progress.percent ?? null);
  }
}

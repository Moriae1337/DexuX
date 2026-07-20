namespace DexuXRenderer {
  let selectionRequestId = 0;

  function getPreviewUrl(url: string): string {
    try {
      const parsed = new URL(url);

      if (parsed.hostname.includes('youtube.com')) {
        const videoId = parsed.searchParams.get('v');
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : url;
      }

      if (parsed.hostname.includes('youtu.be')) {
        const videoId = parsed.pathname.replace(/\//g, '').trim();
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : url;
      }

      return url;
    } catch {
      return url;
    }
  }

  function preserveScrollPosition(): () => void {
    const { scrollX, scrollY } = window;
    return () => {
      window.scrollTo(scrollX, scrollY);
    };
  }

  function waitForNextPaint(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  function resetQueueItemForDownload(item: QueuedVideo): void {
    item.status = 'queued';
    item.progressPercent = null;
    item.progressText = `Ready at ${getQualityLabel(item.quality)}`;
    item.savedPath = undefined;
    item.errorMessage = undefined;
  }

  export function addVideoToQueue(result: SearchResult): void {
    const selectedVideoInfo =
      state.selectedUrl === result.webpageUrl && state.currentVideoInfo?.webpageUrl === result.webpageUrl
        ? state.currentVideoInfo
        : null;
    const quality = selectedVideoInfo ? getValidQualityForVideo(selectedVideoInfo, state.currentQuality) : BEST_QUALITY;
    const added = enqueueVideo(result, quality);
    renderFeed();

    if (!added) {
      setStatus(`"${result.title}" is already in the queue.`);
      return;
    }

    setStatus(`Added "${result.title}" to the queue. ${state.downloadQueue.length} video${state.downloadQueue.length === 1 ? '' : 's'} ready.`);
  }

  export function removeVideoFromQueue(downloadId: string): void {
    const queueItem = getQueueItemById(downloadId);

    if (!queueItem) {
      return;
    }

    removeQueuedVideo(downloadId);
    renderFeed();
    setStatus(`Removed "${queueItem.title}" from the queue.`);
  }

  export function clearDownloadQueue(): void {
    if (state.downloadQueue.length === 0) {
      setStatus('The queue is already empty.');
      return;
    }

    clearQueue();
    renderFeed();
    setStatus('Download queue cleared.');
  }

  export function clearSelection(): void {
    selectionRequestId += 1;
    state.selectedUrl = null;
    state.currentVideoInfo = null;
    state.selectionStatus = 'idle';
    renderSelectionPanel();
    syncSelectedCardState();
    setStatus('Selection closed.');
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
      state.selectionStatus = 'idle';
      state.currentQuality = getValidQualityForVideo(info, state.currentQuality);
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
      state.selectionStatus = 'idle';
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
      setStatus('Search YouTube by title, or paste a direct YouTube or TikTok link first.');
      return;
    }

    if (isProbablyUrl(query)) {
      await loadDirectVideo(query, 'Inspecting pasted link...', 'Video details loaded.');
      return;
    }

    await searchVideos(query);
  }

  export async function selectSearchResult(url: string): Promise<void> {
    if (state.selectedUrl === url && state.selectionStatus === 'loading') {
      return;
    }

    const previousSelection = getSelectionSnapshot();
    const restoreScroll = preserveScrollPosition();
    const requestId = selectionRequestId + 1;
    selectionRequestId = requestId;

    state.selectedUrl = url;
    state.currentVideoInfo = state.currentVideoInfo?.webpageUrl === url ? state.currentVideoInfo : null;
    state.selectionStatus = state.currentVideoInfo ? 'idle' : 'loading';
    renderSelectionPanel();
    syncSelectedCardState();
    restoreScroll();

    if (state.currentVideoInfo) {
      setStatus('Selected video ready to download.');
      return;
    }

    setStatus('Loading video details...');
    await waitForNextPaint();

    try {
      const info = await window.downloaderApi.fetchVideoInfo(url);

      if (selectionRequestId !== requestId || state.selectedUrl !== url) {
        return;
      }

      state.currentVideoInfo = info;
      state.selectionStatus = 'idle';
      state.currentQuality = getValidQualityForVideo(info, state.currentQuality);
      upsertResult(info);
      ui.queryInput.value = info.webpageUrl;
      renderSelectionPanel({ preservePreview: true });
      syncSelectedCardState();
      restoreScroll();
      setStatus('Selected video ready to download.');
    } catch (error) {
      if (selectionRequestId !== requestId) {
        return;
      }

      restoreSelection(previousSelection);
      state.selectionStatus = 'idle';
      renderSelectionPanel();
      syncSelectedCardState();
      restoreScroll();
      setStatus(getErrorMessage(error, 'Could not load that video.'));
    }
  }

  export async function openVideoExternally(url: string): Promise<void> {
    ui.videoModalFrame.src = getPreviewUrl(url);
    ui.videoModal.classList.remove('hidden');
    ui.videoModalOverlay.classList.remove('hidden');
    ui.videoModalOverlay.setAttribute('aria-hidden', 'false');
    setStatus('Video preview opened inside the app.');
  }

  export function closeVideoPreview(): void {
    const restoreScroll = preserveScrollPosition();
    ui.videoModal.classList.add('hidden');
    ui.videoModalOverlay.classList.add('hidden');
    ui.videoModalOverlay.setAttribute('aria-hidden', 'true');
    ui.videoModalFrame.src = 'about:blank';
    restoreScroll();
  }

  export async function chooseFolder(): Promise<void> {
    const selected = await window.downloaderApi.selectDownloadDirectory();

    if (!selected) {
      return;
    }

    state.downloadFolder = selected;
    renderQueue();
    renderSelectionPanel({ preservePreview: true });
    setStatus(`Download folder set to ${selected}`);
  }

  export async function ensureSelectedVideoInfo(url: string): Promise<void> {
    if (state.currentVideoInfo && state.currentVideoInfo.webpageUrl === state.selectedUrl) {
      return;
    }

    const info = await window.downloaderApi.fetchVideoInfo(url);
    state.currentVideoInfo = info;
    state.currentQuality = getValidQualityForVideo(info, state.currentQuality);
    upsertResult(info);
    renderSelectionPanel({ preservePreview: true });
    syncSelectedCardState();
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
      state.currentQuality = getValidQualityForVideo(state.currentVideoInfo, state.currentQuality);

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

  export async function downloadQueuedVideos(): Promise<void> {
    const runnableItems = getRunnableQueueItems();

    if (runnableItems.length === 0) {
      setStatus('Add videos to the queue first.');
      return;
    }

    if (!state.downloadFolder) {
      setStatus('Choose a download folder first.');
      return;
    }

    setBusy(true);
    state.queueRunDownloadIds = runnableItems.map((item) => item.downloadId);
    state.queueRunTotal = runnableItems.length;
    state.completedQueueCount = 0;

    const failures: string[] = [];
    const concurrency = Math.min(state.parallelDownloadLimit, runnableItems.length);

    for (const item of runnableItems) {
      resetQueueItemForDownload(item);
    }

    renderFeed();

    try {
      setStatus(`Starting ${state.queueRunTotal} queued downloads with ${concurrency} in parallel.`);

      let nextIndex = 0;

      const runNextDownload = async (): Promise<void> => {
        const queueItem = runnableItems[nextIndex];
        nextIndex += 1;

        if (!queueItem) {
          return;
        }

        queueItem.status = 'downloading';
        queueItem.progressPercent = 0;
        queueItem.progressText = 'Starting download...';
        renderFeed();

        try {
          const result = await window.downloaderApi.downloadVideo({
            downloadId: queueItem.downloadId,
            url: queueItem.webpageUrl,
            outputDir: state.downloadFolder,
            quality: queueItem.quality,
          });

          queueItem.status = 'complete';
          queueItem.progressPercent = 100;
          queueItem.savedPath = result.path;
          queueItem.progressText = `Saved to ${result.path}`;
        } catch (error) {
          const message = getErrorMessage(error, 'Download failed.');
          queueItem.status = 'failed';
          queueItem.errorMessage = message;
          queueItem.progressPercent = null;
          queueItem.progressText = message;
          failures.push(`${queueItem.title}: ${message}`);
        } finally {
          state.completedQueueCount += 1;
          renderFeed();
        }

        await runNextDownload();
      };

      await Promise.all(Array.from({ length: concurrency }, () => runNextDownload()));

      const successCount = state.queueRunTotal - failures.length;
      if (failures.length === 0) {
        setStatus(`Queue finished. Saved ${successCount} video${successCount === 1 ? '' : 's'}.`, 100);
        return;
      }

      setStatus(
        `Queue finished with ${successCount} saved and ${failures.length} failed. Last issue: ${failures[failures.length - 1]}`,
      );
    } finally {
      setBusy(false);
      state.queueRunDownloadIds = [];
      state.queueRunTotal = 0;
      state.completedQueueCount = 0;
      renderFeed();
    }
  }

  export function handleDownloadProgress(progress: DownloadProgress): void {
    const queueItem = getQueueItemById(progress.downloadId);

    if (queueItem) {
      if (progress.status === 'processing') {
        queueItem.status = 'processing';
        queueItem.progressPercent = 100;
        queueItem.progressText = progress.message || 'Finalizing file...';
      } else {
        queueItem.status = 'downloading';
        queueItem.progressPercent = progress.percent ?? queueItem.progressPercent;

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

        queueItem.progressText = parts.join(' ');
      }

      renderFeed();

      const activeItems = getActiveQueueItems();
      const queueProgress = calculateQueueProgressPercent();
      const progressPrefix = `Parallel downloads: ${state.completedQueueCount}/${state.queueRunTotal} done, ${activeItems.length} active`;
      const detailText =
        progress.status === 'processing'
          ? `${queueItem.title} - ${progress.message || 'Finalizing file...'}`
          : queueItem.progressText;

      setStatus(`${progressPrefix} • ${detailText}`, queueProgress);
      return;
    }

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

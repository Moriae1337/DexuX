namespace DexuXRenderer {
  function getVideoPreviewUrl(url: string): string | null {
    try {
      const parsed = new URL(url);

      if (parsed.hostname.includes('youtube.com')) {
        const videoId = parsed.searchParams.get('v');
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
      }

      if (parsed.hostname.includes('youtu.be')) {
        const videoId = parsed.pathname.replace(/\//g, '').trim();
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  function createPreviewPanel(url: string): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'video-preview-panel';

    const previewUrl = getVideoPreviewUrl(url);

    if (previewUrl) {
      const iframe = document.createElement('iframe');
      iframe.className = 'video-preview-frame';
      iframe.src = previewUrl;
      iframe.title = 'Video preview';
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      panel.append(iframe);
      return panel;
    }

    const fallback = document.createElement('p');
    fallback.className = 'video-preview-fallback';
    fallback.textContent = 'Inline preview is available for YouTube videos. Open the source to preview this one.';
    panel.append(fallback);
    return panel;
  }

  export function createQueueActionButton(
    label: string,
    onClick: () => void,
    { disabled = false, variant = 'secondary' }: { disabled?: boolean; variant?: 'secondary' | 'primary' } = {},
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = variant === 'primary' ? 'queue-action-button queue-action-primary' : 'queue-action-button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  export function createMedia(result: SearchResult, height: string): HTMLDivElement {
    const media = document.createElement('div');
    media.className = 'pin-media';
    media.style.setProperty('--pin-height', height);

    if (result.thumbnail) {
      const image = document.createElement('img');
      image.className = 'pin-image';
      image.alt = result.title;
      image.src = result.thumbnail;
      image.loading = 'lazy';
      media.append(image);
    } else {
      media.classList.add('is-empty');

      const fallback = document.createElement('span');
      fallback.className = 'pin-fallback';
      fallback.textContent = 'Preview unavailable';
      media.append(fallback);
    }

    const duration = document.createElement('span');
    duration.className = 'duration-pill';
    duration.textContent = result.duration;
    media.append(duration);

    return media;
  }

  export function createCompactCard(result: SearchResult, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'pin-card compact-card';
    card.dataset.url = result.webpageUrl;
    const isSelected = state.selectedUrl === result.webpageUrl;

    if (isSelected) {
      card.classList.add(state.selectionStatus === 'loading' ? 'is-loading-selection' : 'is-selected');
    }

    card.style.setProperty('--stagger-index', String(index));

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'pin-card-button';
    previewButton.disabled = state.isBusy;
    previewButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    previewButton.addEventListener('click', () => {
      void selectSearchResult(result.webpageUrl);
    });

    const media = createMedia(result, getCardHeight(index));

    if (isSelected) {
      const selectedBadge = document.createElement('span');
      selectedBadge.className = 'selected-card-badge';
      selectedBadge.textContent = state.selectionStatus === 'loading' ? 'Loading' : 'Selected';
      media.append(selectedBadge);
    }

    const body = document.createElement('div');
    body.className = 'pin-card-copy';

    const title = document.createElement('h3');
    title.className = 'pin-title';
    title.textContent = result.title;

    const meta = document.createElement('p');
    meta.className = 'pin-meta';
    meta.textContent = result.uploader;

    body.append(title, meta);
    previewButton.append(media, body);

    const footer = document.createElement('div');
    footer.className = 'pin-footer pin-card-footer-bar';

    const detail = document.createElement('span');
    detail.className = 'pin-caption';
    detail.textContent = result.duration;

    const footerActions = document.createElement('div');
    footerActions.className = 'pin-footer-actions';

    const openAction = document.createElement('span');
    openAction.className = 'pin-action';
    openAction.textContent = 'Open details';

    const previewLinkButton = createQueueActionButton('Preview in app', () => {
      void openVideoExternally(result.webpageUrl);
    });
    previewLinkButton.disabled = state.isBusy;

    const queueButton = createQueueActionButton(isQueued(result.webpageUrl) ? 'Queued' : 'Add to queue', () => {
      addVideoToQueue(result);
    });
    queueButton.disabled = state.isBusy || isQueued(result.webpageUrl);

    footerActions.append(openAction, previewLinkButton, queueButton);
    footer.append(detail, footerActions);
    card.append(previewButton, footer);
    return card;
  }

  export function syncSelectedCardState(): void {
    const cards = ui.searchResults.querySelectorAll<HTMLElement>('.compact-card');

    for (const card of cards) {
      const isSelected = card.dataset.url === state.selectedUrl;
      const isLoading = isSelected && state.selectionStatus === 'loading';
      card.classList.toggle('is-selected', isSelected && !isLoading);
      card.classList.toggle('is-loading-selection', isLoading);

      const media = card.querySelector('.pin-media');
      const existingBadge = card.querySelector<HTMLElement>('.selected-card-badge');

      if (!isSelected) {
        existingBadge?.remove();
        continue;
      }

      const badge = existingBadge ?? document.createElement('span');
      badge.className = 'selected-card-badge';
      badge.textContent = isLoading ? 'Loading' : 'Selected';

      if (!existingBadge) {
        media?.append(badge);
      }
    }
  }

  export function createQualityControl(videoInfo: VideoInfo): HTMLLabelElement {
    const qualityGroup = document.createElement('label');
    qualityGroup.className = 'control-group';

    const qualityText = document.createElement('span');
    qualityText.className = 'control-label';
    qualityText.textContent = 'Quality';

    const qualitySelect = document.createElement('select');
    qualitySelect.className = 'control-select';
    qualitySelect.disabled = state.isBusy;

    for (const option of getQualityOptions(videoInfo)) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      optionElement.selected = option.value === getValidQualityForVideo(videoInfo, state.currentQuality);
      qualitySelect.append(optionElement);
    }

    qualitySelect.addEventListener('change', (event) => {
      state.currentQuality = (event.currentTarget as HTMLSelectElement).value;
    });

    qualityGroup.append(qualityText, qualitySelect);
    return qualityGroup;
  }

  export function createFolderControl(): HTMLDivElement {
    const folderGroup = document.createElement('div');
    folderGroup.className = 'control-group';

    const folderText = document.createElement('span');
    folderText.className = 'control-label';
    folderText.textContent = 'Download folder';

    const folderRow = document.createElement('div');
    folderRow.className = 'folder-row';

    const folderDisplay = document.createElement('input');
    folderDisplay.className = 'folder-display';
    folderDisplay.type = 'text';
    folderDisplay.readOnly = true;
    folderDisplay.placeholder = 'Choose a folder before downloading';
    folderDisplay.value = state.downloadFolder;

    const browseButton = document.createElement('button');
    browseButton.type = 'button';
    browseButton.className = 'browse-button';
    browseButton.textContent = 'Browse';
    browseButton.disabled = state.isBusy;
    browseButton.addEventListener('click', () => {
      void chooseFolder();
    });

    folderRow.append(folderDisplay, browseButton);
    folderGroup.append(folderText, folderRow);
    return folderGroup;
  }

  export function createDownloadControls(url: string, videoInfo: VideoInfo): HTMLDivElement {
    const controls = document.createElement('div');
    controls.className = 'download-controls';

    const qualityHint = document.createElement('p');
    qualityHint.className = 'quality-hint';
    qualityHint.textContent =
      videoInfo.availableQualities.length > 0
        ? `Available resolutions: ${videoInfo.availableQualities.join(', ')}`
        : 'Resolution details were not available from the source.';

    const actions = document.createElement('div');
    actions.className = 'expanded-actions';

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'download-button';
    downloadButton.textContent = state.downloadFolder ? 'Download this video' : 'Choose folder to download';
    downloadButton.disabled = state.isBusy || !state.downloadFolder;
    downloadButton.addEventListener('click', () => {
      void downloadSelectedVideo(url);
    });

    const queueButton = createQueueActionButton(isQueued(url) ? 'Already in queue' : 'Add selected to queue', () => {
      addVideoToQueue(videoInfo);
    });
    queueButton.disabled = state.isBusy || isQueued(url);

    actions.append(downloadButton, queueButton);
    controls.append(createQualityControl(videoInfo), createFolderControl(), qualityHint, actions);
    return controls;
  }

  export function createQueueItem(queueItem: QueuedVideo): HTMLElement {
    const item = document.createElement('article');
    item.className = 'queue-item';

    const statusDetail = getQueueStatusDetail(queueItem);
    item.classList.add(`is-${statusDetail.tone}`);

    if (queueItem.status === 'complete') {
      item.classList.add('is-complete');
    }

    const copy = document.createElement('div');
    copy.className = 'queue-item-copy';

    const title = document.createElement('h3');
    title.className = 'queue-item-title';
    title.textContent = queueItem.title;

    const meta = document.createElement('p');
    meta.className = 'queue-item-meta';
    meta.textContent = `${formatSearchMeta(queueItem)} • ${getQualityLabel(queueItem.quality)}`;

    const progressText = document.createElement('p');
    progressText.className = 'queue-item-progress-text';
    progressText.textContent = queueItem.progressText;

    const statusBadge = document.createElement('span');
    statusBadge.className = `queue-status-pill is-${statusDetail.tone}`;
    statusBadge.textContent = statusDetail.label;

    const progressTrack = document.createElement('div');
    progressTrack.className = 'queue-progress-track';

    const progressBar = document.createElement('div');
    progressBar.className = 'queue-progress-bar';
    progressBar.style.width = `${queueItem.progressPercent ?? 0}%`;
    progressTrack.append(progressBar);

    copy.append(title, meta, progressText, progressTrack);

    const actions = document.createElement('div');
    actions.className = 'queue-item-actions';

    const removeButton = createQueueActionButton(
      queueItem.status === 'downloading' || queueItem.status === 'processing' ? 'Active' : 'Remove',
      () => {
        removeVideoFromQueue(queueItem.downloadId);
      },
    );
    removeButton.disabled = state.isBusy || queueItem.status === 'downloading' || queueItem.status === 'processing';

    actions.append(statusBadge, removeButton);
    item.append(copy, actions);
    return item;
  }

  export function renderQueue(): void {
    const hasQueue = state.downloadQueue.length > 0;
    ui.queuePanel.classList.toggle('hidden', !hasQueue);
    ui.queueItems.replaceChildren();
    ui.queueActions.replaceChildren();

    if (!hasQueue) {
      ui.queueSummary.textContent = '';
      return;
    }

    const activeCount = getActiveQueueItems().length;
    const queuedCount = state.downloadQueue.filter((item) => item.status === 'queued').length;
    const failedCount = state.downloadQueue.filter((item) => item.status === 'failed').length;
    const completeCount = state.downloadQueue.filter((item) => item.status === 'complete').length;

    const summaryText =
      state.queueRunTotal > 0
        ? `${state.completedQueueCount}/${state.queueRunTotal} finished, ${activeCount} active, ${queuedCount} waiting.`
        : `${queuedCount} waiting, ${completeCount} done, ${failedCount} failed.`;

    ui.queueSummary.textContent = summaryText;

    const downloadQueueButton = createQueueActionButton(
      state.downloadFolder ? `Download ${state.parallelDownloadLimit} at a time` : 'Choose folder to download queue',
      () => {
        void downloadQueuedVideos();
      },
      {
        disabled: state.isBusy || getRunnableQueueItems().length === 0 || !state.downloadFolder,
        variant: 'primary',
      },
    );

    const folderButton = createQueueActionButton(state.downloadFolder ? 'Change folder' : 'Choose folder', () => {
      void chooseFolder();
    }, { disabled: state.isBusy });

    const clearQueueButton = createQueueActionButton('Clear queue', () => {
      clearDownloadQueue();
    }, { disabled: state.isBusy || state.downloadQueue.length === 0 });

    ui.queueActions.append(folderButton, downloadQueueButton, clearQueueButton);

    const fragment = document.createDocumentFragment();

    for (const queueItem of state.downloadQueue) {
      fragment.append(createQueueItem(queueItem));
    }

    ui.queueItems.append(fragment);
  }

  export function createLoadingPanel(): HTMLDivElement {
    const loading = document.createElement('div');
    loading.className = 'loading-panel';
    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner';

    const text = document.createElement('span');
    text.textContent = 'Loading details for this video...';

    loading.append(spinner, text);
    return loading;
  }

  export function createExpandedCopy(result: SearchResult): HTMLDivElement {
    const selectedVideo = state.currentVideoInfo ?? result;

    const copy = document.createElement('div');
    copy.className = 'expanded-copy';

    const title = document.createElement('h3');
    title.className = 'expanded-title';
    title.textContent = selectedVideo.title;

    const meta = document.createElement('p');
    meta.className = 'expanded-meta';
    meta.textContent = formatSearchMeta(selectedVideo);

    const url = document.createElement('p');
    url.className = 'expanded-link';
    url.textContent = result.webpageUrl;

    const previewActions = document.createElement('div');
    previewActions.className = 'expanded-preview-actions';

    const openButton = createQueueActionButton('Open in app', () => {
      void openVideoExternally(result.webpageUrl);
    }, { variant: 'primary' });
    openButton.disabled = state.selectionStatus === 'loading';

    previewActions.append(openButton);
    copy.append(title, meta, url, previewActions);

    if (state.currentVideoInfo) {
      copy.append(createDownloadControls(result.webpageUrl, state.currentVideoInfo));
    } else {
      copy.append(createLoadingPanel());
    }

    return copy;
  }

  export function createExpandedCard(result: SearchResult, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'expanded-card animate-in';
    card.dataset.url = result.webpageUrl;
    card.style.setProperty('--stagger-index', String(index));

    const header = document.createElement('div');
    header.className = 'expanded-header';

    const pill = document.createElement('span');
    pill.className = 'selection-pill';
    pill.textContent = 'Selected';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'close-chip';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => {
      clearSelection();
    });

    header.append(pill, closeButton);

    const content = document.createElement('div');
    content.className = 'expanded-layout';

    content.append(createPreviewPanel(result.webpageUrl), createExpandedCopy(result));
    card.append(header, content);
    return card;
  }

  export function renderSelectionPanel({ preservePreview = false }: { preservePreview?: boolean } = {}): void {
    if (!state.selectedUrl) {
      ui.selectionContent.replaceChildren();
      ui.selectionModal.classList.add('hidden');
      ui.selectionModalOverlay.classList.add('hidden');
      ui.selectionModalOverlay.setAttribute('aria-hidden', 'true');
      return;
    }

    const selectedResult = state.searchItems.find((result) => result.webpageUrl === state.selectedUrl) ?? state.currentVideoInfo;

    if (!selectedResult) {
      return;
    }

    const existingCard = ui.selectionContent.querySelector<HTMLElement>('.expanded-card');
    const existingCopy = existingCard?.querySelector<HTMLElement>('.expanded-copy');

    if (preservePreview && existingCard?.dataset.url === selectedResult.webpageUrl && existingCopy) {
      const pill = existingCard.querySelector<HTMLElement>('.selection-pill');
      if (pill) {
        pill.textContent = state.selectionStatus === 'loading' ? 'Loading' : 'Selected';
      }

      existingCopy.replaceWith(createExpandedCopy(selectedResult));
      ui.selectionModal.classList.remove('hidden');
      ui.selectionModalOverlay.classList.remove('hidden');
      ui.selectionModalOverlay.setAttribute('aria-hidden', 'false');
      return;
    }

    ui.selectionContent.replaceChildren();
    ui.selectionContent.append(createExpandedCard(selectedResult, 0));
    ui.selectionModal.classList.remove('hidden');
    ui.selectionModalOverlay.classList.remove('hidden');
    ui.selectionModalOverlay.setAttribute('aria-hidden', 'false');
  }

  export function createEmptyState(): HTMLElement {
    const emptyState = document.createElement('article');
    emptyState.className = 'empty-board';

    const title = document.createElement('h3');
    title.textContent = 'Nothing matched that search';

    const copy = document.createElement('p');
    copy.textContent =
      'Try a different title, or paste a direct YouTube or TikTok link to open one downloadable card.';

    emptyState.append(title, copy);
    return emptyState;
  }

  export function renderFeed(): void {
    const shouldHideFeed = !state.hasAttemptedSearch && state.searchItems.length === 0 && state.downloadQueue.length === 0;
    ui.feedPanel.classList.toggle('hidden', shouldHideFeed);

    if (shouldHideFeed) {
      renderQueue();
      ui.searchResults.replaceChildren();
      ui.searchSummary.textContent = '';
      renderSelectionPanel({ preservePreview: true });
      return;
    }

    ui.feedTitle.textContent = getFeedTitle();
    ui.searchSummary.textContent = getSearchSummary();
    ui.searchResults.replaceChildren();
    renderQueue();

    if (state.searchItems.length === 0) {
      ui.searchResults.append(createEmptyState());
      renderSelectionPanel({ preservePreview: true });
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const [index, result] of state.searchItems.entries()) {
      fragment.append(createCompactCard(result, index));
    }

    ui.searchResults.append(fragment);
    renderSelectionPanel({ preservePreview: true });
  }
}

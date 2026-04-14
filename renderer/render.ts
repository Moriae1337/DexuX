namespace DexuXRenderer {
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
    card.style.setProperty('--stagger-index', String(index));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pin-card-button';
    button.disabled = state.isBusy;
    button.addEventListener('click', () => {
      void selectSearchResult(result.webpageUrl);
    });

    const media = createMedia(result, getCardHeight(index));

    const body = document.createElement('div');
    body.className = 'pin-card-copy';

    const title = document.createElement('h3');
    title.className = 'pin-title';
    title.textContent = result.title;

    const meta = document.createElement('p');
    meta.className = 'pin-meta';
    meta.textContent = result.uploader;

    const footer = document.createElement('div');
    footer.className = 'pin-footer';

    const detail = document.createElement('span');
    detail.className = 'pin-caption';
    detail.textContent = result.duration;

    const action = document.createElement('span');
    action.className = 'pin-action';
    action.textContent = 'Open details';

    footer.append(detail, action);
    body.append(title, meta, footer);
    button.append(media, body);
    card.append(button);
    return card;
  }

  export function createQualityControl(): HTMLLabelElement {
    const qualityGroup = document.createElement('label');
    qualityGroup.className = 'control-group';

    const qualityText = document.createElement('span');
    qualityText.className = 'control-label';
    qualityText.textContent = 'Quality';

    const qualitySelect = document.createElement('select');
    qualitySelect.className = 'control-select';
    qualitySelect.disabled = state.isBusy;

    for (const option of QUALITY_OPTIONS) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      optionElement.selected = option.value === state.currentQuality;
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

    actions.append(downloadButton);
    controls.append(createQualityControl(), createFolderControl(), qualityHint, actions);
    return controls;
  }

  export function createLoadingPanel(): HTMLDivElement {
    const loading = document.createElement('div');
    loading.className = 'loading-panel';
    loading.textContent = 'Loading details for this video...';
    return loading;
  }

  export function createExpandedCard(result: SearchResult, index: number): HTMLElement {
    const selectedVideo = state.currentVideoInfo ?? result;

    const card = document.createElement('article');
    card.className = 'pin-card expanded-card animate-in';
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
    closeButton.disabled = state.isBusy;
    closeButton.addEventListener('click', () => {
      clearSelection();
    });

    header.append(pill, closeButton);

    const content = document.createElement('div');
    content.className = 'expanded-layout';

    const media = createMedia(selectedVideo, '360px');
    media.classList.add('expanded-media');

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

    copy.append(title, meta, url);

    if (state.currentVideoInfo) {
      copy.append(createDownloadControls(result.webpageUrl, state.currentVideoInfo));
    } else {
      copy.append(createLoadingPanel());
    }

    content.append(media, copy);
    card.append(header, content);
    return card;
  }

  export function createEmptyState(): HTMLElement {
    const emptyState = document.createElement('article');
    emptyState.className = 'empty-board';

    const title = document.createElement('h3');
    title.textContent = 'Nothing matched that search';

    const copy = document.createElement('p');
    copy.textContent = 'Try a different video title, or paste a direct YouTube link to open a single downloadable card.';

    emptyState.append(title, copy);
    return emptyState;
  }

  export function renderFeed(): void {
    const shouldHideFeed = !state.hasAttemptedSearch && state.searchItems.length === 0;
    ui.feedPanel.classList.toggle('hidden', shouldHideFeed);

    if (shouldHideFeed) {
      ui.searchResults.replaceChildren();
      ui.searchSummary.textContent = '';
      return;
    }

    ui.feedTitle.textContent = getFeedTitle();
    ui.searchSummary.textContent = getSearchSummary();
    ui.searchResults.replaceChildren();

    if (state.searchItems.length === 0) {
      ui.searchResults.append(createEmptyState());
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const [index, result] of state.searchItems.entries()) {
      const card =
        state.selectedUrl === result.webpageUrl ? createExpandedCard(result, index) : createCompactCard(result, index);
      fragment.append(card);
    }

    ui.searchResults.append(fragment);
  }
}

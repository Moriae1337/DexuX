function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}

const queryInput = getElementByIdOrThrow<HTMLInputElement>('video-query');
const qualitySelect = getElementByIdOrThrow<HTMLSelectElement>('quality');
const folderInput = getElementByIdOrThrow<HTMLInputElement>('download-folder');
const searchButton = getElementByIdOrThrow<HTMLButtonElement>('search-button');
const folderButton = getElementByIdOrThrow<HTMLButtonElement>('folder-button');
const downloadButton = getElementByIdOrThrow<HTMLButtonElement>('download-button');
const statusText = getElementByIdOrThrow<HTMLParagraphElement>('status-text');
const progressBar = getElementByIdOrThrow<HTMLDivElement>('progress-bar');
const searchResultsPanel = getElementByIdOrThrow<HTMLElement>('search-results-panel');
const searchResults = getElementByIdOrThrow<HTMLDivElement>('search-results');
const searchSummary = getElementByIdOrThrow<HTMLParagraphElement>('search-summary');
const videoCard = getElementByIdOrThrow<HTMLElement>('video-card');
const thumbnail = getElementByIdOrThrow<HTMLImageElement>('thumbnail');
const videoTitle = getElementByIdOrThrow<HTMLHeadingElement>('video-title');
const videoMeta = getElementByIdOrThrow<HTMLParagraphElement>('video-meta');
const videoQualityHint = getElementByIdOrThrow<HTMLParagraphElement>('video-quality-hint');

let currentVideoInfo: VideoInfo | null = null;
let isBusy = false;

function restartAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function setBusy(nextValue: boolean): void {
  isBusy = nextValue;
  searchButton.disabled = nextValue;
  folderButton.disabled = nextValue;
  downloadButton.disabled = nextValue;

  for (const resultButton of Array.from(searchResults.querySelectorAll<HTMLButtonElement>('.search-result'))) {
    resultButton.disabled = nextValue;
  }
}

function setStatus(message: string, percent: number | null = null): void {
  statusText.textContent = message;
  progressBar.style.width = `${percent ?? 0}%`;
  restartAnimation(statusText, 'is-updating');
}

function isProbablyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function clearVideoInfo(): void {
  currentVideoInfo = null;
  thumbnail.removeAttribute('src');
  thumbnail.style.display = 'none';
  videoCard.classList.add('hidden');
  updateSearchSelection();
}

function updateSearchSelection(): void {
  for (const resultButton of Array.from(searchResults.querySelectorAll<HTMLButtonElement>('.search-result'))) {
    const isSelected = resultButton.dataset.url === currentVideoInfo?.webpageUrl;
    resultButton.classList.toggle('selected', isSelected);
    resultButton.setAttribute('aria-pressed', String(isSelected));
  }
}

function renderVideoInfo(info: VideoInfo): void {
  currentVideoInfo = info;
  queryInput.value = info.webpageUrl || queryInput.value;
  videoCard.classList.remove('hidden');
  restartAnimation(videoCard, 'animate-in');
  thumbnail.src = info.thumbnail || '';
  thumbnail.style.display = info.thumbnail ? 'block' : 'none';
  videoTitle.textContent = info.title;
  videoMeta.textContent = `${info.uploader} • ${info.duration}`;

  if (info.availableQualities.length > 0) {
    videoQualityHint.textContent = `Available resolutions: ${info.availableQualities.join(', ')}`;
  } else {
    videoQualityHint.textContent = 'Resolution details were not available from the source.';
  }

  updateSearchSelection();
}

function hideSearchResults(): void {
  searchResultsPanel.classList.add('hidden');
  searchSummary.textContent = '';
  searchResults.replaceChildren();
}

function formatSearchMeta(result: SearchResult): string {
  return `${result.uploader} • ${result.duration}`;
}

function createSearchResult(result: SearchResult, index: number): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-result';
  button.dataset.url = result.webpageUrl || '';
  button.style.setProperty('--stagger-index', String(index));

  const image = document.createElement('img');
  image.className = 'search-result-thumb';
  image.alt = '';

  if (result.thumbnail) {
    image.src = result.thumbnail;
  } else {
    image.classList.add('is-empty');
  }

  const body = document.createElement('div');
  body.className = 'search-result-body';

  const title = document.createElement('p');
  title.className = 'search-result-title';
  title.textContent = result.title;

  const meta = document.createElement('p');
  meta.className = 'search-result-meta';
  meta.textContent = formatSearchMeta(result);

  const link = document.createElement('p');
  link.className = 'search-result-link';
  link.textContent = result.webpageUrl;

  body.append(title, meta, link);
  button.append(image, body);
  button.addEventListener('click', () => {
    void selectSearchResult(result.webpageUrl);
  });

  return button;
}

function renderSearchResults(results: SearchResult[], query: string): void {
  searchResultsPanel.classList.remove('hidden');
  searchResults.replaceChildren();

  if (results.length === 0) {
    searchSummary.textContent = `No matches found for "${query}".`;

    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Try a different video name or paste a direct YouTube link.';
    searchResults.append(emptyState);
    return;
  }

  searchSummary.textContent = `Showing ${results.length} result${results.length === 1 ? '' : 's'} for "${query}".`;

  const fragment = document.createDocumentFragment();
  for (const [index, result] of results.entries()) {
    fragment.append(createSearchResult(result, index));
  }

  searchResults.append(fragment);
  restartAnimation(searchResultsPanel, 'animate-in');
  updateSearchSelection();
}

async function loadVideoFromUrl(url: string, pendingMessage: string, successMessage: string): Promise<void> {
  if (!url) {
    return;
  }

  setBusy(true);
  setStatus(pendingMessage);

  try {
    const info = await window.downloaderApi.fetchVideoInfo(url);
    renderVideoInfo(info);
    setStatus(successMessage);
  } catch (error) {
    clearVideoInfo();
    setStatus(error instanceof Error ? error.message : 'Could not inspect the video.');
  } finally {
    setBusy(false);
  }
}

async function searchVideos(query: string): Promise<void> {
  setBusy(true);
  setStatus(`Searching YouTube for "${query}"...`);

  try {
    const results = await window.downloaderApi.searchVideos(query);
    renderSearchResults(results, query);
    setStatus(results.length > 0 ? 'Search results loaded. Select a video to continue.' : 'No videos matched your search.');
  } catch (error) {
    hideSearchResults();
    setStatus(error instanceof Error ? error.message : 'Search failed.');
  } finally {
    setBusy(false);
  }
}

async function handleSearch(): Promise<void> {
  const query = queryInput.value.trim();
  if (!query) {
    setStatus('Search by video name or paste a YouTube URL first.');
    return;
  }

  if (isProbablyUrl(query)) {
    hideSearchResults();
    await loadVideoFromUrl(query, 'Inspecting video...', 'Video details loaded.');
    return;
  }

  clearVideoInfo();
  await searchVideos(query);
}

async function selectSearchResult(url: string): Promise<void> {
  queryInput.value = url;
  clearVideoInfo();
  await loadVideoFromUrl(url, 'Loading selected video...', 'Selected video ready to download.');
}

async function chooseFolder(): Promise<void> {
  const selected = await window.downloaderApi.selectDownloadDirectory();
  if (selected) {
    folderInput.value = selected;
    setStatus(`Download folder set to ${selected}`);
  }
}

async function downloadVideo(): Promise<void> {
  const query = queryInput.value.trim();
  let url = '';

  if (currentVideoInfo && currentVideoInfo.webpageUrl === query) {
    url = currentVideoInfo.webpageUrl;
  } else if (isProbablyUrl(query)) {
    url = query;
  }

  const outputDir = folderInput.value.trim();

  if (!url) {
    setStatus('Select a search result or paste a YouTube URL first.');
    return;
  }

  if (!outputDir) {
    setStatus('Choose a download folder first.');
    return;
  }

  setBusy(true);
  setStatus('Starting download...');

  try {
    if (!currentVideoInfo || currentVideoInfo.webpageUrl !== url) {
      const info = await window.downloaderApi.fetchVideoInfo(url);
      renderVideoInfo(info);
    }

    const result = await window.downloaderApi.downloadVideo({
      url,
      outputDir,
      quality: qualitySelect.value,
    });

    setStatus(`Saved to ${result.path}`, 100);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Download failed.');
  } finally {
    setBusy(false);
  }
}

window.downloaderApi.onDownloadProgress((progress: DownloadProgress) => {
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
});

searchButton.addEventListener('click', () => {
  void handleSearch();
});

folderButton.addEventListener('click', () => {
  void chooseFolder();
});

downloadButton.addEventListener('click', () => {
  void downloadVideo();
});

queryInput.addEventListener('input', () => {
  if (currentVideoInfo && queryInput.value.trim() !== currentVideoInfo.webpageUrl) {
    clearVideoInfo();
  }
});

queryInput.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !isBusy) {
    void handleSearch();
  }
});

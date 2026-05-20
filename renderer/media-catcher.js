(function () {
  const openButton = document.getElementById('media-catcher-open');
  const closeButton = document.getElementById('media-catcher-close');
  const overlay = document.getElementById('media-catcher-overlay');
  const modal = document.getElementById('media-catcher-modal');
  const urlInput = document.getElementById('media-catcher-url');
  const goButton = document.getElementById('media-catcher-go');
  const status = document.getElementById('media-catcher-status');
  const progressBar = document.getElementById('media-catcher-progress-bar');
  const logRoot = document.getElementById('media-catcher-log');
  const list = document.getElementById('media-catcher-list');
  const webview = document.getElementById('media-catcher-view');
  const queryInput = document.getElementById('video-query');

  if (
    !(openButton instanceof HTMLButtonElement) ||
    !(closeButton instanceof HTMLButtonElement) ||
    !(overlay instanceof HTMLDivElement) ||
    !(modal instanceof HTMLElement) ||
    !(urlInput instanceof HTMLInputElement) ||
    !(goButton instanceof HTMLButtonElement) ||
    !(status instanceof HTMLParagraphElement) ||
    !(progressBar instanceof HTMLDivElement) ||
    !(logRoot instanceof HTMLDivElement) ||
    !(list instanceof HTMLDivElement) ||
    !(queryInput instanceof HTMLInputElement) ||
    !(webview instanceof HTMLElement)
  ) {
    return;
  }

  const foundUrls = new Map();
  let activeContentsId = null;
  let logEntries = [];

  const setStatus = (message) => {
    status.textContent = message;
  };

  const setProgress = (value) => {
    progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  };

  const pushLog = (message) => {
    logEntries = [`${new Date().toLocaleTimeString()}  ${message}`, ...logEntries].slice(0, 14);
    logRoot.replaceChildren(
      ...logEntries.map((entry) => {
        const row = document.createElement('div');
        row.className = 'media-catcher-log-entry';
        row.textContent = entry;
        return row;
      }),
    );
  };

  const normalizePageUrl = (value) => {
    const trimmed = value.trim();

    if (!trimmed) {
      return '';
    }

    try {
      return new URL(trimmed).toString();
    } catch {
      return new URL(`https://${trimmed}`).toString();
    }
  };

  const setOpen = (nextValue) => {
    modal.classList.toggle('hidden', !nextValue);
    overlay.classList.toggle('hidden', !nextValue);
    overlay.setAttribute('aria-hidden', String(!nextValue));
  };

  const renderList = () => {
    const items = Array.from(foundUrls.values()).filter((item) => item.confidence === 'confirmed');

    if (items.length === 0) {
      list.replaceChildren();
      return;
    }

    list.replaceChildren(
      ...items.map((item) => {
        const card = document.createElement('div');
        card.className = 'media-catcher-item';

        let hostname = 'Direct media';

        try {
          hostname = new URL(item.url).hostname.replace(/^www\./, '');
        } catch {
          // Keep fallback label.
        }

        const visual = document.createElement('div');
        visual.className = 'media-catcher-visual';
        const visualLabel = document.createElement('span');
        visualLabel.className = 'media-catcher-visual-label';
        visualLabel.textContent = item.kind.toUpperCase();

        if (item.kind === 'mp4') {
          const previewVideo = document.createElement('video');
          previewVideo.className = 'media-catcher-preview-video';
          previewVideo.src = item.url;
          previewVideo.muted = true;
          previewVideo.loop = true;
          previewVideo.playsInline = true;
          previewVideo.preload = 'metadata';

          previewVideo.addEventListener(
            'loadedmetadata',
            () => {
              const previewTime = Math.min(Math.max(previewVideo.duration * 0.12, 0.8), 4);
              if (Number.isFinite(previewTime)) {
                previewVideo.currentTime = previewTime;
              }
            },
            { once: true },
          );

          previewVideo.addEventListener('seeked', () => {
            previewVideo.pause();
            previewVideo.classList.add('is-ready');
            visual.classList.add('has-preview');
          });

          previewVideo.addEventListener('error', () => {
            visual.classList.remove('has-preview');
          });

          visual.addEventListener('mouseenter', () => {
            if (!previewVideo.classList.contains('is-ready')) {
              return;
            }

            void previewVideo.play().catch(() => {
              // Ignore autoplay restrictions for hover previews.
            });
          });

          visual.addEventListener('mouseleave', () => {
            previewVideo.pause();
          });

          visual.append(previewVideo);
        }

        visual.append(visualLabel);

        const kind = document.createElement('span');
        kind.className = 'media-catcher-kind';
        kind.textContent = item.kind;

        const title = document.createElement('p');
        title.className = 'media-catcher-card-title';
        title.textContent = hostname;

        const meta = document.createElement('p');
        meta.className = 'media-catcher-meta';
        meta.textContent = [
          item.mimeType ? `MIME: ${item.mimeType}` : null,
          item.statusCode ? `Status: ${item.statusCode}` : null,
        ]
          .filter(Boolean)
          .join(' • ');

        const actions = document.createElement('div');
        actions.className = 'media-catcher-actions';

        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'queue-action-button queue-action-primary';
        useButton.textContent = 'Download';
        useButton.addEventListener('click', async () => {
          try {
            setStatus('Choosing a download folder...');
            pushLog('Preparing direct media download.');

            const outputDir = await window.downloaderApi.selectDownloadDirectory();

            if (!outputDir) {
              setStatus('Download cancelled.');
              pushLog('Download cancelled because no folder was selected.');
              return;
            }

            setStatus(`Downloading ${hostname} media...`);
            setProgress(90);
            pushLog(`Starting direct ${item.kind.toUpperCase()} download.`);

            const result = await window.downloaderApi.downloadCapturedMedia({
              url: item.url,
              outputDir,
              referer: item.sourceUrl || undefined,
            });

            setStatus(`Downloaded to ${result.path}`);
            setProgress(100);
            pushLog(`Download complete: ${result.path}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Direct download failed.';
            setStatus(message);
            setProgress(0);
            pushLog(`Direct download failed: ${message}`);
          }
        });

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'queue-action-button';
        copyButton.textContent = 'Copy link';
        copyButton.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(item.url);
            setStatus('Copied media URL.');
            pushLog('Copied a detected media URL.');
          } catch {
            setStatus('Could not copy the URL.');
            pushLog('Copy failed.');
          }
        });

        actions.append(useButton, copyButton);
        card.title = item.url;
        card.append(visual, kind, title);

        if (meta.textContent) {
          card.append(meta);
        }

        card.append(actions);
        return card;
      }),
    );
  };

  const stopCapture = async () => {
    if (activeContentsId == null) {
      return;
    }

    try {
      await window.downloaderApi.stopMediaCapture(activeContentsId);
      pushLog(`Stopped capture for webContents ${activeContentsId}.`);
    } catch {
      // Ignore cleanup issues.
    }

    activeContentsId = null;
  };

  const resetResults = () => {
    foundUrls.clear();
    renderList();
    logEntries = [];
    logRoot.replaceChildren();
    setProgress(0);
  };

  const startCapture = async () => {
    const getWebContentsId = webview.getWebContentsId;

    if (typeof getWebContentsId !== 'function') {
      pushLog('This Electron build does not expose webview capture hooks.');
      return;
    }

    await stopCapture();
    activeContentsId = getWebContentsId.call(webview);
    await window.downloaderApi.startMediaCapture(activeContentsId);
    setProgress(35);
    pushLog(`Started capture for webContents ${activeContentsId}.`);
  };

  const openPage = () => {
    const nextUrl = normalizePageUrl(urlInput.value);

    if (!nextUrl) {
      setStatus('Paste a webpage URL first.');
      pushLog('Open cancelled because no URL was provided.');
      return;
    }

    resetResults();
    setStatus(`Opening ${nextUrl}...`);
    setProgress(10);
    pushLog(`Opening page: ${nextUrl}`);
    webview.src = nextUrl;
  };

  const removeDetectedMediaListener = window.downloaderApi.onDetectedMedia((media) => {
    const existing = foundUrls.get(media.url);
    const isConfirmed = media.confidence === 'confirmed';
    const isBlocked = media.confidence === 'blocked';

    if (!existing) {
      foundUrls.set(media.url, media);
      if (isConfirmed) {
        renderList();
      }

      pushLog(
        `${isBlocked ? 'Blocked' : isConfirmed ? 'Confirmed' : 'Candidate'} ${media.kind.toUpperCase()} URL${
          media.mimeType ? ` (${media.mimeType})` : ''
        }${media.statusCode ? ` [${media.statusCode}]` : ''}.`,
      );
    } else if ((!existing.mimeType && media.mimeType) || (!existing.statusCode && media.statusCode)) {
      foundUrls.set(media.url, {
        ...existing,
        mimeType: media.mimeType ?? existing.mimeType ?? null,
        statusCode: media.statusCode ?? existing.statusCode ?? null,
        confidence: media.confidence ?? existing.confidence ?? 'candidate',
      });
      if (media.confidence === 'confirmed' || existing.confidence === 'confirmed') {
        renderList();
      }
    }

    const confirmedCount = Array.from(foundUrls.values()).filter((item) => item.confidence === 'confirmed').length;
    const blockedCount = Array.from(foundUrls.values()).filter((item) => item.confidence === 'blocked').length;

    if (confirmedCount > 0) {
      setStatus(`Found ${confirmedCount} downloadable media URL${confirmedCount === 1 ? '' : 's'}.`);
      setProgress(100);
    } else if (blockedCount > 0) {
      setStatus('Saw media-like requests, but they were blocked or not directly downloadable.');
      setProgress(78);
    } else {
      setStatus('Saw media-like requests, but none are confirmed downloadable yet.');
      setProgress(74);
    }
  });

  openButton.addEventListener('click', () => {
    setOpen(true);
  });

  closeButton.addEventListener('click', () => {
    setOpen(false);
  });

  overlay.addEventListener('click', () => {
    setOpen(false);
  });

  goButton.addEventListener('click', openPage);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      openPage();
    }
  });

  webview.addEventListener('dom-ready', () => {
    setStatus('Page shell loaded. Starting request capture...');
    setProgress(25);
    pushLog('Webview DOM is ready.');
    void startCapture();
  });

  webview.addEventListener('did-navigate', () => {
    const currentUrl = webview.getURL?.();
    if (currentUrl) {
      urlInput.value = currentUrl;
      setStatus(`Scanning ${currentUrl} for direct video streams...`);
      setProgress(55);
      pushLog(`Navigated to ${currentUrl}`);
    }
  });

  webview.addEventListener('did-start-loading', () => {
    setStatus('Loading page...');
    setProgress(15);
    pushLog('Page started loading.');
  });

  webview.addEventListener('did-stop-loading', () => {
    if (foundUrls.size === 0) {
      setStatus('Page loaded. Waiting for playable media requests...');
      setProgress(70);
      pushLog('Page finished loading. No media found yet.');
      return;
    }

    pushLog('Page finished loading.');
  });

  webview.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) {
      return;
    }

    setStatus(`Load failed: ${event.errorDescription}`);
    setProgress(0);
    pushLog(`Load failed for ${event.validatedURL || 'page'}: ${event.errorDescription}`);
  });

  window.addEventListener('beforeunload', () => {
    removeDetectedMediaListener();
    void stopCapture();
  });
})();

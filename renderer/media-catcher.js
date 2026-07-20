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
    !(queryInput instanceof HTMLInputElement)
  ) {
    return;
  }

  const foundUrls = new Map();
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

  const resetResults = () => {
    foundUrls.clear();
    renderList();
    logEntries = [];
    logRoot.replaceChildren();
    setProgress(0);
  };

  const openPage = async () => {
    const nextUrl = normalizePageUrl(urlInput.value);

    if (!nextUrl) {
      setStatus('Paste a webpage URL first.');
      pushLog('Open cancelled because no URL was provided.');
      return;
    }

    resetResults();
    setStatus(`Inspecting ${nextUrl}...`);
    setProgress(10);
    pushLog(`Inspecting page: ${nextUrl}`);

    try {
      const detectedMedia = await window.downloaderApi.inspectMediaUrl(nextUrl);

      for (const media of detectedMedia) {
        foundUrls.set(media.url, media);
        pushLog(
          `${media.confidence === 'confirmed' ? 'Confirmed' : 'Candidate'} ${media.kind.toUpperCase()} URL${
            media.mimeType ? ` (${media.mimeType})` : ''
          }.`,
        );
      }

      renderList();

      if (detectedMedia.length === 0) {
        setStatus('No direct MP4 or HLS media URLs were found for that page.');
        setProgress(0);
        pushLog('Inspection finished without direct media URLs.');
        return;
      }

      setStatus(`Found ${detectedMedia.length} downloadable media URL${detectedMedia.length === 1 ? '' : 's'}.`);
      setProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Media inspection failed.';
      setStatus(message);
      setProgress(0);
      pushLog(`Inspection failed: ${message}`);
    }
  };

  openButton.addEventListener('click', () => {
    setOpen(true);
  });

  closeButton.addEventListener('click', () => {
    setOpen(false);
  });

  overlay.addEventListener('click', () => {
    setOpen(false);
  });

  goButton.addEventListener('click', () => {
    void openPage();
  });
  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void openPage();
    }
  });
})();

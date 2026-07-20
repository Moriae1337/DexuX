namespace DexuXTauriBridge {
  type TauriEvent<T> = { payload: T };
  type UnlistenFn = () => void;

  type TauriGlobal = {
    core: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
    event: {
      listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<UnlistenFn>;
    };
    dialog: {
      open<T>(options: { directory?: boolean; multiple?: boolean }): Promise<T | null>;
    };
    opener: {
      openUrl(url: string): Promise<void>;
    };
  };

  function getTauri(): TauriGlobal {
    const maybeTauri = (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;

    if (!maybeTauri) {
      throw new Error('Tauri runtime APIs are unavailable.');
    }

    return maybeTauri;
  }

  function normalizeSelectedPath(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }

    return null;
  }

  async function registerEventListener<T>(
    eventName: string,
    callback: (payload: T) => void,
  ): Promise<UnlistenFn> {
    return getTauri().event.listen<T>(eventName, (event) => {
      callback(event.payload);
    });
  }

  window.downloaderApi = {
    async selectDownloadDirectory(): Promise<string | null> {
      const selected = await getTauri().dialog.open<string | string[]>({
        directory: true,
        multiple: false,
      });

      return normalizeSelectedPath(selected);
    },
    searchVideos(query: string): Promise<SearchResult[]> {
      return getTauri().core.invoke<SearchResult[]>('search_videos', { query });
    },
    fetchVideoInfo(url: string): Promise<VideoInfo> {
      return getTauri().core.invoke<VideoInfo>('fetch_video_info', { url });
    },
    downloadVideo(payload: DownloadRequest): Promise<DownloadResult> {
      return getTauri().core.invoke<DownloadResult>('download_video', { payload });
    },
    downloadCapturedMedia(payload: CapturedMediaDownloadRequest): Promise<DownloadResult> {
      return getTauri().core.invoke<DownloadResult>('download_captured_media', { payload });
    },
    async setWindowOpacity(opacity: number): Promise<number> {
      return Math.min(Math.max(opacity, 0.15), 1);
    },
    openExternalUrl(url: string): Promise<void> {
      return getTauri().opener.openUrl(url);
    },
    async inspectMediaUrl(url: string): Promise<DetectedMedia[]> {
      return getTauri().core.invoke<DetectedMedia[]>('inspect_media_url', { url });
    },
    async startMediaCapture(): Promise<void> {
      await Promise.resolve();
    },
    async stopMediaCapture(): Promise<void> {
      await Promise.resolve();
    },
    onDetectedMedia(callback: (media: DetectedMedia) => void): (() => void) {
      let unlisten: UnlistenFn | null = null;
      void registerEventListener<DetectedMedia>('detected-media', callback).then((nextUnlisten) => {
        unlisten = nextUnlisten;
      });

      return () => {
        unlisten?.();
      };
    },
    onDownloadProgress(callback: (progress: DownloadProgress) => void): (() => void) {
      let unlisten: UnlistenFn | null = null;
      void registerEventListener<DownloadProgress>('download-progress', callback).then((nextUnlisten) => {
        unlisten = nextUnlisten;
      });

      return () => {
        unlisten?.();
      };
    },
  };
}

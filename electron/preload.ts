import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('downloaderApi', {
  selectDownloadDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-download-directory'),
  searchVideos: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('search-videos', query),
  fetchVideoInfo: (url: string): Promise<VideoInfo> => ipcRenderer.invoke('fetch-video-info', url),
  downloadVideo: (payload: DownloadRequest): Promise<DownloadResult> => ipcRenderer.invoke('download-video', payload),
  downloadCapturedMedia: (payload: CapturedMediaDownloadRequest): Promise<DownloadResult> =>
    ipcRenderer.invoke('download-captured-media', payload),
  setWindowOpacity: (opacity: number): Promise<number> => ipcRenderer.invoke('set-window-opacity', opacity),
  openExternalUrl: (url: string): Promise<void> => ipcRenderer.invoke('open-external-url', url),
  startMediaCapture: (targetWebContentsId: number): Promise<void> =>
    ipcRenderer.invoke('start-media-capture', targetWebContentsId),
  stopMediaCapture: (targetWebContentsId: number): Promise<void> =>
    ipcRenderer.invoke('stop-media-capture', targetWebContentsId),
  onDetectedMedia: (callback: (media: DetectedMedia) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DetectedMedia): void => callback(data);
    ipcRenderer.on('detected-media', listener);

    return (): void => {
      ipcRenderer.removeListener('detected-media', listener);
    };
  },
  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DownloadProgress): void => callback(data);
    ipcRenderer.on('download-progress', listener);

    return (): void => {
      ipcRenderer.removeListener('download-progress', listener);
    };
  },
});

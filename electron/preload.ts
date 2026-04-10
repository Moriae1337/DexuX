import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('downloaderApi', {
  selectDownloadDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-download-directory'),
  searchVideos: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('search-videos', query),
  fetchVideoInfo: (url: string): Promise<VideoInfo> => ipcRenderer.invoke('fetch-video-info', url),
  downloadVideo: (payload: DownloadRequest): Promise<DownloadResult> => ipcRenderer.invoke('download-video', payload),
  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: DownloadProgress): void => callback(data);
    ipcRenderer.on('download-progress', listener);

    return (): void => {
      ipcRenderer.removeListener('download-progress', listener);
    };
  },
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('downloaderApi', {
    selectDownloadDirectory: () => electron_1.ipcRenderer.invoke('select-download-directory'),
    searchVideos: (query) => electron_1.ipcRenderer.invoke('search-videos', query),
    fetchVideoInfo: (url) => electron_1.ipcRenderer.invoke('fetch-video-info', url),
    downloadVideo: (payload) => electron_1.ipcRenderer.invoke('download-video', payload),
    onDownloadProgress: (callback) => {
        const listener = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('download-progress', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('download-progress', listener);
        };
    },
});

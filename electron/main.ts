import { app, BrowserWindow, dialog, ipcMain, Menu, screen, type OpenDialogOptions } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';

type DownloaderMessage =
  | { type: 'info' | 'search' | 'complete'; data: unknown }
  | { type: 'progress'; data: DownloadProgress }
  | { type: 'error'; error: string };

type DownloadPayloadInput = Partial<DownloadRequest> | undefined;

const DIST_ROOT = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const RENDERER_ENTRY = path.join(DIST_ROOT, 'renderer', 'index.html');
const DOWNLOADER_SCRIPT_PATH = path.join(PROJECT_ROOT, 'backend', 'downloader.py');

const WINDOW_LIMITS = {
  minWidth: 860,
  minHeight: 620,
  maxWidth: 1440,
  maxHeight: 960,
} as const;

const IPC_CHANNELS = {
  selectDownloadDirectory: 'select-download-directory',
  fetchVideoInfo: 'fetch-video-info',
  searchVideos: 'search-videos',
  downloadVideo: 'download-video',
  downloadProgress: 'download-progress',
} as const;

let mainWindow: BrowserWindow | null = null;
let pythonCommandCache: string | null = null;

function clampWindowSize(size: number, min: number, max: number, ratio: number): number {
  return Math.max(min, Math.min(max, Math.round(size * ratio)));
}

function getWindowSize(): { width: number; height: number } {
  const { workAreaSize } = screen.getPrimaryDisplay();

  return {
    width: clampWindowSize(workAreaSize.width, WINDOW_LIMITS.minWidth, WINDOW_LIMITS.maxWidth, 0.92),
    height: clampWindowSize(workAreaSize.height, WINDOW_LIMITS.minHeight, WINDOW_LIMITS.maxHeight, 0.92),
  };
}

function createWindow(): void {
  const { width, height } = getWindowSize();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: WINDOW_LIMITS.minWidth,
    minHeight: WINDOW_LIMITS.minHeight,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.removeMenu();
  void mainWindow.loadFile(RENDERER_ENTRY);
}

function resolvePythonCommand(): string {
  if (pythonCommandCache) {
    return pythonCommandCache;
  }

  const candidates = [process.env.PYTHON_PATH, 'python3', 'python'].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });

    if (result.status === 0) {
      pythonCommandCache = candidate;
      return candidate;
    }
  }

  throw new Error('Python 3 was not found. Install python3 or set the PYTHON_PATH environment variable.');
}

function requireText(value: string | undefined, errorMessage: string): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(errorMessage);
  }

  return normalizedValue;
}

function openDownloadDirectoryPicker(): Promise<Electron.OpenDialogReturnValue> {
  const options: OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
  };

  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

function resolveDownloadPayload(payload: DownloadPayloadInput): DownloadRequest {
  return {
    url: requireText(payload?.url, 'A YouTube URL is required.'),
    outputDir: requireText(payload?.outputDir, 'Choose a download folder first.'),
    quality: payload?.quality || 'best',
  };
}

function processDownloaderLine<T>(
  line: string,
  onEvent: ((message: DownloaderMessage) => void) | undefined,
  settleResolve: (value: T) => void,
  settleReject: (error: unknown) => void,
  appendToStderr: (lineText: string) => void,
): void {
  if (!line.trim()) {
    return;
  }

  let message: DownloaderMessage;

  try {
    message = JSON.parse(line) as DownloaderMessage;
  } catch {
    appendToStderr(line);
    return;
  }

  onEvent?.(message);

  if (message.type === 'info' || message.type === 'search' || message.type === 'complete') {
    settleResolve(message.data as T);
    return;
  }

  if (message.type === 'error') {
    settleReject(new Error(message.error));
  }
}

function runDownloader<T>(
  args: string[],
  { onEvent }: { onEvent?: (message: DownloaderMessage) => void } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let pythonCommand: string;

    try {
      pythonCommand = resolvePythonCommand();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(pythonCommand, [DOWNLOADER_SCRIPT_PATH, ...args], {
      cwd: PROJECT_ROOT,
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;

    const settleResolve = (value: T): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const settleReject = (error: unknown): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const appendToStderr = (line: string): void => {
      stderrBuffer += `${line}\n`;
    };

    const processBufferedOutput = (): void => {
      let newlineIndex = stdoutBuffer.indexOf('\n');

      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        processDownloaderLine(line, onEvent, settleResolve, settleReject, appendToStderr);
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      processBufferedOutput();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (error: Error) => {
      settleReject(error);
    });

    child.on('close', (code: number | null) => {
      if (stdoutBuffer.trim()) {
        processDownloaderLine(stdoutBuffer.trim(), onEvent, settleResolve, settleReject, appendToStderr);
      }

      if (code !== 0 && !settled) {
        settleReject(new Error(stderrBuffer.trim() || `Python process exited with code ${code}.`));
      }
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.selectDownloadDirectory, async () => {
    const result = await openDownloadDirectoryPicker();

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.fetchVideoInfo, async (_event, url: string) => {
    return runDownloader<VideoInfo>(['info', requireText(url, 'A YouTube URL is required.')]);
  });

  ipcMain.handle(IPC_CHANNELS.searchVideos, async (_event, query: string) => {
    return runDownloader<SearchResult[]>(['search', requireText(query, 'A search term is required.')]);
  });

  ipcMain.handle(IPC_CHANNELS.downloadVideo, async (_event, payload: DownloadPayloadInput) => {
    const { url, outputDir, quality } = resolveDownloadPayload(payload);

    return runDownloader<DownloadResult>(['download', url, outputDir, quality], {
      onEvent(message) {
        if (message.type === 'progress') {
          mainWindow?.webContents.send(IPC_CHANNELS.downloadProgress, message.data);
        }
      },
    });
  });
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

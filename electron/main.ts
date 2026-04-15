import { app, BrowserWindow, dialog, ipcMain, Menu, screen, type OpenDialogOptions } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import electronUpdater, { type AppUpdater, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater';

type DownloaderMessage =
  | { type: 'info' | 'search' | 'complete'; data: unknown }
  | { type: 'progress'; data: DownloadProgress }
  | { type: 'error'; error: string };

type DownloadPayloadInput = Partial<DownloadRequest> | undefined;
type PythonCommand = { command: string; args: string[] };
type DownloaderCommand = { command: string; args: string[] };

const DIST_ROOT = path.join(__dirname, '..');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const RENDERER_ENTRY = path.join(DIST_ROOT, 'renderer', 'index.html');

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
let pythonCommandCache: PythonCommand | null = null;
let updateAvailableNoticeShown = false;

const { autoUpdater } = electronUpdater;

function getProjectRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
}

function getDownloaderScriptPath(): string {
  return path.join(getProjectRoot(), 'backend', 'downloader.py');
}

function getPackagedDownloaderPath(): string | null {
  if (!app.isPackaged) {
    return null;
  }

  const executableName = process.platform === 'win32' ? 'downloader.exe' : 'downloader';
  const downloaderPath = path.join(getProjectRoot(), 'backend', executableName);
  return existsSync(downloaderPath) ? downloaderPath : null;
}

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

function showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

function canCheckForUpdates(): boolean {
  if (!app.isPackaged || process.env.DEXUX_DISABLE_AUTO_UPDATES === '1') {
    return false;
  }

  // AppImage updates only work when the app is running from a real AppImage bundle.
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return false;
  }

  return true;
}

function formatReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) {
    return null;
  }

  if (typeof releaseNotes === 'string') {
    return releaseNotes.trim() || null;
  }

  const sections = releaseNotes
    .map((note) => {
      const version = note.version ? `Version ${note.version}` : 'Update';
      const details = note.note?.trim();
      return details ? `${version}\n${details}` : version;
    })
    .filter(Boolean);

  return sections.length > 0 ? sections.join('\n\n') : null;
}

async function promptToInstallUpdate(updater: AppUpdater, event: UpdateDownloadedEvent): Promise<void> {
  const detailParts = ['A new DexuX Downloader update has been downloaded and is ready to install.'];
  const releaseNotes = formatReleaseNotes(event.releaseNotes);

  if (releaseNotes) {
    detailParts.push(`What changed:\n\n${releaseNotes}`);
  }

  const result = await showMessageBox({
    type: 'info',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update Ready',
    message: `Version ${event.version} is ready to install.`,
    detail: detailParts.join('\n\n'),
  });

  if (result.response === 0) {
    updater.quitAndInstall();
  }
}

function setupAutoUpdates(): void {
  if (!canCheckForUpdates()) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-update failed:', error);
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (updateAvailableNoticeShown) {
      return;
    }

    updateAvailableNoticeShown = true;
    const detailParts = ['DexuX Downloader found a new version and is downloading it in the background.'];
    const releaseNotes = formatReleaseNotes(info.releaseNotes);

    if (releaseNotes) {
      detailParts.push(`What changed:\n\n${releaseNotes}`);
    }

    void showMessageBox({
      type: 'info',
      buttons: ['OK'],
      defaultId: 0,
      title: 'Downloading Update',
      message: `Version ${info.version} is on the way.`,
      detail: detailParts.join('\n\n'),
    });
  });

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    void promptToInstallUpdate(autoUpdater, event);
  });

  void autoUpdater.checkForUpdates();
}

function isPythonCommandAvailable(candidate: PythonCommand): boolean {
  try {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    return result.status === 0;
  } catch {
    return false;
  }
}

function resolvePythonCommand(): PythonCommand {
  if (pythonCommandCache) {
    return pythonCommandCache;
  }

  const candidates: PythonCommand[] = [];

  if (process.env.PYTHON_PATH) {
    candidates.push({ command: process.env.PYTHON_PATH, args: [] });
  }

  const localVenvs = ['venv', '.venv'];

  for (const venvName of localVenvs) {
    const venvPythonPath = path.join(
      getProjectRoot(),
      venvName,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python',
    );

    if (existsSync(venvPythonPath)) {
      candidates.push({ command: venvPythonPath, args: [] });
    }
  }

  if (process.platform === 'win32') {
    candidates.push(
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    );
  } else {
    candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] });
  }

  for (const candidate of candidates) {
    if (isPythonCommandAvailable(candidate)) {
      pythonCommandCache = candidate;
      return candidate;
    }
  }

  throw new Error(
    'Python 3 was not found. Install python3 or set the PYTHON_PATH environment variable.',
  );
}

function resolveDownloaderCommand(): DownloaderCommand {
  const packagedDownloaderPath = getPackagedDownloaderPath();

  if (packagedDownloaderPath) {
    return { command: packagedDownloaderPath, args: [] };
  }

  if (app.isPackaged) {
    throw new Error('Packaged downloader backend is missing. Reinstall the app.');
  }

  const pythonCommand = resolvePythonCommand();
  return {
    command: pythonCommand.command,
    args: [...pythonCommand.args, getDownloaderScriptPath()],
  };
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
    downloadId: payload?.downloadId?.trim() || undefined,
    url: requireText(payload?.url, 'A video URL is required.'),
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
    let downloaderCommand: DownloaderCommand;

    try {
      downloaderCommand = resolveDownloaderCommand();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(downloaderCommand.command, [...downloaderCommand.args, ...args], {
      cwd: getProjectRoot(),
      windowsHide: true,
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
        settleReject(new Error(stderrBuffer.trim() || `Downloader process exited with code ${code}.`));
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
    return runDownloader<VideoInfo>(['info', requireText(url, 'A video URL is required.')]);
  });

  ipcMain.handle(IPC_CHANNELS.searchVideos, async (_event, query: string) => {
    return runDownloader<SearchResult[]>(['search', requireText(query, 'A search term is required.')]);
  });

  ipcMain.handle(IPC_CHANNELS.downloadVideo, async (_event, payload: DownloadPayloadInput) => {
    const { downloadId, url, outputDir, quality } = resolveDownloadPayload(payload);

    return runDownloader<DownloadResult>(['download', url, outputDir, quality], {
      onEvent(message) {
        if (message.type === 'progress') {
          mainWindow?.webContents.send(IPC_CHANNELS.downloadProgress, {
            ...(message.data as DownloadProgress),
            downloadId,
          } satisfies DownloadProgress);
        }
      },
    }).then((result) => ({
      ...result,
      downloadId,
    }));
  });
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();
  setupAutoUpdates();

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

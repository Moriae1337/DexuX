import { app, BrowserWindow, dialog, ipcMain, screen, type OpenDialogOptions } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';

type DownloaderMessage =
  | { type: 'info' | 'search' | 'complete'; data: unknown }
  | { type: 'progress'; data: DownloadProgress }
  | { type: 'error'; error: string };

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.max(860, Math.min(1440, Math.round(workAreaSize.width * 0.92)));
  const height = Math.max(620, Math.min(960, Math.round(workAreaSize.height * 0.92)));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 860,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function resolvePythonCommand(): string {
  const candidates = [process.env.PYTHON_PATH, 'python3', 'python'].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error('Python 3 was not found. Install python3 or set the PYTHON_PATH environment variable.');
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

    const scriptPath = path.join(__dirname, '..', 'backend', 'downloader.py');
    const child = spawn(pythonCommand, [scriptPath, ...args], {
      cwd: path.join(__dirname, '..'),
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

    const processMessageLine = (line: string): void => {
      if (!line.trim()) {
        return;
      }

      let message: DownloaderMessage;

      try {
        message = JSON.parse(line) as DownloaderMessage;
      } catch {
        stderrBuffer += `${line}\n`;
        return;
      }

      onEvent?.(message);

      if (message.type === 'info' || message.type === 'search' || message.type === 'complete') {
        settleResolve(message.data as T);
      }

      if (message.type === 'error') {
        settleReject(new Error(message.error));
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();

      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        processMessageLine(line);
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (error: Error) => {
      settleReject(error);
    });

    child.on('close', (code: number | null) => {
      if (stdoutBuffer.trim()) {
        processMessageLine(stdoutBuffer.trim());
      }

      if (code !== 0 && !settled) {
        settleReject(new Error(stderrBuffer.trim() || `Python process exited with code ${code}.`));
      }
    });
  });
}

ipcMain.handle('select-download-directory', async () => {
  const options: OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('fetch-video-info', async (_event, url: string) => {
  if (!url) {
    throw new Error('A YouTube URL is required.');
  }

  return runDownloader<VideoInfo>(['info', url]);
});

ipcMain.handle('search-videos', async (_event, query: string) => {
  const searchQuery = query?.trim();

  if (!searchQuery) {
    throw new Error('A search term is required.');
  }

  return runDownloader<SearchResult[]>(['search', searchQuery]);
});

ipcMain.handle('download-video', async (_event, payload: Partial<DownloadRequest> | undefined) => {
  const url = payload?.url?.trim();
  const outputDir = payload?.outputDir?.trim();
  const quality = payload?.quality || 'best';

  if (!url) {
    throw new Error('A YouTube URL is required.');
  }

  if (!outputDir) {
    throw new Error('Choose a download folder first.');
  }

  return runDownloader<DownloadResult>(['download', url, outputDir, quality], {
    onEvent(message) {
      if (message.type === 'progress') {
        mainWindow?.webContents.send('download-progress', message.data);
      }
    },
  });
});

void app.whenReady().then(() => {
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

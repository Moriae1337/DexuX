"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
let mainWindow = null;
function createWindow() {
    const { workAreaSize } = electron_1.screen.getPrimaryDisplay();
    const width = Math.max(860, Math.min(1440, Math.round(workAreaSize.width * 0.92)));
    const height = Math.max(620, Math.min(960, Math.round(workAreaSize.height * 0.92)));
    mainWindow = new electron_1.BrowserWindow({
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
function resolvePythonCommand() {
    const candidates = [process.env.PYTHON_PATH, 'python3', 'python'].filter(Boolean);
    for (const candidate of candidates) {
        const result = (0, node_child_process_1.spawnSync)(candidate, ['--version'], { encoding: 'utf8' });
        if (result.status === 0) {
            return candidate;
        }
    }
    throw new Error('Python 3 was not found. Install python3 or set the PYTHON_PATH environment variable.');
}
function runDownloader(args, { onEvent } = {}) {
    return new Promise((resolve, reject) => {
        let pythonCommand;
        try {
            pythonCommand = resolvePythonCommand();
        }
        catch (error) {
            reject(error);
            return;
        }
        const scriptPath = path.join(__dirname, '..', 'backend', 'downloader.py');
        const child = (0, node_child_process_1.spawn)(pythonCommand, [scriptPath, ...args], {
            cwd: path.join(__dirname, '..'),
        });
        let stdoutBuffer = '';
        let stderrBuffer = '';
        let settled = false;
        const settleResolve = (value) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        const settleReject = (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        };
        const processMessageLine = (line) => {
            if (!line.trim()) {
                return;
            }
            let message;
            try {
                message = JSON.parse(line);
            }
            catch {
                stderrBuffer += `${line}\n`;
                return;
            }
            onEvent?.(message);
            if (message.type === 'info' || message.type === 'search' || message.type === 'complete') {
                settleResolve(message.data);
            }
            if (message.type === 'error') {
                settleReject(new Error(message.error));
            }
        };
        child.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            let newlineIndex = stdoutBuffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = stdoutBuffer.slice(0, newlineIndex);
                stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
                processMessageLine(line);
                newlineIndex = stdoutBuffer.indexOf('\n');
            }
        });
        child.stderr.on('data', (chunk) => {
            stderrBuffer += chunk.toString();
        });
        child.on('error', (error) => {
            settleReject(error);
        });
        child.on('close', (code) => {
            if (stdoutBuffer.trim()) {
                processMessageLine(stdoutBuffer.trim());
            }
            if (code !== 0 && !settled) {
                settleReject(new Error(stderrBuffer.trim() || `Python process exited with code ${code}.`));
            }
        });
    });
}
electron_1.ipcMain.handle('select-download-directory', async () => {
    const options = {
        properties: ['openDirectory', 'createDirectory'],
    };
    const result = mainWindow
        ? await electron_1.dialog.showOpenDialog(mainWindow, options)
        : await electron_1.dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});
electron_1.ipcMain.handle('fetch-video-info', async (_event, url) => {
    if (!url) {
        throw new Error('A YouTube URL is required.');
    }
    return runDownloader(['info', url]);
});
electron_1.ipcMain.handle('search-videos', async (_event, query) => {
    const searchQuery = query?.trim();
    if (!searchQuery) {
        throw new Error('A search term is required.');
    }
    return runDownloader(['search', searchQuery]);
});
electron_1.ipcMain.handle('download-video', async (_event, payload) => {
    const url = payload?.url?.trim();
    const outputDir = payload?.outputDir?.trim();
    const quality = payload?.quality || 'best';
    if (!url) {
        throw new Error('A YouTube URL is required.');
    }
    if (!outputDir) {
        throw new Error('Choose a download folder first.');
    }
    return runDownloader(['download', url, outputDir, quality], {
        onEvent(message) {
            if (message.type === 'progress') {
                mainWindow?.webContents.send('download-progress', message.data);
            }
        },
    });
});
void electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

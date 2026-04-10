# DexuX Downloader

Electron desktop app with a Python backend for inspecting and downloading YouTube videos with `yt-dlp`.

## What it does

- Paste a YouTube URL and inspect the title, uploader, duration, and available resolutions.
- Pick a destination folder from a native desktop dialog.
- Download the best available video or cap the output at `1080p`, `720p`, or `480p`.
- View progress updates inside the desktop UI.

## Setup

1. Install Node.js 18+ and Python 3.10+.
2. Install `ffmpeg` and make sure it is available on your `PATH`.
3. Install Electron dependencies:

```bash
npm install
```

4. Create a virtual environment and install Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

5. Start the desktop app:

```bash
npm start
```

## Notes

- `yt-dlp` uses `ffmpeg` to merge separate video and audio streams for higher resolutions.
- Downloading videos may be subject to the source platform's rules and your local rights to the content.

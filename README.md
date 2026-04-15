# DexuX Downloader

Electron desktop app with a Python backend for inspecting and downloading videos with `yt-dlp`.

## What it does

- Paste a YouTube or TikTok URL and inspect the title, uploader, duration, and available resolutions.
- Search YouTube by title and browse the results in a visual board.
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

## Packaging

- `npm run package:linux` and `npm run package:win` build a standalone downloader executable with PyInstaller and bundle it into the desktop app.
- End users on Linux and Windows do not need Python or `yt-dlp` installed to use the packaged app.
- Build each release on its target OS so PyInstaller can produce a native backend binary for that platform.
- The build machine still needs Python available to create the standalone backend.
- `ffmpeg` is still expected on the target machine `PATH` for merge-heavy downloads.
- Auto-update metadata is published from GitHub Releases, using the `dexux-youtube-downloader-v*` tags created by `release-please`.

## Notes

- `yt-dlp` uses `ffmpeg` to merge separate video and audio streams for higher resolutions.
- Downloading videos may be subject to the source platform's rules and your local rights to the content.

## Releases

- This repo uses `release-please` to open and maintain release PRs from conventional commit history on `main`.
- Merge the release PR to publish a GitHub release and bump the version in `package.json` and `.release-please-manifest.json`.

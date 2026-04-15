from __future__ import annotations

import sys

from .cli import DownloaderCli
from .emitter import JsonEmitter


def main() -> None:
    emitter = JsonEmitter()

    try:
        from yt_dlp.utils import DownloadError
        from .service import DownloaderService
    except ImportError:
        emitter.emit(
            "error",
            error="Missing Python dependency: yt-dlp. Run `pip install -r requirements.txt` in development.",
        )
        raise SystemExit(1) from None

    service = DownloaderService(emitter)
    cli = DownloaderCli(service, emitter)

    try:
        cli.run(sys.argv[1:])
    except DownloadError as exc:
        emitter.emit("error", error=str(exc))
        raise SystemExit(1) from exc
    except Exception as exc:  # noqa: BLE001
        emitter.emit("error", error=str(exc))
        raise SystemExit(1) from exc

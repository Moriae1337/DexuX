from __future__ import annotations

from collections.abc import Callable

from .emitter import JsonEmitter
from .service import DownloaderService


class DownloaderCli:
    def __init__(self, service: DownloaderService, emitter: JsonEmitter) -> None:
        self.service = service
        self.emitter = emitter
        self.command_handlers: dict[str, Callable[[list[str]], None]] = {
            "info": self.handle_info_command,
            "search": self.handle_search_command,
            "download": self.handle_download_command,
            "inspect-media": self.handle_inspect_media_command,
        }

    def run(self, argv: list[str]) -> None:
        command = self.require_argument(
            argv,
            0,
            "Usage: downloader.py <info|search|download> <url_or_query> [output_dir] [quality]",
        )
        args = argv[1:]

        handler = self.command_handlers.get(command)
        if handler is None:
            self.emitter.emit("error", error=f"Unknown command: {command}")
            raise SystemExit(1)

        handler(args)

    def handle_info_command(self, args: list[str]) -> None:
        self.service.extract_video_info(self.require_argument(args, 0, "A video URL is required."))

    def handle_search_command(self, args: list[str]) -> None:
        self.service.search_videos(self.require_argument(args, 0, "A search term is required."))

    def handle_download_command(self, args: list[str]) -> None:
        url = self.require_argument(args, 0, "A video URL is required.")
        output_dir = self.require_argument(args, 1, "A download directory is required.")
        quality = args[2] if len(args) > 2 else "best"
        referer = args[3] if len(args) > 3 and args[3] else None
        self.service.download_video(url, output_dir, quality, referer)

    def handle_inspect_media_command(self, args: list[str]) -> None:
        self.service.inspect_media_url(self.require_argument(args, 0, "A URL is required."))

    def require_argument(self, args: list[str], index: int, error_message: str) -> str:
        try:
            return args[index]
        except IndexError as exc:
            self.emitter.emit("error", error=error_message)
            raise SystemExit(1) from exc

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL

from .constants import QUALITY_SELECTORS, READ_ONLY_YTDLP_OPTIONS
from .emitter import JsonEmitter


class DownloaderService:
    def __init__(self, emitter: JsonEmitter) -> None:
        self.emitter = emitter

    def extract_video_info(self, url: str) -> None:
        with YoutubeDL(READ_ONLY_YTDLP_OPTIONS) as ydl:
            info = ydl.extract_info(url, download=False)

        self.emitter.emit("info", self._build_video_payload(info, url))

    def search_videos(self, query: str) -> None:
        with YoutubeDL(READ_ONLY_YTDLP_OPTIONS) as ydl:
            info = ydl.extract_info(f"ytsearch10:{query}", download=False)

        entries = info.get("entries") or []
        results = []

        for item in entries:
            if not item:
                continue

            result = self._build_search_result(item)
            if result["webpageUrl"]:
                results.append(result)

        self.emitter.emit("search", results)

    def download_video(self, url: str, output_dir: str, quality: str) -> None:
        destination = Path(output_dir).expanduser().resolve()
        destination.mkdir(parents=True, exist_ok=True)

        with YoutubeDL(self._build_download_options(destination, quality, self._emit_download_progress)) as ydl:
            info = ydl.extract_info(url, download=True)
            output_path = Path(ydl.prepare_filename(info))

        final_extension = info.get("ext") or output_path.suffix.lstrip(".")
        final_path = output_path.with_suffix(f".{final_extension}")

        self.emitter.emit(
            "complete",
            {
                "title": info.get("title"),
                "path": str(final_path),
                "quality": quality,
            },
        )

    def _build_download_options(
        self,
        destination: Path,
        quality: str,
        progress_hook: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        return {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": self._build_format_selector(quality),
            "paths": {"home": str(destination)},
            "outtmpl": {"default": "%(title).180B [%(id)s].%(ext)s"},
            "merge_output_format": "mp4",
            "progress_hooks": [progress_hook],
        }

    def _emit_download_progress(self, progress: dict[str, Any]) -> None:
        status = progress.get("status")

        if status == "downloading":
            downloaded = progress.get("downloaded_bytes") or 0
            total = progress.get("total_bytes") or progress.get("total_bytes_estimate")
            percent = round((downloaded / total) * 100, 2) if total else None

            self.emitter.emit(
                "progress",
                {
                    "status": "downloading",
                    "percent": percent,
                    "downloaded": self._human_bytes(downloaded),
                    "total": self._human_bytes(total),
                    "speed": self._human_speed(progress.get("speed")),
                    "eta": progress.get("eta"),
                },
            )
            return

        if status == "finished":
            self.emitter.emit(
                "progress",
                {
                    "status": "processing",
                    "percent": 100,
                    "message": "Finalizing video file...",
                },
            )

    def _build_video_payload(self, info: dict[str, Any], fallback_url: str | None = None) -> dict[str, Any]:
        return {
            "id": info.get("id"),
            "title": info.get("title") or "Untitled video",
            "uploader": info.get("uploader") or "Unknown creator",
            "duration": self._seconds_to_text(info.get("duration")),
            "thumbnail": self._pick_thumbnail(info),
            "webpageUrl": info.get("webpage_url") or fallback_url,
            "availableQualities": self._available_qualities(info),
        }

    def _build_search_result(self, item: dict[str, Any]) -> dict[str, Any]:
        webpage_url = item.get("webpage_url")
        if not webpage_url and item.get("id"):
            webpage_url = f"https://www.youtube.com/watch?v={item['id']}"

        return {
            "id": item.get("id"),
            "title": item.get("title") or "Untitled video",
            "uploader": item.get("uploader") or "Unknown creator",
            "duration": self._seconds_to_text(item.get("duration")),
            "thumbnail": self._pick_thumbnail(item),
            "webpageUrl": webpage_url,
        }

    def _build_format_selector(self, quality: str) -> str:
        return QUALITY_SELECTORS.get(quality, QUALITY_SELECTORS["best"])

    def _available_qualities(self, info: dict[str, Any]) -> list[str]:
        heights = sorted(
            {
                item.get("height")
                for item in info.get("formats", [])
                if item.get("height") and item.get("vcodec") != "none"
            },
            reverse=True,
        )

        return [f"{height}p" for height in heights]

    def _pick_thumbnail(self, info: dict[str, Any]) -> str | None:
        thumbnail = info.get("thumbnail")
        if thumbnail:
            return str(thumbnail)

        thumbnails = info.get("thumbnails") or []
        if thumbnails:
            return thumbnails[-1].get("url")

        return None

    def _seconds_to_text(self, value: Any) -> str:
        if not value:
            return "Unknown"

        total_seconds = int(value)
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"

        return f"{minutes}:{seconds:02d}"

    def _human_bytes(self, value: Any) -> str | None:
        if value in (None, 0):
            return None

        size = float(value)
        units = ["B", "KB", "MB", "GB", "TB"]

        for unit in units:
            if size < 1024 or unit == units[-1]:
                return f"{size:.1f} {unit}"
            size /= 1024

        return None

    def _human_speed(self, value: Any) -> str | None:
        display = self._human_bytes(value)
        return f"{display}/s" if display else None

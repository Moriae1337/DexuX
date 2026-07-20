from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlparse
from urllib.request import Request, urlopen
from typing import Any

from yt_dlp import YoutubeDL

from .constants import QUALITY_SELECTORS, READ_ONLY_YTDLP_OPTIONS
from .emitter import JsonEmitter

try:
    import imageio_ffmpeg
except Exception:  # pragma: no cover - optional fallback for developer machines without bundled ffmpeg.
    imageio_ffmpeg = None


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

    def download_video(self, url: str, output_dir: str, quality: str, referer: str | None = None) -> None:
        destination = Path(output_dir).expanduser().resolve()
        destination.mkdir(parents=True, exist_ok=True)

        if self._is_direct_media_url(url):
            self._download_direct_media(url, destination, quality, referer)
            return

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

    def inspect_media_url(self, url: str) -> None:
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://dexux.app/",
                "Accept": "*/*",
            },
        )

        with urlopen(request) as response:
            final_url = response.geturl()
            mime_type = response.headers.get("Content-Type")
            status_code = response.status
            direct_kind = self._detect_media_kind(final_url, mime_type)

            if direct_kind:
                self.emitter.emit(
                    "info",
                    [
                        self._build_detected_media(
                            final_url,
                            direct_kind,
                            url,
                            mime_type,
                            status_code,
                            self._media_confidence(direct_kind, mime_type, status_code),
                        )
                    ],
                )
                return

            content_type = (mime_type or "").lower()
            if "text/" not in content_type and "json" not in content_type and "javascript" not in content_type:
                self.emitter.emit("info", [])
                return

            page_text = response.read(1024 * 1024).decode("utf-8", errors="ignore")

        detected: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for raw_candidate in re.findall(r"""(?:"|')([^"']+(?:\.m3u8|\.mp4)[^"']*)(?:"|')""", page_text, flags=re.I):
            candidate = raw_candidate.replace("\\/", "/")
            resolved_url = urljoin(url, candidate)

            if resolved_url in seen_urls:
                continue

            kind = self._detect_media_kind(resolved_url)

            if not kind:
                continue

            seen_urls.add(resolved_url)
            detected.append(self._build_detected_media(resolved_url, kind, url, None, None, "candidate"))

        self.emitter.emit("info", detected)

    def _download_direct_media(self, url: str, destination: Path, quality: str, referer: str | None) -> None:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        extension = self._infer_direct_media_extension(url)
        title = self._infer_direct_media_title(url)
        safe_title = self._sanitize_filename(title)
        output_path = destination / f"{safe_title}.{extension}"
        resolved_referer = referer or (f"{parsed.scheme}://{parsed.netloc}/" if parsed.scheme and parsed.netloc else url)
        resolved_origin = self._infer_origin_from_referer(resolved_referer)

        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": resolved_referer,
                "Origin": resolved_origin,
                "Accept": "*/*",
            },
        )

        with urlopen(request) as response, output_path.open("wb") as output_file:
            total_header = response.headers.get("Content-Length")
            total_bytes = int(total_header) if total_header and total_header.isdigit() else None
            downloaded_bytes = 0

            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break

                output_file.write(chunk)
                downloaded_bytes += len(chunk)
                percent = round((downloaded_bytes / total_bytes) * 100, 2) if total_bytes else None

                self.emitter.emit(
                    "progress",
                    {
                        "status": "downloading",
                        "percent": percent,
                        "downloaded": self._human_bytes(downloaded_bytes),
                        "total": self._human_bytes(total_bytes),
                        "speed": None,
                        "eta": None,
                    },
                )

        media_title = query.get("id", [title])[0] if query.get("id") else title

        self.emitter.emit(
            "progress",
            {
                "status": "processing",
                "percent": 100,
                "message": "Finalizing video file...",
            },
        )

        self.emitter.emit(
            "complete",
            {
                "title": media_title,
                "path": str(output_path),
                "quality": quality,
            },
        )

    def _build_download_options(
        self,
        destination: Path,
        quality: str,
        progress_hook: Callable[[dict[str, Any]], None],
    ) -> dict[str, Any]:
        options: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "format": self._build_format_selector(quality),
            "paths": {"home": str(destination)},
            "outtmpl": {"default": "%(title).180B [%(id)s].%(ext)s"},
            "merge_output_format": "mp4",
            "final_ext": "mp4",
            "prefer_ffmpeg": True,
            "postprocessors": [
                {
                    "key": "FFmpegVideoRemuxer",
                    "preferedformat": "mp4",
                }
            ],
            "progress_hooks": [progress_hook],
        }

        ffmpeg_location = self._resolve_ffmpeg_location()
        if ffmpeg_location:
            options["ffmpeg_location"] = ffmpeg_location

        return options

    def _resolve_ffmpeg_location(self) -> str | None:
        if imageio_ffmpeg is None:
            return None

        try:
            return str(imageio_ffmpeg.get_ffmpeg_exe())
        except Exception:
            return None

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
        if quality in QUALITY_SELECTORS:
            return QUALITY_SELECTORS[quality]

        match = re.fullmatch(r"(\d{3,4})p", quality.strip().lower())
        if match:
            height = int(match.group(1))
            return (
                f"bv*[height<={height}][ext=mp4][vcodec^=avc1]+ba[ext=m4a]/"
                f"bv*[height<={height}][ext=mp4]+ba[ext=m4a]/"
                f"b[height<={height}][ext=mp4]/"
                f"b[height<={height}]"
            )

        return QUALITY_SELECTORS["best"]

    def _is_direct_media_url(self, url: str) -> bool:
        return self._detect_media_kind(url) == "mp4"

    def _detect_media_kind(self, url: str, mime_type: str | None = None) -> str | None:
        lowered_url = url.lower()
        lowered_mime = (mime_type or "").lower()

        if (
            ".m3u8" in lowered_url
            or "application/vnd.apple.mpegurl" in lowered_mime
            or "application/x-mpegurl" in lowered_mime
        ):
            return "m3u8"

        if (
            ".mp4" in lowered_url
            or "mime=video/mp4" in lowered_url
            or "mime=audio/mp4" in lowered_url
            or lowered_url.endswith(".m4v")
            or "video/mp4" in lowered_mime
            or "audio/mp4" in lowered_mime
        ):
            return "mp4"

        return None

    def _media_confidence(self, kind: str, mime_type: str | None, status_code: int | None) -> str:
        lowered_mime = (mime_type or "").lower()

        if status_code is not None and status_code >= 400:
            return "blocked"

        if kind == "m3u8" and (
            "application/vnd.apple.mpegurl" in lowered_mime
            or "application/x-mpegurl" in lowered_mime
            or status_code in {200, 206}
        ):
            return "confirmed"

        if kind == "mp4" and ("video/mp4" in lowered_mime or "audio/mp4" in lowered_mime or status_code in {200, 206}):
            return "confirmed"

        return "candidate"

    def _build_detected_media(
        self,
        url: str,
        kind: str,
        source_url: str | None,
        mime_type: str | None,
        status_code: int | None,
        confidence: str,
    ) -> dict[str, Any]:
        return {
            "url": url,
            "kind": kind,
            "sourceUrl": source_url,
            "mimeType": mime_type,
            "statusCode": status_code,
            "confidence": confidence,
        }

    def _infer_direct_media_extension(self, url: str) -> str:
        return "mp4"

    def _infer_direct_media_title(self, url: str) -> str:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)

        for key in ("title", "id", "filename", "name"):
            value = query.get(key, [None])[0]
            if value:
                return str(unquote(value))

        path_name = Path(parsed.path).name
        if path_name:
            return Path(unquote(path_name)).stem or "direct-media"

        return "direct-media"

    def _sanitize_filename(self, value: str) -> str:
        cleaned = "".join(character if character not in '<>:"/\\|?*' else "_" for character in value).strip()
        return cleaned[:180] or "direct-media"

    def _infer_origin_from_referer(self, referer: str) -> str:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
        return referer

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

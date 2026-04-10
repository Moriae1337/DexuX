#!/usr/bin/env python3
import json
import sys
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError
except ImportError:
    payload = {
        "type": "error",
        "error": "Missing Python dependency: yt-dlp. Run `pip install -r requirements.txt`.",
    }
    print(json.dumps(payload), flush=True)
    raise SystemExit(1)


def emit(message_type, data=None, error=None):
    payload = {"type": message_type}
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = error
    print(json.dumps(payload), flush=True)


def seconds_to_text(value):
    if not value:
        return "Unknown"

    value = int(value)
    hours, remainder = divmod(value, 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def human_bytes(value):
    if value in (None, 0):
        return None

    size = float(value)
    units = ["B", "KB", "MB", "GB", "TB"]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return None


def human_speed(value):
    display = human_bytes(value)
    return f"{display}/s" if display else None


def pick_thumbnail(info):
    if info.get("thumbnail"):
        return info.get("thumbnail")

    thumbnails = info.get("thumbnails") or []
    if thumbnails:
        return thumbnails[-1].get("url")

    return None


def build_video_payload(info, fallback_url=None):
    heights = sorted(
        {
            item.get("height")
            for item in info.get("formats", [])
            if item.get("height") and item.get("vcodec") != "none"
        },
        reverse=True,
    )

    return {
        "id": info.get("id"),
        "title": info.get("title") or "Untitled video",
        "uploader": info.get("uploader") or "Unknown creator",
        "duration": seconds_to_text(info.get("duration")),
        "thumbnail": pick_thumbnail(info),
        "webpageUrl": info.get("webpage_url") or fallback_url,
        "availableQualities": [f"{height}p" for height in heights],
    }


def build_search_result(item):
    webpage_url = item.get("webpage_url")
    if not webpage_url and item.get("id"):
        webpage_url = f"https://www.youtube.com/watch?v={item['id']}"

    return {
        "id": item.get("id"),
        "title": item.get("title") or "Untitled video",
        "uploader": item.get("uploader") or "Unknown creator",
        "duration": seconds_to_text(item.get("duration")),
        "thumbnail": pick_thumbnail(item),
        "webpageUrl": webpage_url,
    }


def build_format_selector(quality):
    quality_map = {
        "best": "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b",
        "1080p": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]",
        "720p": "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]",
        "480p": "bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=480]",
    }
    return quality_map.get(quality, quality_map["best"])


def extract_video_info(url):
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    emit("info", build_video_payload(info, url))


def search_videos(query):
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(f"ytsearch10:{query}", download=False)

    entries = info.get("entries") or []
    results = []

    for item in entries:
        if not item:
            continue

        result = build_search_result(item)
        if result["webpageUrl"]:
            results.append(result)

    emit("search", results)


def download_video(url, output_dir, quality):
    destination = Path(output_dir).expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)

    def progress_hook(progress):
        status = progress.get("status")

        if status == "downloading":
            downloaded = progress.get("downloaded_bytes") or 0
            total = progress.get("total_bytes") or progress.get("total_bytes_estimate")
            percent = round((downloaded / total) * 100, 2) if total else None

            emit(
                "progress",
                {
                    "status": "downloading",
                    "percent": percent,
                    "downloaded": human_bytes(downloaded),
                    "total": human_bytes(total),
                    "speed": human_speed(progress.get("speed")),
                    "eta": progress.get("eta"),
                },
            )

        if status == "finished":
            emit(
                "progress",
                {
                    "status": "processing",
                    "percent": 100,
                    "message": "Finalizing video file...",
                },
            )

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": build_format_selector(quality),
        "paths": {"home": str(destination)},
        "outtmpl": {"default": "%(title).180B [%(id)s].%(ext)s"},
        "merge_output_format": "mp4",
        "progress_hooks": [progress_hook],
    }

    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
        output_path = Path(ydl.prepare_filename(info))

        final_extension = info.get("ext") or output_path.suffix.lstrip(".")
        final_path = output_path.with_suffix(f".{final_extension}")

    emit(
        "complete",
        {
            "title": info.get("title"),
            "path": str(final_path),
            "quality": quality,
        },
    )


def main():
    if len(sys.argv) < 3:
        emit(
            "error",
            error="Usage: downloader.py <info|search|download> <url_or_query> [output_dir] [quality]",
        )
        raise SystemExit(1)

    command = sys.argv[1]
    url = sys.argv[2]

    try:
        if command == "info":
            extract_video_info(url)
            return

        if command == "search":
            search_videos(url)
            return

        if command == "download":
            if len(sys.argv) < 4:
                emit("error", error="A download directory is required.")
                raise SystemExit(1)

            output_dir = sys.argv[3]
            quality = sys.argv[4] if len(sys.argv) > 4 else "best"
            download_video(url, output_dir, quality)
            return

        emit("error", error=f"Unknown command: {command}")
        raise SystemExit(1)
    except DownloadError as exc:
        emit("error", error=str(exc))
        raise SystemExit(1)
    except Exception as exc:  # noqa: BLE001
        emit("error", error=str(exc))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
from typing import Any


class JsonEmitter:
    def emit(self, message_type: str, data: Any = None, error: str | None = None) -> None:
        payload: dict[str, Any] = {"type": message_type}

        if data is not None:
            payload["data"] = data

        if error is not None:
            payload["error"] = error

        print(json.dumps(payload), flush=True)

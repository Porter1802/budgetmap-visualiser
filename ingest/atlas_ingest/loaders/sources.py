"""HTTP/file helpers for fetching source payloads."""
from __future__ import annotations

import json
import os
import urllib.request

UA = os.environ.get("HTTP_UA", "qld-atlas-ingest/0.4 (contact jake1802@gmail.com)")


def fetch_json(url: str, timeout: int = 180):
    """GET a JSON document from an http(s) URL or read a local file path."""
    if url.startswith("http://") or url.startswith("https://"):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    with open(url, encoding="utf-8") as fh:
        return json.load(fh)


# QLD bounding box — guards against stray null-island / interstate coords.
QLD_BBOX = (137.5, -29.5, 154.5, -9.5)


def in_qld(lon, lat) -> bool:
    return (
        lon is not None
        and lat is not None
        and QLD_BBOX[0] <= lon <= QLD_BBOX[2]
        and QLD_BBOX[1] <= lat <= QLD_BBOX[3]
    )

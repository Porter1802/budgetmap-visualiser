"""Dagster assets for context layers (asset group: context)."""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

from dagster import asset

from ..loaders import context as L
from ..loaders.sources import in_qld

GROUP = "context"

_NOMINATIM = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
_UA = os.environ.get("NOMINATIM_UA", "qld-atlas/0.4 (contact jake1802@gmail.com)")
_CACHE = os.environ.get("GEOCODE_CACHE", "/tmp/atlas_geocode_cache.json")


def _make_geocoder():
    cache = json.loads(open(_CACHE).read()) if os.path.exists(_CACHE) else {}

    def geocode(name, address):
        if name in cache:
            return cache[name]
        coord = None
        for q in (f"{name}, Queensland, Australia", f"{address}, Queensland, Australia"):
            params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "au"})
            try:
                req = urllib.request.Request(f"{_NOMINATIM}?{params}", headers={"User-Agent": _UA})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    hits = json.loads(resp.read())
                time.sleep(1.2)
                if hits:
                    coord = [float(hits[0]["lon"]), float(hits[0]["lat"])]
                    break
            except Exception:
                time.sleep(1)
        cache[name] = coord
        open(_CACHE, "w").write(json.dumps(cache))
        return coord

    return geocode


@asset(group_name=GROUP, compute_kind="api")
def schools(context) -> None:
    context.add_output_metadata({"rows": L.load_schools()})


@asset(group_name=GROUP, compute_kind="api")
def hospitals(context) -> None:
    context.add_output_metadata({"rows": L.load_hospitals(geocode=_make_geocoder())})


@asset(group_name=GROUP, compute_kind="abs")
def seifa(context) -> None:
    path = os.environ.get("SEIFA_CSV")
    if not path:
        context.log.warning("SEIFA_CSV not set; skipping")
        return
    context.add_output_metadata({"rows": L.load_seifa_csv(path)})


@asset(group_name=GROUP, compute_kind="abs")
def population_erp(context) -> None:
    path = os.environ.get("ERP_CSV")
    if not path:
        context.log.warning("ERP_CSV not set; skipping")
        return
    context.add_output_metadata({"rows": L.load_erp_csv(path)})

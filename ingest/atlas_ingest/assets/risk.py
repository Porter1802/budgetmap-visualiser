"""Dagster assets for risk & environment layers (asset group: risk)."""
from __future__ import annotations

import os

from dagster import asset

from ..loaders import risk as L

GROUP = "risk"


@asset(group_name=GROUP, compute_kind="postgis")
def flood_extents(context) -> None:
    src = os.environ.get("FLOOD_GEOJSON")
    if not src:
        context.log.warning("FLOOD_GEOJSON not set; skipping")
        return
    context.add_output_metadata({"rows": L.load_flood(src)})


@asset(group_name=GROUP, compute_kind="postgis")
def bushfire_history(context) -> None:
    src = os.environ.get("BUSHFIRE_GEOJSON")
    if not src:
        context.log.warning("BUSHFIRE_GEOJSON not set; skipping")
        return
    context.add_output_metadata({"rows": L.load_bushfire(src)})


@asset(group_name=GROUP, compute_kind="abs")
def tree_canopy(context) -> None:
    path = os.environ.get("CANOPY_CSV")
    if not path:
        context.log.warning("CANOPY_CSV not set; skipping")
        return
    context.add_output_metadata({"rows": L.load_canopy_csv(path)})

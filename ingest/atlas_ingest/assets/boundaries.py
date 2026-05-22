"""Dagster assets for reference geographies (asset group: boundaries).

Thin wrappers over the plain loaders so the logic stays unit-testable. ABS ASGS
sources are configured via env (ABS ships shapefiles; the homelab asset converts
shp -> GeoJSON with ogr2ogr before calling the loader). RDP needs no conversion.
"""
from __future__ import annotations

import os

from dagster import MetadataValue, asset

from ..loaders import boundaries as L

GROUP = "boundaries"


@asset(group_name=GROUP, compute_kind="postgis")
def rdp_regions(context) -> None:
    """The 22 RDP regions the budget API tags projects with."""
    n = L.load_rdp()
    context.add_output_metadata({"regions": n})


@asset(group_name=GROUP, compute_kind="postgis")
def sa2_boundaries(context) -> None:
    """ABS ASGS 2021 SA2 polygons (primary analytical unit)."""
    src = os.environ.get("SA2_GEOJSON")
    if not src:
        context.log.warning("SA2_GEOJSON not set; skipping SA2 load")
        return
    n = L.load_sa2(src)
    context.add_output_metadata({"sa2": n, "source": MetadataValue.path(src)})


@asset(group_name=GROUP, compute_kind="postgis")
def lga_boundaries(context) -> None:
    """ABS ASGS 2021 LGA polygons."""
    src = os.environ.get("LGA_GEOJSON")
    if not src:
        context.log.warning("LGA_GEOJSON not set; skipping LGA load")
        return
    n = L.load_lga(src)
    context.add_output_metadata({"lga": n})

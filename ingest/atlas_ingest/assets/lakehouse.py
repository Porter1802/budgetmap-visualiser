"""Dagster asset for the GeoParquet lakehouse mirror (asset group: lakehouse)."""
from __future__ import annotations

from dagster import asset

from ..loaders import lakehouse as L
from .projects import capital_projects

GROUP = "lakehouse"


@asset(group_name=GROUP, compute_kind="duckdb", deps=[capital_projects])
def geoparquet_mirror(context) -> None:
    """Export PostGIS tables to GeoParquet (MinIO/S3 or local dir)."""
    context.add_output_metadata(L.export_geoparquet())

"""Dagster asset for the SA2 spatial join (asset group: derived)."""
from __future__ import annotations

from dagster import asset

from ..loaders import spatial as L
from .boundaries import sa2_boundaries
from .projects import capital_projects

GROUP = "derived"


@asset(
    group_name=GROUP,
    compute_kind="postgis",
    deps=[capital_projects, sa2_boundaries],
)
def project_location_sa2(context) -> None:
    """Allocate each location to the SA2s it touches, by overlap fraction."""
    rows = L.refresh_sa2_join()
    context.add_output_metadata({"rows": rows})

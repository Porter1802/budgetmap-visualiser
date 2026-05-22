"""Dagster assets for capital projects (asset group: projects)."""
from __future__ import annotations

from dagster import asset

from ..loaders import projects as L

GROUP = "projects"


@asset(group_name=GROUP, compute_kind="api")
def capital_projects(context) -> None:
    """Pull /api/projects + /api/bp3projects live into the canonical tables."""
    counts = L.load_projects()
    context.add_output_metadata(counts)

"""Dagster assets for transit (asset group: transit)."""
from __future__ import annotations

from dagster import asset

from ..db import connect
from ..loaders import transit as L
from .boundaries import sa2_boundaries

GROUP = "transit"


@asset(group_name=GROUP, compute_kind="gtfs")
def gtfs_static(context) -> None:
    """Load Translink GTFS-static routes + stops."""
    context.add_output_metadata(L.load_gtfs())


@asset(group_name=GROUP, compute_kind="pgrouting", deps=[gtfs_static, sa2_boundaries])
def transit_isochrones(context) -> None:
    """Build the routable graph and 30-min isochrone per SA2 centroid."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT build_transit_graph(30.0)")
        edges = cur.fetchone()[0]
        cur.execute("SELECT build_transit_isochrones(30.0)")
        isochrones = cur.fetchone()[0]
    context.add_output_metadata({"edges": edges, "isochrones": isochrones})

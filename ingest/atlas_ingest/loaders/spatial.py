"""Derived spatial joins: populate project_location_sa2 via the DB function."""
from __future__ import annotations

from ..db import connect


def refresh_sa2_join() -> int:
    """Recompute project_location_sa2 for every location. Returns row count."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT refresh_project_location_sa2(NULL)")
        cur.execute("SELECT count(*) FROM project_location_sa2")
        return cur.fetchone()[0]

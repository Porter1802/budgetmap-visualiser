"""Connection pool + query helpers for the API."""
from __future__ import annotations

import os

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "postgresql://atlas:atlas@localhost:5432/atlas")


pool = ConnectionPool(database_url(), min_size=1, max_size=8, open=False)


def query(sql: str, params: tuple = ()) -> list[dict]:
    with pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None

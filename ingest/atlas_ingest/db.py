"""Thin Postgres helpers shared by every loader.

Loaders are plain functions (no Dagster import) so they can be unit-tested and
run from the CLI against a local Postgres; the Dagster assets in ``assets/`` are
thin wrappers over them.
"""
from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg

try:  # optional: load .env when present (local dev)
    from dotenv import load_dotenv

    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
except Exception:  # pragma: no cover - dotenv is convenience only
    pass


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    user = os.environ.get("POSTGRES_USER", "atlas")
    pw = os.environ.get("POSTGRES_PASSWORD", "atlas")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "atlas")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


@contextmanager
def connect():
    conn = psycopg.connect(database_url())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

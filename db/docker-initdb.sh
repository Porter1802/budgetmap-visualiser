#!/bin/bash
# Runs once on first DB init inside the postgis container. Sqitch's
# 0001-extensions repeats these idempotently; this just guarantees a fresh
# volume has them before migrations run.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS postgis_topology;
  CREATE EXTENSION IF NOT EXISTS postgis_raster;
  CREATE EXTENSION IF NOT EXISTS pgrouting;
  CREATE EXTENSION IF NOT EXISTS h3;
  CREATE EXTENSION IF NOT EXISTS h3_postgis;
SQL

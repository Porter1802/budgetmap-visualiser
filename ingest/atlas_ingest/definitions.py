"""Dagster code location: assets, the nightly ingest job, and lineage sensors."""
from __future__ import annotations

from dagster import (
    AssetSelection,
    Definitions,
    ScheduleDefinition,
    define_asset_job,
    load_assets_from_package_module,
)

from . import assets
from .lineage import openlineage_failure_sensor, openlineage_success_sensor

all_assets = load_assets_from_package_module(assets)

# Nightly refresh: pull projects live, reload boundaries, recompute the SA2 join.
ingest_job = define_asset_job("nightly_ingest", selection=AssetSelection.all())

nightly_schedule = ScheduleDefinition(
    job=ingest_job,
    cron_schedule="0 15 * * *",  # 01:00 AEST
)

defs = Definitions(
    assets=all_assets,
    jobs=[ingest_job],
    schedules=[nightly_schedule],
    sensors=[openlineage_success_sensor, openlineage_failure_sensor],
)

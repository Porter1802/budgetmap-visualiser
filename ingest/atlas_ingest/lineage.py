"""OpenLineage wiring (emits to Marquez when OPENLINEAGE_URL is set).

Kept import-safe: if openlineage-python isn't installed or no endpoint is
configured, the sensor degrades to a no-op so the rest of Dagster still loads.
"""
from __future__ import annotations

import os

from dagster import DefaultSensorStatus, RunStatusSensorContext, run_status_sensor
from dagster import DagsterRunStatus


def _emit(event_type: str, ctx: RunStatusSensorContext) -> None:
    url = os.environ.get("OPENLINEAGE_URL")
    if not url:
        return
    try:
        from openlineage.client import OpenLineageClient
        from openlineage.client.run import Job, Run, RunEvent, RunState
        from openlineage.client.uuid import generate_new_uuid
    except Exception:  # pragma: no cover - lineage is optional
        ctx.log.warning("openlineage-python not available; skipping emit")
        return

    client = OpenLineageClient(url=url)
    namespace = os.environ.get("OPENLINEAGE_NAMESPACE", "atlas")
    run = Run(runId=str(generate_new_uuid()))
    job = Job(namespace=namespace, name=ctx.dagster_run.job_name)
    client.emit(
        RunEvent(
            eventType=RunState[event_type],
            eventTime=__import__("datetime").datetime.now().isoformat(),
            run=run,
            job=job,
            producer="https://github.com/porter1802/budgetmap-visualiser",
        )
    )


@run_status_sensor(run_status=DagsterRunStatus.SUCCESS, default_status=DefaultSensorStatus.RUNNING)
def openlineage_success_sensor(context: RunStatusSensorContext):
    _emit("COMPLETE", context)


@run_status_sensor(run_status=DagsterRunStatus.FAILURE, default_status=DefaultSensorStatus.RUNNING)
def openlineage_failure_sensor(context: RunStatusSensorContext):
    _emit("FAIL", context)

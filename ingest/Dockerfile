# Dagster code location + webserver for the homelab. Includes GDAL for the
# ogr2ogr shp->GeoJSON conversion the boundary assets need.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/atlas-ingest
COPY pyproject.toml ./
COPY atlas_ingest ./atlas_ingest
RUN pip install --no-cache-dir -e .

ENV DAGSTER_HOME=/opt/dagster_home
RUN mkdir -p $DAGSTER_HOME

EXPOSE 3000
CMD ["dagster", "dev", "-m", "atlas_ingest.definitions", "-h", "0.0.0.0", "-p", "3000"]

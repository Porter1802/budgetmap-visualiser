#!/usr/bin/env bash
# Export boundary layers from PostGIS to PMTiles for the static basemap.
# Boundaries change rarely, so they're better as a single immutable archive than
# live tiles. Requires: ogr2ogr (GDAL) + tippecanoe.
#
#   ./export_pmtiles.sh sa2 rdp_region
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
OUT_DIR="${OUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

for layer in "$@"; do
  echo ">> $layer"
  ogr2ogr -f GeoJSONSeq "/tmp/${layer}.geojsonl" "PG:${DATABASE_URL}" \
    -sql "SELECT * FROM ${layer}" -nln "$layer"
  tippecanoe -o "${OUT_DIR}/${layer}.pmtiles" \
    --layer="$layer" \
    --maximum-zoom=12 --minimum-zoom=4 \
    --drop-densest-as-needed --force \
    "/tmp/${layer}.geojsonl"
  rm -f "/tmp/${layer}.geojsonl"
done

echo "PMTiles written to $OUT_DIR"

-- Deploy atlas:0006-transit to pg
-- requires: 0005-context-layers

-- Translink GTFS-static + computed isochrones (Phase 4). pgRouting builds the
-- routable graph from the GTFS shapes/stops; transit_isochrone_30min holds the
-- 30-minute reachable polygon per SA2 centroid that feeds the accessibility
-- score in mart_sa2_summary.

BEGIN;

CREATE TABLE transit_routes (
  route_id        text PRIMARY KEY,
  agency_id       text,
  short_name      text,
  long_name       text,
  route_type      integer,     -- GTFS: 0 tram, 2 rail, 3 bus, 4 ferry ...
  geom            geometry(MultiLineString, 4326)
);
CREATE INDEX transit_routes_gix ON transit_routes USING gist (geom);

CREATE TABLE transit_stops (
  stop_id         text PRIMARY KEY,
  stop_name       text,
  geom            geometry(Point, 4326)
);
CREATE INDEX transit_stops_gix ON transit_stops USING gist (geom);

CREATE TABLE transit_isochrone_30min (
  sa2_code        text PRIMARY KEY REFERENCES sa2 (sa2_code),
  computed_at     timestamptz NOT NULL DEFAULT now(),
  geom            geometry(MultiPolygon, 4326)
);
CREATE INDEX transit_isochrone_30min_gix ON transit_isochrone_30min USING gist (geom);

COMMIT;

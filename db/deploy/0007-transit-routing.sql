-- Deploy atlas:0007-transit-routing to pg
-- requires: 0006-transit

-- Build a routable graph from GTFS route geometries and compute a 30-minute
-- reachability polygon per SA2 centroid with pgRouting. Edge cost is segment
-- length converted to minutes at an assumed mean transit speed; this is a
-- network-distance isochrone (not a timetable-accurate one) — honest given
-- GTFS-static has no live headways. The accessibility score is the count of
-- transit stops falling inside each SA2's isochrone.

BEGIN;

-- Routable edge table: each route MultiLineString exploded into 2-point segments.
CREATE TABLE IF NOT EXISTS transit_edges (
  id          bigserial PRIMARY KEY,
  source      bigint,
  target      bigint,
  cost        double precision,   -- minutes
  reverse_cost double precision,
  geom        geometry(LineString, 4326)
);
CREATE INDEX IF NOT EXISTS transit_edges_geom_gix ON transit_edges USING gist (geom);

-- Assumed mean speed (km/h) for converting segment length to minutes.
CREATE OR REPLACE FUNCTION build_transit_graph(mean_speed_kmh double precision DEFAULT 30.0)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  TRUNCATE transit_edges RESTART IDENTITY;
  INSERT INTO transit_edges (cost, reverse_cost, geom)
  SELECT
    (ST_Length(seg::geography) / 1000.0) / mean_speed_kmh * 60.0 AS cost,
    (ST_Length(seg::geography) / 1000.0) / mean_speed_kmh * 60.0 AS reverse_cost,
    seg
  FROM (
    SELECT ST_MakeLine(sp, ep) AS seg
    FROM (
      SELECT (dp).geom AS sp,
             lead((dp).geom) OVER (PARTITION BY route_id, (dp).path[1] ORDER BY (dp).path) AS ep
      FROM (
        SELECT route_id, ST_DumpPoints((ST_Dump(geom)).geom) AS dp
        FROM transit_routes
      ) pts
    ) pairs
    WHERE ep IS NOT NULL
  ) segs
  WHERE ST_Length(seg::geography) > 0;

  -- Topology: assign source/target node ids to the edge endpoints.
  PERFORM pgr_createTopology('transit_edges', 0.0005, 'geom', 'id');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN (SELECT count(*) FROM transit_edges);
END;
$$;

-- Compute the 30-min isochrone per SA2 centroid and store the buffered hull.
CREATE OR REPLACE FUNCTION build_transit_isochrones(budget_min double precision DEFAULT 30.0)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  rec record;
  src bigint;
  poly geometry;
  cnt integer := 0;
BEGIN
  TRUNCATE transit_isochrone_30min;
  FOR rec IN SELECT sa2_code, ST_Centroid(geom) AS c FROM sa2 LOOP
    SELECT id INTO src
    FROM transit_edges_vertices_pgr
    ORDER BY the_geom <-> rec.c
    LIMIT 1;
    CONTINUE WHEN src IS NULL;

    SELECT ST_Multi(ST_Buffer(ST_ConvexHull(ST_Collect(v.the_geom))::geography, 400)::geometry)
    INTO poly
    FROM pgr_drivingDistance(
           'SELECT id, source, target, cost, reverse_cost FROM transit_edges',
           src, budget_min, true) dd
    JOIN transit_edges_vertices_pgr v ON v.id = dd.node;

    IF poly IS NOT NULL THEN
      INSERT INTO transit_isochrone_30min (sa2_code, geom) VALUES (rec.sa2_code, poly);
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;

COMMIT;

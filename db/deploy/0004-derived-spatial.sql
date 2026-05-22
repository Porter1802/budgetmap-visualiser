-- Deploy atlas:0004-derived-spatial to pg
-- requires: 0003-projects

-- The keystone table behind "what's happening in my SA2". A nightly Dagster
-- asset populates it by joining project_locations.geom (or geom_buffered) to
-- sa2. overlap_fraction is 1.0 for points, but the area-overlap math is real so
-- that when WKT lines/polygons arrive funding splits across SA2s honestly with
-- no rework.

BEGIN;

CREATE TABLE project_location_sa2 (
  location_id      bigint  NOT NULL REFERENCES project_locations (location_id) ON DELETE CASCADE,
  sa2_code         text    NOT NULL REFERENCES sa2 (sa2_code),
  overlap_fraction numeric NOT NULL DEFAULT 1.0
    CHECK (overlap_fraction > 0 AND overlap_fraction <= 1.0),
  PRIMARY KEY (location_id, sa2_code)
);
CREATE INDEX project_location_sa2_sa2_idx ON project_location_sa2 (sa2_code);

-- Recompute the join for a set of locations. Handles all geometry dimensions:
--   points/multipoints -> the containing SA2, fraction 1.0
--   lines              -> fraction = length in SA2 / total length
--   polygons           -> fraction = area in SA2 / total area
-- Uses geom_buffered when present (point projects with an impact radius).
CREATE OR REPLACE FUNCTION refresh_project_location_sa2(p_location_ids bigint[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  affected integer;
BEGIN
  DELETE FROM project_location_sa2 pls
  WHERE p_location_ids IS NULL OR pls.location_id = ANY (p_location_ids);

  WITH loc AS (
    SELECT l.location_id,
           COALESCE(l.geom_buffered, l.geom) AS g
    FROM project_locations l
    WHERE l.excluded = false
      AND COALESCE(l.geom_buffered, l.geom) IS NOT NULL
      AND (p_location_ids IS NULL OR l.location_id = ANY (p_location_ids))
  ),
  parts AS (
    SELECT loc.location_id,
           s.sa2_code,
           loc.g,
           ST_Dimension(loc.g) AS dim,
           ST_Intersection(loc.g, s.geom) AS clipped
    FROM loc
    JOIN sa2 s ON ST_Intersects(loc.g, s.geom)
  ),
  fracs AS (
    SELECT location_id,
           sa2_code,
           CASE
             WHEN dim = 2 THEN ST_Area(clipped::geography)
                                / NULLIF(ST_Area(g::geography), 0)
             WHEN dim = 1 THEN ST_Length(clipped::geography)
                                / NULLIF(ST_Length(g::geography), 0)
             ELSE 1.0
           END AS frac
    FROM parts
  )
  INSERT INTO project_location_sa2 (location_id, sa2_code, overlap_fraction)
  SELECT location_id, sa2_code, LEAST(GREATEST(frac, 0.000001), 1.0)
  FROM fracs
  WHERE frac IS NOT NULL AND frac > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMIT;

-- Verify atlas:0003-projects on pg

BEGIN;

SELECT project_id, package_id, pin_geom FROM projects WHERE false;
SELECT location_id, geom, geom_buffered, impact_radius_m FROM project_locations WHERE false;
SELECT project_id, funding_source, total_amount_aud FROM project_funding WHERE false;

ROLLBACK;

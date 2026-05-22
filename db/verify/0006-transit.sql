-- Verify atlas:0006-transit on pg

BEGIN;

SELECT route_id, geom FROM transit_routes WHERE false;
SELECT stop_id, geom FROM transit_stops WHERE false;
SELECT sa2_code, geom FROM transit_isochrone_30min WHERE false;

ROLLBACK;

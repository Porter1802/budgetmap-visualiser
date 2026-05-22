-- Revert atlas:0006-transit from pg

BEGIN;

DROP TABLE IF EXISTS transit_isochrone_30min;
DROP TABLE IF EXISTS transit_stops;
DROP TABLE IF EXISTS transit_routes;

COMMIT;

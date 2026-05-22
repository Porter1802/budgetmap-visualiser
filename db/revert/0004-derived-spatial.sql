-- Revert atlas:0004-derived-spatial from pg

BEGIN;

DROP FUNCTION IF EXISTS refresh_project_location_sa2(bigint[]);
DROP TABLE IF EXISTS project_location_sa2;

COMMIT;

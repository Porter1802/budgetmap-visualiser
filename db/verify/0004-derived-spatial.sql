-- Verify atlas:0004-derived-spatial on pg

BEGIN;

SELECT location_id, sa2_code, overlap_fraction FROM project_location_sa2 WHERE false;
SELECT has_function_privilege('refresh_project_location_sa2(bigint[])', 'execute');

ROLLBACK;

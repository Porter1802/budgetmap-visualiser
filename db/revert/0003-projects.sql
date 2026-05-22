-- Revert atlas:0003-projects from pg

BEGIN;

DROP TABLE IF EXISTS project_funding;
DROP TABLE IF EXISTS project_locations;
DROP TABLE IF EXISTS projects;

COMMIT;

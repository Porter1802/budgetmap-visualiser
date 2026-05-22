-- Revert atlas:0002-reference-geographies from pg

BEGIN;

DROP TABLE IF EXISTS rdp_region;
DROP TABLE IF EXISTS electorate_fed;
DROP TABLE IF EXISTS electorate_state;
DROP TABLE IF EXISTS lga;
DROP TABLE IF EXISTS sa2;

COMMIT;

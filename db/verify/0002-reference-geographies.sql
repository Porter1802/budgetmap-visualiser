-- Verify atlas:0002-reference-geographies on pg

BEGIN;

SELECT sa2_code, geom FROM sa2 WHERE false;
SELECT lga_code, geom FROM lga WHERE false;
SELECT sed_code FROM electorate_state WHERE false;
SELECT ced_code FROM electorate_fed WHERE false;
SELECT rdp_code FROM rdp_region WHERE false;

ROLLBACK;

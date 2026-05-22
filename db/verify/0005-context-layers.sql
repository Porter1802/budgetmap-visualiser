-- Verify atlas:0005-context-layers on pg

BEGIN;

SELECT sa2_code FROM seifa WHERE false;
SELECT sa2_code, year FROM population_erp WHERE false;
SELECT sa2_code, variable FROM census_2021 WHERE false;
SELECT lga_code, month FROM crime_offences WHERE false;
SELECT lga_code, quarter FROM rental_bonds WHERE false;
SELECT sa2_code FROM tree_canopy_sa2 WHERE false;
SELECT id, geom FROM flood_extents WHERE false;
SELECT id, geom FROM bushfire_history WHERE false;
SELECT id, geom FROM schools WHERE false;
SELECT id, geom FROM hospitals WHERE false;

ROLLBACK;

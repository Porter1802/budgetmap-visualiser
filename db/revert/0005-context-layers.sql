-- Revert atlas:0005-context-layers from pg

BEGIN;

DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS schools;
DROP TABLE IF EXISTS bushfire_history;
DROP TABLE IF EXISTS flood_extents;
DROP TABLE IF EXISTS tree_canopy_sa2;
DROP TABLE IF EXISTS rental_bonds;
DROP TABLE IF EXISTS crime_offences;
DROP TABLE IF EXISTS census_2021;
DROP TABLE IF EXISTS population_erp;
DROP TABLE IF EXISTS seifa;

COMMIT;

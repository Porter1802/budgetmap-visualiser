-- Deploy atlas:0002-reference-geographies to pg
-- requires: 0001-extensions

-- ABS ASGS 2021 hierarchy + LGA + electorates + the RDP regions the public
-- budget API actually tags projects with. SA2 is the primary analytical unit;
-- everything project-side joins up to it via the derived spatial join (0004).

BEGIN;

CREATE TABLE sa2 (
  sa2_code    text PRIMARY KEY,
  sa2_name    text,
  sa3_code    text,
  sa3_name    text,
  sa4_code    text,
  sa4_name    text,
  gccsa_code  text,
  state_code  text,
  area_km2    numeric,
  geom        geometry(MultiPolygon, 4326)
);
CREATE INDEX sa2_geom_gix ON sa2 USING gist (geom);
CREATE INDEX sa2_sa4_idx ON sa2 (sa4_code);

CREATE TABLE lga (
  lga_code    text PRIMARY KEY,
  lga_name    text,
  state_code  text,
  area_km2    numeric,
  geom        geometry(MultiPolygon, 4326)
);
CREATE INDEX lga_geom_gix ON lga USING gist (geom);

CREATE TABLE electorate_state (
  sed_code    text PRIMARY KEY,
  sed_name    text,
  geom        geometry(MultiPolygon, 4326)
);
CREATE INDEX electorate_state_geom_gix ON electorate_state USING gist (geom);

CREATE TABLE electorate_fed (
  ced_code    text PRIMARY KEY,
  ced_name    text,
  geom        geometry(MultiPolygon, 4326)
);
CREATE INDEX electorate_fed_geom_gix ON electorate_fed USING gist (geom);

-- RDP = Regional Development Plan regions. The budget API tags every project
-- with one or more RDP codes (301..322); this is the only ready-made admin unit
-- the public payload gives us, and it backs the current region filter until SA2
-- joins exist.
CREATE TABLE rdp_region (
  rdp_code    integer PRIMARY KEY,
  rdp_name    text,
  geom        geometry(MultiPolygon, 4326)
);
CREATE INDEX rdp_region_geom_gix ON rdp_region USING gist (geom);

COMMIT;

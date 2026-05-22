-- Deploy atlas:0005-context-layers to pg
-- requires: 0004-derived-spatial

-- One table per context dataset (spec §3.4). Indicator sources key to sa2_code;
-- LGA-grain sources (crime, rental bonds) attach to SA2 through the LGA the SA2
-- sits in at mart time. Free-form risk layers keep their own geometry.

BEGIN;

CREATE TABLE seifa (
  sa2_code        text PRIMARY KEY REFERENCES sa2 (sa2_code),
  irsd_score      integer,   -- Index of Relative Socio-economic Disadvantage
  irsd_decile     smallint,
  irsad_score     integer,
  irsad_decile    smallint,
  ier_score       integer,
  ieo_score       integer
);

CREATE TABLE population_erp (
  sa2_code        text NOT NULL REFERENCES sa2 (sa2_code),
  year            smallint NOT NULL,
  erp             integer,
  PRIMARY KEY (sa2_code, year)
);

-- Census 2021: a curated ~30-column subset lives in a typed view over this
-- key/value store, so adding a variable is a data change not a migration.
CREATE TABLE census_2021 (
  sa2_code        text NOT NULL REFERENCES sa2 (sa2_code),
  variable        text NOT NULL,
  value           numeric,
  PRIMARY KEY (sa2_code, variable)
);

CREATE TABLE crime_offences (
  lga_code        text NOT NULL,
  month           date NOT NULL,
  offence         text NOT NULL,
  count           integer,
  PRIMARY KEY (lga_code, month, offence)
);

CREATE TABLE rental_bonds (
  lga_code        text NOT NULL,
  quarter         date NOT NULL,
  dwelling_type   text NOT NULL,
  median_weekly   integer,
  bond_count      integer,
  PRIMARY KEY (lga_code, quarter, dwelling_type)
);

CREATE TABLE tree_canopy_sa2 (
  sa2_code        text PRIMARY KEY REFERENCES sa2 (sa2_code),
  canopy_pct      numeric,
  year            smallint
);

-- Free-form risk polygons (own geometry, exposure derived per-SA2 at mart time).
CREATE TABLE flood_extents (
  id              bigserial PRIMARY KEY,
  source          text,
  scenario        text,        -- e.g. 'Q100'
  geom            geometry(MultiPolygon, 4326)
);
CREATE INDEX flood_extents_gix ON flood_extents USING gist (geom);

CREATE TABLE bushfire_history (
  id              bigserial PRIMARY KEY,
  year            smallint,
  source          text,
  geom            geometry(MultiPolygon, 4326)
);
CREATE INDEX bushfire_history_gix ON bushfire_history USING gist (geom);

-- Service-context point/polygon layers.
CREATE TABLE schools (
  id              bigserial PRIMARY KEY,
  name            text,
  sector          text,
  centre_type     text,
  lga_name        text,
  geom            geometry(Point, 4326),
  catchment       geometry(MultiPolygon, 4326)
);
CREATE INDEX schools_gix ON schools USING gist (geom);

CREATE TABLE hospitals (
  id              bigserial PRIMARY KEY,
  name            text,
  hhs             text,        -- Hospital and Health Service
  phone           text,
  address         text,
  geom            geometry(Point, 4326)
);
CREATE INDEX hospitals_gix ON hospitals USING gist (geom);

COMMIT;

-- Deploy atlas:0003-projects to pg
-- requires: 0002-reference-geographies

-- Canonical project facts. Built WKT-shaped from day one (decision #3): the
-- public API gives points only today, but lines/polygons/impact-radius land in
-- /api/projects ~June 2026, so geom is generic Geometry (not Point) and the WKT
-- columns exist nullable. project_locations is a real 1:N table even though it
-- holds ~one synthesised point per project for now.

BEGIN;

CREATE TABLE projects (
  project_id        integer NOT NULL,
  package_id        integer NOT NULL,
  financial_year    text    NOT NULL,            -- '2024-25'
  package_version   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, package_id),

  name              text,
  description       text,                         -- canonical (single field on public API)
  description_raw   jsonb,                        -- all variants when internal access lands
  activity_word     text,

  agency_id         integer,
  agency_name       text,
  type_id           integer,
  type_name         text,                         -- project category (drives map icon/colour)
  category          text NOT NULL DEFAULT 'other',-- other|capital|school|police|hospital

  in_qld_program    boolean,
  in_fed_program    boolean,
  qld_program_name  text,
  fed_program_name  text,

  is_commitment     boolean,
  is_new_initiative boolean,
  from_bp3          boolean,
  budget_outcome    boolean,
  budget_highlight  boolean,
  status            integer,
  entry_state       integer,

  pin_latitude      double precision,
  pin_longitude     double precision,
  pin_geom          geometry(Point, 4326),

  region_sa4        text,
  region_lga        text,
  region_lga_code   text,
  region_sed        text,
  region_sed_code   text,

  raw               jsonb,
  ingested_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_package_idx ON projects (package_id);
CREATE INDEX projects_fy_idx      ON projects (financial_year);
CREATE INDEX projects_agency_idx  ON projects (agency_id);
CREATE INDEX projects_category_idx ON projects (category);
CREATE INDEX projects_pin_gix     ON projects USING gist (pin_geom);

CREATE TABLE project_locations (
  location_id      bigint PRIMARY KEY,
  project_id       integer NOT NULL,
  package_id       integer NOT NULL,
  FOREIGN KEY (project_id, package_id) REFERENCES projects (project_id, package_id) ON DELETE CASCADE,

  address          text,
  latitude         double precision,
  longitude        double precision,
  geometry_wkt     text,                          -- raw WKT from API (null until ~June)
  geometry_geojson text,
  geometry_type    text,                          -- Point | LineString | Polygon | ...
  impact_radius_m  double precision,

  geom             geometry(Geometry, 4326),      -- generic: points now, lines/polys later
  geom_buffered    geometry(Polygon, 4326),       -- ST_Buffer(geom::geography, impact_radius_m) when set

  region_sa4       text,
  region_sed       text,
  region_sed_code  integer,
  region_rdp       integer,
  region_lga       text,
  region_lga_code  integer,

  excluded         boolean NOT NULL DEFAULT false,
  dnrm_reference   text
);
CREATE INDEX project_locations_geom_gix     ON project_locations USING gist (geom);
CREATE INDEX project_locations_buf_gix      ON project_locations USING gist (geom_buffered);
CREATE INDEX project_locations_project_idx  ON project_locations (project_id, package_id);

CREATE TABLE project_funding (
  project_id        integer NOT NULL,
  package_id        integer NOT NULL,
  funding_source    text    NOT NULL,             -- qld | fed | local | own_src | private
  annual_amount_aud bigint,
  total_amount_aud  bigint,
  PRIMARY KEY (project_id, package_id, funding_source),
  FOREIGN KEY (project_id, package_id) REFERENCES projects (project_id, package_id) ON DELETE CASCADE,
  CONSTRAINT project_funding_source_chk
    CHECK (funding_source IN ('qld', 'fed', 'local', 'own_src', 'private'))
);

COMMIT;

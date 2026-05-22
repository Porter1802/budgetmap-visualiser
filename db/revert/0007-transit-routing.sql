-- Revert atlas:0007-transit-routing from pg

BEGIN;

DROP FUNCTION IF EXISTS build_transit_isochrones(double precision);
DROP FUNCTION IF EXISTS build_transit_graph(double precision);
DROP TABLE IF EXISTS transit_edges_vertices_pgr;
DROP TABLE IF EXISTS transit_edges;

COMMIT;

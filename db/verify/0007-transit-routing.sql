-- Verify atlas:0007-transit-routing on pg

BEGIN;

SELECT id, source, target, cost FROM transit_edges WHERE false;
SELECT has_function_privilege('build_transit_graph(double precision)', 'execute');
SELECT has_function_privilege('build_transit_isochrones(double precision)', 'execute');

ROLLBACK;

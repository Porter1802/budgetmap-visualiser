-- Verify atlas:0001-extensions on pg

BEGIN;

SELECT 1 / count(*) FROM pg_extension WHERE extname = 'postgis';
SELECT 1 / count(*) FROM pg_extension WHERE extname = 'pgrouting';
SELECT 1 / count(*) FROM pg_extension WHERE extname = 'h3';
SELECT 1 / count(*) FROM pg_extension WHERE extname = 'h3_postgis';

ROLLBACK;

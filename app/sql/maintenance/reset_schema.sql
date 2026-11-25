-- Used by: python -m app.database.seed --reset
-- Drops everything, including optimization indexes and views, so the ORM can rebuild cleanly.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
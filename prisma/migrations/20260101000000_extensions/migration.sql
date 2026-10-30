-- Extensions must exist before the core schema (users.email is citext).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist; -- gist exclusion on uuid + range
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- movie title search

-- Migration: add customizable registration-form support to existing events
-- Safe to run once on a database that was already set up before this feature.
-- Brand-new databases don't need this — schema.sql already includes the column.
--
-- Safe to run more than once by accident: IF NOT EXISTS makes a repeat run a
-- harmless no-op instead of an error, and either way this statement only
-- ever adds a new column — it never reads, modifies, or deletes any existing
-- row or column, so your existing data is never at risk.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS registration_form_config_json TEXT NULL;

-- Nothing else to backfill: existing events simply have NULL here, and the
-- application already treats a NULL config as "use the default form" (see
-- Event.get_registration_form_config() in app/models/models.py) — so every
-- event created before this migration keeps working exactly as it did,
-- with the same fields shown/required as before.

-- Migration: add customizable registration-form support to existing events
-- Safe to run once on a database that was already set up before this feature.
-- Brand-new databases don't need this — schema.sql already includes the column.

ALTER TABLE events
    ADD COLUMN registration_form_config_json TEXT NULL;

-- Nothing else to backfill: existing events simply have NULL here, and the
-- application already treats a NULL config as "use the default form" (see
-- Event.get_registration_form_config() in app/models/models.py) — so every
-- event created before this migration keeps working exactly as it did,
-- with the same fields shown/required as before.

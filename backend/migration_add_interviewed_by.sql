-- Migration: add "Interviewed By" tracking to existing candidate test sessions
-- Safe to run once on a database that was already set up before this feature.
-- Brand-new databases don't need this — schema.sql already includes the column.
--
-- Safe to run more than once by accident: IF NOT EXISTS makes a repeat run a
-- harmless no-op instead of an error, and either way this statement only
-- ever adds a new column — it never reads, modifies, or deletes any existing
-- row or column, so your existing data is never at risk.

ALTER TABLE candidate_test_sessions
    ADD COLUMN IF NOT EXISTS interviewed_by VARCHAR(50) NULL;

-- Nothing to backfill: existing sessions simply have NULL here (meaning "not
-- yet assigned to an interviewer"), which the application already treats as
-- the normal unassigned state.

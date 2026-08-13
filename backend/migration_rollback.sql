-- Rollback for migration_add_registration_form_config.sql and
-- migration_add_interviewed_by.sql — only needed if you want to undo those
-- two column additions for some reason. Not required for normal operation.
--
-- Safe with respect to your existing data: this only removes the two new
-- columns (which, on a database that's been running the current app, would
-- only contain values you set through the new features — registration form
-- customization and interviewer assignment). Every other column and every
-- other table is completely unaffected.
--
-- Run only the lines you actually need to undo.

ALTER TABLE events
    DROP COLUMN IF EXISTS registration_form_config_json;

ALTER TABLE candidate_test_sessions
    DROP COLUMN IF EXISTS interviewed_by;

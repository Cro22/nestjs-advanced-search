-- Enforce at the database level that an outbox entry's operation is one of the
-- known values, so a bad write can never enqueue an operation the processor
-- cannot apply.
ALTER TABLE "outbox_entries"
  ADD CONSTRAINT "outbox_entries_operation_check" CHECK ("operation" IN ('upsert', 'delete'));

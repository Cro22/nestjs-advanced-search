export const OUTBOX_UPSERT = 'upsert';
export const OUTBOX_DELETE = 'delete';

/** The only operations an outbox entry may carry. */
export type OutboxOperation = typeof OUTBOX_UPSERT | typeof OUTBOX_DELETE;

/** Every valid operation, e.g. for validation or a DB CHECK constraint mirror. */
export const OUTBOX_OPERATIONS: readonly OutboxOperation[] = [OUTBOX_UPSERT, OUTBOX_DELETE];

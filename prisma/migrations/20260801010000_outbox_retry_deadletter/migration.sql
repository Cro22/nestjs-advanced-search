-- DropIndex
DROP INDEX "outbox_entries_processed_at_created_at_idx";

-- AlterTable
ALTER TABLE "outbox_entries" ADD COLUMN     "failed_at" TIMESTAMP(3),
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "next_retry_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "outbox_entries_processed_at_failed_at_next_retry_at_created_idx" ON "outbox_entries"("processed_at", "failed_at", "next_retry_at", "created_at");


-- Soft-delete grace window: hide accounts/memberships until a background
-- purge removes them for good after the retention period (default 7 days).

-- AlterTable
ALTER TABLE "editorial_memberships" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3);


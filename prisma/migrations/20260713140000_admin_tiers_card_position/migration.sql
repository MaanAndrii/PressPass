-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EDITORIAL_ADMIN';

-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "position" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "position_en" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "editorials" ADD COLUMN     "display_name_en" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "display_name_uk" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "editorial_id" INTEGER;

-- CreateIndex
CREATE INDEX "users_editorial_id_idx" ON "users"("editorial_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_editorial_id_fkey" FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE SET NULL ON UPDATE CASCADE;


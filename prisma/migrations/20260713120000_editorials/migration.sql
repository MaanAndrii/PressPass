-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "editorial_id" INTEGER;

-- CreateTable
CREATE TABLE "editorials" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "edrpou" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "logo_path" TEXT,
    "director" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_editorial_id_idx" ON "cards"("editorial_id");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_editorial_id_fkey" FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE SET NULL ON UPDATE CASCADE;


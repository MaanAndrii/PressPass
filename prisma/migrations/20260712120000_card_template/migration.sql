-- AlterTable
ALTER TABLE "journalists" ADD COLUMN     "full_name_en" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "card_templates" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_templates_pkey" PRIMARY KEY ("id")
);


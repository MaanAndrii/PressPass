-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'JOURNALIST');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'JOURNALIST',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journalists" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "photo_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journalists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "journalist_id" INTEGER NOT NULL,
    "card_number" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "expire_date" DATE NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "journalists_user_id_key" ON "journalists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_uuid_key" ON "cards"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "cards_card_number_key" ON "cards"("card_number");

-- CreateIndex
CREATE INDEX "cards_journalist_id_idx" ON "cards"("journalist_id");

-- AddForeignKey
ALTER TABLE "journalists" ADD CONSTRAINT "journalists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_journalist_id_fkey" FOREIGN KEY ("journalist_id") REFERENCES "journalists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

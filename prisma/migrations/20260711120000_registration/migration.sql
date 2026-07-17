-- AlterTable
ALTER TABLE "journalists" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "passport_data" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "self_registered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tax_number" TEXT,
ALTER COLUMN "full_name" SET DEFAULT '',
ALTER COLUMN "position" SET DEFAULT '',
ALTER COLUMN "organization" SET DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_user_id_key" ON "email_verifications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: акаунти, що існували до появи самореєстрації, створені
-- адміністратором або сідом — вважаємо їх email підтвердженим.
UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP WHERE "email_verified_at" IS NULL;

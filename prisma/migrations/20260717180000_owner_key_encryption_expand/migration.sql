-- Stage 1 owner-key encryption: additive expand migration.
ALTER TABLE "users" ADD COLUMN "email_blind_index" TEXT, ADD COLUMN "encrypted_data" JSONB;
CREATE UNIQUE INDEX "users_email_blind_index_key" ON "users"("email_blind_index");
ALTER TABLE "journalists" ADD COLUMN "encrypted_data" JSONB;
ALTER TABLE "editorials" ADD COLUMN "encrypted_data" JSONB;
ALTER TABLE "cards" ADD COLUMN "encrypted_data" JSONB;
ALTER TABLE "card_templates" ADD COLUMN "encrypted_data" JSONB;
ALTER TABLE "app_settings" ADD COLUMN "encrypted_data" JSONB;

CREATE TABLE "admin_key_material" (
  "id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL UNIQUE,
  "key_version" INTEGER NOT NULL DEFAULT 1, "passphrase_kdf" JSONB NOT NULL,
  "key_envelope" JSONB NOT NULL, "fingerprint" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "admin_key_material_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "editorial_key_material" (
  "id" SERIAL PRIMARY KEY, "editorial_id" INTEGER NOT NULL UNIQUE,
  "key_version" INTEGER NOT NULL DEFAULT 1, "fingerprint" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "rotated_at" TIMESTAMP(3),
  CONSTRAINT "editorial_key_material_editorial_id_fkey" FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "editorial_admin_key_slots" (
  "id" SERIAL PRIMARY KEY, "editorial_key_id" INTEGER NOT NULL, "admin_key_id" INTEGER NOT NULL,
  "key_envelope" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "editorial_admin_key_slots_editorial_key_id_fkey" FOREIGN KEY ("editorial_key_id") REFERENCES "editorial_key_material"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "editorial_admin_key_slots_admin_key_id_fkey" FOREIGN KEY ("admin_key_id") REFERENCES "admin_key_material"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "editorial_admin_key_slots_editorial_key_id_admin_key_id_key" ON "editorial_admin_key_slots"("editorial_key_id", "admin_key_id");
CREATE TABLE "superadmin_recovery_keys" (
  "id" SERIAL PRIMARY KEY, "superadmin_user_id" INTEGER NOT NULL, "slot_number" INTEGER NOT NULL,
  "public_key" TEXT NOT NULL, "fingerprint" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "superadmin_recovery_keys_superadmin_user_id_fkey" FOREIGN KEY ("superadmin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "superadmin_recovery_keys_slot_number_check" CHECK ("slot_number" IN (1, 2))
);
CREATE UNIQUE INDEX "superadmin_recovery_keys_superadmin_user_id_slot_number_key" ON "superadmin_recovery_keys"("superadmin_user_id", "slot_number");
CREATE TABLE "superadmin_key_slots" (
  "id" SERIAL PRIMARY KEY, "superadmin_user_id" INTEGER NOT NULL, "recovery_key_id" INTEGER NOT NULL,
  "owner_type" TEXT NOT NULL, "owner_id" TEXT NOT NULL, "slot_number" INTEGER NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1, "key_envelope" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "superadmin_key_slots_superadmin_user_id_fkey" FOREIGN KEY ("superadmin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "superadmin_key_slots_recovery_key_id_fkey" FOREIGN KEY ("recovery_key_id") REFERENCES "superadmin_recovery_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "superadmin_key_slots_slot_number_check" CHECK ("slot_number" IN (1, 2))
);
CREATE UNIQUE INDEX "superadmin_key_slots_owner_type_owner_id_slot_number_key" ON "superadmin_key_slots"("owner_type", "owner_id", "slot_number");
CREATE INDEX "superadmin_key_slots_superadmin_user_id_idx" ON "superadmin_key_slots"("superadmin_user_id");
CREATE INDEX "superadmin_key_slots_recovery_key_id_idx" ON "superadmin_key_slots"("recovery_key_id");
CREATE TABLE "encrypted_files" (
  "id" UUID PRIMARY KEY, "owner_type" TEXT NOT NULL, "owner_id" TEXT NOT NULL,
  "editorial_id" INTEGER, "purpose" TEXT NOT NULL, "storage_name" TEXT NOT NULL UNIQUE,
  "mime_type" TEXT NOT NULL, "byte_length" INTEGER NOT NULL,
  "content_envelope" JSONB NOT NULL, "file_key_envelope" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "replaced_at" TIMESTAMP(3),
  CONSTRAINT "encrypted_files_editorial_id_fkey" FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "encrypted_files_owner_type_owner_id_purpose_idx" ON "encrypted_files"("owner_type", "owner_id", "purpose");
ALTER TABLE "editorials" ADD COLUMN "card_number_prefix_blind_index" TEXT;
CREATE UNIQUE INDEX "editorials_card_number_prefix_blind_index_key" ON "editorials"("card_number_prefix_blind_index");
ALTER TABLE "cards" ADD COLUMN "card_number_blind_index" TEXT;
CREATE UNIQUE INDEX "cards_card_number_blind_index_key" ON "cards"("card_number_blind_index");
CREATE TABLE "system_key_material" (
  "id" INTEGER PRIMARY KEY DEFAULT 1, "key_version" INTEGER NOT NULL DEFAULT 1,
  "fingerprint" TEXT NOT NULL UNIQUE, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotated_at" TIMESTAMP(3)
);
CREATE TABLE "system_admin_key_slots" (
  "id" SERIAL PRIMARY KEY, "system_key_id" INTEGER NOT NULL, "admin_key_id" INTEGER NOT NULL,
  "key_envelope" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMP(3),
  CONSTRAINT "system_admin_key_slots_system_key_id_fkey" FOREIGN KEY ("system_key_id") REFERENCES "system_key_material"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "system_admin_key_slots_admin_key_id_fkey" FOREIGN KEY ("admin_key_id") REFERENCES "admin_key_material"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "system_admin_key_slots_system_key_id_admin_key_id_key" ON "system_admin_key_slots"("system_key_id", "admin_key_id");
ALTER TABLE "cards" ALTER COLUMN "issue_date" DROP NOT NULL, ALTER COLUMN "expire_date" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "google_id_blind_index" TEXT;
CREATE UNIQUE INDEX "users_google_id_blind_index_key" ON "users"("google_id_blind_index");

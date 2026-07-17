-- Security stage 2: recoverable user key envelopes, revocable access tokens,
-- and one encrypted data-key grant per current editorial membership.
ALTER TABLE "users"
  ADD COLUMN "recovery_key_envelope" JSONB,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "editorial_data_key_grants" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "editorial_id" INTEGER NOT NULL,
  "key_envelope" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "editorial_data_key_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "editorial_data_key_grants_user_id_editorial_id_key"
  ON "editorial_data_key_grants"("user_id", "editorial_id");

ALTER TABLE "editorial_data_key_grants"
  ADD CONSTRAINT "editorial_data_key_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "editorial_data_key_grants"
  ADD CONSTRAINT "editorial_data_key_grants_editorial_id_fkey"
  FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

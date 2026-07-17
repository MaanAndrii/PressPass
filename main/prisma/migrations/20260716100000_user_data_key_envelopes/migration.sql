-- Password-derived wrapping metadata and the encrypted per-user data key.
-- Nullable columns keep existing accounts usable until their keys are provisioned.
ALTER TABLE "users"
  ADD COLUMN "password_kdf" JSONB,
  ADD COLUMN "data_key_envelope" JSONB;

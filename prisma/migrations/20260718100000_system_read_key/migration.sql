-- System read key: RSA keypair whose public key seals every profile data key
-- (Superadmin universal online read access) and whose private key is stored
-- only AES-256-GCM encrypted under the System KEK.
ALTER TABLE "system_key_material"
  ADD COLUMN "read_public_key" TEXT,
  ADD COLUMN "read_private_key_envelope" JSONB;

-- Per-user profile data key sealed to the system read public key.
ALTER TABLE "users" ADD COLUMN "system_key_envelope" JSONB;

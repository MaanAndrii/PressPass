-- An administrator's own email sealed (RSA-OAEP) to the system read public key,
-- so a Superadmin sees their email even when signed in via Google (there is no
-- password to derive the profile key that encrypts `encrypted_data`).
ALTER TABLE "users" ADD COLUMN "admin_email_envelope" JSONB;

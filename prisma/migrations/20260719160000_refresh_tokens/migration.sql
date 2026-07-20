-- Rotating refresh tokens for keeping a device signed in (PWA). Only a SHA-256
-- hash is stored; bound to the owner's token_version so a "sign out everywhere"
-- (token_version bump) invalidates every device at once.
CREATE TABLE "refresh_tokens" (
  "id" SERIAL NOT NULL,
  "token_hash" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "token_version" INTEGER NOT NULL,
  "label" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

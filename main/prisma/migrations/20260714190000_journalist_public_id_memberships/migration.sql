-- Journalist public id (short code given to an admin to be added to a media).
ALTER TABLE "journalists" ADD COLUMN "public_id" TEXT;
UPDATE "journalists"
  SET "public_id" = 'JR-' || upper(substr(md5(random()::text || id::text), 1, 6))
  WHERE "public_id" IS NULL;
ALTER TABLE "journalists" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX "journalists_public_id_key" ON "journalists"("public_id");

-- Journalist ↔ editorial membership (many-to-many).
CREATE TABLE "editorial_memberships" (
  "id" SERIAL PRIMARY KEY,
  "editorial_id" INTEGER NOT NULL,
  "journalist_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "editorial_memberships_editorial_id_journalist_id_key"
  ON "editorial_memberships"("editorial_id", "journalist_id");
CREATE INDEX "editorial_memberships_journalist_id_idx"
  ON "editorial_memberships"("journalist_id");
ALTER TABLE "editorial_memberships"
  ADD CONSTRAINT "editorial_memberships_editorial_id_fkey"
  FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_memberships"
  ADD CONSTRAINT "editorial_memberships_journalist_id_fkey"
  FOREIGN KEY ("journalist_id") REFERENCES "journalists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: everyone who already holds a card from an editorial is a member,
-- so editorial admins keep seeing the journalists they have already issued to.
INSERT INTO "editorial_memberships" ("editorial_id", "journalist_id")
  SELECT DISTINCT "editorial_id", "journalist_id" FROM "cards"
  WHERE "editorial_id" IS NOT NULL
  ON CONFLICT DO NOTHING;

-- Editorial READ keypair: public key seals a journalist's profile key on join
-- confirmation / login backfill; private key stored only encrypted under the
-- Editorial KEK.
ALTER TABLE "editorial_key_material"
  ADD COLUMN "read_public_key" TEXT,
  ADD COLUMN "read_private_key_envelope" JSONB;

-- A grant may now carry only an RSA seal until an admin materialises the
-- symmetric envelope, so key_envelope becomes nullable.
ALTER TABLE "editorial_data_key_grants"
  ALTER COLUMN "key_envelope" DROP NOT NULL,
  ADD COLUMN "sealed_key_envelope" JSONB;

-- Consent-based join requests.
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "join_requests" (
  "id" SERIAL PRIMARY KEY,
  "editorial_id" INTEGER NOT NULL,
  "journalist_id" INTEGER NOT NULL,
  "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMP(3),
  CONSTRAINT "join_requests_editorial_id_fkey" FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "join_requests_journalist_id_fkey" FOREIGN KEY ("journalist_id") REFERENCES "journalists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "join_requests_editorial_id_journalist_id_key" ON "join_requests"("editorial_id", "journalist_id");
CREATE INDEX "join_requests_journalist_id_idx" ON "join_requests"("journalist_id");

-- Public, non-secret editorial label (shown to a journalist reviewing a join
-- request). Existing editorials keep '' until next edited.
ALTER TABLE "editorials" ADD COLUMN "public_name" TEXT NOT NULL DEFAULT '';

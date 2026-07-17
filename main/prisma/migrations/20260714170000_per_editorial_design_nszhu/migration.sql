-- Journalist: NSZHU (National Union of Journalists of Ukraine) membership.
ALTER TABLE "journalists" ADD COLUMN "nszhu_member" BOOLEAN NOT NULL DEFAULT false;

-- App settings: uploaded NSZHU logo path (shown on members' cards).
ALTER TABLE "app_settings" ADD COLUMN "nszhu_logo_path" TEXT;

-- Card templates: bind a design to a specific editorial (NULL = system default).
ALTER TABLE "card_templates" ADD COLUMN "editorial_id" INTEGER;
CREATE UNIQUE INDEX "card_templates_editorial_id_key" ON "card_templates"("editorial_id");
ALTER TABLE "card_templates"
  ADD CONSTRAINT "card_templates_editorial_id_fkey"
  FOREIGN KEY ("editorial_id") REFERENCES "editorials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Switch the card_templates id from a literal default of 1 to an autoincrement
-- sequence, so per-editorial rows get unique ids alongside the id=1 default.
CREATE SEQUENCE IF NOT EXISTS "card_templates_id_seq" OWNED BY "card_templates"."id";
SELECT setval('card_templates_id_seq', GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "card_templates"), 1));
ALTER TABLE "card_templates" ALTER COLUMN "id" SET DEFAULT nextval('card_templates_id_seq');

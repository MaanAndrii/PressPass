-- Per-editorial card-number templates.
ALTER TABLE "editorials" ADD COLUMN "card_number_prefix" TEXT NOT NULL DEFAULT '';
ALTER TABLE "editorials" ADD COLUMN "card_number_template" TEXT NOT NULL DEFAULT '{prefix}-{year}-{seq:6}';

-- Per-editorial, per-year sequence used to build a card number.
ALTER TABLE "cards" ADD COLUMN "number_seq" INTEGER NOT NULL DEFAULT 0;

-- Journalist's chosen primary card (when they hold several). No hard FK so a
-- deleted card simply leaves a dangling id the app ignores.
ALTER TABLE "journalists" ADD COLUMN "primary_card_id" INTEGER;

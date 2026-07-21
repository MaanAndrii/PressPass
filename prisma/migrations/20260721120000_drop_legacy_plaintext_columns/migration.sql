-- Contract migration (owner-key encryption, Level 1): permanently drop the
-- transitional plaintext columns now that every value lives in `encrypted_data`
-- (or a keyed blind index). This is IRREVERSIBLE: the dropped columns hold no
-- recoverable data, but the drop cannot be undone.
--
-- PRECONDITION: `npm run security:verify` must pass first. It proves every row
-- carries its encrypted payload and that these columns are already empty, so no
-- data is lost here. Do not apply this migration on an installation that has not
-- passed verification.

-- DropIndex
DROP INDEX "cards_card_number_key";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "app_settings" DROP COLUMN "mail_from",
DROP COLUMN "nszhu_logo_path",
DROP COLUMN "resend_api_key";

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "card_number",
DROP COLUMN "expire_date",
DROP COLUMN "issue_date",
DROP COLUMN "position",
DROP COLUMN "position_en";

-- AlterTable
ALTER TABLE "editorials" DROP COLUMN "address",
DROP COLUMN "card_number_prefix",
DROP COLUMN "card_number_template",
DROP COLUMN "director",
DROP COLUMN "display_name_en",
DROP COLUMN "display_name_uk",
DROP COLUMN "edrpou",
DROP COLUMN "email",
DROP COLUMN "logo_path",
DROP COLUMN "media_id",
DROP COLUMN "name",
DROP COLUMN "phone",
DROP COLUMN "website";

-- AlterTable
ALTER TABLE "journalists" DROP COLUMN "birth_date",
DROP COLUMN "full_name",
DROP COLUMN "full_name_en",
DROP COLUMN "nszhu_member",
DROP COLUMN "organization",
DROP COLUMN "organization_en",
DROP COLUMN "passport_data",
DROP COLUMN "phone",
DROP COLUMN "photo_path",
DROP COLUMN "position",
DROP COLUMN "position_en",
DROP COLUMN "tax_number";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email";

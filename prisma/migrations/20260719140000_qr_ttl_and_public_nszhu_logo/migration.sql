-- The NSZHU logo as a public base64 data URI (served without a key, survives
-- restart) and the configurable QR validity/refresh interval in seconds.
ALTER TABLE "app_settings" ADD COLUMN "nszhu_logo_data" TEXT;
ALTER TABLE "app_settings" ADD COLUMN "qr_ttl_seconds" INTEGER;

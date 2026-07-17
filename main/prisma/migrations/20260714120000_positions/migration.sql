-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "name_uk" TEXT NOT NULL,
    "name_en" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);


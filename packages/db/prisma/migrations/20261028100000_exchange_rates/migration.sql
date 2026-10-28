-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "rate_to_uah" DECIMAL(14,6) NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nbu',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_date_source_key" ON "exchange_rates"("currency", "date", "source");
CREATE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates"("currency", "date");

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "price_uah" DECIMAL(14,2);
CREATE INDEX "listings_price_uah_idx" ON "listings"("price_uah");

-- Backfill UAH rows; USD/EUR rows are filled by `pnpm --filter @pricelens/pipeline backfill:fx`
-- (or automatically the next time a search sees the listing).
UPDATE "listings" SET "price_uah" = "price" WHERE upper("currency") = 'UAH';

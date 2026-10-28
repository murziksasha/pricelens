-- Purchases become a header with one or more positions (purchase_items).
-- purchases.sale_price is the TOTAL for the whole purchase; per-unit values are derived per position.
--
-- MANUAL CHECK BEFORE DEPLOYING (see docs/OPS.md): older versions treated sale_price as per-unit.
-- List rows that may have been typed per unit and fix them (multiply by qty) before this runs:
--   SELECT id, qty, price, sale_price FROM purchases WHERE qty > 1 AND sale_price IS NOT NULL;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "sale_price_uah" DECIMAL(14,2),
ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "qty" DROP NOT NULL,
ALTER COLUMN "listing_snapshot" DROP NOT NULL;

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "listing_id" UUID,
    "product_group_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "unit_price_uah" DECIMAL(14,2),
    "sale_manual" DECIMAL(14,2),
    "sale_total" DECIMAL(14,2),
    "sale_unit" DECIMAL(14,2),
    "sale_unit_uah" DECIMAL(14,2),
    "alloc_method" TEXT,
    "listing_snapshot" JSONB NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_items_qty_check" CHECK ("qty" >= 1)
);

-- CreateIndex
CREATE INDEX "purchase_items_product_group_id_idx" ON "purchase_items"("product_group_id");
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");
CREATE INDEX "purchases_sold_at_idx" ON "purchases"("sold_at");

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one position per existing purchase (sale_price treated as the purchase total).
INSERT INTO "purchase_items" (
  "id", "purchase_id", "listing_id", "product_group_id", "qty", "unit_price", "unit_price_uah",
  "sale_total", "sale_unit", "sale_unit_uah", "alloc_method", "listing_snapshot"
)
SELECT
  gen_random_uuid(), p."id", p."listing_id", p."product_group_id", GREATEST(COALESCE(p."qty", 1), 1), COALESCE(p."price", 0),
  CASE WHEN upper(p."currency") = 'UAH' THEN p."price" END,
  p."sale_price",
  ROUND(p."sale_price" / GREATEST(COALESCE(p."qty", 1), 1), 2),
  CASE WHEN upper(p."currency") = 'UAH' THEN ROUND(p."sale_price" / GREATEST(COALESCE(p."qty", 1), 1), 2) END,
  CASE WHEN p."sale_price" IS NULL THEN NULL ELSE 'single' END,
  COALESCE(p."listing_snapshot", '{}'::jsonb)
FROM "purchases" p;

UPDATE "purchases" SET "sale_price_uah" = "sale_price" WHERE upper("currency") = 'UAH' AND "sale_price" IS NOT NULL;

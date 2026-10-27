-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "email_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- Ensure pg_trgm index remains
CREATE INDEX IF NOT EXISTS listings_title_trgm ON listings USING gin (title gin_trgm_ops);

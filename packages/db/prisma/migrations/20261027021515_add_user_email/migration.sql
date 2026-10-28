-- This migration's timestamp sorts before `init`, so on a fresh database the tables
-- do not exist yet. Guarded so it is a no-op there; `20261027203100_user_email_columns`
-- adds the same columns after `init` (idempotent on databases that already ran this).
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT,
      ADD COLUMN IF NOT EXISTS "email_opt_in" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF to_regclass('public.listings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS listings_title_trgm ON listings USING gin (title gin_trgm_ops);
  END IF;
END $$;

-- Re-applies the user email columns after `init` (see 20261027021515_add_user_email). Idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "email_opt_in" BOOLEAN NOT NULL DEFAULT false;

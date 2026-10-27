-- AlterTable visits
ALTER TABLE "visits" DROP CONSTRAINT "visits_user_id_fkey";
ALTER TABLE "visits" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable listing_notes
ALTER TABLE "listing_notes" DROP CONSTRAINT "listing_notes_user_id_fkey";
ALTER TABLE "listing_notes" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "listing_notes" ADD CONSTRAINT "listing_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable purchases
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_user_id_fkey";
ALTER TABLE "purchases" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


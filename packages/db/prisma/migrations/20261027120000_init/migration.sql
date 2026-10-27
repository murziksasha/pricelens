-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "MarkStatus" AS ENUM ('interesting', 'rejected', 'bought', 'contacted');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "url_template" TEXT NOT NULL,
    "parse_rules" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "region_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "poll_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "max_concurrency" INTEGER NOT NULL DEFAULT 1,
    "min_delay_ms" INTEGER NOT NULL DEFAULT 800,
    "paused_until" TIMESTAMP(3),
    "use_browser" BOOLEAN NOT NULL DEFAULT false,
    "supported_filters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unsupported_filters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_condition" TEXT NOT NULL DEFAULT 'unknown',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "icon" TEXT,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "preset" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "site_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_group_members" (
    "group_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,

    CONSTRAINT "site_group_members_pkey" PRIMARY KEY ("group_id","site_id")
);

-- CreateTable
CREATE TABLE "site_config_versions" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_health" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "latency_ms" INTEGER,
    "screenshot_path" TEXT,

    CONSTRAINT "site_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site_selection" (
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "selected" BOOLEAN NOT NULL,

    CONSTRAINT "user_site_selection_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "site_ids" TEXT[],
    "refresh" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'running',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_site_runs" (
    "id" UUID NOT NULL,
    "search_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "from_cache" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "search_site_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_cache" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "listing_ids" TEXT[],

    CONSTRAINT "search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_templates" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "site_ids" TEXT[],
    "filters" JSONB NOT NULL,
    "sort" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_schedules" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "cron" TEXT NOT NULL DEFAULT '',
    "interval_minutes" INTEGER,
    "daily_time" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_rules" JSONB NOT NULL,
    "last_run_at" TIMESTAMP(3),

    CONSTRAINT "template_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_runs" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "new_count" INTEGER NOT NULL DEFAULT 0,
    "changed_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "schedule_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "location" TEXT,
    "posted_at" TIMESTAMP(3),
    "specs" JSONB,
    "image_url" TEXT,
    "image_hash" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'unknown',
    "description" TEXT,
    "seller" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_prices" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'laptop',
    "specs" JSONB NOT NULL,
    "group_key" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expected_sale_price" DECIMAL(14,2),
    "min_margin" DECIMAL(14,2),
    "manual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_listings" (
    "product_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "match_score" DOUBLE PRECISION NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_listings_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "search_results" (
    "search_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "search_results_pkey" PRIMARY KEY ("search_id","listing_id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_marks" (
    "listing_id" UUID NOT NULL,
    "status" "MarkStatus" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_marks_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "listing_notes" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicates" (
    "listing_id" UUID NOT NULL,
    "original_listing_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicates_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "listing_id" UUID,
    "product_group_id" UUID,
    "user_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "sale_price" DECIMAL(14,2),
    "sold_at" TIMESTAMP(3),
    "note" TEXT,
    "listing_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "user_id" UUID NOT NULL,
    "chat_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "telegram_codes" (
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_codes_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heal_proposals" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heal_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_shots" (
    "id" UUID NOT NULL,
    "site_id" UUID,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "image_base64" TEXT,
    "boxes" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_shots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_key_key" ON "sites"("key");

-- CreateIndex
CREATE UNIQUE INDEX "site_config_versions_site_id_version_key" ON "site_config_versions"("site_id", "version");

-- CreateIndex
CREATE INDEX "site_health_site_id_checked_at_idx" ON "site_health"("site_id", "checked_at");

-- CreateIndex
CREATE INDEX "searches_user_id_created_at_idx" ON "searches"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "search_site_runs_search_id_idx" ON "search_site_runs"("search_id");

-- CreateIndex
CREATE UNIQUE INDEX "search_cache_site_id_cache_key_key" ON "search_cache"("site_id", "cache_key");

-- CreateIndex
CREATE INDEX "search_templates_owner_id_idx" ON "search_templates"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_schedules_template_id_key" ON "template_schedules"("template_id");

-- CreateIndex
CREATE INDEX "schedule_runs_template_id_started_at_idx" ON "schedule_runs"("template_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "listings_url_key" ON "listings"("url");

-- CreateIndex
CREATE INDEX "listings_site_id_external_id_idx" ON "listings"("site_id", "external_id");

-- CreateIndex
CREATE INDEX "listings_title_idx" ON "listings"("title");

-- CreateIndex
CREATE INDEX "listing_prices_listing_id_seen_at_idx" ON "listing_prices"("listing_id", "seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "products_group_key_key" ON "products"("group_key");

-- CreateIndex
CREATE INDEX "product_listings_product_id_idx" ON "product_listings"("product_id");

-- CreateIndex
CREATE INDEX "visits_listing_id_visited_at_idx" ON "visits"("listing_id", "visited_at");

-- CreateIndex
CREATE INDEX "visits_user_id_idx" ON "visits"("user_id");

-- CreateIndex
CREATE INDEX "listing_notes_listing_id_idx" ON "listing_notes"("listing_id");

-- CreateIndex
CREATE INDEX "purchases_product_group_id_idx" ON "purchases"("product_group_id");

-- CreateIndex
CREATE INDEX "purchases_purchased_at_idx" ON "purchases"("purchased_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_chat_id_key" ON "telegram_links"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_codes_code_key" ON "telegram_codes"("code");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "heal_proposals_site_id_status_idx" ON "heal_proposals"("site_id", "status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_group_members" ADD CONSTRAINT "site_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "site_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_group_members" ADD CONSTRAINT "site_group_members_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_config_versions" ADD CONSTRAINT "site_config_versions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_health" ADD CONSTRAINT "site_health_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_selection" ADD CONSTRAINT "user_site_selection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site_selection" ADD CONSTRAINT "user_site_selection_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_site_runs" ADD CONSTRAINT "search_site_runs_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_site_runs" ADD CONSTRAINT "search_site_runs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_cache" ADD CONSTRAINT "search_cache_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_templates" ADD CONSTRAINT "search_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_schedules" ADD CONSTRAINT "template_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "search_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_prices" ADD CONSTRAINT "listing_prices_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_listings" ADD CONSTRAINT "product_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_marks" ADD CONSTRAINT "listing_marks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_notes" ADD CONSTRAINT "listing_notes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_notes" ADD CONSTRAINT "listing_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicates" ADD CONSTRAINT "duplicates_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicates" ADD CONSTRAINT "duplicates_original_listing_id_fkey" FOREIGN KEY ("original_listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_codes" ADD CONSTRAINT "telegram_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heal_proposals" ADD CONSTRAINT "heal_proposals_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_shots" ADD CONSTRAINT "browser_shots_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX listings_title_trgm ON listings USING gin (title gin_trgm_ops);

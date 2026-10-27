-- CreateTable
CREATE TABLE "health_runs" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_runs_status_created_at_idx" ON "health_runs"("status", "created_at");


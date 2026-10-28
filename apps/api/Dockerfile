FROM node:22-bookworm-slim
# pg_dump must match the postgres:16 server (Debian bookworm ships client 15), so use the PGDG repo.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/adapters ./packages/adapters
COPY packages/pipeline ./packages/pipeline
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pricelens/db generate
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @pricelens/db exec prisma migrate deploy && pnpm --filter @pricelens/api exec tsx src/main.ts"]

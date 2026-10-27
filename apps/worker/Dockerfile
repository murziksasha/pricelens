FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/adapters ./packages/adapters
COPY packages/pipeline ./packages/pipeline
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pricelens/db generate
RUN pnpm --filter @pricelens/worker exec playwright install --with-deps chromium
CMD ["pnpm", "--filter", "@pricelens/worker", "exec", "tsx", "src/main.ts"]

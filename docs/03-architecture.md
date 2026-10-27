# 03 — Architecture  (Status: Implemented)

## Deployment targets
1. **Docker**: `docker compose up` starts `api`, `web`, `postgres`, `worker`.
2. **Web**: browser client served by the server, reachable on the LAN.
3. **Windows native**: thin desktop client (proposed: Tauri) wrapping the same web UI and connecting to the Docker server on the LAN. No local database, no offline mode (ADR-0003). Adds: native window, tray, OS notifications, embedded browser for the site constructor, "Open in browser" action.

## Components
- **API server** — REST/JSON, auth, business logic.
- **Search worker** — background job queue; calls the search provider and fetches/parses pages; rate-limited per site.
- **PostgreSQL** — all data; full-text + `pg_trgm` for fuzzy matching.
- **Web UI** — SPA.

## Stack (ADR-0004)
- Language: TypeScript everywhere (monorepo: `apps/api`, `apps/worker`, `apps/web`, `apps/desktop`, `packages/shared`, `packages/db`, `packages/adapters`, `packages/pipeline`). `packages/pipeline` is the shared search, grouping, backup and notification domain used by the API and the worker.
- Backend: NestJS; ORM: Prisma (migrations); job queue: pg-boss (PostgreSQL-based, no Redis).
- Scraping / constructor: Playwright (Chromium) in the worker container.
- Frontend: React + TypeScript.
- Desktop: Tauri (thin client).
- Search: per-site `SiteAdapter` (native search URL/API + parser) is primary; `GoogleFallbackProvider` only for sites without own search (ADR-0001).




## Hosting (ADR-0006)
- Server host: owner's Windows laptop running Docker Desktop, reachable on the LAN (fixed local IP or hostname).
- Docker Desktop and containers start automatically at login; `restart: unless-stopped`.
- When the laptop is off or asleep: clients show "server unavailable"; scheduled searches resume on next start and run missed jobs once.
- Recommended: disable sleep while plugged in; Windows firewall rule for the app port.

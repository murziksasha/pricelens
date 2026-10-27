# Operations

## Run on the laptop

1. Install Docker Desktop and keep the machine awake while it is plugged in.
2. Copy `.env.example` to `.env`. Set `ADMIN_PASSWORD` to a real password before `NODE_ENV=production`.
3. `docker compose up --build`.
4. Open `http://<lan-ip>:8080`. The API is on port 3000 and answers `GET /health`.
5. Allow inbound TCP 8080 (and 3000 if clients call the API directly) and UDP 53530 (automatic LAN discovery beacon) on the Windows firewall for the private network profile.

Postgres, the API, the worker and the web container restart unless stopped. Scheduled searches and the daily 03:00 backup run inside the worker. If the laptop was off, the worker runs a missed schedule once on startup and creates a backup if the newest automatic dump is older than 24 hours.

Backups live in the `backups` volume. Restore from the admin UI always writes a safety dump first and keeps the 10 newest files.

## LAN Discovery

When `DISCOVERY!=0`, the API broadcasts a UDP beacon on port `53530` every 5 seconds (`pricelens 1 <api-port>`). The login screen has a "Find server" button that automatically probes `http://127.0.0.1:3000/health`, `http://<page-host>:3000/health`, or queries the desktop UDP listener (`discover_server`).

## Development

```
docker compose up -d postgres
pnpm install
pnpm generate
pnpm --filter @pricelens/api dev
pnpm --filter @pricelens/web dev
```

`INLINE_SEARCH=1` (the default outside Compose) runs a search inside the API process. Compose sets `INLINE_SEARCH=0` so the worker claims queued searches.

`pnpm test` is unit tests. `pnpm test:integration` needs Postgres on `localhost:5432`. `RUN_LIVE=1 pnpm --filter @pricelens/adapters test` hits the real sites.

## Desktop

The Windows client is a Tauri shell in `apps/desktop`. Install Rust, then run `apps/desktop/build.ps1`. On the login screen set the server to `http://<lan-ip>:3000` and use Test connection.

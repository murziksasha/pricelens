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

## Backups

- Automatic backups run on the `backup_cron` schedule (default daily) and whenever the last automatic
  backup is older than 24 hours. Only pg_dump custom-format files (`.dump`) are accepted for upload.
- Restoring takes a `safety-*.dump` backup first. The 3 newest safety backups are kept separately and
  never push regular backups out of rotation; the backup being restored is never deleted.
- `pg_dump`/`pg_restore` must be on the API/worker PATH (the Docker images include them).

## Upgrading to purchase positions (migration `20261028110000_purchase_items`)

1. Take a backup (Admin → Backups → Create) and download it.
2. Check old purchases where `sale_price` may have meant "per unit" instead of "whole purchase":

   ```sql
   SELECT id, qty, price, sale_price FROM purchases WHERE qty > 1 AND sale_price IS NOT NULL;
   ```

   From now on `sale_price` is the total for the whole purchase. Fix any row that stored a per-unit
   price (`UPDATE purchases SET sale_price = sale_price * qty WHERE id = '…'`) **before** migrating.
3. Run `pnpm --filter @pricelens/db migrate:deploy` (or restart the stack; the API applies migrations).

## Prices in hryvnia

After the `exchange_rates` migration, fill `price_uah` for old listings and purchases:

```bash
pnpm --filter @pricelens/pipeline backfill:fx
```

The worker refreshes NBU rates every 6 hours (`FX_AUTORUN=0` disables it); manual rates and the
spread are set in Admin → Settings.

## Re-grouping listings

Grouping is stricter now (same model and specs prefix). Preview first, then apply:

```bash
pnpm --filter @pricelens/pipeline regroup           # dry run, prints the changes
pnpm --filter @pricelens/pipeline regroup --apply   # take a backup first
```

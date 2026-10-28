# PriceLens

Self-hosted multi-site search for a small LAN team. Spec: `docs/`. Runbook: `docs/OPS.md`.

## First start

1. Copy `.env.example` to `.env`.
2. Set **`ADMIN_PASSWORD`** (required; the stack refuses to start with the default `changeme`) and **`POSTGRES_PASSWORD`**.
3. Optional: `WEB_ORIGIN` lists extra browser origins that call the API on port 3000 directly
   (the web UI on :8080 goes through nginx and the desktop app is always allowed).

> **Existing install:** the `pgdata` volume keeps its old password (`pricelens`). Either set
> `POSTGRES_PASSWORD=pricelens`, or first run
> `docker compose exec postgres psql -U pricelens -c "ALTER USER pricelens PASSWORD 'new-password'"`
> and then put the new password in `.env`.

```
docker compose up --build
```

Web UI: `http://localhost:8080`. Health: `http://localhost:8080/health`.

## Upgrading

Take a backup in **Admin → Backups → Backup now** before pulling a release that contains database migrations.
See `docs/OPS.md` for release-specific manual steps.

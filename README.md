# PriceLens

Self-hosted multi-site search for a small LAN team. Spec: `docs/`. Runbook: `docs/OPS.md`.

## First start

1. Copy `.env.example` to `.env`.
2. Set **`ADMIN_PASSWORD`** (required; the stack refuses to start with the default `changeme`) and **`POSTGRES_PASSWORD`**.
3. Set `WEB_ORIGIN` to the address(es) colleagues open in the browser, e.g. `http://192.168.1.10:8080,http://localhost:8080`.

```
docker compose up --build
```

Web UI: `http://localhost:8080`. Health: `http://localhost:8080/health`.

## Upgrading

Take a backup in **Admin → Backups → Backup now** before pulling a release that contains database migrations.
See `docs/OPS.md` for release-specific manual steps.

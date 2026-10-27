# Grill: PriceLens product search & comparison app
Date: 2026-10-27

## Intent
A self-hosted tool for an electronics shop owner to find used/new laptops (and other goods) across many Ukrainian sites at once, compare the same model side by side, spot resale deals, and never re-review listings already handled.

## Constraints
- Owner + a few LAN users; admin creates accounts and roles (Admin/User).
- PostgreSQL in Docker; Web and Windows (Tauri) thin clients to one server.
- Server runs on owner's laptop; 10 rotating backups with restore/download/delete.
- All 16 sites in v1.
- UI in RU/UK/EN from v1.

## Key decisions
- Decision: site-native search first, Google only as last resort. Reason: fresher, precise filters, no quota. Alternative considered: Google-first hybrid.
- Decision: visual no-code site constructor with multi-strategy resilient selectors. Reason: survive class/tag renames. Alternative considered: plain CSS selectors.
- Decision: group by model + key specs, shops and classifieds together. Reason: see margin.
- Decision: thin clients, single Docker server. Alternative considered: standalone Windows app with local DB.
- Decision: visits and statuses shared across team.
- Decision: TypeScript stack (NestJS, React, Tauri, Playwright, Prisma, pg-boss). Alternative considered: Python/FastAPI.
- Decision: Telegram + in-app notifications; scheduled templates; per-site polling interval.
- Decision: deal score vs. 30-day median + minimum margin 1 500 UAH.
- Decision: all 16 sites at once. Alternative considered: start with 3-4.
- Decision: host on laptop. Alternative considered: dedicated always-on PC.

## Surfaced assumptions
- Sites may block frequent scraping; mitigated by per-site intervals, backoff, health checks.
- Laptop off = no scheduled searches; catch-up on start.
- Deal score needs >= 3 comparable listings.

## Open questions
- Proxy support needed later?
- Default costs (delivery/repair) for expected profit.

## Out of scope
Messaging sellers, inventory/sales accounting, publishing ads, public SaaS, mobile apps. Only "Bought" (price/date/qty, optional sale price) is kept.

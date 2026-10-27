# 01 — Vision & Scope  (Status: Implemented)

## Problem
The owner of an electronics shop buys products (e.g. used laptops) for resale. Finding the same product across several sites (OLX, Rozetka, Prom, etc.), comparing price/specs, and remembering which listings were already reviewed is slow and manual.

## Goal
One app where a single query searches many configurable sites at once (via a Google-based search engine), results are grouped by product, compared side by side, and already-opened listings are clearly marked in later searches.

## Users
- Owner (super-admin) plus a few colleagues on the local network.
- No self-registration: the admin creates accounts, sets login/password, and assigns roles.

## Success criteria
- One search over N sites returns grouped, comparable results in < 10 s.
- Already-visited listings are never presented as "new".
- Adding/editing/removing a site takes < 1 minute, no code change.

## Non-goals (v1)
- Public SaaS / multi-tenant, payments, mobile apps.
- Automatic purchasing or messaging sellers.
- Inventory/stock management, sales accounting, publishing own ads (only the "Bought" record with price/date is in scope, FR-BUY).


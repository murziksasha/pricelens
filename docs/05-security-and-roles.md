# 05 — Security & Roles  (Status: Implemented)

- No public registration; first run creates the super-admin.
- Roles: **Admin** (manage users, roles, global settings, sites) and **User** (search, compare, mark, manage own saved searches).
- Admins can create other admins and users, set/reset passwords, deactivate accounts.
- Admins change role and password from the list (own password included); they delete any account except their own; the last active admin cannot be deleted or demoted; shared purchases, visits and shared notes remain.
- Passwords hashed (Argon2/bcrypt); session tokens with expiry.
- LAN-only by default; HTTPS optional with self-signed cert.

## Data visibility

PriceLens is a tool for one shop team, so most data is shared on purpose (decided 2026-10-28).
Everything below still requires a signed-in, active account.

| Data | Who can see it |
|---|---|
| Searches, their results and CSV/XLSX exports | Whole team (anyone with the search link). History lists your own searches; `?scope=team` lists everyone's. |
| Visits and marks | Whole team |
| Purchases | Whole team can view; only the buyer or an admin can edit |
| Notes | Shared notes: whole team. Private notes: only their author |
| Settings, backups, users, sites, constructor, health | Admins only |

Search ids are random UUIDs and every request needs a session, so nothing leaves the team.
Opening another user's search by id is **not** an IDOR bug; do not add an owner check.

## Network hardening

- The API only answers CORS requests from `WEB_ORIGIN` (comma list) and the desktop app
  (`http://tauri.localhost`, `tauri://localhost`). The session cookie is `SameSite=Strict`.
- Behind nginx the API trusts `X-Forwarded-For` only from loopback/private proxies, so the LAN-only
  check and the login limit see the real client. Login is limited per IP+login pair
  (`LOGIN_MAX_FAILS`, default 10) and per IP (`LOGIN_MAX_FAILS_PER_IP`, default 5× that).
- Tokens are accepted only in the `Authorization` header or the session cookie (not `?access_token=`).
- Postgres is bound to `127.0.0.1` and its password comes from `POSTGRES_PASSWORD`.

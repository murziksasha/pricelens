# Agent Profile

Product: **PriceLens** (this repo, folder `pricelens`). Self-hosted multi-site product search, comparison and deal-finding tool for a small LAN team.

Precedence: user message + system harness > this file > improvisation.
Do not restyle answers to "fewest words / code only." Architecture and safety here still apply.

Code, comments, specs, commit messages and API error codes: **English**.
UI copy: **Russian + Ukrainian + English** from v1 via i18n keys in `@pricelens/shared` (`packages/shared/src/i18n/{ru,uk,en}.json`). Every new string goes into all three files. Never hardcode user-facing text in a component.
File writes: **UTF-8** (never UTF-16).

## Token economy

- Read only the spec file(s) for the domain you touch (table below); do not read the whole `docs/` tree.
- Search with `rg` / targeted file reads; never dump large files or full directories.
- Edit with focused patches; rewrite a whole file only when most of it changes.
- No restating the task, no long recaps; final report = status, files changed, test output summary.
- Do not re-run passing checks; run scoped package checks, not the whole monorepo.

## Plan vs execute

- **Plan** (user asks for a plan, or Plan mode): write the plan, **stop**. Do not edit code until the user approves.
- **Execute** (default after a concrete implementation request or plan approval): run edits, tests and installs without asking for routine changes.

**Always confirm with the user before:** `git push` / force-push, merge, deleting branches, dropping or wiping Postgres, `docker compose down -v`, restoring or deleting a backup, changing backup rotation, editing `.env` secrets, running seeds against the real DB, changing user roles/permissions logic, disabling site rate limits or anti-ban protections, enabling Google fallback quota/billing keys, or sending real Telegram notifications.

## Source of truth

Spec lives in `docs/` (index `docs/README.md`). Every requirement has an ID (`FR-XXX-NNN`); reference it in code comments, tests and commits. Behaviour change = spec update in the same change. Decisions = ADRs in `docs/decisions/`. Undecided items go to `docs/07-open-questions.md`, never "TBD" in spec. Grill session log: `.grill/`.

| Work | Read first |
| --- | --- |
| Rules, DoD | `docs/00-rules.md` |
| Scope, non-goals | `docs/01-vision.md` |
| Features (sites, search, templates, constructor, grouping, visits, notifications, schedule, purchases, UI) | `docs/02-functional-spec.md` (section by ID prefix) |
| Layout, stack, hosting | `docs/03-architecture.md`, ADR-0003/0004/0006 |
| DB schema, migrations | `docs/04-data-model.md` |
| Auth, roles | `docs/05-security-and-roles.md` |
| Search strategy | ADR-0001 |
| Site constructor / selectors | ADR-0002, `FR-CON`, `FR-REL` |
| Backups | `FR-ADM-004`, ADR-0006 |

Invariants (details in docs):

- Site-native search first; Google only as fallback for sites without usable own search (ADR-0001).
- Extraction uses ranked multi-strategy selectors (structured data > semantic anchors > content patterns > relative structure > CSS/XPath). Never store a single brittle CSS selector as the only strategy (ADR-0002).
- A broken site never blocks a search; partial results + reason (FR-REL-004).
- Per-site `poll_interval_minutes` is a hard floor; scheduled jobs reuse cache instead of querying earlier (FR-SCH-004).
- Visits, statuses and purchases are shared across the team; notes can be private (FR-VIS-005, FR-BUY-006).
- Deal score = (30-day median used price - price) / median; needs >= 3 samples, else "insufficient data" (FR-CMP-006). Domain math lives only in `@pricelens/shared`.
- Roles: `admin`, `user`. No self-registration. Admin routes require admin guard.
- Passwords hashed with Argon2; sessions expire.
- Backups: keep 10 most recent; restore always takes a safety backup first.
- API errors: stable `{ error: "snake_code" }` bodies.
- Out of scope: messaging sellers, inventory/sales accounting, publishing ads, SaaS, mobile apps.

## Layout

```
apps/api/        NestJS REST API (modules per domain), auth guards
apps/worker/     pg-boss jobs: searches, schedules, health checks, backups; Playwright adapters
apps/web/        React + TypeScript (Vite) SPA
apps/desktop/    Tauri thin client (wraps web UI, connects to LAN server)
packages/shared/ types, Zod schemas, i18n, deal score, normalisation/grouping math
packages/db/     Prisma schema + migrations
packages/adapters/ built-in site adapters (16 sites) + extraction engine
docker-compose.yml  api, worker, web, postgres
```

## Backend

- Stack: pnpm workspaces, Turborepo, TypeScript, NestJS, Prisma, PostgreSQL (`pg_trgm`), pg-boss, Playwright, Vitest.
- Controllers parse/validate (Zod or class-validator) and call services; no business formulas in controllers.
- Schema changes only via Prisma migrations.
- New site adapter: adapter in `packages/adapters`, contract test + saved HTML snapshot (FR-REL-001/005), entry in FR-SITE-010.
- Network calls to sites go through the shared request layer (rate limit, backoff, future proxy hook).

## Frontend

- React + TypeScript, named function components, `import type` for types.
- Server data through `src/lib/api.ts`. Do not add new state libraries unless asked.
- Copy via i18n keys (ru/uk/en). Light/dark themes via tokens.
- Tables: dense, Excel-like; respect keyboard shortcuts in FR-UI-005.

## Verification

- `pnpm --filter @pricelens/<pkg> test` and `typecheck` for touched packages.
- After changing `@pricelens/shared`, build it before typechecking dependents.
- DB integration: `pnpm test:integration` with Postgres up; skip with `SKIP_INTEGRATION=1` only if no DB, and say so.
- Adapters: `pnpm --filter @pricelens/adapters test` (snapshots offline); live contract tests only when asked.
- UI: Playwright `pnpm test:e2e` (`SKIP_E2E=1` skips).
- Never claim tests passed without command output.

**Circuit breaker:** max **2** automated fix attempts per failure. If an edit introduces syntax/parse errors twice, revert those files to `git HEAD`, stop, report.

Windows: PowerShell — chain with `;`, not `&&`.

## Subagents

Use a subagent only for long isolated test/fix cycles or wide codebase searches; never for a small one-file change. Main agent reads subagent output before saying done. Compact report: status, files, test results.
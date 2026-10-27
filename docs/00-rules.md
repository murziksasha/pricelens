# 00 — Project Rules

## Spec governance
1. The spec in `docs/` is authoritative. Any change in behaviour requires a spec update in the same commit/PR.
2. Every requirement has a stable ID (e.g. `FR-SRCH-001`). Code comments, tests, and commits reference these IDs.
3. Significant technical decisions are recorded as ADRs in `docs/decisions/NNNN-title.md` (Context, Decision, Alternatives, Consequences).
4. Unresolved items go to `07-open-questions.md`, never as "TBD" inside the spec.
5. Spec status per file: `Draft` → `Agreed` → `Implemented`.

## Engineering rules
- One codebase, three targets: Docker (server), Web (browser client), Windows native (desktop shell). No feature forks per target.
- Database: PostgreSQL only; all schema changes via versioned migrations, never manual edits.
- Every feature ships with tests (unit + at least one integration test touching the DB).
- Secrets (API keys, DB passwords) never in the repo; use `.env` / OS secret store.
- Conventional Commits (`feat:`, `fix:`, `docs:` ...) referencing requirement IDs.
- Language: code, comments, docs in English; UI localised RU / UK / EN from v1; every new string must be added to all three locale files.
- Respect target websites: rate limits, robots/ToS awareness, caching to avoid repeated requests.

## Definition of Done
Spec updated · tests pass · migration included (if schema changed) · works in Docker and Windows build · changelog entry.


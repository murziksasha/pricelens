# Changelog

## 1.0.0

- Monorepo, Docker Compose, Prisma migration with `pg_trgm`, and seed for the admin user plus 16 sites.
- Session auth (Argon2id), admin and user roles, audit log.
- Web UI in English, Russian and Ukrainian, with light, dark and system themes.
- Site registry, groups, config versions, import/export and rollback.
- Extraction engine (structured data, semantic labels, patterns, repeated cards, CSS last) and offline snapshots for 16 sites.
- Multi-site search with partial failures, poll-interval cache, visits, shared marks, private notes, duplicates, grouping, deal score, compare export, purchases, templates, schedules, in-app notifications and Telegram linking.
- Health records, backup rotation (keep 10), constructor preview and heal proposals.
- Tauri shell scaffold for the Windows client.
- Email notifications for saved-search hits (FR-NTF-001) with SMTP configuration and user opt-in, automatic UDP LAN discovery beacon on port 53530 with client discovery.


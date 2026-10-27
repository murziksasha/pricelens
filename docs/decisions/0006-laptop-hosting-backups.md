# ADR-0006: Host on owner's laptop (LAN), rotating backups
Status: Accepted · Date: 2026-10-27
## Decision
Docker stack runs on the owner's laptop; LAN clients connect to it. Automatic backups with 10-copy rotation, restore/download/delete/upload from UI.
## Alternative considered
Dedicated always-on PC/mini-PC (deferred; migration = restore a backup on the new host).
## Consequences
No service while laptop is off; missed schedules catch up on start.

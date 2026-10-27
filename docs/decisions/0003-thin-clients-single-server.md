# ADR-0003: Single Docker server; Web and Windows apps are thin clients
Status: Accepted · Date: 2026-10-27

## Decision
One PostgreSQL + API in Docker is the only data store. Web UI (any browser on the LAN) and the Windows desktop client both connect to it; the user can switch from the desktop app to the browser at any time (same session/URL).

## Alternatives
Standalone Windows app with bundled PostgreSQL (rejected: sync complexity, divergent data).

## Consequences
Clients need network access to the server; server address configurable in the Windows client (auto-discovery on LAN optional).

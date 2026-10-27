# ADR-0005: Ship all 16 sites in v1
Status: Accepted · Date: 2026-10-27
## Context
Owner needs full coverage from day one. Risk: layout changes / anti-bot silently break adapters.
## Decision
All 16 adapters in M1, mitigated by FR-REL (contract tests, health dashboard, alerts, partial results, Google fallback).
## Alternative considered
Start with 3-4 sites (rejected by owner).

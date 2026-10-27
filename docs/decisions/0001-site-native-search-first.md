# ADR-0001: Site-native search first, Google as last-resort fallback
Status: Accepted · Date: 2026-10-27

## Context
Listings (e.g. OLX) change fast; Google indexes stale/removed ads, lacks precise price/city filters, and has paid quotas.

## Decision
Each site is searched through its own search page or API with native filters. Google Programmable Search is used only for sites with no usable own search.

## Alternatives
Google-only (rejected: stale results, quota cost, weak filters); hybrid with Google as default (rejected by owner).

## Consequences
Per-site adapters/templates and parse rules must be maintained; site health monitoring (FR-SITE-005) becomes essential. Google API key is optional.

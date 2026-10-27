# ADR-0002: Visual constructor with multi-strategy resilient selectors
Status: Accepted · Date: 2026-10-27

## Context
The owner must add sites without a programmer by clicking elements; mappings must survive renamed classes/tags.

## Decision
Constructor captures clicks in an embedded browser and stores a ranked set of extraction strategies per field (structured data, semantic anchors, content patterns, relative structure, CSS/XPath last). Validation + self-healing proposals on failure.

## Alternatives
Plain CSS selectors (rejected: brittle); AI-only extraction (deferred: cost/latency, may be added as an extra strategy).

## Consequences
Constructor needs an embedded browser (Playwright on server / WebView in Windows app); more complex extraction engine and test suite.

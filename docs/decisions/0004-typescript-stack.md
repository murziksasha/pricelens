# ADR-0004: TypeScript full stack — NestJS, React, Tauri, Playwright
Status: Accepted · Date: 2026-10-27

## Decision
TypeScript monorepo. API: NestJS + Prisma + PostgreSQL. Queue: pg-boss. Web: React + TypeScript (Vite). Desktop: Tauri. Site search/extraction and visual constructor: Playwright.

## Alternatives
Python/FastAPI backend (rejected: two languages to maintain).

## Consequences
Shared types between API, worker and UI in `packages/shared`; Playwright browsers shipped in the worker Docker image.

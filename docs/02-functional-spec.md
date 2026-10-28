# 02 — Functional Specification  (Status: Implemented)

## Sites (FR-SITE)
- FR-SITE-001 CRUD for search sites: name, domain, enabled flag, region tags, priority, icon.
- FR-SITE-002 Per-site search mode. **Primary: the site's own search** (URL template with placeholders `{query}`, `{price_min}`, `{price_max}`, `{city}`, `{page}`, or the site's API if available). **Fallback only: Google `site:` query**, used when a site has no usable own search. See ADR-0001.
- FR-SITE-003 Per-site parsing rules (optional): CSS/JSON selectors for price, title, specs, location, date.
- FR-SITE-004 Site groups / presets (e.g. "Ukraine classifieds", "Odesa region").
- FR-SITE-005 Site health indicator (last success, error rate).

## Search (FR-SRCH)
- FR-SRCH-001 One query runs in parallel across selected sites/groups.
- FR-SRCH-002 Filters: price range, currency, condition (new/used), location/radius, date posted.
- FR-SRCH-003 Saved searches with optional schedule (e.g. daily) and "only new since last run".
- FR-SRCH-004 Search history per user, re-runnable.
- FR-SRCH-005 Results cached; configurable refresh to save API quota.

## Results & comparison (FR-CMP)
- FR-CMP-001 Result list: title, price, site, location, date, thumbnail, link.
- FR-CMP-002 Automatic grouping of the same product across sites (model normalisation + fuzzy match); manual merge/split.
- FR-CMP-003 Side-by-side comparison table of selected items: price, specs, features, seller, condition.
- FR-CMP-004 Price analytics per product: min/avg/max, distribution, price history over time.
- FR-CMP-005 Spec extraction (CPU, RAM, storage, GPU, screen) into structured fields; editable manually.
- FR-CMP-006 **Deal score** = (median used price of the product group - listing price) / median, in %. Median computed over active used listings of the same group in the last 30 days (min 3 samples, else "insufficient data").
  - Thresholds (admin-configurable): >= 20% green "Deal", 10-20% yellow, < 10% neutral.
  - Per-group/user **expected sale price** (manual or default = median) and **minimum margin** (default 1 500 UAH).
  - Expected profit = expected sale price - listing price - configurable costs (delivery, repair estimate); shown as "≈ X UAH".
  - Notifications trigger when deal score >= threshold OR expected profit >= minimum margin.
- FR-CMP-007 Export to CSV/XLSX.

## Visited & duplicates (FR-VIS)
- FR-VIS-001 Opening a link via the app records a visit (user, time).
- FR-VIS-002 In later searches visited listings are marked (badge, dimmed) and filterable ("hide visited").
- FR-VIS-003 Duplicate detection: same URL, same listing ID, or same product re-posted (title trigram, price within 5%, and a hash of the image URL) — marked as duplicate of the original.
- FR-VIS-004 Manual marks per listing: Interesting, Rejected, Bought, Contacted, with notes and tags.
- FR-VIS-005 Visits and statuses (Interesting/Rejected/Bought/Contacted) are **shared across the team**; badge shows who and when (e.g. "Opened by Ivan, 26.10"). Notes can be private or shared (per note).
- FR-VIS-006 Price-change detection on a known listing (badge "price dropped").

## Notifications (FR-NTF)
- FR-NTF-001 Saved search finds new items → in-app notification; optional Telegram/email.

## Administration (FR-ADM)
- FR-ADM-001 User management (see 05).
- FR-ADM-002 Global settings: search API keys, quotas, default sites, language, currency rates.
- FR-ADM-003 Audit log of admin actions.
- FR-ADM-004 **Backups** (admin only):
  - Automatic `pg_dump` on schedule (default daily 03:00, configurable) + manual "Backup now".
  - Rotation: keep the **10 most recent** backups, older ones deleted automatically (count configurable).
  - Backup list in UI: date, size, type (auto/manual), status.
  - Actions: **Restore** (with confirmation; a safety backup is taken first), **Download**, **Delete**, **Upload** a backup file to restore.
  - Backups stored in a Docker volume mapped to a host folder (configurable).
  - Missed schedule (laptop was off) runs at next startup.


## Initial site catalogue (FR-SITE-010)
Built-in adapters/presets shipped in v1: OLX (olx.ua), Prom.ua, Bigl.ua, Hotline.ua, Rozetka.com.ua, EK.ua, kvshop.com.ua, itbox.ua, click.ua, brain.com.ua, touch.com.ua, skay.ua, pcshop.ua, f.ua, proton-it.kyiv.ua, tex.ua.

## Site selection per search (FR-SITE-011)
- Checkbox list of sites (and groups) shown before each search; select all / none / invert.
- The last selection is saved **per user** and restored next time.

## Search templates (FR-TPL)
- FR-TPL-001 Save a search as a named template: query text, selected sites, filters (price range, condition, city), sort.
- FR-TPL-002 Edit a template: rename, change query, add/remove sites, change filters; duplicate a template.
- FR-TPL-003 Run a template in one click; optional schedule (links to FR-SRCH-003).
- FR-TPL-004 Templates are personal by default; an admin can publish a template as shared.

## Site constructor (FR-CON) — visual, no-code
- FR-CON-001 Admin opens a "New site" wizard: name, domain, search URL (the wizard detects the query parameter by running a test search, e.g. the user searches "test123" on the site and pastes the result URL). The probe word may sit in a query parameter or in the path (OLX uses `/q-<word>/`). Percent-encoding is decoded before the match, and the matched word is stored as `{query}`. Preview fetches the address with the probe word filled in, not the literal `{query}` placeholder.
- FR-CON-002 Built-in browser view of the results page. The web client previews HTML fetched by the server and assigns a clicked value to a field. The worker can also capture a Playwright screenshot plus element boxes for the same URL. Each assignment is stored as a ranked strategy, not a single CSS selector.
- FR-CON-003 Pagination: user clicks "next page" or the wizard detects the page parameter.
- FR-CON-004 Live preview: extracted results table shown immediately; user confirms or corrects.
- FR-CON-005 Optional detail-page mapping (specs table, seller, condition) using the same click method.
- FR-CON-006 **Resilient selectors** (must not break when classes, tags, or ids are renamed). For every field the system stores several strategies and ranks them:
  1. Structured data first: JSON-LD / schema.org Product/Offer, OpenGraph, microdata, site API JSON, and embedded listing JSON (`__PRERENDERED_STATE__`, `__NEXT_DATA__`).
  2. Semantic anchors: visible label text near the value (e.g. "Ціна", "₴"), ARIA roles/attributes, data-* attributes.
  3. Content patterns: regex/value type (price = number + currency, URL = href to item page).
  4. Relative structure: position within the repeated result card (detected as repeating sibling block), not absolute paths.
  5. CSS/XPath as last resort only.
  Extraction uses the first strategy that returns a valid typed value; all are kept as fallbacks.
- FR-CON-007 Self-healing: when extraction fails or values fail validation, the system re-locates the field by stored sample values/text features, proposes an updated mapping, and notifies the admin for one-click approval.
- FR-CON-008 Health checks: hourly scheduled background test query run per site (or on demand by admin via queued health runs); status green/yellow/red; failing sites auto-fall back to Google (ADR-0001).
- FR-CON-009 Site configs are versioned (history, rollback) and exportable/importable as JSON.
- FR-CON-010 Edit existing site in constructor: admin can select any existing site from a dropdown or via direct link from the Sites list, modify name, domain, or search URL (with probe query token replaced by {query}), and save back an updated config version while preserving existing parse rules.

## Product grouping rules (FR-GRP)
- FR-GRP-001 A product group = brand + model + key specs (category-specific; laptops: CPU model, RAM, storage size, GPU). Example: "Dell Latitude 7490 / i7-8650U / 16GB / 512GB".
- FR-GRP-002 Shop items (new, SKU-based) and classified ads (used, individual units) are both attached to the same group and shown side by side.
- FR-GRP-003 Group view shows: new price range (shops), used price range (classifieds), and estimated resale margin.
- FR-GRP-004 Automatic matching (normalised model names + spec extraction + fuzzy similarity); confidence score shown.
- FR-GRP-005 Manual merge / split / move listing to another group; manual decisions override automatic ones and are remembered.





## Site reliability (FR-REL) — required because all 16 sites ship in v1
- FR-REL-001 Each built-in adapter has an automated contract test (fixed query, expects >= 1 result with valid price/title/link); runs daily and in CI.
- FR-REL-002 Site health dashboard: status, last success, success rate 7d, avg response time, last error with screenshot.
- FR-REL-003 Breakage alert to admins via Telegram + in-app within one failed health cycle.
- FR-REL-004 A broken site never blocks a search: results from healthy sites are shown, broken ones listed with reason; automatic Google fallback where possible.
- FR-REL-005 Saved HTML snapshots of each site's results page for offline regression tests of extractors.


## Purchase history (FR-BUY)
- FR-BUY-001 Marking a listing **Bought** opens a quick form: purchase price (prefilled with listing price), date (today), quantity, optional note, optional actual sale price/date later. Stored with snapshot of listing (title, specs, site, URL, photo).
- FR-BUY-002 When a search result belongs to a product group with past purchases, show an inline badge "Bought before: 2x, last 8 200 UAH on 12.10.2026" on the group and on each listing.
- FR-BUY-003 Group detail panel "Purchase history": table of past purchases (date, price, buyer, source site, sale price if entered, realised margin) + mini price chart overlaying past purchase prices on current listing prices.
- FR-BUY-004 Comparison hint: current listing price vs. your average/last purchase price ("-900 UAH cheaper than your last purchase").
- FR-BUY-005 Purchases page: filterable list (period, brand, buyer, site), totals, export CSV/XLSX.
- FR-BUY-006 Purchases are shared across the team and editable by the buyer or an admin; changes audit-logged.

## User interface (FR-UI)
- FR-UI-001 Languages from v1: **Russian, Ukrainian, English**; switcher in header; choice saved per user; all strings via i18n files (no hard-coded text).
- FR-UI-002 Light and dark theme, saved per user.
- FR-UI-003 Main screen: search bar + template picker on top; left panel with site checkboxes/groups and filters; main area = results table grouped by product model.
- FR-UI-004 Dense, Excel-like table: sortable/filterable columns, column chooser, row badges (visited, duplicate, deal, bought before, price drop), thumbnails on hover.
- FR-UI-005 Keyboard shortcuts: V visited, I interesting, R reject, B bought, Enter open link, Ctrl+Click open in browser, / focus search.
- FR-UI-006 Compare drawer: select rows -> side-by-side comparison (FR-CMP-003).
- FR-UI-007 Responsive enough for a tablet browser on the LAN.

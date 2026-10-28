import { createHash, randomUUID } from 'node:crypto';
import {
  applyFilters,
  expandSearchPage,
  extractListings,
  googleSiteSearch,
  looksBlockedPage,
  type ListingDraft,
} from '@pricelens/adapters';
import type { PrismaClient } from '@pricelens/db';
import {
  detectDefects,
  DEFAULT_MIN_MARGIN_UAH,
  DEFAULT_SETTINGS,
  buildSearchUrl,
  cacheFresh,
  cacheKey,
  dealScore,
  displayGroupName,
  duplicateDecision,
  expectedProfit,
  expectedSalePrice,
  weightedMedian,
  extractLaptopSpecs,
  groupKeyFromSpecs,
  groupKeyPrefix,
  scheduleDue,
  shouldNotify,
  specConfidence,
  specsCompatible,
  toUah,
  type LaptopSpecs,
  type Rates,
  type NotifyRules,
} from '@pricelens/shared';
import { loadRates } from './fx';

type Db = PrismaClient;

export interface SearchFilters {
  priceMin?: number | null;
  priceMax?: number | null;
  condition?: string | null;
  city?: string | null;
  dateFrom?: string | null;
}

export interface LoadPage {
  (site: { id: string; key: string; maxConcurrency: number; minDelayMs: number; pausedUntil: Date | null }, url: string): Promise<string>;
}

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function hashImage(url?: string | null): string | null {
  if (!url) return null;
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export async function readSettings(prisma: Db): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) settings[row.key] = row.value;
  if (!settings.google_api_key && process.env.GOOGLE_API_KEY) settings.google_api_key = process.env.GOOGLE_API_KEY;
  if (!settings.google_cx && process.env.GOOGLE_CX) settings.google_cx = process.env.GOOGLE_CX;
  if (!settings.telegram_bot_token && process.env.TELEGRAM_BOT_TOKEN) {
    settings.telegram_bot_token = process.env.TELEGRAM_BOT_TOKEN;
  }
  return settings;
}

export async function audit(
  prisma: Db,
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  payload?: unknown,
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId: entityId ?? null,
      payload: payload === undefined ? undefined : (payload as object),
    },
  });
}

export async function saveSelection(prisma: Db, userId: string, selectedIds: string[]) {
  const sites = await prisma.site.findMany({ select: { id: true } });
  for (const site of sites) {
    const selected = selectedIds.includes(site.id);
    await prisma.userSiteSelection.upsert({
      where: { userId_siteId: { userId, siteId: site.id } },
      create: { userId, siteId: site.id, selected },
      update: { selected },
    });
  }
}

function mergedSpecs(title: string, description: string | null, stored: unknown): LaptopSpecs {
  const extracted = extractLaptopSpecs(title, description ?? '');
  const extra = (stored ?? {}) as Partial<LaptopSpecs>;
  const specs = { ...extracted };
  (Object.keys(extra) as (keyof LaptopSpecs)[]).forEach((key) => {
    if (extra[key] != null && extra[key] !== '') (specs as any)[key] = extra[key];
  });
  return specs;
}

export async function attachGroup(prisma: Db, listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return;
  const existing = await prisma.productListing.findUnique({ where: { listingId } });
  if (existing?.manual) return;
  const specs = mergedSpecs(listing.title, listing.description, listing.specs);
  const key = groupKeyFromSpecs(specs);
  if (!key || specConfidence(specs) < 0.5) return;
  let product = await prisma.product.findUnique({ where: { groupKey: key } });
  if (!product) {
    const prefix = groupKeyPrefix(specs)!;
    const candidates = await prisma.product.findMany({
      where: { groupKey: { startsWith: prefix } },
      orderBy: { confidence: 'desc' },
      take: 50,
    });
    product =
      candidates.find((candidate) => specsCompatible(specs, candidate.specs as unknown as LaptopSpecs)) ?? null;
  }
  if (!product) {
    product = await prisma.product.create({
      data: {
        groupKey: key,
        normalizedName: displayGroupName(specs),
        specs: specs as object,
        confidence: specConfidence(specs),
        category: 'laptop',
      },
    });
  }
  await prisma.productListing.upsert({
    where: { listingId },
    create: { listingId, productId: product.id, matchScore: specConfidence(specs), manual: false },
    update: { productId: product.id, matchScore: specConfidence(specs), manual: false },
  });
}

/** FR-VIS-003. Prices are compared in UAH so a $400 ad and a 16 400 грн ad can match. */
async function rememberDuplicate(prisma: Db, listing: ListingRow, siteId: string, draft: ListingDraft, price: number | null) {
  const listingId = listing.id;
  const sameExternal = draft.externalId
    ? await prisma.listing.findFirst({
        where: { siteId, externalId: draft.externalId, NOT: { id: listingId } },
      })
    : null;
  const near =
    price != null && price > 0
      ? await prisma.listing.findMany({
          where: { NOT: { id: listingId }, priceUah: { gte: price * 0.9, lte: price * 1.1 } },
          orderBy: { lastSeenAt: 'desc' },
          take: 20,
        })
      : [];
  const pool = sameExternal ? [sameExternal, ...near] : near;
  for (const other of pool) {
    const decision = duplicateDecision(
      {
        url: listing.url,
        siteId,
        externalId: listing.externalId,
        title: listing.title,
        price: price ?? 0,
        imageHash: listing.imageHash,
      },
      {
        url: other.url,
        siteId: other.siteId,
        externalId: other.externalId,
        title: other.title,
        price: other.priceUah != null ? num(other.priceUah) : 0,
        imageHash: other.imageHash,
      },
    );
    if (!decision.duplicate || !decision.reason) continue;
    const original = listing.firstSeenAt <= other.firstSeenAt ? listing : other;
    const duplicate = original.id === listing.id ? other : listing;
    await prisma.duplicate.upsert({
      where: { listingId: duplicate.id },
      create: { listingId: duplicate.id, originalListingId: original.id, reason: decision.reason },
      update: { originalListingId: original.id, reason: decision.reason },
    });
    return;
  }
}

type ListingRow = NonNullable<Awaited<ReturnType<Db['listing']['findUnique']>>>;

async function upsertDraft(
  prisma: Db,
  siteId: string,
  draft: ListingDraft,
  fallbackCondition: string,
  rates: Rates,
  known?: Map<string, ListingRow>,
) {
  const price = draft.price ?? 0;
  const currency = draft.currency ?? 'UAH';
  const priceUah = toUah(price, currency, rates);
  // `known` is the page's existing listings, fetched in one query by runSearch.
  const existing = known ? (known.get(draft.url) ?? null) : await prisma.listing.findUnique({ where: { url: draft.url } });
  const data = {
    siteId,
    title: draft.title,
    price,
    currency,
    priceUah,
    location: draft.location ?? null,
    postedAt: draft.postedAt ? new Date(draft.postedAt) : null,
    imageUrl: draft.imageUrl ?? null,
    imageHash: hashImage(draft.imageUrl),
    condition: draft.condition && draft.condition !== 'unknown' ? draft.condition : fallbackCondition,
    description: draft.description ?? null,
    externalId: draft.externalId ?? null,
    lastSeenAt: new Date(),
  };
  let listing = existing;
  try {
    listing = existing
      ? await prisma.listing.update({ where: { id: existing.id }, data })
      : await prisma.listing.create({ data: { ...data, url: draft.url, firstSeenAt: new Date() } });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
    if (code !== 'P2002') throw error;
    const winner = await prisma.listing.findUnique({ where: { url: draft.url } });
    if (!winner) throw error;
    listing = await prisma.listing.update({ where: { id: winner.id }, data });
  }
  if (!listing) throw new Error('listing_missing');
  const changed = !existing || Math.abs(num(existing.price) - price) > 0.009;
  if (!existing || changed) {
    await prisma.listingPrice.create({ data: { listingId: listing.id, price } });
  }
  // An already known listing with the same title, description and price cannot change its duplicate
  // status or group (duplicate checks are symmetric and run when the other listing arrives).
  const unchanged =
    existing && !changed && existing.title === draft.title && (existing.description ?? null) === (draft.description ?? null);
  if (!unchanged) {
    await rememberDuplicate(prisma, listing, siteId, draft, priceUah);
    await attachGroup(prisma, listing.id);
  }
  return { listing, changed: Boolean(existing && changed), isNew: !existing };
}

export async function runSearch(
  prisma: Db,
  searchId: string,
  deps: { load: LoadPage; now?: Date; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> },
) {
  const search = await prisma.search.findUnique({ where: { id: searchId } });
  if (!search) throw new Error('search_not_found');
  const filters = (search.filters ?? {}) as SearchFilters;
  const now = deps.now ?? new Date();
  const settings = await readSettings(prisma);
  const rates = await loadRates(prisma, settings);
  const sites = await prisma.site.findMany({
    where: { id: { in: search.siteIds }, enabled: true },
    orderBy: { priority: 'asc' },
  });
  await Promise.all(
    sites.map(async (site) => {
      const run = await prisma.searchSiteRun.create({
        data: { searchId, siteId: site.id, status: 'running' },
      });
      try {
        if (site.pausedUntil && site.pausedUntil > now) {
          throw Object.assign(new Error('site_paused'), { code: 'site_paused' });
        }
        const key = cacheKey({
          query: search.query,
          priceMin: filters.priceMin,
          priceMax: filters.priceMax,
          condition: filters.condition,
          city: filters.city,
        });
        const cached = search.refresh
          ? null
          : await prisma.searchCache.findUnique({ where: { siteId_cacheKey: { siteId: site.id, cacheKey: key } } });
        if (cached && cached.listingIds.length > 0 && cacheFresh(cached.fetchedAt, now, site.pollIntervalMinutes)) {
          await linkResults(prisma, searchId, cached.listingIds);
          await prisma.searchSiteRun.update({
            where: { id: run.id },
            data: { status: 'complete', fromCache: true, resultCount: cached.listingIds.length, finishedAt: new Date() },
          });
          return;
        }
        const health = await prisma.siteHealth.findFirst({
          where: { siteId: site.id },
          orderBy: { checkedAt: 'desc' },
        });
        const useGoogle = site.mode === 'google_fallback' || health?.status === 'red';
        let drafts: ListingDraft[] = [];
        if (useGoogle) {
          const google = await googleSiteSearch(
            { apiKey: String(settings.google_api_key ?? ''), cx: String(settings.google_cx ?? '') },
            site.domain,
            search.query,
          );
          if (google.error && site.mode !== 'google_fallback') {
            /* native site is red and Google is unavailable: still try native below */
          } else if (!google.error) drafts = google.items;
          if (site.mode === 'google_fallback' && google.error) throw new Error(google.error);
        }
        if (!useGoogle || (health?.status === 'red' && drafts.length === 0 && site.mode !== 'google_fallback')) {
          const url = buildSearchUrl(site.urlTemplate, {
            query: search.query,
            page: 1,
            price_min: site.supportedFilters.includes('price_min') ? filters.priceMin ?? null : null,
            price_max: site.supportedFilters.includes('price_max') ? filters.priceMax ?? null : null,
            city: site.supportedFilters.includes('city') ? filters.city ?? null : null,
          });
          const html = await expandSearchPage(url, await deps.load(site, url), { fetchImpl: deps.fetchImpl });
          drafts = extractListings(html, { baseUrl: `https://${site.domain}/` });
          // A block page is an error, not "no listings" (and must not be cached as an empty result).
          if (drafts.length === 0 && looksBlockedPage(html)) throw new Error('upstream_blocked');
        }
        drafts = applyFilters(drafts, filters);
        const ids: string[] = [];
        const started = Date.now();
        const known = new Map(
          (await prisma.listing.findMany({ where: { url: { in: drafts.map((draft) => draft.url) } } })).map((row) => [row.url, row]),
        );
        for (const draft of drafts) {
          if (draft.price == null) continue;
          const saved = await upsertDraft(prisma, site.id, draft, site.defaultCondition, rates, known);
          ids.push(saved.listing.id);
        }
        // Only cache non-empty results, so one bad fetch does not show "no listings" for 30 minutes.
        if (ids.length) {
          await prisma.searchCache.upsert({
            where: { siteId_cacheKey: { siteId: site.id, cacheKey: key } },
            create: { siteId: site.id, cacheKey: key, fetchedAt: now, listingIds: ids },
            update: { fetchedAt: now, listingIds: ids },
          });
        }
        await linkResults(prisma, searchId, ids);
        if (process.env.PIPELINE_TIMING === '1') console.info(`site ${site.key}: ${ids.length} listings in ${Date.now() - started} ms`);
        await prisma.searchSiteRun.update({
          where: { id: run.id },
          data: { status: 'complete', resultCount: ids.length, finishedAt: new Date() },
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : 'site_failed';
        if (code === 'site_paused') {
          await prisma.site.update({
            where: { id: site.id },
            data: { pausedUntil: new Date(now.getTime() + 15 * 60_000) },
          });
        }
        await prisma.searchSiteRun.update({
          where: { id: run.id },
          data: { status: 'error', error: code, finishedAt: new Date() },
        });
      }
    }),
  );
  await prisma.search.update({ where: { id: searchId }, data: { status: 'complete' } });
}

async function linkResults(prisma: Db, searchId: string, listingIds: string[]) {
  const rank = await prisma.searchResult.count({ where: { searchId } });
  const unique = [...new Set(listingIds)];
  await prisma.searchResult.createMany({
    data: unique.map((listingId, index) => ({ searchId, listingId, rank: rank + index + 1 })),
    skipDuplicates: true,
  });
}

export async function searchProgress(prisma: Db, searchId: string) {
  const search = await prisma.search.findUnique({ where: { id: searchId } });
  const runs = await prisma.searchSiteRun.findMany({ where: { searchId }, include: { site: true } });
  return {
    status: search?.status ?? 'missing',
    done: search?.status === 'complete' || search?.status === 'failed',
    failed: search?.status === 'failed',
    runs: runs.map((run) => ({
      siteId: run.siteId,
      siteName: run.site.name,
      status: run.status,
      error: run.error,
      resultCount: run.resultCount,
      fromCache: run.fromCache,
    })),
  };
}

function range(values: number[]) {
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

export async function searchRows(prisma: Db, searchId: string) {
  const settings = await readSettings(prisma);
  const green = Number(settings.deal_green_threshold ?? 0.2);
  const yellow = Number(settings.deal_yellow_threshold ?? 0.1);
  const defaultMargin = Number(settings.min_margin_uah ?? DEFAULT_MIN_MARGIN_UAH);
  const costs = Number(settings.cost_delivery ?? 0) + Number(settings.cost_repair ?? 0);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rates = await loadRates(prisma, settings);
  const lookbackDays = Number(settings.sale_lookback_days ?? 180);
  const minOwnSales = Number(settings.min_own_sales ?? 2);
  const askingToSaleRatio = Number(settings.asking_to_sale_ratio ?? 1);
  const useAllocated = settings.own_sales_use_allocated !== false && settings.own_sales_use_allocated !== 'false';
  const negotiateAfter = Number(settings.negotiate_after_days ?? 21);
  const uah = (l: { priceUah: unknown; price: unknown; currency: string }): number | null =>
    l.priceUah != null ? num(l.priceUah) : toUah(num(l.price), l.currency, rates);
  const results = await prisma.searchResult.findMany({
    where: { searchId },
    orderBy: { rank: 'asc' },
    include: {
      listing: {
        include: {
          site: true,
          mark: true,
          dupOf: true,
          grouped: { include: { product: true } },
          prices: { orderBy: { seenAt: 'desc' }, take: 2 },
          visits: { orderBy: { visitedAt: 'desc' }, take: 1, include: { user: true } },
        },
      },
    },
  });
  const productIds = [
    ...new Set(results.map((row) => row.listing.grouped?.productId).filter((id): id is string => Boolean(id))),
  ];
  const members = productIds.length
    ? await prisma.productListing.findMany({
        where: { productId: { in: productIds } },
        include: { listing: { include: { dupOf: true } } },
      })
    : [];
  const purchases = productIds.length
    ? await prisma.purchaseItem.findMany({
        where: { productGroupId: { in: productIds } },
        include: { purchase: { select: { purchasedAt: true } } },
        orderBy: { purchase: { purchasedAt: 'desc' } },
      })
    : [];
  // 1.2a: own realised per-unit sale prices (UAH), each unit counted once.
  const soldItems = productIds.length
    ? await prisma.purchaseItem.findMany({
        where: {
          productGroupId: { in: productIds },
          saleUnitUah: { not: null },
          purchase: { soldAt: { gte: new Date(Date.now() - lookbackDays * 86_400_000) } },
          ...(useAllocated ? {} : { allocMethod: { in: ['single', 'manual'] } }),
        },
        select: { productGroupId: true, qty: true, saleUnitUah: true },
      })
    : [];
  return results.map((row) => {
    const listing = row.listing;
    const product = listing.grouped?.product ?? null;
    const groupMembers = product ? members.filter((member) => member.productId === product.id) : [];
    // 5.1: defective / "for parts" units are priced separately from working ones.
    const defects = detectDefects(listing.title, listing.description);
    const comparable = groupMembers.filter(
      (member) =>
        member.listingId !== listing.id &&
        !member.listing.dupOf &&
        member.listing.condition === 'used' &&
        member.listing.lastSeenAt >= since,
    );
    const isDefective = (member: (typeof comparable)[number]) => detectDefects(member.listing.title, member.listing.description).length > 0;
    // Comparable used units only: not this listing, not a repost, recently seen, working.
    const used = comparable
      .filter((member) => !isDefective(member))
      .map((member) => uah(member.listing))
      .filter((value): value is number => value != null);
    const parts = comparable
      .filter(isDefective)
      .map((member) => uah(member.listing))
      .filter((value): value is number => value != null);
    const fresh = groupMembers
      .filter((member) => member.listing.condition === 'new')
      .map((member) => uah(member.listing))
      .filter((value): value is number => value != null);
    const listingUah = uah(listing);
    const deal =
      listingUah == null
        ? ({ score: null, label: 'insufficient', median: null, samples: used.length } as const)
        : dealScore(listingUah, defects.length ? parts : used, { green, yellow });
    const points = product
      ? soldItems
          .filter((item) => item.productGroupId === product.id)
          .map((item) => ({ value: num(item.saleUnitUah), weight: item.qty }))
      : [];
    // A defective unit has no reliable resale price from working-unit data.
    const sale = defects.length
      ? { value: null, source: 'none' as const, samples: 0 }
      : expectedSalePrice({
          manual: product?.expectedSalePrice != null ? num(product.expectedSalePrice) : null,
          ownMedian: weightedMedian(points),
          unitsSold: points.reduce((sum, point) => sum + point.weight, 0),
          askingMedian: deal.median,
          askingToSaleRatio,
          minOwnSales,
        });
    const expected = sale.value;
    const profit =
      expected != null && listingUah != null
        ? expectedProfit({ expectedSalePrice: expected, listingPrice: listingUah, costs })
        : null;
    const margin = product?.minMargin != null ? num(product.minMargin) : defaultMargin;
    // 5.5: the most you can pay and still make the target margin after costs.
    const buyBelow = expected != null ? Math.floor(expected - costs - margin) : null;
    const history = purchases.filter((purchase) => purchase.productGroupId === product?.id);
    const last = history[0];
    const visit = listing.visits[0];
    const previous = listing.prices[1];
    const priceDropped = Boolean(previous && num(listing.prices[0]?.price) < num(previous.price));
    // 5.4: days on market, from the site's posting date when known, else when we first saw it.
    const listedSince = listing.postedAt ?? listing.firstSeenAt;
    const daysListed = Math.max(0, Math.floor((Date.now() - listedSince.getTime()) / 86_400_000));
    const negotiable = daysListed >= negotiateAfter;
    return {
      listingId: listing.id,
      title: listing.title,
      price: num(listing.price),
      currency: listing.currency,
      priceUah: listingUah,
      url: listing.url,
      siteId: listing.siteId,
      siteName: listing.site.name,
      location: listing.location,
      postedAt: listing.postedAt?.toISOString() ?? null,
      condition: listing.condition,
      imageUrl: listing.imageUrl,
      specs: listing.specs ?? product?.specs ?? null,
      seller: listing.seller,
      visited: visit ? { login: visit.user?.login ?? null, visitedAt: visit.visitedAt.toISOString() } : null,
      mark: listing.mark?.status ?? null,
      tags: listing.mark?.tags ?? [],
      duplicateOf: listing.dupOf?.originalListingId ?? null,
      priceDropped,
      priceDrop: priceDropped ? num(previous!.price) - num(listing.prices[0]!.price) : null,
      daysListed,
      sellerHint: priceDropped && negotiable ? 'motivated' : negotiable ? 'negotiable' : null,
      deal,
      profit,
      expectedSale: expected,
      expectedSource: sale.source,
      expectedSamples: sale.samples,
      margin,
      buyBelow,
      groupId: product?.id ?? null,
      groupName: product?.normalizedName ?? null,
      groupConfidence: product?.confidence ?? null,
      newRange: range(fresh),
      usedRange: range(used),
      defects,
      partsRange: range(parts),
      bought: last
        ? {
            count: history.reduce((sum, item) => sum + item.qty, 0),
            lastPrice: num(last.unitPrice),
            lastAt: last.purchase.purchasedAt.toISOString(),
          }
        : null,
      priceHint: last && listingUah != null ? num(last.unitPriceUah ?? last.unitPrice) - listingUah : null,
    };
  });
}

export async function notifyAdmins(prisma: Db, type: string, payload: object) {
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true } });
  for (const admin of admins) {
    await prisma.notification.create({ data: { userId: admin.id, type, payload } });
  }
}

export async function checkSite(prisma: Db, siteId: string, load: LoadPage) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return;
  const previous = await prisma.siteHealth.findFirst({ where: { siteId }, orderBy: { checkedAt: 'desc' } });
  const started = Date.now();
  let status: 'green' | 'yellow' | 'red' = 'green';
  let error: string | null = null;
  try {
    const url = buildSearchUrl(site.urlTemplate, { query: 'ноутбук', page: 1 });
    const html = await expandSearchPage(url, await load(site, url));
    const items = extractListings(html, { baseUrl: `https://${site.domain}/` });
    status = items.length >= 1 ? 'green' : 'yellow';
    if (status !== 'green') error = 'no_results';
  } catch (err) {
    status = 'red';
    error = err instanceof Error ? err.message : 'health_failed';
  }
  await prisma.siteHealth.create({
    data: { siteId, status, error, latencyMs: Date.now() - started },
  });
  if (status === 'red' && previous?.status !== 'red') {
    await notifyAdmins(prisma, 'site_down', { siteId, name: site.name, error });
  }
}

export async function runTemplate(prisma: Db, templateId: string, deps: { load: LoadPage }) {
  const template = await prisma.searchTemplate.findUnique({
    where: { id: templateId },
    include: { schedule: true },
  });
  if (!template) return;
  const started = new Date();
  const search = await prisma.search.create({
    data: {
      userId: template.ownerId,
      query: template.query,
      filters: template.filters as object,
      siteIds: template.siteIds,
      refresh: false,
      status: 'running',
    },
  });
  await runSearch(prisma, search.id, deps);
  const rows = await searchRows(prisma, search.id);
  const rules = (template.schedule?.notifyRules ?? {
    onlyNew: true,
    priceDrop: false,
    dealThreshold: false,
  }) as unknown as NotifyRules;
  let newCount = 0;
  let changedCount = 0;
  for (const row of rows) {
    const listing = await prisma.listing.findUnique({ where: { id: row.listingId } });
    const isNew = Boolean(listing && listing.firstSeenAt >= started);
    if (isNew) newCount += 1;
    if (row.priceDropped) changedCount += 1;
    const deal = row.deal.label === 'deal';
    if (shouldNotify(rules, { isNew, priceDropped: row.priceDropped, deal }, new Date())) {
      await prisma.notification.create({
        data: {
          userId: template.ownerId,
          type: 'template_hit',
          payload: {
            title: row.title,
            price: row.price,
            currency: row.currency,
            site: row.siteName,
            city: row.location,
            deal: row.deal.label,
            url: row.url,
            listingId: row.listingId,
          },
        },
      });
    }
  }
  await prisma.scheduleRun.create({
    data: { templateId, startedAt: started, finishedAt: new Date(), newCount, changedCount, errors: [] },
  });
  if (template.schedule) {
    await prisma.templateSchedule.update({
      where: { templateId },
      data: { lastRunAt: new Date() },
    });
  }
  return search.id;
}

export async function runDueSchedules(prisma: Db, deps: { load: LoadPage }, now = new Date()) {
  const schedules = await prisma.templateSchedule.findMany({ where: { enabled: true } });
  for (const schedule of schedules) {
    const due = scheduleDue({
      intervalMinutes: schedule.intervalMinutes,
      dailyTime: schedule.dailyTime,
      cron: schedule.cron,
      lastRunAt: schedule.lastRunAt,
      now,
    });
    if (due) await runTemplate(prisma, schedule.templateId, deps);
  }
}

export async function mergeGroups(prisma: Db, targetId: string, sourceId: string, actorId: string) {
  if (targetId === sourceId) return;
  await prisma.productListing.updateMany({ where: { productId: sourceId }, data: { productId: targetId, manual: true } });
  await prisma.purchase.updateMany({ where: { productGroupId: sourceId }, data: { productGroupId: targetId } });
  await prisma.purchaseItem.updateMany({ where: { productGroupId: sourceId }, data: { productGroupId: targetId } });
  await prisma.product.update({ where: { id: targetId }, data: { manual: true } });
  await prisma.product.delete({ where: { id: sourceId } });
  await audit(prisma, actorId, 'group.merge', 'product', targetId, { sourceId });
}

export async function splitListings(prisma: Db, listingIds: string[], name: string | undefined, actorId: string) {
  const product = await prisma.product.create({
    data: {
      normalizedName: name || 'Manual group',
      groupKey: `manual:${randomUUID()}`,
      specs: {},
      manual: true,
      confidence: 1,
      category: 'laptop',
    },
  });
  for (const listingId of listingIds) {
    await prisma.productListing.upsert({
      where: { listingId },
      create: { listingId, productId: product.id, matchScore: 1, manual: true },
      update: { productId: product.id, matchScore: 1, manual: true },
    });
  }
  await audit(prisma, actorId, 'group.split', 'product', product.id, { listingIds });
  return product;
}


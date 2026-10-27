import { createHash, randomUUID } from 'node:crypto';
import { applyFilters, extractListings, googleSiteSearch, type ListingDraft } from '@pricelens/adapters';
import type { PrismaClient } from '@pricelens/db';
import {
  DEFAULT_MIN_MARGIN_UAH,
  DEFAULT_SETTINGS,
  buildSearchUrl,
  cacheFresh,
  cacheKey,
  dealScore,
  displayGroupName,
  duplicateDecision,
  expectedProfit,
  extractLaptopSpecs,
  groupKeyFromSpecs,
  scheduleDue,
  shouldNotify,
  specConfidence,
  specsCompatible,
  type LaptopSpecs,
  type NotifyRules,
} from '@pricelens/shared';

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
    const candidates = await prisma.product.findMany({ take: 300, orderBy: { confidence: 'desc' } });
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

async function rememberDuplicate(prisma: Db, listingId: string, siteId: string, draft: ListingDraft, price: number) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return;
  const sameExternal = draft.externalId
    ? await prisma.listing.findFirst({
        where: { siteId, externalId: draft.externalId, NOT: { id: listingId } },
      })
    : null;
  const near = await prisma.listing.findMany({
    where: { NOT: { id: listingId }, price: { gte: price * 0.9, lte: price * 1.1 } },
    orderBy: { lastSeenAt: 'desc' },
    take: 20,
  });
  const pool = sameExternal ? [sameExternal, ...near] : near;
  for (const other of pool) {
    const decision = duplicateDecision(
      {
        url: listing.url,
        siteId,
        externalId: listing.externalId,
        title: listing.title,
        price,
        imageHash: listing.imageHash,
      },
      {
        url: other.url,
        siteId: other.siteId,
        externalId: other.externalId,
        title: other.title,
        price: num(other.price),
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

async function upsertDraft(prisma: Db, siteId: string, draft: ListingDraft, fallbackCondition: string) {
  const price = draft.price ?? 0;
  const currency = draft.currency ?? 'UAH';
  const existing = await prisma.listing.findUnique({ where: { url: draft.url } });
  const data = {
    siteId,
    title: draft.title,
    price,
    currency,
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
  await rememberDuplicate(prisma, listing.id, siteId, draft, price);
  await attachGroup(prisma, listing.id);
  return { listing, changed: Boolean(existing && changed), isNew: !existing };
}

export async function runSearch(prisma: Db, searchId: string, deps: { load: LoadPage; now?: Date }) {
  const search = await prisma.search.findUnique({ where: { id: searchId } });
  if (!search) throw new Error('search_not_found');
  const filters = (search.filters ?? {}) as SearchFilters;
  const now = deps.now ?? new Date();
  const settings = await readSettings(prisma);
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
        if (cached && cacheFresh(cached.fetchedAt, now, site.pollIntervalMinutes)) {
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
          const html = await deps.load(site, url);
          drafts = extractListings(html, { baseUrl: `https://${site.domain}/` });
        }
        drafts = applyFilters(drafts, filters);
        const ids: string[] = [];
        for (const draft of drafts) {
          if (draft.price == null) continue;
          const saved = await upsertDraft(prisma, site.id, draft, site.defaultCondition);
          ids.push(saved.listing.id);
        }
        await prisma.searchCache.upsert({
          where: { siteId_cacheKey: { siteId: site.id, cacheKey: key } },
          create: { siteId: site.id, cacheKey: key, fetchedAt: now, listingIds: ids },
          update: { fetchedAt: now, listingIds: ids },
        });
        await linkResults(prisma, searchId, ids);
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
  let rank = await prisma.searchResult.count({ where: { searchId } });
  for (const listingId of listingIds) {
    rank += 1;
    await prisma.searchResult.upsert({
      where: { searchId_listingId: { searchId, listingId } },
      create: { searchId, listingId, rank },
      update: {},
    });
  }
}

export async function searchProgress(prisma: Db, searchId: string) {
  const search = await prisma.search.findUnique({ where: { id: searchId } });
  const runs = await prisma.searchSiteRun.findMany({ where: { searchId }, include: { site: true } });
  return {
    status: search?.status ?? 'missing',
    done: search?.status === 'complete',
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
    ? await prisma.productListing.findMany({ where: { productId: { in: productIds } }, include: { listing: true } })
    : [];
  const purchases = productIds.length
    ? await prisma.purchase.findMany({
        where: { productGroupId: { in: productIds } },
        orderBy: { purchasedAt: 'desc' },
      })
    : [];
  return results.map((row) => {
    const listing = row.listing;
    const product = listing.grouped?.product ?? null;
    const groupMembers = product ? members.filter((member) => member.productId === product.id) : [];
    const used = groupMembers
      .filter((member) => member.listing.condition === 'used' && member.listing.lastSeenAt >= since)
      .map((member) => num(member.listing.price));
    const fresh = groupMembers.filter((member) => member.listing.condition === 'new').map((member) => num(member.listing.price));
    const deal = dealScore(num(listing.price), used, { green, yellow });
    const expected = product?.expectedSalePrice != null ? num(product.expectedSalePrice) : deal.median;
    const profit =
      expected != null
        ? expectedProfit({ expectedSalePrice: expected, listingPrice: num(listing.price), costs })
        : null;
    const history = purchases.filter((purchase) => purchase.productGroupId === product?.id);
    const last = history[0];
    const visit = listing.visits[0];
    const previous = listing.prices[1];
    return {
      listingId: listing.id,
      title: listing.title,
      price: num(listing.price),
      currency: listing.currency,
      url: listing.url,
      siteId: listing.siteId,
      siteName: listing.site.name,
      location: listing.location,
      postedAt: listing.postedAt?.toISOString() ?? null,
      condition: listing.condition,
      imageUrl: listing.imageUrl,
      specs: listing.specs ?? product?.specs ?? null,
      seller: listing.seller,
      visited: visit ? { login: visit.user.login, visitedAt: visit.visitedAt.toISOString() } : null,
      mark: listing.mark?.status ?? null,
      tags: listing.mark?.tags ?? [],
      duplicateOf: listing.dupOf?.originalListingId ?? null,
      priceDropped: Boolean(previous && num(listing.prices[0]?.price) < num(previous.price)),
      deal,
      profit,
      margin: product?.minMargin != null ? num(product.minMargin) : defaultMargin,
      groupId: product?.id ?? null,
      groupName: product?.normalizedName ?? null,
      groupConfidence: product?.confidence ?? null,
      newRange: range(fresh),
      usedRange: range(used),
      bought: last
        ? { count: history.length, lastPrice: num(last.price), lastAt: last.purchasedAt.toISOString() }
        : null,
      priceHint: last ? num(last.price) - num(listing.price) : null,
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
    const html = await load(site, url);
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

export async function recordPurchase(
  prisma: Db,
  userId: string,
  input: {
    listingId: string;
    price: number;
    currency: string;
    qty: number;
    purchasedAt?: string;
    note?: string;
    salePrice?: number | null;
    soldAt?: string | null;
  },
) {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { grouped: true, site: true },
  });
  if (!listing) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  const purchase = await prisma.purchase.create({
    data: {
      listingId: listing.id,
      productGroupId: listing.grouped?.productId ?? null,
      userId,
      price: input.price,
      currency: input.currency,
      qty: input.qty,
      purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
      note: input.note,
      salePrice: input.salePrice ?? null,
      soldAt: input.soldAt ? new Date(input.soldAt) : null,
      listingSnapshot: {
        title: listing.title,
        specs: listing.specs,
        site: listing.site.name,
        url: listing.url,
        imageUrl: listing.imageUrl,
      },
    },
  });
  await prisma.listingMark.upsert({
    where: { listingId: listing.id },
    create: { listingId: listing.id, status: 'bought', updatedBy: userId },
    update: { status: 'bought', updatedBy: userId },
  });
  return purchase;
}

export function realisedMargin(price: number, salePrice: number | null, qty: number): number | null {
  if (salePrice == null) return null;
  return (salePrice - price) * qty;
}

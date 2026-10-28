import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export const userCreateSchema = z.object({
  login: z.string().min(2).max(80),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'user']),
});

export const userPatchSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const preferencesSchema = z.object({
  language: z.enum(['en', 'ru', 'uk']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  emailOptIn: z.boolean().optional(),
});

export const searchFiltersSchema = z.object({
  priceMin: z.number().nonnegative().nullable().optional(),
  priceMax: z.number().nonnegative().nullable().optional(),
  condition: z.enum(['new', 'used']).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  dateFrom: z.string().nullable().optional(),
});

export const searchCreateSchema = z.object({
  query: z.string().min(1).max(300),
  siteIds: z.array(z.string().uuid()).min(1),
  filters: searchFiltersSchema.default({}),
  refresh: z.boolean().optional(),
});

export const siteWriteSchema = z.object({
  key: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120),
  domain: z.string().min(1).max(200),
  mode: z.enum(['native', 'google_fallback']),
  urlTemplate: z.string().min(1).max(2000),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  regionTags: z.array(z.string()).optional(),
  pollIntervalMinutes: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().positive().max(8).optional(),
  minDelayMs: z.number().int().nonnegative().optional(),
  useBrowser: z.boolean().optional(),
  supportedFilters: z.array(z.string()).optional(),
  unsupportedFilters: z.array(z.string()).optional(),
  defaultCondition: z.enum(['new', 'used', 'unknown']).optional(),
  parseRules: z.record(z.unknown()).optional(),
});

export const markSchema = z.object({
  status: z.enum(['interesting', 'rejected', 'bought', 'contacted']),
  tags: z.array(z.string().max(40)).optional(),
});

export const noteSchema = z.object({
  body: z.string().min(1).max(4000),
  shared: z.boolean(),
});

export const purchaseItemSchema = z.object({
  listingId: z.string().uuid(),
  qty: z.number().int().positive().max(1000).default(1),
  unitPrice: z.number().nonnegative().max(100_000_000),
});

/** 1.2a: salePrice is the TOTAL for the whole purchase. Legacy single-listing body is still accepted. */
export const purchaseSchema = z
  .object({
    currency: z.string().min(1).max(8).default('UAH'),
    purchasedAt: z.string().optional(),
    note: z.string().max(2000).optional(),
    salePrice: z.number().nonnegative().max(100_000_000).nullable().optional(),
    soldAt: z.string().nullable().optional(),
    items: z.array(purchaseItemSchema).min(1).max(20).optional(),
    listingId: z.string().uuid().optional(),
    price: z.number().nonnegative().optional(),
    qty: z.number().int().positive().max(1000).optional(),
  })
  .transform((input, ctx) => {
    const items =
      input.items ??
      (input.listingId && input.price !== undefined
        ? [{ listingId: input.listingId, qty: input.qty ?? 1, unitPrice: input.price }]
        : null);
    if (!items) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'items required' });
      return z.NEVER;
    }
    return {
      currency: input.currency,
      purchasedAt: input.purchasedAt,
      note: input.note,
      salePrice: input.salePrice,
      soldAt: input.soldAt,
      items,
    };
  });

export const purchasePatchSchema = z.object({
  salePrice: z.number().nonnegative().max(100_000_000).nullable().optional(),
  soldAt: z.string().nullable().optional(),
  note: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        qty: z.number().int().positive().max(1000).optional(),
        unitPrice: z.number().nonnegative().max(100_000_000).optional(),
        saleManual: z.number().nonnegative().max(100_000_000).nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const templateSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().min(1).max(300),
  siteIds: z.array(z.string().uuid()),
  filters: searchFiltersSchema.default({}),
  sort: z.string().max(40).nullable().optional(),
  shared: z.boolean().optional(),
});

export const scheduleSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().positive().nullable().optional(),
  dailyTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  cron: z.string().max(80).nullable().optional(),
  notifyRules: z.object({
    onlyNew: z.boolean(),
    priceDrop: z.boolean(),
    dealThreshold: z.boolean(),
    quietStart: z.string().optional(),
    quietEnd: z.string().optional(),
  }),
});

/** PATCH body for a site: every field optional; `key` cannot be changed. */
export const sitePatchSchema = siteWriteSchema.omit({ key: true }).partial();

export const specsPatchSchema = z
  .object({
    brand: z.string().max(40).nullable(),
    model: z.string().max(80).nullable(),
    cpu: z.string().max(60).nullable(),
    ramGb: z.number().int().positive().max(256).nullable(),
    storageGb: z.number().int().positive().max(16384).nullable(),
    gpu: z.string().max(60).nullable(),
    screenIn: z.number().positive().max(25).nullable(),
  })
  .partial()
  .strict();

export const groupPatchSchema = z
  .object({
    expectedSalePrice: z.number().nonnegative().max(10_000_000).nullable().optional(),
    minMargin: z.number().nonnegative().max(10_000_000).nullable().optional(),
    specs: specsPatchSchema.optional(),
    normalizedName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const listingSpecsSchema = z.object({ specs: specsPatchSchema });

export const siteGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  siteIds: z.array(z.string().uuid()).max(100).default([]),
});

export const rollbackSchema = z.object({ version: z.coerce.number().int().positive() });

export const groupMergeSchema = z.object({
  targetId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

export const groupSplitSchema = z.object({
  listingIds: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(200).optional(),
});

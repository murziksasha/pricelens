export interface SiteBudget {
  id: string;
  maxConcurrency: number;
  minDelayMs: number;
  pausedUntil?: number | null;
}

export interface FetchTextResult {
  status: number;
  text: string;
  url: string;
}

export class SitePausedError extends Error {
  readonly code = 'site_paused';
  constructor(readonly siteId: string) {
    super('site_paused');
  }
}

export class UpstreamError extends Error {
  readonly code = 'upstream_error';
  constructor(
    readonly status: number,
    message = 'upstream_error',
  ) {
    super(message);
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 PriceLens';

function isBlocked(status: number, text: string): boolean {
  if (status === 429 || status === 503) return true;
  if (status === 403 && /captcha|cloudflare|access denied/i.test(text)) return true;
  if (/g-recaptcha|hcaptcha|cf-challenge|cf-browser-verification/i.test(text)) return true;
  return false;
}

export interface ProxyHook {
  decorate(url: string, init: RequestInit): Promise<{ url: string; init: RequestInit }>;
}

/** Per-site rate limit, concurrency, jitter, and backoff. Proxy is a hook only (FR-SCH-006). */
export class RequestLayer {
  private running = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();
  private nextAt = new Map<string, number>();
  private paused = new Map<string, number>();

  constructor(
    private opts: {
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
      random?: () => number;
      proxy?: ProxyHook;
      onPause?: (siteId: string, reason: string) => void | Promise<void>;
    } = {},
  ) {}

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private async sleep(ms: number) {
    if (this.opts.sleep) return this.opts.sleep(ms);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async enter(site: SiteBudget) {
    const pausedUntil = Math.max(site.pausedUntil ?? 0, this.paused.get(site.id) ?? 0);
    if (pausedUntil > this.now()) throw new SitePausedError(site.id);
    while ((this.running.get(site.id) ?? 0) >= site.maxConcurrency) {
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(site.id) ?? [];
        queue.push(resolve);
        this.waiters.set(site.id, queue);
      });
    }
    this.running.set(site.id, (this.running.get(site.id) ?? 0) + 1);
    const jitter = 0.7 + (this.opts.random ? this.opts.random() : Math.random()) * 0.6;
    const delay = site.minDelayMs * jitter;
    const wait = Math.max(0, (this.nextAt.get(site.id) ?? 0) - this.now());
    if (wait > 0) await this.sleep(wait);
    this.nextAt.set(site.id, this.now() + delay);
  }

  private leave(siteId: string) {
    this.running.set(siteId, Math.max(0, (this.running.get(siteId) ?? 1) - 1));
    const queue = this.waiters.get(siteId);
    const next = queue?.shift();
    if (next) next();
  }

  async getText(site: SiteBudget, url: string): Promise<FetchTextResult> {
    await this.enter(site);
    try {
      let attempt = 0;
      while (true) {
        const headers: Record<string, string> = {
          'user-agent': UA,
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'uk,ru;q=0.9,en;q=0.8',
        };
        let target = url;
        let init: RequestInit = { headers, redirect: 'follow' };
        if (this.opts.proxy) {
          const decorated = await this.opts.proxy.decorate(target, init);
          target = decorated.url;
          init = decorated.init;
        }
        const fetchImpl = this.opts.fetchImpl ?? fetch;
        const response = await fetchImpl(target, init);
        const text = await response.text();
        if (isBlocked(response.status, text)) {
          attempt += 1;
          if (attempt >= 3) {
            const until = this.now() + 15 * 60_000;
            this.paused.set(site.id, until);
            await this.opts.onPause?.(site.id, 'captcha_or_rate_limit');
            throw new SitePausedError(site.id);
          }
          await this.sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        if (response.status >= 500) throw new UpstreamError(response.status);
        return { status: response.status, text, url: target };
      }
    } finally {
      this.leave(site.id);
    }
  }
}

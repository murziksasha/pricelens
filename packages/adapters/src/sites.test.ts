import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SITE_CATALOG } from '@pricelens/shared';
import { describe, expect, it } from 'vitest';
import { extractListings } from './extract';
import { RequestLayer, jsCookieChallenge, looksBlockedPage, looksTransientError } from './request';
import { expandSearchPage, needsExpansion } from './site-loaders';

const dir = path.join(__dirname, '..', 'snapshots', 'live-2026-10');
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8');
const domainOf = (key: string) => SITE_CATALOG.find((site) => site.key === key)!.domain;

/** First listing of each trimmed live search page ("ноутбук", 28 Oct 2026). */
const FIRST: Record<string, { count: number; title: string; price: number; url: string }> = {
  click: { count: 4, title: 'Ноутбук Lenovo LOQ 15ARP10E (83S000ETRA) Luna Grey', price: 60797, url: 'https://click.ua/shop/noutbuk-lenovo-loq-15arp10e' },
  brain: { count: 4, title: 'Ноутбук Lenovo V15 G5 IRL (83GW00C2RA)', price: 63999, url: 'https://brain.com.ua/ukr/Noutbuk_Lenovo_V15_G5_IRL_83GW00C2RA-p1297256' },
  itbox: { count: 4, title: 'Ноутбук Dell 15 (LDC15250-5315BLK-PUS16)', price: 39999, url: 'https://www.itbox.ua/ua/product/Noutbuk_Dell_15_LDC15250' },
  skay: { count: 4, title: 'Ноутбук AGN x15A 15,6" (AGN_x15A_i7_12Th_32_512)', price: 117320, url: 'https://skay.ua/noutbuki/99659-' },
  proton: { count: 3, title: 'Универсальный блок питания для ноутбуков PowerPlant', price: 1115, url: 'https://proton-it.kyiv.ua/universalnyy-blok-pitaniya' },
  tex: { count: 4, title: 'Ноутбук HP Laptop 15-fc0269ua (C78SKEA) Natural Silver', price: 53221, url: 'https://tex.ua/products/hp-laptop-15-fc0269ua-124215' },
  ek: { count: 4, title: 'Gigabyte GAMING A16 3WH', price: 65251, url: 'https://ek.ua/GIGABYTE-GAMING-A16-3WH.htm' },
  touch: { count: 4, title: 'Ноутбук Acer Extensa 15 EXO15-41-R3P7 (NX.EL5EU.009)', price: 32349, url: 'https://touch.com.ua/ua/item/noutbuk-acer-extensa-15' },
  fua: { count: 4, title: 'Ноутбук Acer Extensa EXO15-41 15,6" (NX.EL5EU.006)', price: 30999, url: 'https://epicentrk.ua/shop/noutbuk-acer-extensa-exo15-41' },
  kvshop: { count: 4, title: 'Ноутбук Apple MacBook Air 13.6" M4 16/256GB 2025 Midnight (MW123)', price: 67999, url: 'https://kvshop.com.ua/noutbuki/apple/' },
  bigl: { count: 4, title: 'Ноутбук 14" HP Chromebook 14 G5', price: 2950, url: 'https://bigl.ua/ua/p2903481502-' },
  hotline: { count: 4, title: 'ASUS TUF Gaming A16 FA608UMI (FA608UMI-R7165W)', price: 84518, url: 'https://hotline.ua/ua/computer-noutbuki-netbuki/asus-tuf-gaming-a16' },
};

describe('live search pages (Oct 2026)', () => {
  it.each(Object.entries(FIRST))('%s: titles, prices and links come from the right card fields', (key, expected) => {
    const items = extractListings(read(`${key}.html`), { baseUrl: `https://${domainOf(key)}/` });
    expect(items).toHaveLength(expected.count);
    expect(items[0]!.title.startsWith(expected.title)).toBe(true);
    expect(items[0]!.price).toBe(expected.price);
    expect(items[0]!.currency).toBe('UAH');
    expect(items[0]!.url.startsWith(expected.url)).toBe(true);
    // No screen sizes, product codes or instalment amounts read as the price.
    expect(items.every((item) => item.price! >= 500 && item.title.length > 10)).toBe(true);
    expect(items.every((item) => !/знижка|акція/i.test(item.title))).toBe(true);
  });

  it('keeps images that only sit in lazy-load attributes', () => {
    const items = extractListings(read('itbox.html'), { baseUrl: 'https://www.itbox.ua/' });
    expect(items[0]!.imageUrl).toMatch(/^https:\/\/img\d\.itbox\.ua\//);
  });

  it('decodes HTML entities in titles', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'MacBook Air 13&quot; M5',
      url: 'https://touch.com.ua/ua/item/x/',
      offers: { price: 77069, priceCurrency: 'UAH' },
    })}</script>`;
    expect(extractListings(html, { baseUrl: 'https://touch.com.ua/' })[0]!.title).toBe('MacBook Air 13" M5');
  });
});

describe('Rozetka search API', () => {
  const fixture = JSON.parse(read('rozetka.json')) as {
    search: unknown;
    products: Record<string, { data: Record<string, unknown> }>;
  };
  const url = 'https://search.rozetka.com.ua/ua/search/api/v6/?front-type=xl&country=UA&lang=ua&redirected=1&text=x';
  const fakeFetch = (products = fixture.products) =>
    (async (target: string | URL | Request) => {
      const id = new URL(String(target)).searchParams.get('goodsId')!;
      const body = products[id];
      return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{}', { status: 404 });
    }) as typeof fetch;

  it('turns goods ids into listings with titles, prices and links', async () => {
    expect(needsExpansion(url)).toBe(true);
    const page = await expandSearchPage(url, JSON.stringify(fixture.search), { fetchImpl: fakeFetch() });
    const items = extractListings(page, { baseUrl: 'https://rozetka.com.ua/' });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ price: 48888, currency: 'UAH', condition: 'new' });
    expect(items[0]!.title).toContain('Lenovo LOQ 15ARP9');
    expect(items[0]!.url).toBe('https://rozetka.com.ua/ua/lenovo-83jc00nfra/p553197315/');
    expect(items[0]!.imageUrl).toContain('rozetka.com.ua');
  });

  it('skips goods that are out of stock or failed to load', async () => {
    const products = structuredClone(fixture.products);
    const [first, second] = Object.keys(products);
    products[first!]!.data.sell_status = 'unavailable';
    delete products[second!];
    const page = await expandSearchPage(url, JSON.stringify(fixture.search), { fetchImpl: fakeFetch(products) });
    expect(extractListings(page, { baseUrl: 'https://rozetka.com.ua/' })).toHaveLength(1);
  });

  it('leaves other sites alone', async () => {
    expect(needsExpansion('https://rozetka.com.ua/ua/search/?text=x')).toBe(false);
    expect(await expandSearchPage('https://click.ua/shop/search?q=x', '<html></html>')).toBe('<html></html>');
  });
});

describe('shop anti-bot and error pages', () => {
  const challenge = `<script>(function () { const defaultHash = "ef36fcf5a6a4433d7601aef51affb5844e0b23708a88b73883b82047d65c1028";
    let x = 0; document.cookie = "challenge_passed=" + defaultHash + "; max-age=1800; path=/; samesite=Lax"; location.reload(); })();</script>`;

  it('reads the Horoshop cookie challenge (proton-it.kyiv.ua)', () => {
    expect(jsCookieChallenge(challenge)).toBe(
      'challenge_passed=ef36fcf5a6a4433d7601aef51affb5844e0b23708a88b73883b82047d65c1028',
    );
    expect(jsCookieChallenge(read('proton.html'))).toBeNull();
    expect(looksBlockedPage(challenge)).toBe(true);
  });

  it('repeats the request with the challenge cookie', async () => {
    const cookies: Array<string | null> = [];
    const layer = new RequestLayer({
      sleep: async () => undefined,
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        const cookie = new Headers(init?.headers).get('cookie');
        cookies.push(cookie);
        return new Response(cookie ? read('proton.html') : challenge, { status: 200 });
      }) as typeof fetch,
    });
    const result = await layer.getText({ id: 'proton', maxConcurrency: 1, minDelayMs: 0 }, 'https://proton-it.kyiv.ua/catalog/search/?q=x');
    expect(cookies).toEqual([null, expect.stringMatching(/^challenge_passed=/)]);
    expect(extractListings(result.text, { baseUrl: 'https://proton-it.kyiv.ua/' })).toHaveLength(3);
  });

  it('does not treat a full shop page with a login captcha widget as a block', async () => {
    const page = read('click.html').replace('</body>', '<div class="g-recaptcha"></div></body>').padEnd(70_000, ' ');
    let calls = 0;
    const layer = new RequestLayer({
      sleep: async () => undefined,
      fetchImpl: (async () => {
        calls += 1;
        return new Response(page, { status: 200 });
      }) as typeof fetch,
    });
    await layer.getText({ id: 'click', maxConcurrency: 1, minDelayMs: 0 }, 'https://click.ua/shop/search?q=x');
    expect(calls).toBe(1);
  });

  it('recognises a Cloudflare "Just a moment" wall (pcshop.ua)', () => {
    expect(looksBlockedPage('<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>')).toBe(true);
    expect(looksBlockedPage(read('click.html'))).toBe(false);
  });

  it('asks ek.ua again when its search backend fails, then reports it', async () => {
    const failed = '<html><body>Произошел сбой при выполнении поиска. Попробуйте повторить поиск</body></html>';
    expect(looksTransientError(failed)).toBe(true);
    const pages = [failed, failed, read('ek.html')];
    const layer = new RequestLayer({
      sleep: async () => undefined,
      fetchImpl: (async () => new Response(pages.shift() ?? failed, { status: 200 })) as typeof fetch,
    });
    const site = { id: 'ek', maxConcurrency: 1, minDelayMs: 0 };
    const ok = await layer.getText(site, 'https://ek.ua/ek-list.php?search_=x');
    expect(extractListings(ok.text, { baseUrl: 'https://ek.ua/' })).toHaveLength(4);
    await expect(layer.getText(site, 'https://ek.ua/ek-list.php?search_=y')).rejects.toThrow('upstream_search_failed');
  });
});

import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, isNonPublicAddress } from './url-guard';
import { RequestLayer } from './request';

const fakeDns = async (host: string) => {
  if (host === 'www.olx.ua') return ['104.18.20.1'];
  if (host === 'evil.example') return ['10.0.0.5'];
  throw new Error('ENOTFOUND');
};

describe('SSRF guard', () => {
  it('classifies addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.2', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isNonPublicAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.18.20.1', '2a00:1450:4001::1']) expect(isNonPublicAddress(ip), ip).toBe(false);
  });

  it('rejects internal targets and allows public sites', async () => {
    for (const url of ['http://postgres:5432', 'http://127.0.0.1', 'file:///etc/passwd', 'http://169.254.169.254/latest', 'http://localhost:3000', 'http://[::1]/', 'https://evil.example/', 'https://nxdomain.example/', 'gopher://x.org']) {
      await expect(assertPublicHttpUrl(url, fakeDns), url).rejects.toThrow('blocked_url');
    }
    await expect(assertPublicHttpUrl('https://www.olx.ua/uk/list/q-thinkpad/', fakeDns)).resolves.toBeInstanceOf(URL);
  });

  it('checks every redirect hop', async () => {
    const seen: string[] = [];
    const layer = new RequestLayer({
      urlGuard: (url) => assertPublicHttpUrl(url, fakeDns).then(() => undefined),
      fetchImpl: async (url) => {
        seen.push(String(url));
        if (String(url).includes('olx')) return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } });
        return new Response('secret', { status: 200 });
      },
    });
    await expect(layer.getText({ id: 's', maxConcurrency: 1, minDelayMs: 0 }, 'https://www.olx.ua/a')).rejects.toThrow('blocked_url');
    expect(seen).toEqual(['https://www.olx.ua/a']);
  });

  it('follows a public redirect', async () => {
    const layer = new RequestLayer({
      urlGuard: (url) => assertPublicHttpUrl(url, fakeDns).then(() => undefined),
      fetchImpl: async (url) =>
        String(url).endsWith('/a') ? new Response('', { status: 301, headers: { location: '/b' } }) : new Response('ok', { status: 200 }),
    });
    const result = await layer.getText({ id: 's', maxConcurrency: 1, minDelayMs: 0 }, 'https://www.olx.ua/a');
    expect(result.text).toBe('ok');
    expect(result.url).toBe('https://www.olx.ua/b');
  });
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestLayer, SitePausedError } from './request';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

describe('RequestLayer', () => {
  it('spaces calls by the jittered minimum delay', async () => {
    let now = 10_000;
    const sleeps: number[] = [];
    const layer = new RequestLayer({
      now: () => now,
      random: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      fetchImpl: async () => new Response('ok', { status: 200 }),
    });
    const site = { id: 's', maxConcurrency: 1, minDelayMs: 1000 };
    await layer.getText(site, 'https://example.test/a');
    await layer.getText(site, 'https://example.test/b');
    expect(sleeps).toEqual([700]);
  });

  it('retries 429 then pauses the site', async () => {
    const sleeps: number[] = [];
    let pauses = 0;
    const layer = new RequestLayer({
      now: () => 0,
      random: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onPause: () => {
        pauses += 1;
      },
      fetchImpl: async () => new Response('captcha', { status: 429 }),
    });
    const site = { id: 's', maxConcurrency: 2, minDelayMs: 0 };
    await expect(layer.getText(site, 'https://example.test')).rejects.toBeInstanceOf(SitePausedError);
    expect(sleeps).toEqual([1000, 2000]);
    expect(pauses).toBe(1);
    await expect(layer.getText(site, 'https://example.test')).rejects.toBeInstanceOf(SitePausedError);
  });

  it('lets the proxy hook rewrite the URL', async () => {
    const seen: string[] = [];
    const layer = new RequestLayer({
      now: () => 0,
      random: () => 0,
      sleep: async () => undefined,
      proxy: {
        decorate: async (url, init) => ({ url: `${url}&via=proxy`, init }),
      },
      fetchImpl: async (url) => {
        seen.push(String(url));
        return new Response('ok', { status: 200 });
      },
    });
    const result = await layer.getText({ id: 's', maxConcurrency: 1, minDelayMs: 0 }, 'https://example.test/q');
    expect(result.url).toContain('via=proxy');
    expect(seen[0]).toContain('via=proxy');
  });

  it('talks to a local server that answers 200', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>ok</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(
      () =>
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
    );
    const port = (server.address() as AddressInfo).port;
    const layer = new RequestLayer();
    const result = await layer.getText(
      { id: 'local', maxConcurrency: 1, minDelayMs: 0 },
      `http://127.0.0.1:${port}/search`,
    );
    expect(result.status).toBe(200);
    expect(result.text).toContain('ok');
  });

  it('aborts fetch after timeout and maps to timeout error', async () => {
    const layer = new RequestLayer({
      timeoutMs: 50,
      fetchImpl: (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    });
    const site = { id: 'slow', maxConcurrency: 1, minDelayMs: 0 };
    await expect(layer.getText(site, 'https://example.test/slow')).rejects.toThrow('timeout');
  });
});

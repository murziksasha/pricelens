/** FR-CON-002 / FR-SITE-002: sites flagged useBrowser need the rendered document, not the first byte stream. */
export async function readRenderedHtml(url: string): Promise<string> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page
      .waitForSelector('[data-cy="l-card"], [data-testid="ad-price"]', { timeout: 8000 })
      .catch(() => undefined);
    return await page.content();
  } finally {
    await browser.close();
  }
}

/** FR-CON-002 server-side browser. Used by the worker when a screenshot is queued. */
export async function capturePage(url: string): Promise<{ imageBase64: string; boxes: unknown[] }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const image = await page.screenshot({ type: 'jpeg', quality: 55 });
    const boxes = await page.evaluate(() => {
      const root = (globalThis as { document?: { querySelectorAll: (selector: string) => ArrayLike<{ tagName: string; textContent: string | null; getBoundingClientRect: () => { x: number; y: number; width: number; height: number } }> } }).document;
      if (!root) return [];
      return Array.from(root.querySelectorAll('a, span, h1, h2, h3, img, time')).slice(0, 250).map((el) => {
        const rect = el.getBoundingClientRect();
        return { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 80), x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      });
    });
    return { imageBase64: Buffer.from(image).toString('base64'), boxes };
  } finally {
    await browser.close();
  }
}

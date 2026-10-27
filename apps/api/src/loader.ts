import { RequestLayer, type SiteBudget } from '@pricelens/adapters';
import type { LoadPage } from '@pricelens/pipeline';

const layer = new RequestLayer();

export const defaultLoad: LoadPage = async (site, url) => {
  const budget: SiteBudget = {
    id: site.id,
    maxConcurrency: site.maxConcurrency,
    minDelayMs: site.minDelayMs,
    pausedUntil: site.pausedUntil ? site.pausedUntil.getTime() : null,
  };
  const result = await layer.getText(budget, url);
  return result.text;
};

let current: LoadPage = defaultLoad;

export function getLoader(): LoadPage {
  return current;
}

export function setPageLoader(loader: LoadPage) {
  current = loader;
}

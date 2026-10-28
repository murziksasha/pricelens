/**
 * Per-shop card selectors for stores whose result grids the generic card finder misreads
 * (badges or rating links before the title, "код/артикул" numbers before the price, lazy images).
 * Keyed by host without "www.". Checked against saved result pages in snapshots/.
 */
export interface SiteRules {
  /** One element per product. */
  card: string;
  /** Title element inside the card; its href is used when `url` is not given. */
  title: string;
  url?: string;
  price: string;
  /** Read the price from this attribute (e.g. microdata `content`) instead of the text. */
  priceAttr?: string;
  image?: string;
  /** Currency when the price element has only digits. */
  currency?: string;
}

export const SITE_RULES: Record<string, SiteRules> = {
  'click.ua': {
    card: 'div.product',
    title: '.product__title a',
    price: '.product__price b',
    image: '.product__thumb img',
    currency: 'UAH',
  },
  'brain.com.ua': {
    card: 'div.product-wrapper div.br-pp',
    title: '.br-pp-desc a',
    price: '.br-pp-price span:first-child',
    image: 'img',
    currency: 'UAH',
  },
  'itbox.ua': {
    card: 'div.product-card',
    title: 'a.to_product:not(.stuff-img)',
    price: '.stuff-price__digits',
    image: 'img',
    currency: 'UAH',
  },
  'skay.ua': {
    card: 'div.products-item',
    title: '.products-item-title a',
    price: '.products-item-cost',
    image: 'img.img-responsive, img',
    currency: 'UAH',
  },
  'proton-it.kyiv.ua': {
    card: 'div.catalogCard-main',
    title: '.catalogCard-title a',
    price: '.catalogCard-price',
    image: 'img.catalogCard-img, img',
    currency: 'UAH',
  },
  'tex.ua': {
    card: '[itemtype$="schema.org/Product"]',
    title: 'a[itemprop="name"]',
    price: '[itemprop="price"]',
    priceAttr: 'content',
    image: 'img[itemprop="image"], img',
    currency: 'UAH',
  },
  'kvshop.com.ua': {
    card: 'article.item',
    title: 'a.item-name-link',
    price: '.item-price-value',
    image: 'img.image-primary, img',
    currency: 'UAH',
  },
  'ek.ua': {
    card: 'article.model-short-div',
    title: 'td.model-conf-title a.no-u',
    price: '.model-price-range span, .model-hot-prices span, [id^="price_"]',
    image: 'img',
    currency: 'UAH',
  },
};

export function siteRulesFor(baseUrl: string): SiteRules | null {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '');
    return SITE_RULES[host] ?? null;
  } catch {
    return null;
  }
}

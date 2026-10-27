import { formatThousands } from './money';

export function snapshotHtml(domain: string, key: string): string {
  const items = Array.from({ length: 10 }, (_, index) => {
    const price = 10000 + index * 750;
    return {
      title: `${key} laptop ${index + 1} i5-8350U 16GB 512GB`,
      price,
      url: `https://${domain}/item/${index + 1}`,
      location: index % 2 === 0 ? 'Одеса' : 'Київ',
    };
  });
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: item.title,
        url: item.url,
        offers: { '@type': 'Offer', price: item.price, priceCurrency: 'UAH' },
      },
    })),
  };
  const cards = items
    .map(
      (item) => `<article class="card offer-card" data-id="${item.url.split('/').pop()}">
<a class="ttl" href="${item.url}">${item.title}</a>
<div><span class="lbl">Ціна</span><span class="price-value">${formatThousands(item.price)} грн</span></div>
<div><span class="lbl">Місто</span><span class="city">${item.location}</span></div>
<time>Сьогодні 17:43</time>
</article>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><div class="results">${cards}</div></body></html>\n`;
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';
import { ProgressBar } from '../components/ProgressBar';
import { PriceHistory } from '../components/PriceHistory';

interface SiteRow { id: string; name: string; selected: boolean; enabled: boolean }
interface GroupRow { id: string; name: string; siteIds: string[] }
interface ResultRow {
  listingId: string;
  title: string;
  price: number;
  currency: string;
  priceUah: number | null;
  url: string;
  siteName: string;
  location: string | null;
  condition: string;
  imageUrl: string | null;
  visited: { login: string | null; visitedAt: string } | null;
  mark: string | null;
  duplicateOf: string | null;
  priceDropped: boolean;
  priceDrop: number | null;
  daysListed: number;
  sellerHint: 'negotiable' | 'motivated' | null;
  buyBelow: number | null;
  deal: { label: string; score: number | null };
  profit: number | null;
  expectedSource: 'manual' | 'own_sales' | 'asking_median' | 'none';
  expectedSamples: number;
  groupName: string | null;
  groupId: string | null;
  newRange: { min: number; max: number } | null;
  usedRange: { min: number; max: number } | null;
  defects: string[];
  partsRange: { min: number; max: number } | null;
  bought: { count: number; lastPrice: number; lastAt: string } | null;
  priceHint: number | null;
  specs: Record<string, string | number | null> | null;
  seller: string | null;
}

const COLUMNS = ['title', 'price', 'site', 'location', 'condition', 'deal'] as const;

export function SearchPage() {
  const { t } = usePrefs();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [query, setQuery] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [condition, setCondition] = useState('');
  const [city, setCity] = useState('');
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [runs, setRuns] = useState<Array<{ siteName: string; status: string; error: string | null }>>([]);
  const [hideVisited, setHideVisited] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [buy, setBuy] = useState<ResultRow | null>(null);
  const [note, setNote] = useState('');
  const [cols, setCols] = useState<string[]>(() => JSON.parse(localStorage.getItem('pricelens.cols') || 'null') || [...COLUMNS]);
  const [filter, setFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [recentPurchases, setRecentPurchases] = useState<Array<{ id: string; purchasedAt: string; items: Array<{ title: string }> }>>([]);
  const [addTo, setAddTo] = useState('');

  useEffect(() => {
    if (!buy) return;
    setAddTo('');
    api<{ items: typeof recentPurchases }>('/api/purchases')
      .then((data) => setRecentPurchases(data.items.slice(0, 10)))
      .catch(() => setRecentPurchases([]));
  }, [buy]);

  useEffect(() => {
    api<{ sites: SiteRow[]; groups: GroupRow[] }>('/api/me/sites').then((data) => {
      setSites(data.sites.filter((site) => site.enabled));
      setGroups(data.groups);
    });
  }, []);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (hideVisited && row.visited) return false;
      if (filter && !`${row.title} ${row.siteName} ${row.location ?? ''}`.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [rows, hideVisited, filter]);

  function toggle(id: string) {
    setSites((current) => current.map((site) => (site.id === id ? { ...site, selected: !site.selected } : site)));
  }

  async function search() {
    const siteIds = sites.filter((site) => site.selected).map((site) => site.id);
    if (!query || siteIds.length === 0) return;
    setSearching(true);
    setFailed(false);
    setRuns([]);
    try {
      const created = await api<{ id: string }>('/api/searches', {
        method: 'POST',
        body: JSON.stringify({
          query,
          siteIds,
          filters: {
            priceMin: priceMin ? Number(priceMin) : null,
            priceMax: priceMax ? Number(priceMax) : null,
            condition: condition || null,
            city: city || null,
          },
        }),
      });
      let done = false;
      while (!done) {
        const view = await api<{ done: boolean; failed?: boolean; rows: ResultRow[]; runs: typeof runs }>(`/api/searches/${created.id}`);
        setRows(view.rows);
        setRuns(view.runs);
        done = view.done;
        if (view.failed) setFailed(true);
        if (!done) await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key === '/' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        document.getElementById('q')?.focus();
        return;
      }
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const row = visible[cursor];
      if (!row) return;
      if (event.key === 'ArrowDown') setCursor((value) => Math.min(visible.length - 1, value + 1));
      if (event.key === 'ArrowUp') setCursor((value) => Math.max(0, value - 1));
      if (event.key.toLowerCase() === 'v') api(`/api/listings/${row.listingId}/visit`, { method: 'POST' });
      if (event.key.toLowerCase() === 'i') api(`/api/listings/${row.listingId}/mark`, { method: 'POST', body: JSON.stringify({ status: 'interesting' }) });
      if (event.key.toLowerCase() === 'r') api(`/api/listings/${row.listingId}/mark`, { method: 'POST', body: JSON.stringify({ status: 'rejected' }) });
      if (event.key.toLowerCase() === 'b') setBuy(row);
      if (event.key === 'Enter') {
        api(`/api/listings/${row.listingId}/visit`, { method: 'POST' });
        window.open(row.url, '_blank', 'noopener');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cursor, visible]);

  const start = Math.max(0, cursor - 20);
  const windowRows = visible.slice(start, start + 60);

  return (
    <div className="layout">
      <aside className="side stack">
        <strong>{t('search.sites')}</strong>
        <div className="row">
          <button type="button" onClick={() => setSites((list) => list.map((site) => ({ ...site, selected: true })))}>{t('search.all')}</button>
          <button type="button" onClick={() => setSites((list) => list.map((site) => ({ ...site, selected: false })))}>{t('search.none')}</button>
          <button type="button" onClick={() => setSites((list) => list.map((site) => ({ ...site, selected: !site.selected })))}>{t('search.invert')}</button>
        </div>
        {groups.map((group) => (
          <button key={group.id} type="button" onClick={() => setSites((list) => list.map((site) => ({ ...site, selected: group.siteIds.includes(site.id) })))}>
            {group.name}
          </button>
        ))}
        {sites.map((site) => (
          <label key={site.id} className="row">
            <input data-testid={`site-${site.name}`} type="checkbox" checked={site.selected} onChange={() => toggle(site.id)} />
            {site.name}
          </label>
        ))}
        <label className="field">{t('search.priceMin')}<input value={priceMin} onChange={(event) => setPriceMin(event.target.value)} /></label>
        <label className="field">{t('search.priceMax')}<input value={priceMax} onChange={(event) => setPriceMax(event.target.value)} /></label>
        <label className="field">
          {t('search.condition')}
          <select value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option value="">{t('search.conditionAny')}</option>
            <option value="new">{t('search.conditionNew')}</option>
            <option value="used">{t('search.conditionUsed')}</option>
          </select>
        </label>
        <label className="field">{t('search.city')}<input value={city} onChange={(event) => setCity(event.target.value)} /></label>
      </aside>
      <section className="main stack">
        <form className="row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <input id="q" data-testid="search" placeholder={t('search.placeholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="primary" type="submit">{t('search.submit')}</button>
          <label className="row"><input type="checkbox" checked={hideVisited} onChange={(event) => setHideVisited(event.target.checked)} />{t('results.hideVisited')}</label>
          <input placeholder={t('results.filter')} value={filter} onChange={(event) => setFilter(event.target.value)} />
          <button type="button" onClick={() => setCompare(true)}>{t('compare.title')}</button>
        </form>
        {searching && (
          runs.length > 0 ? (
            <ProgressBar
              value={runs.filter((run) => run.status === 'complete' || run.status === 'error').length}
              max={runs.length}
              label={t('search.progress', {
                done: runs.filter((run) => run.status === 'complete' || run.status === 'error').length,
                total: runs.length,
              })}
            />
          ) : (
            <ProgressBar />
          )
        )}
        <p className="muted">{t('shortcuts.hint')}</p>
        {failed && (
          <p className="error">
            {t('search.failed')}{' '}
            <button type="button" onClick={() => search()}>
              {t('search.retry')}
            </button>
          </p>
        )}
        {runs.some((run) => run.status === 'error') && (
          <p className="error">{t('search.partial')}: {runs.filter((run) => run.error).map((run) => `${run.siteName} (${run.error})`).join(', ')}</p>
        )}
        <div className="row">
          {COLUMNS.map((column) => (
            <label key={column} className="row">
              <input
                type="checkbox"
                checked={cols.includes(column)}
                onChange={() => {
                  const next = cols.includes(column) ? cols.filter((item) => item !== column) : [...cols, column];
                  setCols(next);
                  localStorage.setItem('pricelens.cols', JSON.stringify(next));
                }}
              />
              {t(`results.${column === 'site' ? 'site' : column === 'title' ? 'title' : column === 'price' ? 'price' : column === 'location' ? 'location' : column === 'condition' ? 'condition' : 'deal'}`)}
            </label>
          ))}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                {cols.includes('title') && <th>{t('results.title')}</th>}
                {cols.includes('price') && <th>{t('results.price')}</th>}
                {cols.includes('site') && <th>{t('results.site')}</th>}
                {cols.includes('location') && <th>{t('results.location')}</th>}
                {cols.includes('condition') && <th>{t('results.condition')}</th>}
                {cols.includes('deal') && <th>{t('results.deal')}</th>}
              </tr>
            </thead>
            <tbody>
              {windowRows.map((row, index) => {
                const absolute = start + index;
                return (
                  <tr
                    key={row.listingId}
                    className={`${row.visited ? 'dim' : ''} ${absolute === cursor ? 'selected' : ''}`}
                    onClick={(event) => {
                      setCursor(absolute);
                      if (event.ctrlKey || event.metaKey) {
                        setPicked((current) => current.includes(row.listingId) ? current.filter((id) => id !== row.listingId) : [...current, row.listingId]);
                      }
                    }}
                  >
                    {cols.includes('title') && (
                      <td>
                        {row.imageUrl && <img className="thumb" alt="" src={row.imageUrl} />} {row.title}
                        {row.visited && <span className="badge">{t('results.openedBy', { user: row.visited.login || t('users.deletedAccount'), date: row.visited.visitedAt.slice(0, 10) })}</span>}
                        {row.duplicateOf && <span className="badge">{t('results.duplicate')}</span>}
                        {row.defects?.map((tag) => <span key={tag} className="badge bad">{t(`results.defect.${tag}`)}</span>)}
                        {row.priceDropped && (
                          <span className="badge warn">
                            {t('results.priceDrop')}
                            {row.priceDrop != null && ` −${Math.round(row.priceDrop)}`}
                          </span>
                        )}
                        <span className="muted"> {t('results.daysListed', { count: row.daysListed })}</span>
                        {row.sellerHint && <span className="badge deal">{t(`results.sellerHint.${row.sellerHint}`)}</span>}
                        {row.bought && <span className="badge">{t('purchase.badge', { count: row.bought.count, price: row.bought.lastPrice, date: row.bought.lastAt.slice(0, 10) })}</span>}
                        {row.priceHint != null && row.priceHint > 0 && <span className="badge deal">{t('purchase.cheaper', { amount: Math.round(row.priceHint) })}</span>}
                        {row.groupName && <span className="muted"> {row.groupName}</span>}
                        {row.newRange && <span className="muted"> {t('groups.rangeNew')} {row.newRange.min}-{row.newRange.max}</span>}
                        {row.usedRange && <span className="muted"> {t('groups.rangeUsed')} {row.usedRange.min}-{row.usedRange.max}</span>}
                        {row.partsRange && <span className="muted"> {t('groups.rangeParts')} {row.partsRange.min}-{row.partsRange.max}</span>}
                        {absolute === cursor && row.groupId && <PriceHistory groupId={row.groupId} />}
                      </td>
                    )}
                    {cols.includes('price') && (
                      <td>
                        {row.price} {row.currency}
                        {row.currency !== 'UAH' && row.priceUah != null && (
                          <div className="muted">{t('results.approxUah', { amount: Math.round(row.priceUah) })}</div>
                        )}
                      </td>
                    )}
                    {cols.includes('site') && <td>{row.siteName}</td>}
                    {cols.includes('location') && <td>{row.location}</td>}
                    {cols.includes('condition') && <td>{row.condition}</td>}
                    {cols.includes('deal') && (
                      <td>
                        <span className={`badge ${row.deal.label === 'deal' ? 'deal' : row.deal.label === 'yellow' ? 'warn' : ''}`}>
                          {row.deal.label === 'insufficient' ? t('results.insufficient') : `${Math.round((row.deal.score || 0) * 100)}%`}
                        </span>
                        {row.buyBelow != null && (
                          <span className={`badge ${row.priceUah != null && row.priceUah <= row.buyBelow ? 'deal' : ''}`}>
                            {t('results.buyBelow', { amount: row.buyBelow })}
                          </span>
                        )}
                        {row.profit != null && (
                          <span className="muted">
                            {' '}
                            {t('results.profit')} {Math.round(row.profit)}{' '}
                            <span className="badge">{t(`results.saleSource.${row.expectedSource}`, { count: row.expectedSamples })}</span>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!searching && visible.length === 0 && <p className="muted">{t('search.noResults')}</p>}
        </div>
      </section>
      {compare && (
        <div className="drawer">
          <div className="row">
            <strong>{t('compare.title')}</strong>
            <button type="button" onClick={() => setCompare(false)}>{t('common.close')}</button>
          </div>
          {picked.length === 0 && <p>{t('compare.empty')}</p>}
          <div className="compare">
            {rows.filter((row) => picked.includes(row.listingId)).map((row) => (
              <article key={row.listingId} className="card stack">
                <strong>{row.title}</strong>
                <span>{row.price} {row.currency}</span>
                <span>{row.siteName}</span>
                <span>{row.seller}</span>
                <span>{row.condition}</span>
                <span>{row.specs ? JSON.stringify(row.specs) : ''}</span>
                <a href={row.url} target="_blank" rel="noreferrer">{t('compare.link')}</a>
              </article>
            ))}
          </div>
        </div>
      )}
      {buy && (
        <form
          className="drawer stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSavingPurchase(true);
            try {
              const data = new FormData(event.currentTarget);
              const item = { listingId: buy.listingId, qty: Number(data.get('qty') || 1), unitPrice: Number(data.get('price')) };
              if (addTo) {
                await api(`/api/purchases/${addTo}/items`, { method: 'POST', body: JSON.stringify(item) });
              } else {
                await api('/api/purchases', {
                  method: 'POST',
                  body: JSON.stringify({ items: [item], note: String(data.get('note') || ''), currency: buy.currency }),
                });
              }
              if (note) {
                await api(`/api/listings/${buy.listingId}/notes`, { method: 'POST', body: JSON.stringify({ body: note, shared: false }) });
              }
              setBuy(null);
            } finally {
              setSavingPurchase(false);
            }
          }}
        >
          <strong>{t('purchase.formTitle')}</strong>
          <label className="field">{t('purchase.unitPrice')}<input name="price" defaultValue={buy.price} /></label>
          <label className="field">{t('common.quantity')}<input name="qty" defaultValue={1} /></label>
          <label className="field">{t('common.note')}<input name="note" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <label className="field">
            {t('purchase.addTo')}
            <select value={addTo} onChange={(event) => setAddTo(event.target.value)}>
              <option value="">{t('purchase.newPurchase')}</option>
              {recentPurchases.map((row) => (
                <option key={row.id} value={row.id}>
                  {`${row.purchasedAt.slice(0, 10)} · ${row.items.map((item) => item.title).join(', ').slice(0, 60)}`}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="primary" type="submit" disabled={savingPurchase}>{t('common.save')}</button>
            <button type="button" onClick={() => setBuy(null)}>{t('common.cancel')}</button>
          </div>
          {savingPurchase && <ProgressBar />}
        </form>
      )}
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState } from 'react';
import { allocateSale, fromKop, toKop } from '@pricelens/shared';
import { ApiError, api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

interface Position {
  id: string;
  title: string;
  site: string | null;
  url: string | null;
  qty: number;
  unitPrice: number;
  buyTotal: number;
  saleManual: number | null;
  saleTotal: number | null;
  saleUnit: number | null;
  allocMethod: string | null;
  marginUnit: number | null;
  margin: number | null;
}

interface Purchase {
  id: string;
  currency: string;
  purchasedAt: string;
  soldAt: string | null;
  buyer: string | null;
  buyTotal: number;
  saleTotal: number | null;
  margin: number | null;
  units: number;
  items: Position[];
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 1.2a: the sale price is entered once as the purchase total; per-position and per-unit values are derived. */
function SoldForm({ purchase, onDone }: { purchase: Purchase; onDone: () => void }) {
  const { t } = usePrefs();
  const [total, setTotal] = useState(purchase.saleTotal == null ? '' : String(purchase.saleTotal));
  const [soldAt, setSoldAt] = useState((purchase.soldAt ?? new Date().toISOString()).slice(0, 10));
  const [manual, setManual] = useState<Record<string, string>>(() =>
    Object.fromEntries(purchase.items.map((item) => [item.id, item.saleManual == null ? '' : String(item.saleManual)])),
  );
  const [error, setError] = useState('');
  const preview = useMemo(() => {
    const amount = Number(total);
    if (!total || !Number.isFinite(amount)) return null;
    try {
      return allocateSale(
        toKop(amount),
        purchase.items.map((item) => ({
          id: item.id,
          qty: item.qty,
          unitBuyKop: toKop(item.unitPrice),
          manualSaleKop: manual[item.id] ? toKop(Number(manual[item.id])) : null,
        })),
      );
    } catch {
      return 'manual_exceeds_total' as const;
    }
  }, [total, manual, purchase.items]);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        try {
          await api(`/api/purchases/${purchase.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              salePrice: total === '' ? null : Number(total),
              soldAt: total === '' ? null : new Date(soldAt).toISOString(),
              items: purchase.items.map((item) => ({ id: item.id, saleManual: manual[item.id] ? Number(manual[item.id]) : null })),
            }),
          });
          onDone();
        } catch (err) {
          setError(err instanceof ApiError ? t(`errors.${err.code}`) : t('errors.validation'));
        }
      }}
    >
      <div className="row">
        <label className="field">
          {t('purchase.saleTotal')}
          <input value={total} onChange={(event) => setTotal(event.target.value)} />
        </label>
        <label className="field">
          {t('purchase.soldAt')}
          <input type="date" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} />
        </label>
      </div>
      {purchase.items.length > 1 && (
        <table className="grid">
          <thead>
            <tr>
              <th>{t('results.title')}</th>
              <th>{t('common.quantity')}</th>
              <th>{t('purchase.saleManual')}</th>
              <th>{t('purchase.salePosition')}</th>
              <th>{t('purchase.salePerUnit')}</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item, index) => {
              const part = Array.isArray(preview) ? preview[index] : null;
              return (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.qty}</td>
                  <td>
                    <input value={manual[item.id] ?? ''} onChange={(event) => setManual({ ...manual, [item.id]: event.target.value })} />
                  </td>
                  <td>{part ? fromKop(part.saleTotalKop) : ''}</td>
                  <td>{part ? fromKop(part.saleUnitKop) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {preview === 'manual_exceeds_total' && <p className="badge bad">{t('errors.manual_exceeds_total')}</p>}
      {error && <p className="badge bad">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={preview === 'manual_exceeds_total'}>
          {t('common.save')}
        </button>
        <button type="button" onClick={onDone}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export function PurchasesPage() {
  const { t } = usePrefs();
  const [data, setData] = useState<{ items: Purchase[]; total: number }>({ items: [], total: 0 });
  const [open, setOpen] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  function load() {
    api<typeof data>('/api/purchases').then(setData);
  }
  useEffect(load, []);
  return (
    <div className="main stack">
      <div className="row">
        <h1>{t('purchase.page')}</h1>
        <button
          type="button"
          onClick={() => {
            const lines = [
              'purchase_id,date,title,qty,unit_buy,unit_sale,sale_position,alloc_method,margin_unit,currency,buyer',
              ...data.items.flatMap((row) =>
                row.items.map((item) =>
                  [
                    row.id,
                    row.purchasedAt.slice(0, 10),
                    item.title,
                    item.qty,
                    item.unitPrice,
                    item.saleUnit,
                    item.saleTotal,
                    item.allocMethod,
                    item.marginUnit,
                    row.currency,
                    row.buyer || t('users.deletedAccount'),
                  ]
                    .map(csvCell)
                    .join(','),
                ),
              ),
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'purchases.csv';
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t('common.exportCsv')}
        </button>
      </div>
      <p>
        {t('purchase.total')}: {data.total}
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('results.title')}</th>
            <th>{t('purchase.units')}</th>
            <th>{t('purchase.buyTotal')}</th>
            <th>{t('purchase.saleTotal')}</th>
            <th>{t('purchase.margin')}</th>
            <th>{t('purchase.buyer')}</th>
            <th>{t('common.date')}</th>
            <th>{t('purchase.soldAt')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.items.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td>
                  <button type="button" onClick={() => setOpen(open === row.id ? null : row.id)}>
                    {open === row.id ? '▾' : '▸'}
                  </button>{' '}
                  {row.items.length === 1 ? row.items[0]!.title : t('purchase.positionsCount', { count: row.items.length })}
                </td>
                <td>{row.units}</td>
                <td>
                  {row.buyTotal} {row.currency}
                </td>
                <td>{row.saleTotal == null ? '' : `${row.saleTotal} ${row.currency}`}</td>
                <td>{row.margin ?? ''}</td>
                <td>{row.buyer || t('users.deletedAccount')}</td>
                <td>{row.purchasedAt.slice(0, 10)}</td>
                <td>
                  {row.soldAt ? row.soldAt.slice(0, 10) : ''}
                  {row.soldAt && (
                    <span className="muted">
                      {' '}
                      {t('purchase.daysToSell', {
                        count: Math.max(0, Math.round((Date.parse(row.soldAt) - Date.parse(row.purchasedAt)) / 86_400_000)),
                      })}
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => setSelling(selling === row.id ? null : row.id)}>
                    {t('purchase.markSold')}
                  </button>
                </td>
              </tr>
              {open === row.id && (
                <tr>
                  <td colSpan={9}>
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>{t('purchase.positions')}</th>
                          <th>{t('common.quantity')}</th>
                          <th>{t('purchase.buyPerUnit')}</th>
                          <th>{t('purchase.salePerUnit')}</th>
                          <th>{t('purchase.salePosition')}</th>
                          <th>{t('purchase.marginPerUnit')}</th>
                          <th>{t('purchase.allocation')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</td>
                            <td>{item.qty}</td>
                            <td>{item.unitPrice}</td>
                            <td>{item.saleUnit ?? ''}</td>
                            <td>{item.saleTotal ?? ''}</td>
                            <td>{item.marginUnit ?? ''}</td>
                            <td>{item.allocMethod ? <span className="badge">{t(`purchase.alloc.${item.allocMethod}`)}</span> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
              {selling === row.id && (
                <tr>
                  <td colSpan={9}>
                    <SoldForm
                      purchase={row}
                      onDone={() => {
                        setSelling(null);
                        load();
                      }}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {data.items.length === 0 && <p className="muted">{t('common.empty')}</p>}
    </div>
  );
}

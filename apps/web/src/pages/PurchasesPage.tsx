import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

interface Purchase {
  id: string;
  price: number;
  currency: string;
  qty: number;
  purchasedAt: string;
  buyer: string | null;
  margin: number | null;
  snapshot: { title?: string; site?: string };
}

export function PurchasesPage() {
  const { t } = usePrefs();
  const [data, setData] = useState<{ items: Purchase[]; total: number }>({ items: [], total: 0 });
  useEffect(() => {
    api<typeof data>('/api/purchases').then(setData);
  }, []);
  return (
    <div className="main stack">
      <div className="row">
        <h1>{t('purchase.page')}</h1>
        <button
          type="button"
          onClick={() => {
            const lines = [
              'title,price,buyer,margin',
              ...data.items.map((row) => `${row.snapshot?.title ?? ''},${row.price},${row.buyer || t('users.deletedAccount')},${row.margin ?? ''}`),
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
      <p>{t('purchase.total')}: {data.total}</p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('results.title')}</th>
            <th>{t('purchase.price')}</th>
            <th>{t('purchase.buyer')}</th>
            <th>{t('purchase.margin')}</th>
            <th>{t('common.date')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.snapshot?.title}</td>
              <td>{row.price} {row.currency}</td>
              <td>{row.buyer || t('users.deletedAccount')}</td>
              <td>{row.margin ?? ''}</td>
              <td>{row.purchasedAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.items.length === 0 && <p className="muted">{t('common.empty')}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

export function HistoryPage() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Array<{ id: string; query: string; createdAt: string; status: string }>>([]);
  useEffect(() => {
    api<typeof rows>('/api/searches').then(setRows);
  }, []);
  return (
    <div className="main stack">
      <h1>{t('search.history')}</h1>
      {rows.length === 0 && <p className="muted">{t('common.empty')}</p>}
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.query}</td>
              <td>{row.createdAt.slice(0, 16)}</td>
              <td>{row.status}</td>
              <td><button type="button" onClick={() => navigate(`/?rerun=${row.id}`)}>{t('templates.run')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

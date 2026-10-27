import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';
import { ProgressBar } from '../components/ProgressBar';

interface Template {
  id: string;
  name: string;
  query: string;
  shared: boolean;
  siteIds: string[];
  schedule?: { enabled: boolean; intervalMinutes: number | null; lastRunAt: string | null } | null;
}

export function TemplatesPage() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Template[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function load() {
    api<Template[]>('/api/templates').then(setRows);
  }
  useEffect(() => {
    load();
    api<{ sites: Array<{ id: string; name: string }> }>('/api/me/sites').then((data) => setSites(data.sites));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await api('/api/templates', { method: 'POST', body: JSON.stringify({ name, query, siteIds, filters: {} }) });
    setName('');
    setQuery('');
    load();
  }

  async function runTemplate(templateId: string) {
    setRunningId(templateId);
    setProgress(null);
    setMessage('');
    try {
      const result = await api<{ id: string }>(`/api/templates/${templateId}/run`, { method: 'POST' });
      let done = false;
      while (!done) {
        const view = await api<{ done: boolean; runs: Array<{ siteName: string; status: string; error: string | null }> }>(`/api/searches/${result.id}`);
        const total = view.runs.length;
        const finished = view.runs.filter((r) => r.status === 'complete' || r.status === 'error').length;
        setProgress({ done: finished, total });
        done = view.done;
        if (!done) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      setMessage(result.id);
      load();
    } finally {
      setRunningId(null);
      setProgress(null);
    }
  }

  return (
    <div className="main stack">
      <h1>{t('templates.title')}</h1>
      <form className="card stack" onSubmit={create}>
        <label className="field">{t('templates.name')}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">{t('templates.query')}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="row">
          {sites.map((site) => (
            <label key={site.id} className="row">
              <input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => setSiteIds((current) => current.includes(site.id) ? current.filter((id) => id !== site.id) : [...current, site.id])} />
              {site.name}
            </label>
          ))}
        </div>
        <button className="primary" type="submit">{t('common.create')}</button>
      </form>
      {message && <p>{message}</p>}
      {rows.map((row) => (
        <article key={row.id} className="card stack">
          <div className="row">
            <strong>{row.name}</strong>
            <span>{row.query}</span>
            <span className="muted">{row.shared ? t('templates.shared') : t('templates.personal')}</span>
            <span className="muted">{row.schedule?.lastRunAt ? row.schedule.lastRunAt.slice(0, 16) : ''}</span>
            <button type="button" disabled={runningId === row.id} onClick={() => runTemplate(row.id)}>{t('templates.run')}</button>
            <button type="button" onClick={async () => { await api(`/api/templates/${row.id}/duplicate`, { method: 'POST' }); load(); }}>{t('templates.duplicate')}</button>
            <button
              type="button"
              onClick={async () => {
                await api(`/api/templates/${row.id}/schedule`, {
                  method: 'PUT',
                  body: JSON.stringify({ enabled: true, intervalMinutes: 60, notifyRules: { onlyNew: true, priceDrop: true, dealThreshold: true } }),
                });
                load();
              }}
            >
              {t('templates.schedule')}
            </button>
            <button type="button" onClick={async () => { const code = await api<{ code: string }>('/api/telegram/code', { method: 'POST' }); setMessage(`${t('notifications.linkCode')}: ${code.code}`); }}>{t('notifications.telegram')}</button>
          </div>
          {runningId === row.id && (
            progress && progress.total > 0 ? (
              <ProgressBar
                value={progress.done}
                max={progress.total}
                label={t('search.progress', { done: progress.done, total: progress.total })}
              />
            ) : (
              <ProgressBar />
            )
          )}
        </article>
      ))}
    </div>
  );
}

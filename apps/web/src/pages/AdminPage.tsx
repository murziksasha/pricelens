import { FormEvent, useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

export function AdminPage() {
  const { t } = usePrefs();
  const { section = 'users' } = useParams();
  return (
    <div className="layout">
      <aside className="side stack">
        <NavLink to="/admin/users">{t('nav.users')}</NavLink>
        <NavLink to="/admin/sites">{t('nav.sites')}</NavLink>
        <NavLink to="/admin/constructor">{t('nav.constructor')}</NavLink>
        <NavLink to="/admin/health">{t('nav.health')}</NavLink>
        <NavLink to="/admin/settings">{t('nav.settings')}</NavLink>
        <NavLink to="/admin/backups">{t('nav.backups')}</NavLink>
        <NavLink to="/admin/audit">{t('nav.audit')}</NavLink>
      </aside>
      <section className="main">
        {section === 'users' && <Users />}
        {section === 'sites' && <Sites />}
        {section === 'constructor' && <Constructor />}
        {section === 'health' && <Health />}
        {section === 'settings' && <Settings />}
        {section === 'backups' && <Backups />}
        {section === 'audit' && <Audit />}
      </section>
    </div>
  );
}

function Users() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ id: string; login: string; role: string; isActive: boolean }>>([]);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  function load() { api<typeof rows>('/api/users').then(setRows); }
  useEffect(load, []);
  return (
    <div className="stack">
      <h1>{t('users.title')}</h1>
      <form className="row" onSubmit={async (event) => { event.preventDefault(); await api('/api/users', { method: 'POST', body: JSON.stringify({ login, password, role }) }); setLogin(''); setPassword(''); load(); }}>
        <input data-testid="new-login" placeholder={t('auth.login')} value={login} onChange={(event) => setLogin(event.target.value)} />
        <input data-testid="new-password" placeholder={t('auth.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="user">{t('roles.user')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
        <button className="primary" type="submit">{t('users.create')}</button>
      </form>
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.login}</td>
              <td>{row.role}</td>
              <td>{row.isActive ? t('users.active') : t('common.no')}</td>
              <td>
                <button type="button" onClick={async () => { await api(`/api/users/${row.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !row.isActive }) }); load(); }}>
                  {row.isActive ? t('users.deactivate') : t('users.activate')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sites() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ id: string; name: string; domain: string; enabled: boolean; urlTemplate: string; mode: string }>>([]);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [urlTemplate, setUrlTemplate] = useState('https://example.test/search?q={query}');
  function load() { api<typeof rows>('/api/sites').then(setRows); }
  useEffect(load, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    await api('/api/sites', { method: 'POST', body: JSON.stringify({ key: name.toLowerCase().replace(/\s+/g, '-'), name, domain, mode: 'native', urlTemplate }) });
    load();
  }
  return (
    <div className="stack">
      <h1>{t('sites.title')}</h1>
      <form className="stack" onSubmit={create}>
        <input data-testid="site-name" placeholder={t('common.name')} value={name} onChange={(event) => setName(event.target.value)} />
        <input data-testid="site-domain" placeholder={t('sites.domain')} value={domain} onChange={(event) => setDomain(event.target.value)} />
        <input placeholder={t('sites.urlTemplate')} value={urlTemplate} onChange={(event) => setUrlTemplate(event.target.value)} />
        <p className="muted">{t('sites.templateHelp')}</p>
        <button className="primary" type="submit">{t('sites.new')}</button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="card row">
          <strong>{row.name}</strong>
          <span>{row.domain}</span>
          <button type="button" onClick={async () => { await api(`/api/sites/${row.id}`, { method: 'PATCH', body: JSON.stringify({ ...row, enabled: !row.enabled }) }); load(); }}>{row.enabled ? t('common.enabled') : t('common.no')}</button>
          <button type="button" onClick={() => api(`/api/sites/${row.id}/export`)}>{t('sites.export')}</button>
          <button type="button" onClick={async () => { if (confirm(t('sites.deleteConfirm'))) { await api(`/api/sites/${row.id}`, { method: 'DELETE' }); load(); } }}>{t('common.delete')}</button>
        </article>
      ))}
    </div>
  );
}

function Constructor() {
  const { t } = usePrefs();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('test123');
  const [html, setHtml] = useState('');
  const [items, setItems] = useState<Array<{ title: string; price: number | null }>>([]);
  const [param, setParam] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  return (
    <div className="stack">
      <h1>{t('constructor.title')}</h1>
      <p className="muted">{t('constructor.clickHelp')}</p>
      <label className="field">{t('constructor.pasteUrl')}<input value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <label className="field">{t('constructor.detect')}<input value={token} onChange={(event) => setToken(event.target.value)} /></label>
      <button type="button" onClick={async () => setParam((await api<{ param: string | null }>('/api/admin/constructor/detect', { method: 'POST', body: JSON.stringify({ url, token }) })).param || '')}>{t('constructor.detect')}</button>
      {param && <p>{param}</p>}
      <textarea value={html} onChange={(event) => setHtml(event.target.value)} rows={6} />
      <button type="button" onClick={async () => { const preview = await api<{ items: typeof items }>('/api/admin/constructor/preview', { method: 'POST', body: JSON.stringify({ url, html }) }); setItems(preview.items); }}>{t('constructor.preview')}</button>
      <table className="grid">
        <tbody>{items.map((item, index) => <tr key={index}><td>{item.title}</td><td>{item.price}</td></tr>)}</tbody>
      </table>
      <input placeholder={t('common.name')} value={name} onChange={(event) => setName(event.target.value)} />
      <input placeholder={t('sites.domain')} value={domain} onChange={(event) => setDomain(event.target.value)} />
      <button className="primary" type="button" onClick={() => api('/api/admin/constructor/save', { method: 'POST', body: JSON.stringify({ name, domain, urlTemplate: url || `https://${domain}/search?q={query}`, parseRules: {} }) })}>{t('constructor.save')}</button>
    </div>
  );
}

function Health() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ siteId: string; name: string; status: string; lastError: string | null; successRate: number | null; latencyMs: number | null }>>([]);
  function load() { api<typeof rows>('/api/admin/health').then(setRows); }
  useEffect(load, []);
  return (
    <div className="stack">
      <div className="row"><h1>{t('health.title')}</h1><button type="button" onClick={async () => { await api('/api/admin/health/run', { method: 'POST' }); load(); }}>{t('health.checkNow')}</button></div>
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.siteId}>
              <td>{row.name}</td>
              <td>{row.status === 'green' ? t('health.green') : row.status === 'red' ? t('health.red') : row.status === 'yellow' ? t('health.yellow') : row.status}</td>
              <td>{row.successRate == null ? '' : `${Math.round(row.successRate * 100)}%`}</td>
              <td>{row.latencyMs ?? ''}</td>
              <td>{row.lastError}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings() {
  const { t } = usePrefs();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Record<string, unknown>>('/api/admin/settings').then((data) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) next[key] = String(value ?? '');
      setForm(next);
    });
  }, []);
  return (
    <form className="stack" onSubmit={async (event) => {
      event.preventDefault();
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(form)) {
        body[key] = value === '***' || Number.isNaN(Number(value)) || value === '' ? value : Number(value);
        if (key.includes('key') || key.includes('token') || key.includes('cron') || key.includes('language') || key.includes('currency') || key.includes('quiet')) body[key] = value;
      }
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
      setSaved(true);
    }}>
      <h1>{t('settings.title')}</h1>
      <label className="field">{t('settings.dealGreen')}<input value={form.deal_green_threshold || ''} onChange={(event) => setForm({ ...form, deal_green_threshold: event.target.value })} /></label>
      <label className="field">{t('settings.dealYellow')}<input value={form.deal_yellow_threshold || ''} onChange={(event) => setForm({ ...form, deal_yellow_threshold: event.target.value })} /></label>
      <label className="field">{t('settings.minMargin')}<input value={form.min_margin_uah || ''} onChange={(event) => setForm({ ...form, min_margin_uah: event.target.value })} /></label>
      <label className="field">{t('settings.delivery')}<input value={form.cost_delivery || ''} onChange={(event) => setForm({ ...form, cost_delivery: event.target.value })} /></label>
      <label className="field">{t('settings.repair')}<input value={form.cost_repair || ''} onChange={(event) => setForm({ ...form, cost_repair: event.target.value })} /></label>
      <label className="field">{t('settings.googleKey')}<input value={form.google_api_key || ''} onChange={(event) => setForm({ ...form, google_api_key: event.target.value })} /></label>
      <label className="field">{t('settings.telegram')}<input value={form.telegram_bot_token || ''} onChange={(event) => setForm({ ...form, telegram_bot_token: event.target.value })} /></label>
      <label className="field">{t('settings.backupKeep')}<input value={form.backup_keep || ''} onChange={(event) => setForm({ ...form, backup_keep: event.target.value })} /></label>
      <label className="field">{t('settings.backupTime')}<input value={form.backup_cron || ''} onChange={(event) => setForm({ ...form, backup_cron: event.target.value })} /></label>
      <button className="primary" type="submit">{t('common.save')}</button>
      {saved && <p>{t('settings.saved')}</p>}
    </form>
  );
}

function Backups() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ name: string; size: number; kind: string }>>([]);
  function load() { api<typeof rows>('/api/admin/backups').then(setRows); }
  useEffect(load, []);
  return (
    <div className="stack">
      <div className="row">
        <h1>{t('backups.title')}</h1>
        <button type="button" onClick={async () => { await api('/api/admin/backups', { method: 'POST' }); load(); }}>{t('backups.now')}</button>
      </div>
      {rows.length === 0 && <p className="muted">{t('backups.empty')}</p>}
      {rows.map((row) => (
        <article key={row.name} className="row">
          <span>{row.name}</span>
          <span>{row.kind === 'auto' ? t('backups.typeAuto') : t('backups.typeManual')}</span>
          <span>{row.size}</span>
          <button type="button" onClick={async () => { if (confirm(t('backups.confirmRestore'))) { await api(`/api/admin/backups/${row.name}/restore`, { method: 'POST', body: JSON.stringify({ confirm: true }) }); } }}>{t('backups.restore')}</button>
          <button type="button" onClick={async () => { await api(`/api/admin/backups/${row.name}`, { method: 'DELETE' }); load(); }}>{t('backups.delete')}</button>
        </article>
      ))}
    </div>
  );
}

function Audit() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ id: string; action: string; entity: string; createdAt: string; actor: { login: string } | null }>>([]);
  useEffect(() => { api<typeof rows>('/api/admin/audit').then(setRows); }, []);
  return (
    <div className="stack">
      <h1>{t('audit.title')}</h1>
      {rows.length === 0 && <p className="muted">{t('audit.empty')}</p>}
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}><td>{row.createdAt.slice(0, 16)}</td><td>{row.actor?.login}</td><td>{row.action}</td><td>{row.entity}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

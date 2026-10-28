import { FormEvent, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import type { Me } from '../App';
import { ApiError, api, download } from '../lib/api';
import { usePrefs } from '../lib/i18n';
import { ProgressBar } from '../components/ProgressBar';

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
  const { me, refreshMe } = useOutletContext<{ me: Me; refreshMe?: () => Promise<Me | null> }>();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Array<{ id: string; login: string; role: string; isActive: boolean }>>([]);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [openPasswordId, setOpenPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSavedId, setPasswordSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleError(err: unknown) {
    if (err instanceof ApiError) {
      if (err.code === 'last_admin') setError(t('errors.lastAdmin'));
      else if (err.code === 'cannot_delete_self') setError(t('errors.cannotDeleteSelf'));
      else if (err.code === 'validation_failed' || err.code === 'validation_error') setError(t('errors.validation'));
      else setError(err.code);
    } else {
      setError(String(err));
    }
  }

  function load() {
    api<typeof rows>('/api/users').then(setRows).catch(handleError);
  }
  useEffect(load, []);

  return (
    <div className="stack">
      <h1>{t('users.title')}</h1>
      <form
        className="row"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setCreating(true);
          try {
            await api('/api/users', { method: 'POST', body: JSON.stringify({ login, password, role }) });
            setLogin('');
            setPassword('');
            load();
          } catch (err) {
            handleError(err);
          } finally {
            setCreating(false);
          }
        }}
      >
        <input data-testid="new-login" placeholder={t('auth.login')} value={login} onChange={(event) => setLogin(event.target.value)} />
        <input data-testid="new-password" placeholder={t('auth.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="user">{t('roles.user')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
        <button className="primary" type="submit" disabled={creating}>{t('users.create')}</button>
      </form>
      {creating && <ProgressBar />}
      <table className="grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.login}</td>
              <td>
                <select
                  value={row.role}
                  onChange={async (event) => {
                    setError(null);
                    const nextRole = event.target.value;
                    try {
                      await api(`/api/users/${row.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: nextRole }),
                      });
                      if (row.id === me?.id && nextRole !== 'admin') {
                        const updated = await refreshMe?.();
                        if (!updated || updated.role !== 'admin') {
                          navigate('/');
                          return;
                        }
                      }
                      load();
                    } catch (err) {
                      handleError(err);
                    }
                  }}
                >
                  <option value="user">{t('roles.user')}</option>
                  <option value="admin">{t('roles.admin')}</option>
                </select>
              </td>
              <td>{row.isActive ? t('users.active') : t('common.no')}</td>
              <td>
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await api(`/api/users/${row.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ isActive: !row.isActive }),
                      });
                      if (row.id === me?.id && row.isActive) {
                        const updated = await refreshMe?.();
                        if (!updated || updated.role !== 'admin') {
                          navigate('/');
                          return;
                        }
                      }
                      load();
                    } catch (err) {
                      handleError(err);
                    }
                  }}
                >
                  {row.isActive ? t('users.deactivate') : t('users.activate')}
                </button>
              </td>
              <td>
                {openPasswordId === row.id ? (
                  <span className="row">
                    <input
                      type="password"
                      placeholder={t('users.newPassword')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        if (newPassword.length < 8) {
                          setError(t('errors.validation'));
                          return;
                        }
                        try {
                          await api(`/api/users/${row.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ password: newPassword }),
                          });
                          setPasswordSavedId(row.id);
                          setOpenPasswordId(null);
                          setNewPassword('');
                          setTimeout(() => setPasswordSavedId(null), 3000);
                        } catch (err) {
                          handleError(err);
                        }
                      }}
                    >
                      {t('common.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenPasswordId(null);
                        setNewPassword('');
                      }}
                    >
                      {t('common.close')}
                    </button>
                  </span>
                ) : (
                  <span className="row">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenPasswordId(row.id);
                        setNewPassword('');
                        setError(null);
                      }}
                    >
                      {t('users.resetPassword')}
                    </button>
                    {passwordSavedId === row.id && <span className="muted">{t('users.passwordSaved')}</span>}
                  </span>
                )}
              </td>
              <td>
                {row.id !== me?.id && (
                  <button
                    type="button"
                    aria-label={t('users.delete')}
                    onClick={async () => {
                      setError(null);
                      if (confirm(t('users.deleteConfirm'))) {
                        try {
                          await api(`/api/users/${row.id}`, { method: 'DELETE' });
                          load();
                        } catch (err) {
                          handleError(err);
                        }
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Sites() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ id: string; name: string; domain: string; enabled: boolean; urlTemplate: string; mode: string }>>([]);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [urlTemplate, setUrlTemplate] = useState('https://example.test/search?q={query}');
  const [creating, setCreating] = useState(false);
  function load() { api<typeof rows>('/api/sites').then(setRows); }
  useEffect(load, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await api('/api/sites', { method: 'POST', body: JSON.stringify({ key: name.toLowerCase().replace(/\s+/g, '-'), name, domain, mode: 'native', urlTemplate }) });
      setName('');
      setDomain('');
      load();
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="stack">
      <h1>{t('sites.title')}</h1>
      <form className="stack" onSubmit={create}>
        <input data-testid="site-name" placeholder={t('common.name')} value={name} onChange={(event) => setName(event.target.value)} />
        <input data-testid="site-domain" placeholder={t('sites.domain')} value={domain} onChange={(event) => setDomain(event.target.value)} />
        <input placeholder={t('sites.urlTemplate')} value={urlTemplate} onChange={(event) => setUrlTemplate(event.target.value)} />
        <p className="muted">{t('sites.templateHelp')}</p>
        <button className="primary" type="submit" disabled={creating}>{t('sites.new')}</button>
      </form>
      {creating && <ProgressBar />}
      {rows.map((row) => (
        <article key={row.id} className="card row">
          <strong>{row.name}</strong>
          <span>{row.domain}</span>
          <NavLink to={`/admin/constructor?site=${row.id}`}>{t('sites.editConstructor')}</NavLink>
          <button type="button" onClick={async () => { await api(`/api/sites/${row.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !row.enabled }) }); load(); }}>{row.enabled ? t('common.enabled') : t('common.no')}</button>
          <button type="button" onClick={() => api(`/api/sites/${row.id}/export`)}>{t('sites.export')}</button>
          <button type="button" onClick={async () => { if (confirm(t('sites.deleteConfirm'))) { await api(`/api/sites/${row.id}`, { method: 'DELETE' }); load(); } }}>{t('common.delete')}</button>
        </article>
      ))}
    </div>
  );
}

function Constructor() {
  const { t } = usePrefs();
  const [searchParams, setSearchParams] = useSearchParams();
  const siteParam = searchParams.get('site') || '';

  const [sites, setSites] = useState<Array<any>>([]);
  const [selectedSiteId, setSelectedSiteId] = useState(siteParam);
  const [loadedSite, setLoadedSite] = useState<any>(null);

  const [url, setUrl] = useState('');
  const [token, setToken] = useState('test123');
  const [html, setHtml] = useState('');
  const [items, setItems] = useState<Array<{ title: string; price: number | null }>>([]);
  const [_param, setParam] = useState('');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/api/sites').then((list) => {
      setSites(list);
      if (siteParam) {
        const found = list.find((s) => s.id === siteParam);
        if (found) {
          setSelectedSiteId(found.id);
          setLoadedSite(found);
          setName(found.name);
          setDomain(found.domain);
          setUrl(found.urlTemplate);
        }
      }
    });
  }, [siteParam]);

  function onSelectSite(id: string) {
    setSelectedSiteId(id);
    setSaved(false);
    if (!id) {
      setSearchParams({});
      setLoadedSite(null);
      setName('');
      setDomain('');
      setUrl('');
      setParam('');
      setItems([]);
    } else {
      setSearchParams({ site: id });
      const found = sites.find((s) => s.id === id);
      if (found) {
        setLoadedSite(found);
        setName(found.name);
        setDomain(found.domain);
        setUrl(found.urlTemplate);
        setParam('');
      }
    }
  }

  function computeUrl() {
    if (!url) return `https://${domain}/search?q={query}`;
    if (token && url.includes(token)) {
      return url.replaceAll(token, '{query}');
    }
    return url;
  }

  return (
    <div className="stack">
      <h1>{t('constructor.title')}</h1>
      <label className="field">
        {t('constructor.pickSite')}
        <select value={selectedSiteId} onChange={(e) => onSelectSite(e.target.value)}>
          <option value="">{t('constructor.pickSite')}</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.domain})
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{t('constructor.clickHelp')}</p>
      <label className="field">
        {t('constructor.pasteUrl')}
        <input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label className="field">
        {t('constructor.probe')}
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          setError(null);
          setNotice(null);
          try {
            const res = await api<{ param: string | null; template: string }>('/api/admin/constructor/detect', {
              method: 'POST',
              body: JSON.stringify({ url, token }),
            });
            const found = res.param || '';
            setParam(found);
            if (res.template) setUrl(res.template);
            setNotice(found ? (found === 'path' ? t('constructor.detectedPath') : `${t('constructor.detectedParam')} ${found}`) : t('constructor.detectMiss'));
          } catch (err) {
            setError(err instanceof ApiError ? t('errors.validation') : t('constructor.detectMiss'));
          }
        }}
      >
        {t('constructor.detect')}
      </button>
      {notice && <p>{notice}</p>}
      {error && <p className="error">{error}</p>}
      <textarea value={html} onChange={(event) => setHtml(event.target.value)} rows={6} />
      <button
        type="button"
        disabled={previewing}
        onClick={async () => {
          setPreviewing(true);
          setError(null);
          try {
            const preview = await api<{ items: typeof items; error?: string | null }>('/api/admin/constructor/preview', {
              method: 'POST',
              body: JSON.stringify({ url, html, token }),
            });
            setItems(preview.items);
            if (preview.error === 'upstream_blocked' || preview.error === 'site_paused') setError(t('constructor.blocked'));
            else if (preview.items.length === 0) setError(t('constructor.previewEmpty'));
          } catch (err) {
            setError(err instanceof ApiError && (err.code === 'site_paused' || err.code === 'upstream_blocked') ? t('constructor.blocked') : t('constructor.previewEmpty'));
          } finally {
            setPreviewing(false);
          }
        }}
      >
        {t('constructor.preview')}
      </button>
      {previewing && <ProgressBar />}
      <table className="grid">
        <tbody>{items.map((item, index) => <tr key={index}><td>{item.title}</td><td>{item.price}</td></tr>)}</tbody>
      </table>
      <input
        placeholder={t('common.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setSaved(false);
        }}
      />
      <input
        placeholder={t('sites.domain')}
        value={domain}
        onChange={(event) => {
          setDomain(event.target.value);
          setSaved(false);
        }}
      />
      <button
        className="primary"
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setSaved(false);
          const finalUrl = computeUrl();
          setError(null);
          try {
            if (selectedSiteId && loadedSite) {
              await api(`/api/sites/${selectedSiteId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  ...loadedSite,
                  name,
                  domain,
                  urlTemplate: finalUrl,
                  mode: loadedSite.mode || 'native',
                  parseRules: loadedSite.parseRules ?? {},
                }),
              });
              setSaved(true);
            } else {
              await api('/api/admin/constructor/save', {
                method: 'POST',
                body: JSON.stringify({
                  name,
                  domain,
                  urlTemplate: finalUrl,
                  parseRules: {},
                }),
              });
              setSaved(true);
            }
          } catch {
            setSaved(false);
            setError(t('errors.validation'));
          } finally {
            setSaving(false);
          }
        }}
      >
        {t('constructor.save')}
      </button>
      {saving && <ProgressBar />}
      {saved && <p>{t('constructor.saved')}</p>}
    </div>
  );
}

function Health() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ siteId: string; name: string; status: string; lastError: string | null; successRate: number | null; latencyMs: number | null }>>([]);
  const [run, setRun] = useState<{ id: string; status: string; total: number; done: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api<{ sites: typeof rows; run: typeof run }>('/api/admin/health');
      setRows(data.sites);
      setRun(data.run);
      return data.run;
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'error');
      return null;
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const isRunning = Boolean(run && (run.status === 'queued' || run.status === 'running'));

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      void load();
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  async function checkNow() {
    setError(null);
    try {
      const newRun = await api<{ id: string; status: string; done: number; total: number }>('/api/admin/health/run', { method: 'POST' });
      setRun(newRun);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'error');
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <h1>{t('health.title')}</h1>
        <button type="button" disabled={isRunning} onClick={checkNow}>
          {t('health.checkNow')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {isRunning && run && (
        <ProgressBar
          value={run.done}
          max={run.total}
          label={t('health.checking', { done: run.done, total: run.total })}
        />
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>{t('results.site')}</th>
            <th>{t('common.status')}</th>
            <th>{t('health.successRate')}</th>
            <th>{t('health.latency')}</th>
            <th>{t('health.lastError')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.siteId}>
              <td>{row.name}</td>
              <td>
                {row.status === 'green'
                  ? t('health.green')
                  : row.status === 'red'
                  ? t('health.red')
                  : row.status === 'yellow'
                  ? t('health.yellow')
                  : row.status === 'unknown'
                  ? t('health.unknown')
                  : row.status}
              </td>
              <td>{row.successRate == null ? '' : `${Math.round(row.successRate * 100)}%`}</td>
              <td>{row.latencyMs ?? ''}</td>
              <td>{row.lastError ?? ''}</td>
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
  const [saving, setSaving] = useState(false);
  const [fxRates, setFxRates] = useState<Array<{ currency: string; rate: number; date: string }>>([]);
  function load() {
    api<Record<string, unknown>>('/api/admin/settings').then((data) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (key === 'fx_rates') continue;
        next[key] = String(value ?? '');
      }
      setFxRates(Array.isArray(data.fx_rates) ? (data.fx_rates as typeof fxRates) : []);
      setForm(next);
    });
  }
  useEffect(load, []);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(form)) {
          body[key] = value === '***' || Number.isNaN(Number(value)) || value === '' ? value : Number(value);
          if (
            key.includes('key') ||
            key.includes('token') ||
            key.includes('cron') ||
            key.includes('language') ||
            key.includes('currency') ||
            key.includes('quiet') ||
            key.includes('host') ||
            key.includes('user') ||
            key.includes('password') ||
            key.includes('from')
          )
            body[key] = value;
          if (key === 'email_enabled' || key === 'own_sales_use_allocated') body[key] = value === 'true';
        }
        try {
          await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
          setSaved(true);
          load();
        } finally {
          setSaving(false);
        }
      }}
    >
      <h1>{t('settings.title')}</h1>
      <label className="field">
        {t('settings.dealGreen')}
        <input
          value={form.deal_green_threshold || ''}
          onChange={(event) => setForm({ ...form, deal_green_threshold: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.dealYellow')}
        <input
          value={form.deal_yellow_threshold || ''}
          onChange={(event) => setForm({ ...form, deal_yellow_threshold: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.minMargin')}
        <input
          value={form.min_margin_uah || ''}
          onChange={(event) => setForm({ ...form, min_margin_uah: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.delivery')}
        <input
          value={form.cost_delivery || ''}
          onChange={(event) => setForm({ ...form, cost_delivery: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.repair')}
        <input
          value={form.cost_repair || ''}
          onChange={(event) => setForm({ ...form, cost_repair: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.askingToSale')}
        <input value={form.asking_to_sale_ratio || ''} onChange={(event) => setForm({ ...form, asking_to_sale_ratio: event.target.value })} />
      </label>
      <label className="field">
        {t('settings.saleLookback')}
        <input value={form.sale_lookback_days || ''} onChange={(event) => setForm({ ...form, sale_lookback_days: event.target.value })} />
      </label>
      <label className="field">
        {t('settings.minOwnSales')}
        <input value={form.min_own_sales || ''} onChange={(event) => setForm({ ...form, min_own_sales: event.target.value })} />
      </label>
      <label className="field">
        {t('settings.useAllocated')}
        <select
          value={form.own_sales_use_allocated === 'false' ? 'false' : 'true'}
          onChange={(event) => setForm({ ...form, own_sales_use_allocated: event.target.value })}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>
      </label>
      <label className="field">
        {t('settings.fxMode')}
        <select value={form.fx_mode || 'nbu'} onChange={(event) => setForm({ ...form, fx_mode: event.target.value })}>
          <option value="nbu">{t('settings.fxModeNbu')}</option>
          <option value="manual">{t('settings.fxModeManual')}</option>
        </select>
      </label>
      <label className="field">
        {t('settings.fxUsd')}
        <input value={form.fx_usd_uah || ''} onChange={(event) => setForm({ ...form, fx_usd_uah: event.target.value })} />
      </label>
      <label className="field">
        {t('settings.fxEur')}
        <input value={form.fx_eur_uah || ''} onChange={(event) => setForm({ ...form, fx_eur_uah: event.target.value })} />
      </label>
      <label className="field">
        {t('settings.fxSpread')}
        <input value={form.fx_spread_pct || ''} onChange={(event) => setForm({ ...form, fx_spread_pct: event.target.value })} />
      </label>
      <p className="muted">
        {fxRates.length
          ? fxRates.map((row) => t('settings.fxLatest', { currency: row.currency, rate: row.rate, date: row.date })).join(' · ')
          : t('settings.fxNone')}
      </p>
      <label className="field">
        {t('settings.googleKey')}
        <input
          value={form.google_api_key || ''}
          onChange={(event) => setForm({ ...form, google_api_key: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.telegram')}
        <input
          value={form.telegram_bot_token || ''}
          onChange={(event) => setForm({ ...form, telegram_bot_token: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.smtpHost')}
        <input
          data-testid="smtp-host"
          value={form.smtp_host || ''}
          onChange={(event) => setForm({ ...form, smtp_host: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.smtpPort')}
        <input
          data-testid="smtp-port"
          value={form.smtp_port || ''}
          onChange={(event) => setForm({ ...form, smtp_port: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.smtpUser')}
        <input
          data-testid="smtp-user"
          value={form.smtp_user || ''}
          onChange={(event) => setForm({ ...form, smtp_user: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.smtpPassword')}
        <input
          data-testid="smtp-password"
          type="password"
          value={form.smtp_password || ''}
          onChange={(event) => setForm({ ...form, smtp_password: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.smtpFrom')}
        <input
          data-testid="smtp-from"
          value={form.smtp_from || ''}
          onChange={(event) => setForm({ ...form, smtp_from: event.target.value })}
        />
      </label>
      <label className="row">
        <input
          data-testid="email-enabled"
          type="checkbox"
          checked={form.email_enabled === 'true'}
          onChange={(event) => setForm({ ...form, email_enabled: String(event.target.checked) })}
        />
        {t('settings.emailEnabled')}
      </label>
      <label className="field">
        {t('settings.backupKeep')}
        <input
          value={form.backup_keep || ''}
          onChange={(event) => setForm({ ...form, backup_keep: event.target.value })}
        />
      </label>
      <label className="field">
        {t('settings.backupTime')}
        <input
          value={form.backup_cron || ''}
          onChange={(event) => setForm({ ...form, backup_cron: event.target.value })}
        />
      </label>
      <button className="primary" type="submit" disabled={saving}>
        {t('common.save')}
      </button>
      {saving && <ProgressBar />}
      {saved && <p>{t('settings.saved')}</p>}
    </form>
  );
}

function Backups() {
  const { t } = usePrefs();
  const [rows, setRows] = useState<Array<{ name: string; size: number; kind: string }>>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() { api<typeof rows>('/api/admin/backups').then(setRows); }
  useEffect(load, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!confirm(t('backups.confirmRestore'))) return;
    setError(null);
    setRestoring(file.name);
    try {
      const bytes = await file.arrayBuffer();
      const uploaded = await api<{ name: string }>('/api/admin/backups/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-backup-name': file.name,
        },
        body: bytes,
      });
      await api(`/api/admin/backups/${uploaded.name}/restore`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_backup') {
        setError(t('errors.invalidBackup'));
      } else if (err instanceof ApiError) {
        setError(err.code);
      } else {
        setError(String(err));
      }
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <h1>{t('backups.title')}</h1>
        <button
          type="button"
          disabled={backingUp}
          onClick={async () => {
            setBackingUp(true);
            try {
              await api('/api/admin/backups', { method: 'POST' });
              load();
            } finally {
              setBackingUp(false);
            }
          }}
        >
          {t('backups.now')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".dump"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <button
          type="button"
          disabled={Boolean(restoring) || backingUp}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('backups.restoreFromFile')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {(backingUp || Boolean(restoring)) && <ProgressBar />}
      {rows.length === 0 && <p className="muted">{t('backups.empty')}</p>}
      {rows.map((row) => (
        <article key={row.name} className="row">
          <span>{row.name}</span>
          <span>{row.kind === 'auto' ? t('backups.typeAuto') : t('backups.typeManual')}</span>
          <span>{row.size}</span>
          <button
            type="button"
            onClick={() => download(`/api/admin/backups/${row.name}`, row.name)}
          >
            {t('backups.download')}
          </button>
          <button
            type="button"
            disabled={Boolean(restoring)}
            onClick={async () => {
              if (confirm(t('backups.confirmRestore'))) {
                setRestoring(row.name);
                try {
                  await api(`/api/admin/backups/${row.name}/restore`, { method: 'POST', body: JSON.stringify({ confirm: true }) });
                } finally {
                  setRestoring(null);
                }
              }
            }}
          >
            {t('backups.restore')}
          </button>
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

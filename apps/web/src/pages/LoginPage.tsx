import { FormEvent, useState } from 'react';
import type { Me } from '../App';
import { ApiError, api, serverBase } from '../lib/api';
import { usePrefs } from '../lib/i18n';
import { ProgressBar } from '../components/ProgressBar';

export function LoginPage({ onIn }: { onIn: (user: Me) => void }) {
  const { t, locale, setLocale, theme, setTheme } = usePrefs();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(localStorage.getItem('pricelens.server') || '');
  const [error, setError] = useState('');
  const [probe, setProbe] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function probeServer(url: string): Promise<boolean> {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function findServer() {
    // 1. Probe http://127.0.0.1:3000/health
    if (await probeServer('http://127.0.0.1:3000')) {
      const target = 'http://127.0.0.1:3000';
      setServer(target);
      localStorage.setItem('pricelens.server', target);
      setProbe(t('login.ok'));
      return;
    }

    // 2. If the page host is not localhost, probe http://<page-host>:3000/health
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const lanUrl = `http://${host}:3000`;
      if (await probeServer(lanUrl)) {
        setServer(lanUrl);
        localStorage.setItem('pricelens.server', lanUrl);
        setProbe(t('login.ok'));
        return;
      }
    }

    // 3. In the desktop shell, call discover_server
    try {
      const tauri = (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__;
      const invoke = tauri?.core?.invoke || tauri?.invoke;
      if (invoke) {
        const found = await invoke('discover_server');
        if (typeof found === 'string' && found) {
          setServer(found);
          localStorage.setItem('pricelens.server', found);
          const ok = await probeServer(found);
          setProbe(ok ? t('login.ok') : t('login.bad'));
          return;
        }
      }
    } catch {
      /* ignore */
    }

    setProbe(t('login.bad'));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem('pricelens.server', server.trim());
    setError('');
    setSubmitting(true);
    try {
      const session = await api<{ token: string; user: Me }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      localStorage.setItem('pricelens.token', session.token);
      onIn(session.user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? t(err.code === 'inactive_user' ? 'auth.inactive' : err.code === 'rate_limited' ? 'errors.rateLimited' : 'auth.failed')
          : t('common.error'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card login stack" onSubmit={submit}>
      <h1>{t('login.title')}</h1>
      <p className="muted">{t('login.subtitle')}</p>
      <label className="field">
        {t('login.server')}
        <input
          data-testid="server"
          value={server}
          placeholder={serverBase() || 'http://127.0.0.1:3000'}
          onChange={(event) => setServer(event.target.value)}
        />
      </label>
      <p className="muted">{t('login.serverHint')}</p>
      <div className="row">
        <button type="button" data-testid="find-server" onClick={findServer}>
          {t('login.findServer')}
        </button>
        <button
          type="button"
          data-testid="test-server"
          onClick={async () => {
            const target = (server.trim() || 'http://127.0.0.1:3000').replace(/\/$/, '');
            localStorage.setItem('pricelens.server', server.trim());
            const ok = await probeServer(target);
            setProbe(ok ? t('login.ok') : t('login.bad'));
          }}
        >
          {t('login.test')}
        </button>
      </div>
      {probe && <p>{probe}</p>}
      <label className="field">
        {t('auth.login')}
        <input data-testid="login" value={login} onChange={(event) => setLogin(event.target.value)} />
      </label>
      <label className="field">
        {t('auth.password')}
        <input
          data-testid="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit" disabled={submitting}>
        {t('auth.submit')}
      </button>
      {submitting && <ProgressBar />}
      <div className="row">
        <select
          aria-label={t('lang.en')}
          value={locale}
          onChange={(event) => setLocale(event.target.value as 'en' | 'ru' | 'uk')}
        >
          <option value="en">{t('lang.en')}</option>
          <option value="ru">{t('lang.ru')}</option>
          <option value="uk">{t('lang.uk')}</option>
        </select>
        <select
          aria-label={t('theme.system')}
          value={theme}
          onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}
        >
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
      </div>
    </form>
  );
}

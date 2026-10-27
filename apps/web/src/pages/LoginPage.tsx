import { FormEvent, useState } from 'react';
import type { Me } from '../App';
import { ApiError, api, serverBase } from '../lib/api';
import { usePrefs } from '../lib/i18n';

export function LoginPage({ onIn }: { onIn: (user: Me) => void }) {
  const { t, locale, setLocale, theme, setTheme } = usePrefs();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(localStorage.getItem('pricelens.server') || '');
  const [error, setError] = useState('');
  const [probe, setProbe] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    localStorage.setItem('pricelens.server', server.trim());
    setError('');
    try {
      const session = await api<{ token: string; user: Me }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      localStorage.setItem('pricelens.token', session.token);
      onIn(session.user);
    } catch (err) {
      setError(err instanceof ApiError ? t(err.code === 'inactive_user' ? 'auth.inactive' : err.code === 'rate_limited' ? 'errors.rateLimited' : 'auth.failed') : t('common.error'));
    }
  }

  return (
    <form className="card login stack" onSubmit={submit}>
      <h1>{t('login.title')}</h1>
      <p className="muted">{t('login.subtitle')}</p>
      <label className="field">
        {t('login.server')}
        <input data-testid="server" value={server} placeholder={serverBase() || 'http://127.0.0.1:3000'} onChange={(event) => setServer(event.target.value)} />
      </label>
      <p className="muted">{t('login.serverHint')}</p>
      <button
        type="button"
        onClick={async () => {
          localStorage.setItem('pricelens.server', server.trim());
          try {
            const response = await fetch(`${server.trim().replace(/\/$/, '')}/health`);
            setProbe(response.ok ? t('login.ok') : t('login.bad'));
          } catch {
            setProbe(t('login.bad'));
          }
        }}
      >
        {t('login.test')}
      </button>
      {probe && <p>{probe}</p>}
      <label className="field">
        {t('auth.login')}
        <input data-testid="login" value={login} onChange={(event) => setLogin(event.target.value)} />
      </label>
      <label className="field">
        {t('auth.password')}
        <input data-testid="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">{t('auth.submit')}</button>
      <div className="row">
        <select aria-label={t('lang.en')} value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'ru' | 'uk')}>
          <option value="en">{t('lang.en')}</option>
          <option value="ru">{t('lang.ru')}</option>
          <option value="uk">{t('lang.uk')}</option>
        </select>
        <select aria-label={t('theme.system')} value={theme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'system')}>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
      </div>
    </form>
  );
}

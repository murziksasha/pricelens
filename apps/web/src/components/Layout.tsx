import type { Locale } from '@pricelens/shared';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Me } from '../App';
import { api } from '../lib/api';
import { usePrefs } from '../lib/i18n';

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t, locale, setLocale, theme, setTheme } = usePrefs();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Array<{ id: string; type: string; payload: { title?: string } }>>([]);

  useEffect(() => {
    api<{ count: number }>('/api/notifications/unread').then((row) => setUnread(row.count)).catch(() => undefined);
  }, []);

  async function changeLocale(next: Locale) {
    setLocale(next);
    await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ language: next }) });
  }
  async function changeTheme(next: 'light' | 'dark' | 'system') {
    setTheme(next);
    await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ theme: next }) });
  }

  return (
    <div className="app">
      <header className="top">
        <span className="brand">{t('app.name')}</span>
        <nav className="nav">
          <NavLink to="/" end>{t('nav.search')}</NavLink>
          <NavLink to="/history">{t('nav.history')}</NavLink>
          <NavLink to="/templates">{t('nav.templates')}</NavLink>
          <NavLink to="/purchases">{t('nav.purchases')}</NavLink>
          {me.role === 'admin' && (
            <NavLink to="/admin/users" data-testid="admin-nav">{t('nav.admin')}</NavLink>
          )}
        </nav>
        <span className="spacer" />
        <button
          type="button"
          onClick={async () => {
            setOpen(true);
            setNotes(await api('/api/notifications'));
          }}
        >
          {t('nav.notifications')} {unread ? `(${unread})` : ''}
        </button>
        <select aria-label={t('lang.en')} data-testid="lang-switch" value={locale} onChange={(event) => changeLocale(event.target.value as Locale)}>
          <option value="en">{t('lang.en')}</option>
          <option value="ru">{t('lang.ru')}</option>
          <option value="uk">{t('lang.uk')}</option>
        </select>
        <select aria-label={t('theme.system')} data-testid="theme-switch" value={theme} onChange={(event) => changeTheme(event.target.value as 'light' | 'dark' | 'system')}>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
        <span className="muted">{me.login}</span>
        <button type="button" onClick={onLogout}>{t('nav.logout')}</button>
      </header>
      <Outlet />
      {open && (
        <div className="drawer">
          <div className="row">
            <strong>{t('notifications.title')}</strong>
            <button
              type="button"
              onClick={async () => {
                await api('/api/notifications/read', { method: 'POST' });
                setUnread(0);
              }}
            >
              {t('notifications.markRead')}
            </button>
            <button type="button" onClick={() => setOpen(false)}>{t('common.close')}</button>
          </div>
          {notes.length === 0 && <p className="muted">{t('notifications.empty')}</p>}
          {notes.map((note) => (
            <p key={note.id}>{note.payload.title || note.type}</p>
          ))}
        </div>
      )}
    </div>
  );
}

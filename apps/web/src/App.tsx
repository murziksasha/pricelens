import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { api } from './lib/api';
import { usePrefs } from './lib/i18n';
import { AdminPage } from './pages/AdminPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SearchPage } from './pages/SearchPage';
import { TemplatesPage } from './pages/TemplatesPage';

export interface Me {
  id: string;
  login: string;
  role: 'admin' | 'user';
  language: 'en' | 'ru' | 'uk';
  theme: 'light' | 'dark' | 'system';
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const prefs = usePrefs();
  const navigate = useNavigate();

  useEffect(() => {
    api<Me>('/api/auth/me')
      .then((user) => {
        setMe(user);
        prefs.setLocale(user.language);
        prefs.setTheme(user.theme);
      })
      .catch(() => setMe(null));
    // Apply the saved account once; later edits go through the header.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me === undefined) return <p className="muted">{prefs.t('common.loading')}</p>;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onIn={(user) => { setMe(user); prefs.setLocale(user.language); prefs.setTheme(user.theme); navigate('/'); }} />} />
      <Route
        element={me ? <Layout me={me} onLogout={() => { localStorage.removeItem('pricelens.token'); setMe(null); navigate('/login'); }} /> : <Navigate to="/login" replace />}
      >
        <Route path="/" element={<SearchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/admin/:section" element={me?.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

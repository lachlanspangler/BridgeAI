import { useEffect, useState } from 'react';
import { api, type Status } from './api.ts';
import { Create } from './pages/Create.tsx';
import { JobPage } from './pages/Job.tsx';
import { Library } from './pages/Library.tsx';
import { Settings } from './pages/Settings.tsx';

export type Route =
  { page: 'create' } | { page: 'job'; id: string } | { page: 'library' } | { page: 'settings' };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'job' && b && /^j_[0-9a-z]+$/.test(b)) return { page: 'job', id: b };
  if (a === 'library') return { page: 'library' };
  if (a === 'settings') return { page: 'settings' };
  return { page: 'create' };
}

export const go = (r: string): void => {
  window.location.hash = r;
};

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const refresh = () =>
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  useEffect(() => {
    void refresh();
  }, [route.page]);

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#/" aria-label="Bridge home">
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            <path
              d="M8 42 Q32 12 56 42"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path d="M8 46h48" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" />
            <path
              d="M21 46v-9M32 46v-15M43 46v-9"
              stroke="var(--secondary)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <span>Bridge</span>
        </a>
        <nav>
          <a href="#/" className={route.page === 'create' ? 'on' : ''}>
            New video
          </a>
          <a href="#/library" className={route.page === 'library' ? 'on' : ''}>
            Library
          </a>
          <a href="#/settings" className={route.page === 'settings' ? 'on' : ''}>
            Settings
          </a>
        </nav>
      </header>
      <main>
        {route.page === 'create' && <Create status={status} />}
        {route.page === 'job' && <JobPage id={route.id} />}
        {route.page === 'library' && <Library />}
        {route.page === 'settings' && <Settings status={status} onChange={refresh} />}
      </main>
      <footer className="foot">
        Bridge runs on this computer only (127.0.0.1). Free path: local model, local voice, music and visuals
        made in code. Your keys never leave this machine except to their own provider.
      </footer>
    </div>
  );
}

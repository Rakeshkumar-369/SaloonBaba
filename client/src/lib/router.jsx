// A ~70-line router (history API) — keeps the bundle far smaller than a full router library.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RouterCtx = createContext(null);

export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', to);
  window.dispatchEvent(new Event('sb:navigate'));
  window.scrollTo(0, 0);
}

export function RouterProvider({ children }) {
  const [loc, setLoc] = useState({ path: location.pathname, search: location.search });
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search });
    window.addEventListener('popstate', on);
    window.addEventListener('sb:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('sb:navigate', on);
    };
  }, []);
  const value = useMemo(() => ({ ...loc, query: Object.fromEntries(new URLSearchParams(loc.search)) }), [loc]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export const useLocation = () => useContext(RouterCtx);

/** Match "/salon/:id/*" style patterns. Returns params or null. */
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') {
      params['*'] = s.slice(i).join('/');
      return params;
    }
    if (s[i] === undefined) return p[i].endsWith('?') ? params : null;
    if (p[i].startsWith(':')) params[p[i].slice(1).replace('?', '')] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return s.length === p.length ? params : null;
}

/** Render the first route whose pattern matches. routes: [[pattern, (params) => element]] */
export function Routes({ routes, base = '', fallback = null }) {
  const { path } = useLocation();
  for (const [pattern, render] of routes) {
    const params = match(base + pattern, path);
    if (params) return render(params);
  }
  return fallback;
}

export function Link({ to, children, className = '', activeClass = 'active', exact = false, onClick, ...rest }) {
  const { path } = useLocation();
  const target = to.split('?')[0];
  const active = exact ? path === target : path === target || path.startsWith(`${target}/`);
  return (
    <a
      href={to}
      className={`${className} ${active ? activeClass : ''}`.trim()}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.(e);
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function setQuery(patch) {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  navigate(`${location.pathname}${s ? `?${s}` : ''}`, { replace: true });
}

/** Navigate after render (never navigate during render). */
export function Redirect({ to }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

/** URL-synced state (e.g. the active tab survives refresh and deep links). */
export function useQueryState(key, def) {
  const { query } = useLocation();
  return [query[key] ?? def, (v) => setQuery({ [key]: v === def ? null : v })];
}

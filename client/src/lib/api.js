import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'sb_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
const listeners = new Set();

export const getToken = () => token;
export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  cache.clear();
  listeners.forEach((fn) => fn(token));
}
export const onTokenChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Tiny GET cache: show last data instantly, then refresh (stale-while-revalidate)
const cache = new Map();
export const invalidate = (prefix = '') => {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
};

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, form, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (res.status === 401 && token) setToken('');
  if (!res.ok) throw new ApiError(res.status, isJson ? data : { error: data });
  if (method !== 'GET') invalidate('');
  else cache.set(path, data);
  return data;
}

export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });

/** Download a file (CSV / XML) from an authenticated endpoint. */
export async function download(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Data hook: { data, error, loading, reload, setData } */
export function useApi(path, deps = []) {
  const [state, setState] = useState(() => ({ data: path ? cache.get(path) : undefined, error: null, loading: Boolean(path) }));
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setState((s) => ({ data: s.data ?? cache.get(path), error: null, loading: true }));
    try {
      const data = await api(path);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    setState({ data: path ? cache.get(path) : undefined, error: null, loading: Boolean(path) });
    load();
  }, [load, path]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

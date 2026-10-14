import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, onTokenChange, post, setToken, patch } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [ctx, setCtx] = useState({ user: null, loading: Boolean(getToken()) });

  const refresh = useCallback(async () => {
    if (!getToken()) return setCtx({ user: null, loading: false });
    try {
      const me = await api('/me');
      setCtx({ ...me, loading: false });
    } catch {
      setCtx({ user: null, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    return onTokenChange((t) => (t ? refresh() : setCtx({ user: null, loading: false })));
  }, [refresh]);

  const login = async (loginId, password) => {
    const res = await post('/auth/login', { login: loginId, password });
    setToken(res.token);
    return res.user;
  };
  const loginWithToken = (t) => setToken(t);
  const logout = () => setToken('');
  const setLang = async (lang) => {
    localStorage.setItem('sb_lang', lang);
    if (ctx.user) {
      await patch('/me', { lang });
      setCtx((c) => ({ ...c, user: { ...c.user, lang } }));
    }
  };
  return <AuthCtx.Provider value={{ ...ctx, refresh, login, loginWithToken, logout, setLang }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const HOME = {
  admin: '/admin', franchisor: '/franchise', area_manager: '/franchise', owner: '/salon', manager: '/salon', stylist: '/staff', customer: '/app', vendor: '/vendor',
};

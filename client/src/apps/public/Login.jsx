import { useState } from 'react';
import { Button, Input, Toggle, Notice, useAction, Avatar } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { navigate, useLocation } from '../../lib/router.jsx';
import { useAuth, HOME } from '../../lib/auth.jsx';
import { post, setToken, useApi } from '../../lib/api.js';

export default function Login({ mode: initialMode = 'password' }) {
  const { login } = useAuth();
  const { query } = useLocation();
  const demo = useApi('/auth/demo-accounts');
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({ login: '', password: '', phone: '', otp: '', name: '', demo_otp: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [run, busy] = useAction();
  const go = (u) => navigate(query.next && !query.next.startsWith('/login') ? query.next : HOME[u.role]);

  const doLogin = (e) => {
    e?.preventDefault();
    run(async () => go(await login(f.login, f.password))).catch(() => {});
  };
  const quick = (email) => run(async () => go(await login(email, demo.data?.password || 'demo123'))).catch(() => {});
  const requestOtp = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post('/auth/otp/request', { phone: f.phone });
      setOtpSent(true);
      if (r.demo_otp) setF((x) => ({ ...x, demo_otp: r.demo_otp }));
    }, 'Code sent by SMS').catch(() => {});
  };
  const verifyOtp = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post('/auth/otp/verify', { phone: f.phone, otp: f.otp, name: f.name || undefined });
      setToken(r.token);
      go(r.user);
    }).catch(() => {});
  };
  const signup = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await post('/auth/register', { name: f.name, phone: f.phone, password: f.password });
      setToken(r.token);
      go(r.user);
    }, 'Welcome to SaloonBaba!').catch(() => {});
  };

  const groups = {};
  for (const a of demo.data?.accounts || []) (groups[a.group] ||= []).push(a);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, var(--primary-soft), var(--bg) 40%)' }}>
      <div className="page" style={{ maxWidth: 980, paddingBottom: 40 }}>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="row" style={{ color: 'var(--text)', fontWeight: 800, fontSize: 18 }}>
          <img src="/icon.svg" width="30" height="30" alt="" />SaloonBaba
        </a>
        <div className="grid grid-md-2 mt-l" style={{ alignItems: 'start' }}>
          <div className="card col">
            <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
            <Toggle value={mode} onChange={setMode} options={[['password', 'Password'], ['otp', 'Phone OTP'], ['signup', 'Sign up']]} />
            {mode === 'password' && (
              <form className="col" onSubmit={doLogin}>
                <Input label="Email or mobile number" autoComplete="username" required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
                <Input label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
                <Button type="submit" busy={busy} className="lg">Log in</Button>
              </form>
            )}
            {mode === 'otp' && (
              <form className="col" onSubmit={otpSent ? verifyOtp : requestOtp}>
                <Input label="Mobile number" inputMode="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                {otpSent && (
                  <>
                    <Input label="6-digit code" inputMode="numeric" required value={f.otp} onChange={(e) => setF({ ...f, otp: e.target.value })} />
                    <Input label="Your name (new customers)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                    {f.demo_otp && <Notice tone="info" icon="message">Demo mode (no SMS gateway): your code is <b>{f.demo_otp}</b></Notice>}
                  </>
                )}
                <Button type="submit" busy={busy} className="lg">{otpSent ? 'Verify & continue' : 'Send code'}</Button>
              </form>
            )}
            {mode === 'signup' && (
              <form className="col" onSubmit={signup}>
                <Input label="Full name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <Input label="Mobile number" inputMode="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                <Input label="Password (min 6)" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
                <Button type="submit" busy={busy} className="lg">Create customer account</Button>
                <div className="tiny muted">Salon owners: <a href="/#demo">book a demo</a> and we will set up your salon for you.</div>
              </form>
            )}
          </div>

          <div className="card col">
            <div className="row between"><h2 style={{ margin: 0 }}>Live demo logins</h2><span className="badge primary">password: {demo.data?.password || 'demo123'}</span></div>
            <div className="small muted">Tap any account to explore that app with realistic data.</div>
            {Object.entries(groups).map(([g, list]) => (
              <div key={g}>
                <div className="section-title" style={{ marginTop: 8 }}>{g}</div>
                <div className="list card flat pad-0">
                  {list.map((a) => (
                    <button key={a.email} className="list-item" onClick={() => quick(a.email)} disabled={busy}>
                      <Avatar name={a.name} hue={a.name.length * 37} size="sm" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="title small">{a.name} <span className="muted tiny">· {a.role.replace('_', ' ')}</span></div>
                        <div className="meta tiny ellipsis">{a.email} · {a.note}</div>
                      </div>
                      <Icon name="right" size={18} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

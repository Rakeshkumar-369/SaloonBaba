import { useState } from 'react';
import Shell from '../../ui/Shell.jsx';
import { Routes } from '../../lib/router.jsx';
import { useApi, post, patch } from '../../lib/api.js';
import { Async, Card, Button, Badge, Input, Select, useAction, Table, Notice, Stat, KV, StatusBadge, SearchBox } from '../../ui/kit.jsx';
import { HBars } from '../../ui/charts.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, dateShort, ago, cap } from '../../lib/format.js';

export default function AdminApp() {
  const nav = [
    { to: '/admin', label: 'Overview', icon: 'chart', primary: true },
    { to: '/admin/salons', label: 'Salons', icon: 'store', primary: true },
    { to: '/admin/leads', label: 'Demo leads', icon: 'megaphone', primary: true },
    { to: '/admin/messages', label: 'Messages', icon: 'message', primary: true },
    { to: '/admin/users', label: 'Users', icon: 'users' },
  ];
  return (
    <Shell nav={nav} base="/admin" title="SaloonBaba Admin">
      <Routes base="/admin" routes={[
        ['', () => <Overview />],
        ['/salons', () => <Salons />],
        ['/leads', () => <Leads />],
        ['/messages', () => <Messages />],
        ['/users', () => <Users />],
      ]} fallback={<Overview />} />
    </Shell>
  );
}

function Overview() {
  const q = useApi('/admin/overview');
  const [run, busy] = useAction();
  const [out, setOut] = useState(null);
  const [bot, setBot] = useState({ text: 'MENU mane room', reply: '' });
  return (
    <div className="page">
      <h1>Platform overview</h1>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="kpis">
              <Stat label="Active salons" value={d.stats.active_salons} sub={`${d.stats.brands} brands`} />
              <Stat label="MRR" value={inr(d.stats.mrr)} sub="from salon plans" />
              <Stat label="GMV (30d)" value={inr(d.stats.gmv_30d, { compact: true })} sub="billed through Salon OS" />
              <Stat label="Bookings (30d)" value={d.stats.bookings_30d} sub={`${d.stats.app_bookings_30d} via app`} />
              <Stat label="Customers" value={d.stats.customers} />
              <Stat label="Vendors" value={d.stats.vendors} />
              <Stat label="New demo leads" value={d.stats.new_leads} tone={d.stats.new_leads ? 'warn' : ''} />
              <Stat label="Messages (24h)" value={d.stats.messages_24h} />
            </div>
            <div className="grid grid-md-2">
              <Card title="Salons by city"><HBars format={(v) => v} items={d.by_city.map((c) => ({ label: c.city, value: c.salons }))} /></Card>
              <Card title="Plans"><HBars format={(v) => v} items={d.plans.map((p) => ({ label: cap(p.plan), value: p.n }))} /></Card>
            </div>
            <Card title="Integrations">
              <KV items={Object.entries(d.integrations).map(([k, v]) => [cap(k), <Badge key={k} tone={v === 'live' ? 'good' : 'info'}>{cap(v)}</Badge>])} />
              <div className="tiny muted mt">Set WHATSAPP_*, MSG91_* and RAZORPAY_* in .env to switch from simulated to live.</div>
            </Card>
            <Card title="Automations" action={<Button size="sm" busy={busy} icon="zap" onClick={() => run(() => post('/admin/automations/run'), 'Automations ran').then(setOut)}>Run now</Button>}>
              <div className="small muted">Reminders, 48-hour thank-you, due-date nudges, win-back, low stock, refill and overdue-payment messages run every 15 minutes.</div>
              {out && <KV items={Object.entries(out).map(([k, v]) => [cap(k.replace(/([A-Z])/g, ' $1')), String(v)])} />}
            </Card>
            <Card title="WhatsApp bot simulator">
              <div className="row"><Input value={bot.text} onChange={(e) => setBot({ ...bot, text: e.target.value })} /><Button icon="send" onClick={async () => setBot({ ...bot, reply: (await post('/integrations/whatsapp/simulate', { text: bot.text })).reply })}>Send</Button></div>
              {bot.reply && <div className="card flat mt" style={{ whiteSpace: 'pre-wrap', background: 'var(--good-soft)' }}><Icon name="whatsapp" size={16} /> {bot.reply}</div>}
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}

function Salons() {
  const q = useApi('/admin/salons');
  const [run] = useAction();
  return (
    <div className="page">
      <h1>Salons</h1>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0"><Table rows={rows} columns={[
            { label: 'Salon', render: (s) => <span>{s.name}<div className="tiny muted">{s.area}, {s.city}{s.brand ? ` · ${s.brand}` : ''}</div></span> },
            { label: 'Owner', render: (s) => <span>{s.owner}<div className="tiny muted">{s.owner_phone}</div></span> },
            { label: 'Staff', align: 'right', key: 'staff' },
            { label: 'GMV 30d', align: 'right', render: (s) => inr(s.gmv_30d, { compact: true }) },
            { label: 'Last bill', render: (s) => (s.last_bill ? ago(s.last_bill) : '—') },
            { label: 'Plan', render: (s) => <select className="input sm" value={s.plan} onChange={(e) => run(() => patch(`/admin/salons/${s.id}`, { plan: e.target.value }).then(q.reload), 'Plan updated')}>{['starter', 'growth', 'pro', 'franchise'].map((p) => <option key={p}>{p}</option>)}</select> },
            { label: 'Active', render: (s) => <button className={`btn xs ${s.is_active ? 'good' : 'ghost'}`} onClick={() => run(() => patch(`/admin/salons/${s.id}`, { is_active: s.is_active ? 0 : 1 }).then(q.reload))}>{s.is_active ? 'Active' : 'Suspended'}</button> },
          ]} /></div>
        )}
      </Async>
    </div>
  );
}

function Leads() {
  const q = useApi('/admin/demo-requests');
  const [run] = useAction();
  return (
    <div className="page">
      <h1>Demo requests</h1>
      <Notice icon="megaphone">Leads from the website “Book a demo” form. Call within an hour — speed wins salon deals.</Notice>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt"><Table rows={rows} columns={[
            { label: 'Lead', render: (l) => <span>{l.name}<div className="tiny muted">{l.business_name} · {l.city} · {l.outlets || 1} outlet(s)</div></span> },
            { label: 'Contact', render: (l) => <a href={`tel:${l.phone}`}>{l.phone}</a> },
            { label: 'Role', render: (l) => cap(l.role || '') },
            { label: 'Message', render: (l) => <span className="small">{l.message}</span> },
            { label: 'When', render: (l) => ago(l.created_at) },
            { label: 'Status', render: (l) => <select className="input sm" value={l.status} onChange={(e) => run(() => patch(`/admin/demo-requests/${l.id}`, { status: e.target.value }).then(q.reload), 'Updated')}>{['new', 'contacted', 'demo_done', 'won', 'lost'].map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select> },
          ]} /></div>
        )}
      </Async>
    </div>
  );
}

function Messages() {
  const [channel, setChannel] = useState('');
  const q = useApi(`/admin/messages${channel ? `?channel=${channel}` : ''}`);
  return (
    <div className="page">
      <h1>Message log</h1>
      <Select value={channel} onChange={(e) => setChannel(e.target.value)} options={[['', 'All channels'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['push', 'Push']]} />
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt"><Table rows={rows} columns={[{ label: 'To', render: (m) => <span>{m.to_name || '—'}<div className="tiny muted">{m.to_phone} · {m.salon_name || 'Platform'}</div></span> }, { label: 'Template', render: (m) => <Badge>{m.template}</Badge> }, { label: 'Body', render: (m) => <span className="small">{m.body}</span> }, { label: 'Status', render: (m) => <StatusBadge status={m.status} /> }, { label: 'When', render: (m) => ago(m.created_at) }]} /></div>
        )}
      </Async>
    </div>
  );
}

function Users() {
  const [s, setS] = useState('');
  const [role, setRole] = useState('');
  const q = useApi(`/admin/users?q=${encodeURIComponent(s)}${role ? `&role=${role}` : ''}`);
  const [run] = useAction();
  return (
    <div className="page">
      <h1>Users</h1>
      <div className="grid-2"><SearchBox value={s} onChange={setS} placeholder="Name, email or phone" /><Select value={role} onChange={(e) => setRole(e.target.value)} options={[['', 'All roles'], 'admin', 'franchisor', 'area_manager', 'owner', 'manager', 'stylist', 'customer', 'vendor']} /></div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt"><Table rows={rows} columns={[{ label: 'User', render: (u) => <span>{u.name}<div className="tiny muted">{u.email || u.phone}</div></span> }, { label: 'Role', render: (u) => <Badge>{cap(u.role)}</Badge> }, { label: 'City', key: 'city' }, { label: 'Last login', render: (u) => (u.last_login_at ? ago(u.last_login_at) : '—') }, { label: 'Joined', render: (u) => dateShort(u.created_at) }, { label: '', render: (u) => <button className={`btn xs ${u.is_active ? 'ghost' : 'danger'}`} onClick={() => run(() => patch(`/admin/users/${u.id}`, { is_active: u.is_active ? 0 : 1 }).then(q.reload), 'Updated')}>{u.is_active ? 'Disable' : 'Enable'}</button> }]} /></div>
        )}
      </Async>
    </div>
  );
}


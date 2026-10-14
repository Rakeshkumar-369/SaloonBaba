import { useState } from 'react';
import Shell from '../../ui/Shell.jsx';
import { Routes, navigate, useQueryState } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, post, patch, del } from '../../lib/api.js';
import { Async, Card, Button, Badge, Sheet, Input, Select, Textarea, Tabs, useAction, StatusBadge, Table, Notice, Stat, Avatar, Progress, Toggle } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, pct, dateShort, dateDay, ago, cap, monthLabel, ym, today } from '../../lib/format.js';

export default function FranchiseApp() {
  const { user } = useAuth();
  const hq = user.role !== 'area_manager';
  const nav = [
    { to: '/franchise', label: 'Network', icon: 'layers', primary: true },
    { to: '/franchise/audits', label: 'Audits', icon: 'clipboard', primary: true },
    ...(hq ? [{ to: '/franchise/royalty', label: 'Royalty', icon: 'rupee', primary: true }] : []),
    { to: '/franchise/leads', label: 'Leads', icon: 'users', primary: true },
    { to: '/franchise/catalogue', label: 'Menu & offers', icon: 'list' },
    { to: '/franchise/procurement', label: 'Procurement', icon: 'truck' },
    { to: '/franchise/training', label: 'Training', icon: 'book' },
    { to: '/franchise/sop', label: 'SOP & hygiene', icon: 'shield' },
  ];
  return (
    <Shell nav={nav} base="/franchise" title={hq ? 'Franchise HQ' : 'Area manager'}>
      <Routes base="/franchise" routes={[
        ['', () => <Network />],
        ['/outlet/:id', (p) => <Outlet id={p.id} />],
        ['/audits', () => <Audits />],
        ['/royalty', () => <Royalty />],
        ['/leads', () => <Leads hq={hq} />],
        ['/catalogue', () => <Catalogue hq={hq} />],
        ['/procurement', () => <Procurement hq={hq} />],
        ['/training', () => <Training hq={hq} />],
        ['/sop', () => <Sop hq={hq} />],
      ]} fallback={<Network />} />
    </Shell>
  );
}

function Network() {
  const [range, setRange] = useQueryState('range', '30');
  const q = useApi(`/franchise/overview?${rangeQs(range)}`);
  return (
    <div className="page">
      <Async q={q} rows={5}>
        {(d) => (
          <div className="col">
            <div className="page-title"><div><h1>{d.brand.name}</h1><div className="small muted">{d.outlets.length} outlets · royalty {Number(d.brand.royalty_pct)}% + marketing {Number(d.brand.marketing_fee_pct)}%</div></div></div>
            <RangeChips value={range} onChange={setRange} />
            {d.total && (
              <div className="kpis">
                <Stat label="Network revenue" value={inr(d.total.revenue, { compact: true })} sub={`${d.total.bills} bills`} />
                <Stat label="2nd-visit return" value={pct(d.total.second_visit_rate)} />
                <Stat label="Retail share" value={pct(d.total.retail_pct)} />
                <Stat label="Avg hygiene" value={d.total.hygiene} />
                {d.is_hq && <Stat label="Royalty due" value={inr(d.royalty.due, { compact: true })} sub={`${d.royalty.overdue || 0} overdue`} tone={d.royalty.overdue ? 'bad' : ''} />}
                {d.is_hq && <Stat label="Royalty collected" value={inr(d.royalty.collected, { compact: true })} />}
                <Stat label="Leads" value={d.leads.total} sub={`${d.leads.booked || 0} booked · ${d.leads.pending || 0} pending`} />
                <Stat label="Utilisation" value={pct(d.total.utilisation)} />
              </div>
            )}
            {d.alerts.length > 0 && (
              <Card title="Needs attention">
                {d.alerts.map((a, i) => <div key={i} className="row small" style={{ padding: '4px 0' }}><Icon name="alert" size={16} className="warn" /><b>{a.salon}</b><span className="muted">{a.text}</span></div>)}
              </Card>
            )}
            <div className="section-title">Outlet ranking</div>
            <div className="card pad-0">
              <Table rows={d.outlets} onRow={(o) => navigate(`/franchise/outlet/${o.id}`)} columns={[
                { label: 'Outlet', render: (o) => <span><b>#{o.rank}</b> {o.name}<div className="tiny muted">{o.franchisee} · {o.city}</div></span> },
                { label: 'Revenue', align: 'right', render: (o) => inr(o.kpi.revenue, { compact: true }) },
                { label: '2nd visit', align: 'right', render: (o) => <b className={o.kpi.second_visit_rate < 45 ? 'bad' : 'good'}>{pct(o.kpi.second_visit_rate)}</b> },
                { label: 'Rebook', align: 'right', render: (o) => pct(o.kpi.rebooking_rate) },
                { label: 'Retail', align: 'right', render: (o) => pct(o.kpi.retail_pct) },
                { label: 'Utilisation', align: 'right', render: (o) => pct(o.kpi.utilisation) },
                { label: 'Discounts', align: 'right', render: (o) => <span className={o.kpi.discount_pct > 4 ? 'bad' : ''}>{pct(o.kpi.discount_pct)}</span> },
                { label: 'Rating', align: 'right', render: (o) => `★ ${Number(o.rating).toFixed(1)}` },
                { label: 'Hygiene', align: 'right', render: (o) => <Badge tone={o.hygiene_score >= 85 ? 'good' : 'bad'}>{o.hygiene_score}</Badge> },
                { label: 'Audit', align: 'right', render: (o) => (o.audit_score !== null ? `${o.audit_score}%` : '—') },
              ]} />
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

function Outlet({ id }) {
  const q = useApi(`/franchise/outlets/${id}`);
  return (
    <div className="page">
      <Button size="sm" variant="ghost" icon="left" onClick={() => navigate('/franchise')}>Network</Button>
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            <h1>{d.outlet.name}</h1>
            <div className="kpis">
              <Stat label="Revenue (30d)" value={inr(d.kpi.revenue, { compact: true })} />
              <Stat label="Avg bill" value={inr(d.kpi.avg_bill)} />
              <Stat label="2nd-visit return" value={pct(d.kpi.second_visit_rate)} />
              <Stat label="No-shows" value={pct(d.kpi.no_show_rate)} />
              {d.pnl && <Stat label="Net sales" value={inr(d.pnl.net_sales, { compact: true })} />}
              {d.pnl && <Stat label="Royalty + marketing" value={inr(d.pnl.royalty + d.pnl.marketing_fee)} />}
            </div>
            <Card title="Stylists" className="pad-0">
              <Table rows={d.staff} columns={[{ label: 'Stylist', render: (s) => <span className="row gap-s"><Avatar name={s.name} hue={s.hue} size="sm" />{s.name}</span> }, { label: 'Sales', align: 'right', render: (s) => inr(s.service_revenue, { compact: true }) }, { label: 'Clients', align: 'right', key: 'bills' }, { label: 'Rebook', align: 'right', render: (s) => pct(s.rebook_pct) }, { label: 'Retail', align: 'right', render: (s) => pct(s.retail_pct) }, { label: 'Rating', align: 'right', render: (s) => `★ ${Number(s.rating).toFixed(1)}` }]} />
            </Card>
            <Card title="Audits">{d.audits.map((a) => <div key={a.id} className="row between small"><span>{dateDay(a.audit_date)} · {a.auditor}</span><Badge tone={a.score >= 80 ? 'good' : 'bad'}>{a.score}%</Badge></div>)}{!d.audits.length && <div className="small muted">No audits yet</div>}</Card>
            <Card title="Open action items">{d.actions.filter((x) => x.status !== 'closed').map((x) => <div key={x.id} className="row between small"><span>{x.title}</span><StatusBadge status={x.status} /></div>)}</Card>
          </div>
        )}
      </Async>
    </div>
  );
}

function Royalty() {
  const [month, setMonth] = useState('');
  const q = useApi(`/franchise/royalty${month ? `?month=${month}` : ''}`);
  const [run, busy] = useAction();
  const last = ym(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  return (
    <div className="page">
      <div className="page-title"><h1>Royalty engine</h1><Button busy={busy} icon="refresh" onClick={() => run(() => post('/franchise/royalty/generate', { month: last }), (r) => `${monthLabel(r.month)}: ${r.created} new invoices`).then(q.reload)}>Generate {monthLabel(last)}</Button></div>
      <Notice icon="rupee">Calculated on net billed sales recorded in each outlet’s Salon OS — the franchisee sees the same number in their P&L. No more under-reporting disputes.</Notice>
      <div className="mt"><Select value={month} onChange={(e) => setMonth(e.target.value)} options={[['', 'All months'], ...Array.from({ length: 4 }, (_, i) => { const m = ym(new Date(new Date().getFullYear(), new Date().getMonth() - i - 1, 1)); return [m, monthLabel(m)]; })]} /></div>
      <Async q={q}>
        {(d) => (
          <div className="card pad-0 mt">
            <Table rows={d.rows} columns={[
              { label: 'Outlet', render: (r) => <span>{r.salon_name}<div className="tiny muted">{r.franchisee}</div></span> },
              { label: 'Month', render: (r) => monthLabel(r.month) },
              { label: 'Net sales', align: 'right', render: (r) => inr(r.net_sales) },
              { label: 'Royalty', align: 'right', render: (r) => inr(r.royalty_amount) },
              { label: 'Mktg fee', align: 'right', render: (r) => inr(r.marketing_fee) },
              { label: 'Total', align: 'right', render: (r) => <b>{inr(r.total)}</b> },
              { label: 'Status', render: (r) => <span className="row gap-s"><StatusBadge status={r.status === 'due' && r.due_date < today() ? 'overdue' : r.status} />{r.status === 'due' && <><button className="btn xs ghost" onClick={() => run(() => post(`/franchise/royalty/${r.id}/remind`), 'Reminder sent on WhatsApp')}>Remind</button><button className="btn xs soft" onClick={() => run(() => post(`/franchise/royalty/${r.id}/mark-paid`).then(q.reload), 'Marked paid')}>Paid</button></>}</span> },
            ]} />
          </div>
        )}
      </Async>
    </div>
  );
}

function Audits() {
  const q = useApi('/franchise/audits');
  const tpl = useApi('/franchise/audit-template');
  const [tab, setTab] = useState('audits');
  const [newAudit, setNewAudit] = useState(false);
  const [view, setView] = useState(null);
  const [run] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Digital audits</h1><Button icon="plus" onClick={() => setNewAudit(true)}>New audit</Button></div>
      <Tabs value={tab} onChange={setTab} tabs={[['audits', 'Audits'], ['actions', 'Action items']]} />
      <Async q={q}>
        {(d) => tab === 'audits' ? (
          <div className="card pad-0"><Table rows={d.audits} onRow={(a) => setView(a.id)} columns={[{ label: 'Outlet', key: 'salon_name' }, { label: 'Date', render: (a) => dateShort(a.audit_date) }, { label: 'Score', align: 'right', render: (a) => <Badge tone={a.score >= 80 ? 'good' : 'bad'}>{a.score}%</Badge> }, { label: 'Auditor', key: 'auditor' }, { label: 'Open actions', align: 'right', key: 'open_actions' }]} /></div>
        ) : (
          <div className="card pad-0"><Table rows={d.actions} columns={[{ label: 'Action', render: (x) => <span>{x.title}<div className="tiny muted">{x.salon_name}{x.outlet_note ? ` · “${x.outlet_note}”` : ''}</div></span> }, { label: 'Due', render: (x) => <span className={x.status !== 'closed' && x.due_date < today() ? 'bad' : ''}>{dateShort(x.due_date)}</span> }, { label: 'Status', render: (x) => <StatusBadge status={x.status} /> }, { label: '', render: (x) => (x.status !== 'closed' ? <button className="btn xs soft" onClick={() => run(() => patch(`/franchise/actions/${x.id}`, { status: 'closed' }).then(q.reload), 'Verified & closed')}>Verify close</button> : <button className="btn xs ghost" onClick={() => run(() => patch(`/franchise/actions/${x.id}`, { status: 'open' }).then(q.reload), 'Re-opened')}>Re-open</button>) }]} /></div>
        )}
      </Async>
      {newAudit && <AuditForm outlets={q.data?.outlets || []} tpl={tpl.data || []} onClose={() => { setNewAudit(false); q.reload(); }} />}
      {view && <AuditView id={view} onClose={() => setView(null)} />}
    </div>
  );
}

function AuditForm({ outlets, tpl, onClose }) {
  const [salonId, setSalonId] = useState(outlets[0]?.id || '');
  const [res, setRes] = useState({});
  const [summary, setSummary] = useState('');
  const [run, busy] = useAction();
  const items = tpl.flatMap((s) => s.items.map((label) => ({ section: s.section, label })));
  const answered = items.filter((i) => res[i.label]).length;
  const submit = () => run(() => post('/franchise/audits', { salon_id: salonId, summary, items: items.map((i) => ({ ...i, result: res[i.label] || 'fail' })) }), (r) => `Audit saved · ${r.score}% · failed items became action items`).then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Outlet audit" wide>
      <div className="col">
        <Select label="Outlet" value={salonId} onChange={(e) => setSalonId(e.target.value)} options={outlets.map((o) => [o.id, o.name])} />
        <Progress value={answered} max={items.length} />
        {tpl.map((sec) => (
          <div key={sec.section}>
            <div className="section-title">{sec.section}</div>
            {sec.items.map((label) => (
              <div key={label} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="small grow">{label}</span>
                <Toggle value={res[label]} onChange={(v) => setRes({ ...res, [label]: v })} options={[['pass', '✓'], ['partial', '~'], ['fail', '✗']]} />
              </div>
            ))}
          </div>
        ))}
        <Textarea placeholder="Summary for the franchisee" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <Button className="lg" busy={busy} disabled={answered < items.length} onClick={submit}>{answered < items.length ? `${items.length - answered} items left` : 'Submit audit'}</Button>
      </div>
    </Sheet>
  );
}

function AuditView({ id, onClose }) {
  const q = useApi(`/franchise/audits/${id}`);
  return (
    <Sheet open onClose={onClose} title="Audit report" wide>
      <Async q={q}>
        {(a) => (
          <div className="col">
            <div className="row between"><b>{a.salon_name} · {dateDay(a.audit_date)}</b><Badge tone={a.score >= 80 ? 'good' : 'bad'}>{a.score}%</Badge></div>
            <div className="small muted">{a.auditor} · {a.summary}</div>
            {a.items.map((i) => <div key={i.label} className="row between small" style={{ padding: '4px 0' }}><span>{i.label}</span><Badge tone={i.result === 'pass' ? 'good' : i.result === 'partial' ? 'warn' : 'bad'}>{cap(i.result)}</Badge></div>)}
          </div>
        )}
      </Async>
    </Sheet>
  );
}

function Leads({ hq }) {
  const q = useApi('/franchise/leads');
  const ov = useApi('/franchise/overview');
  const [add, setAdd] = useState(false);
  const [run] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Lead routing</h1><Button icon="plus" onClick={() => setAdd(true)}>Add lead</Button></div>
      <Notice icon="users">Leads from Instagram, Google and the website go to the nearest outlet automatically. Watch how fast each outlet calls back.</Notice>
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            <div className="card pad-0"><Table rows={d.by_outlet} keyField="name" columns={[{ label: 'Outlet', key: 'name' }, { label: 'Leads', align: 'right', key: 'leads' }, { label: 'Booked', align: 'right', key: 'booked' }, { label: 'Pending', align: 'right', key: 'pending' }, { label: 'Avg response', align: 'right', render: (r) => (r.avg_response_min ? <b className={r.avg_response_min > 120 ? 'bad' : 'good'}>{r.avg_response_min} min</b> : '—') }]} /></div>
            <div className="card pad-0"><Table rows={d.rows} columns={[
              { label: 'Lead', render: (l) => <span>{l.name}<div className="tiny muted">{l.service_interest} · {cap(l.source)} · {ago(l.created_at)}</div></span> },
              { label: 'Outlet', render: (l) => l.salon_name || <Badge tone="warn">Unassigned</Badge> },
              { label: 'Response', align: 'right', render: (l) => (l.contacted_at ? `${l.response_min} min` : `${l.response_min} min waiting`) },
              { label: 'Status', render: (l) => <StatusBadge status={l.status} /> },
              ...(hq ? [{ label: '', render: (l) => (['new', 'assigned'].includes(l.status) ? <select className="input sm" defaultValue="" onChange={(e) => e.target.value && run(() => post(`/franchise/leads/${l.id}/reassign`, { salon_id: e.target.value }).then(q.reload), 'Reassigned')}><option value="">Reassign…</option>{(ov.data?.outlets || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select> : null) }] : []),
            ]} /></div>
          </div>
        )}
      </Async>
      <FormSheet open={add} onClose={() => setAdd(false)} title="New lead" initial={{ source: 'instagram' }} onSubmit={(v) => post('/franchise/leads', v).then(q.reload)} success="Lead routed to the nearest outlet"
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', required: true, half: true }, { name: 'source', label: 'Source', type: 'select', half: true, options: ['instagram', 'google', 'website', 'facebook', 'referral', 'campaign'] }, { name: 'area', label: 'Area (e.g. Velachery)', half: true }, { name: 'city', label: 'City', half: true }, { name: 'service_interest', label: 'Interested in' }]} />
    </div>
  );
}

function Catalogue({ hq }) {
  const q = useApi('/franchise/catalogue');
  const offers = useApi('/franchise/offers');
  const [tab, setTab] = useState('menu');
  const [edit, setEdit] = useState(null);
  const [offer, setOffer] = useState(false);
  const [run, busy] = useAction();
  return (
    <div className="page">
      <h1>Central menu & national offers</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['menu', 'Service menu'], ['offers', 'National offers']]} />
      {tab === 'menu' ? (
        <Async q={q}>
          {(d) => (
            <div className="col">
              {hq && <div className="row"><Button icon="plus" variant="soft" onClick={() => setEdit({ allow_override: 1, gender: 'unisex' })}>Add service</Button><Button icon="send" busy={busy} onClick={() => run(() => post('/franchise/catalogue/push'), (r) => `Pushed to ${r.outlets} outlets (${r.added} added, ${r.updated} updated)`).then(q.reload)}>Push to all outlets</Button></div>}
              <div className="card pad-0"><Table rows={d.items} onRow={hq ? setEdit : undefined} columns={[
                { label: 'Service', render: (s) => <span>{s.name}<div className="tiny muted">{s.category} · {s.duration_min} min</div></span> },
                { label: 'HQ price', align: 'right', render: (s) => inr(s.price) },
                { label: 'Local range', align: 'right', render: (s) => (s.min_price ? `${inr(s.min_price)}–${inr(s.max_price)}` : '—') },
                { label: 'Pricing', render: (s) => <Badge tone={s.allow_override ? 'info' : 'primary'}>{s.allow_override ? 'Local override allowed' : 'Locked'}</Badge> },
                { label: 'Live', align: 'right', render: (s) => `${s.outlets_live}/${d.outlet_count}` },
              ]} /></div>
            </div>
          )}
        </Async>
      ) : (
        <Async q={offers}>
          {(rows) => (
            <div className="col">
              {hq && <Button icon="plus" onClick={() => setOffer(true)}>New national offer</Button>}
              <div className="card pad-0"><Table rows={rows} columns={[{ label: 'Offer', render: (o) => <span>{o.title}<div className="tiny muted">{o.code}</div></span> }, { label: 'Value', render: (o) => (o.type === 'percent' ? `${Number(o.value)}%` : inr(o.value)) }, { label: 'Valid', render: (o) => (o.valid_to ? `till ${dateShort(o.valid_to)}` : 'Ongoing') }, { label: 'Redeemed', align: 'right', render: (o) => `${o.redemptions} · ${inr(o.revenue, { compact: true })}` }, { label: 'Status', render: (o) => (hq ? <button className={`btn xs ${o.is_active ? 'good' : 'ghost'}`} onClick={() => run(() => patch(`/franchise/offers/${o.id}`, { is_active: o.is_active ? 0 : 1 }).then(offers.reload))}>{o.is_active ? 'Active' : 'Paused'}</button> : <StatusBadge status={o.is_active ? 'active' : 'closed'} />) }]} /></div>
            </div>
          )}
        </Async>
      )}
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? edit.name : 'New service'} initial={edit || {}} onSubmit={(v) => (edit.id ? patch(`/franchise/catalogue/${edit.id}`, v) : post('/franchise/catalogue', v)).then(q.reload)}
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', required: true, half: true }, { name: 'gender', label: 'For', type: 'select', half: true, options: ['unisex', 'women', 'men'] }, { name: 'price', label: 'Price ₹', type: 'number', required: true, half: true }, { name: 'duration_min', label: 'Minutes', type: 'number', required: true, half: true }, { name: 'cycle_days', label: 'Reminder cycle (days)', type: 'number' }, { name: 'allow_override', label: 'Outlets may set their own price', type: 'checkbox' }, ...(edit?.id ? [{ name: 'is_active', label: 'Active', type: 'checkbox' }] : [])]} />
      <FormSheet open={offer} onClose={() => setOffer(false)} title="National offer" initial={{ type: 'percent', value: 10 }} onSubmit={(v) => post('/franchise/offers', v).then(offers.reload)} success="Offer pushed to all outlets"
        fields={[{ name: 'title', label: 'Title', required: true }, { name: 'code', label: 'Code', required: true, half: true }, { name: 'value', label: '% off', type: 'number', required: true, half: true }, { name: 'valid_from', label: 'From', type: 'date', half: true }, { name: 'valid_to', label: 'To', type: 'date', half: true }, { name: 'description', label: 'Description' }]} />
    </div>
  );
}

function Procurement({ hq }) {
  const q = useApi('/franchise/procurement');
  const [add, setAdd] = useState(false);
  const [run] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Central procurement</h1>{hq && <Button icon="plus" onClick={() => setAdd(true)}>Approve product</Button>}</div>
      <Notice icon="truck">Negotiated prices apply automatically when outlets order from approved distributors — no counterfeit risk from random suppliers.</Notice>
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            <div className="card pad-0"><Table rows={d.approved} columns={[{ label: 'Product', render: (p) => <span>{p.name}<div className="tiny muted">{p.brand} · {p.vendor_name}</div></span> }, { label: 'Trade', align: 'right', render: (p) => inr(p.trade_price) }, { label: 'Negotiated', align: 'right', render: (p) => <b>{inr(p.negotiated_price)}</b> }, { label: 'Saving', align: 'right', render: (p) => <Badge tone="good">{p.saving_pct}%</Badge> }, ...(hq ? [{ label: '', render: (p) => <button className="btn xs ghost" onClick={() => run(() => del(`/franchise/procurement/${p.id}`).then(q.reload), 'Removed')}>Remove</button> }] : [])]} /></div>
            <div className="section-title">Outlet purchasing (90 days)</div>
            <div className="card pad-0"><Table rows={d.volume} keyField="salon_name" columns={[{ label: 'Outlet', key: 'salon_name' }, { label: 'Vendor', key: 'vendor_name' }, { label: 'Orders', align: 'right', key: 'orders' }, { label: 'Value', align: 'right', render: (r) => inr(r.value) }]} /></div>
          </div>
        )}
      </Async>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Approve product & price" onSubmit={(v) => post('/franchise/procurement', v).then(q.reload)}
        fields={[{ name: 'vendor_product_id', label: 'Product', type: 'select', required: true, options: (q.data?.catalogue || []).map((p) => [p.id, `${p.name} · ${p.vendor_name} · ${inr(p.trade_price)}`]) }, { name: 'negotiated_price', label: 'Negotiated price ₹', type: 'number', required: true }]} />
    </div>
  );
}

function Training({ hq }) {
  const q = useApi('/franchise/training');
  const [run] = useAction();
  const [add, setAdd] = useState(false);
  const [lessons, setLessons] = useState([{ title: '', content: '' }]);
  const [meta, setMeta] = useState({ title: '', badge_name: '', level: 'basic' });
  const create = () => run(() => post('/franchise/courses', { ...meta, lessons }), 'Course created').then(() => { setAdd(false); q.reload(); }).catch(() => {});
  return (
    <div className="page">
      <div className="page-title"><h1>Training & certification</h1>{hq && <Button icon="plus" onClick={() => setAdd(true)}>New course</Button>}</div>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="grid-auto">
              {d.courses.map((c) => (
                <Card key={c.id}>
                  <div className="row between"><b>{c.title}</b>{c.brand_id ? <Badge tone="primary">Brand</Badge> : <Badge>Marketplace</Badge>}</div>
                  <div className="tiny muted">{c.lessons.length} lessons · {c.duration_min} min · 🏅 {c.badge_name || '—'}</div>
                  <div className="row between small mt"><span>{c.completed}/{c.enrolled} completed</span></div>
                  <Progress value={c.completed} max={c.enrolled || 1} />
                  {hq && <Button size="sm" variant="soft" className="mt" onClick={() => run(() => post(`/franchise/courses/${c.id}/assign`, {}).then(q.reload), (r) => `Assigned to ${r.assigned} staff`)}>Assign to all staff</Button>}
                </Card>
              ))}
            </div>
            <div className="section-title">By outlet</div>
            <div className="card pad-0"><Table rows={d.by_outlet} keyField="name" columns={[{ label: 'Outlet', key: 'name' }, { label: 'Staff', align: 'right', key: 'staff' }, { label: 'Enrolments', align: 'right', key: 'enrollments' }, { label: 'Completed', align: 'right', key: 'completed' }, { label: 'Badges', align: 'right', key: 'badges' }]} /></div>
          </div>
        )}
      </Async>
      <Sheet open={add} onClose={() => setAdd(false)} title="New course" wide>
        <div className="col">
          <div className="grid-2"><Input label="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /><Input label="Badge earned" value={meta.badge_name} onChange={(e) => setMeta({ ...meta, badge_name: e.target.value })} /></div>
          {lessons.map((l, i) => (
            <Card key={i} className="flat"><Input label={`Lesson ${i + 1} title`} value={l.title} onChange={(e) => setLessons(lessons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><Textarea label="Content (keep it to 5 minutes)" value={l.content} onChange={(e) => setLessons(lessons.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} /></Card>
          ))}
          <Button variant="ghost" icon="plus" onClick={() => setLessons([...lessons, { title: '', content: '' }])}>Add lesson</Button>
          <Button disabled={!meta.title} onClick={create}>Create course</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Sop({ hq }) {
  const q = useApi('/franchise/sop');
  const [add, setAdd] = useState(false);
  return (
    <div className="page">
      <div className="page-title"><h1>SOP & hygiene compliance</h1>{hq && <Button icon="plus" onClick={() => setAdd(true)}>New checklist</Button>}</div>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="card pad-0"><Table rows={d.compliance} columns={[{ label: 'Outlet', key: 'name' }, { label: 'Checklists (14d)', align: 'right', key: 'runs_14d' }, { label: 'Avg score', align: 'right', render: (r) => <b className={r.avg_score < 85 ? 'bad' : 'good'}>{r.avg_score ?? '—'}%</b> }, { label: 'Hygiene badge', render: (r) => (r.hygiene_score >= 85 ? <Badge tone="good">Shown</Badge> : <Badge tone="bad">Hidden</Badge>) }]} /></div>
            <div className="grid-auto">{d.templates.map((t) => <Card key={t.id} title={t.name}><Badge>{cap(t.kind)}</Badge><ul className="small">{t.items.map((i) => <li key={i}>{i}</li>)}</ul></Card>)}</div>
          </div>
        )}
      </Async>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Brand checklist" initial={{ kind: 'hygiene' }} onSubmit={(v) => post('/franchise/sop', v).then(q.reload)} success="Checklist pushed to all outlets"
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'kind', label: 'Type', type: 'select', options: ['opening', 'hygiene', 'service', 'closing'] }, { name: 'items', label: 'Items (one per line)', type: 'textarea', required: true }]} />
    </div>
  );
}

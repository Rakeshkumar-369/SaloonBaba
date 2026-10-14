import { useState } from 'react';
import Shell from '../../ui/Shell.jsx';
import { Routes } from '../../lib/router.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, post, patch } from '../../lib/api.js';
import { Async, Card, Button, Badge, Sheet, Input, Select, Textarea, useAction, Empty, StatusBadge, Table, Notice, Stat, KV } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { Bars, HBars } from '../../ui/charts.jsx';
import { inr, dateShort, ago, cap, monthLabel } from '../../lib/format.js';

const NAV = {
  distributor: ['overview', 'orders', 'products', 'credit', 'insights', 'promotions'],
  brand: ['overview', 'products', 'insights', 'promotions', 'codes', 'courses', 'orders', 'credit'],
  academy: ['overview', 'courses', 'promotions'],
  equipment: ['overview', 'service', 'products'],
};
const META = {
  overview: ['Overview', 'home'], orders: ['Orders', 'truck'], products: ['Storefront', 'store'], credit: ['Credit & collections', 'wallet'], insights: ['Sell-through', 'chart'],
  promotions: ['Promotions', 'gift'], codes: ['Authenticity', 'qr'], courses: ['Courses', 'book'], service: ['Service & AMC', 'settings'],
};

export default function VendorApp() {
  const { vendor } = useAuth();
  const keys = NAV[vendor?.type] || NAV.distributor;
  const nav = keys.map((k, i) => ({ to: k === 'overview' ? '/vendor' : `/vendor/${k}`, label: META[k][0], icon: META[k][1], primary: i < 4 }));
  return (
    <Shell nav={nav} base="/vendor" title={vendor?.name || 'Vendor portal'}>
      <Routes base="/vendor" routes={[
        ['', () => <Overview />],
        ['/orders', () => <Orders />],
        ['/products', () => <Products />],
        ['/credit', () => <Credit />],
        ['/insights', () => <Insights />],
        ['/promotions', () => <Promotions />],
        ['/codes', () => <Codes />],
        ['/courses', () => <Courses />],
        ['/service', () => <Service />],
      ]} fallback={<Overview />} />
    </Shell>
  );
}

function Overview() {
  const q = useApi('/vendor/overview');
  return (
    <div className="page">
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div><h1>{d.vendor.name}</h1><div className="small muted">{cap(d.vendor.type)} · {d.vendor.city} · GSTIN {d.vendor.gstin}</div></div>
            <p className="small">{d.vendor.about}</p>
            <div className="kpis">
              {['distributor', 'brand'].includes(d.vendor.type) && <>
                <Stat label="New orders" value={d.orders.new_orders || 0} tone={d.orders.new_orders ? 'warn' : ''} />
                <Stat label="This month" value={inr(d.orders.mtd_value, { compact: true })} />
                <Stat label="Receivable" value={inr(d.orders.outstanding, { compact: true })} sub={`${inr(d.orders.overdue, { compact: true })} overdue`} />
                <Stat label="Salons served" value={d.orders.salons} />
              </>}
              {d.vendor.type === 'academy' && <>
                <Stat label="Courses" value={d.courses.n} /><Stat label="Learners" value={d.courses.enrolled} /><Stat label="Certified" value={d.courses.completed || 0} />
              </>}
              {d.vendor.type === 'equipment' && <>
                <Stat label="Open tickets" value={d.tickets.open || 0} /><Stat label="Total tickets" value={d.tickets.total} />
              </>}
              {d.vendor.type === 'brand' && <><Stat label="Authenticity scans" value={d.codes.scans} sub={`${d.codes.suspicious || 0} suspicious codes`} /><Stat label="Promotion claims" value={d.promotions.claims} /></>}
            </div>
            {d.series.length > 0 && <Card title="Orders by month"><Bars data={d.series.map((s) => ({ label: monthLabel(s.m), short: monthLabel(s.m).split(' ')[0], value: s.value }))} /></Card>}
            {d.top.length > 0 && <Card title="Top salons"><HBars items={d.top.map((t) => ({ label: `${t.name}, ${t.city}`, value: t.value, sub: `${t.orders} orders` }))} /></Card>}
          </div>
        )}
      </Async>
    </div>
  );
}

function Orders() {
  const [status, setStatus] = useState('');
  const q = useApi(`/vendor/orders${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState(null);
  return (
    <div className="page">
      <h1>Orders from salons</h1>
      <div className="chips">{[['', 'All'], ['placed', 'New'], ['accepted', 'Accepted'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt"><Table rows={rows} onRow={(r) => setOpen(r.id)} empty="No orders" columns={[
            { label: 'Order', render: (r) => <span>{r.po_no}<div className="tiny muted">{r.salon_name} · {r.area}, {r.city}</div></span> },
            { label: 'Items', align: 'right', key: 'item_count' },
            { label: 'Value', align: 'right', render: (r) => inr(r.total) },
            { label: 'Placed', render: (r) => ago(r.placed_at || r.created_at) },
            { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} /></div>
        )}
      </Async>
      {open && <OrderSheet id={open} onClose={() => { setOpen(null); q.reload(); }} />}
    </div>
  );
}

function OrderSheet({ id, onClose }) {
  const q = useApi(`/vendor/orders/${id}`);
  const [run, busy] = useAction();
  const [over, setOver] = useState(false);
  const act = (action) => run(() => patch(`/vendor/orders/${id}`, { action, override: over }), `Order ${action === 'reject' ? 'rejected' : `${action}ed`}`).then(onClose).catch((e) => { if (e.data?.creditLimit) setOver(true); });
  return (
    <Sheet open onClose={onClose} title="Order">
      <Async q={q}>
        {(po) => (
          <div className="col">
            <div className="row between"><b>{po.po_no}</b><StatusBadge status={po.status} /></div>
            <div className="small">{po.salon_name}<div className="muted tiny">{po.address} · {po.phone}</div></div>
            {po.items.map((it) => <div key={it.id} className="row between small"><span>{Number(it.qty)} × {it.name}</span><b>{inr(it.amount)}</b></div>)}
            <KV items={[['Total', inr(po.total)], ['Paid', inr(po.paid_amount)], po.due_date && ['Due', dateShort(po.due_date)]]} />
            {over && <Notice tone="warn">This order exceeds the salon’s credit limit. Accept anyway?</Notice>}
            <div className="row">
              {po.status === 'placed' && <><Button busy={busy} onClick={() => act('accept')}>{over ? 'Accept anyway' : 'Accept'}</Button><Button variant="ghost" busy={busy} onClick={() => act('reject')}>Reject</Button></>}
              {po.status === 'accepted' && <Button busy={busy} icon="truck" onClick={() => act('dispatch')}>Mark dispatched</Button>}
            </div>
          </div>
        )}
      </Async>
    </Sheet>
  );
}

function Products() {
  const q = useApi('/vendor/products');
  const [edit, setEdit] = useState(null);
  return (
    <div className="page">
      <div className="page-title"><h1>Storefront</h1><Button icon="plus" onClick={() => setEdit({ unit: 'pc', moq: 1, stock: 100 })}>Add product</Button></div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0"><Table rows={rows} onRow={setEdit} columns={[
            { label: 'Product', render: (p) => <span>{p.name}{!p.is_active && <Badge>Hidden</Badge>}<div className="tiny muted">{p.brand} · {p.category}</div></span> },
            { label: 'Trade', align: 'right', render: (p) => inr(p.trade_price) },
            { label: 'MRP', align: 'right', render: (p) => inr(p.mrp) },
            { label: 'Margin', align: 'right', render: (p) => `${Math.round((1 - p.trade_price / p.mrp) * 100)}%` },
            { label: 'MOQ', align: 'right', key: 'moq' },
            { label: 'Scheme', render: (p) => (p.scheme ? <Badge tone="warn">{p.scheme}</Badge> : '—') },
            { label: 'Sold', align: 'right', render: (p) => Number(p.units_ordered) },
          ]} /></div>
        )}
      </Async>
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? edit.name : 'New product'} initial={edit || {}} onSubmit={(v) => (edit.id ? patch(`/vendor/products/${edit.id}`, v) : post('/vendor/products', v)).then(q.reload)}
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'brand', label: 'Brand', half: true }, { name: 'category', label: 'Category', half: true }, { name: 'trade_price', label: 'Trade price ₹', type: 'number', required: true, half: true }, { name: 'mrp', label: 'MRP ₹', type: 'number', required: true, half: true }, { name: 'moq', label: 'Minimum order', type: 'number', half: true }, { name: 'stock', label: 'Stock', type: 'number', half: true }, { name: 'scheme', label: 'Scheme (e.g. Buy 12 get 1)' }, ...(edit?.id ? [{ name: 'is_active', label: 'Visible to salons', type: 'checkbox' }] : [])]} />
    </div>
  );
}

function Credit() {
  const q = useApi('/vendor/credit');
  const [edit, setEdit] = useState(null);
  const [run] = useAction();
  return (
    <div className="page">
      <h1>Credit & collections</h1>
      <Notice icon="chart">Suggested limits use each salon’s actual billed sales in SaloonBaba (shared with consent) — lend on cash flow, not guesswork.</Notice>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0 mt"><Table rows={rows} keyField="salon_id" columns={[
            { label: 'Salon', render: (r) => <span>{r.name}<div className="tiny muted">{r.area}, {r.city}</div></span> },
            { label: 'Limit', align: 'right', render: (r) => (r.credit_limit ? `${inr(r.credit_limit)} · ${r.credit_days}d` : '—') },
            { label: 'Outstanding', align: 'right', render: (r) => inr(r.outstanding) },
            { label: 'Overdue', align: 'right', render: (r) => (Number(r.overdue) ? <b className="bad">{inr(r.overdue)} · {r.max_days_overdue}d</b> : '—') },
            { label: 'Salon sales 30d', align: 'right', render: (r) => inr(r.sales_30d, { compact: true }) },
            { label: 'Suggested limit', align: 'right', render: (r) => inr(r.suggested_limit) },
            { label: '', render: (r) => <span className="row gap-s">{Number(r.outstanding) > 0 && <button className="btn xs soft" onClick={() => run(() => post(`/vendor/credit/${r.salon_id}/remind`), 'Reminder sent on WhatsApp')}>Remind</button>}<button className="btn xs ghost" onClick={() => setEdit(r)}>Limit</button></span> },
          ]} /></div>
        )}
      </Async>
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title={`Credit · ${edit?.name}`} initial={{ credit_limit: edit?.credit_limit || edit?.suggested_limit, credit_days: edit?.credit_days || 30 }}
        onSubmit={(v) => post('/vendor/credit', { ...v, salon_id: edit.salon_id }).then(q.reload)} fields={[{ name: 'credit_limit', label: 'Credit limit ₹', type: 'number', required: true, half: true }, { name: 'credit_days', label: 'Days', type: 'number', half: true }]} />
    </div>
  );
}

function Insights() {
  const q = useApi('/vendor/insights');
  return (
    <div className="page">
      <h1>Sell-through & usage</h1>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <Notice icon="shield">{d.note}</Notice>
            <Card title="Sell-in to salons (90 days)"><HBars items={d.sell_in.slice(0, 10).map((p) => ({ label: p.name, value: p.value, sub: `${Number(p.units)} units · ${p.salons} salons` }))} /></Card>
            <Card title="Sell-out: retail to consumers & back-bar use, by city" className="pad-0">
              <Table rows={d.sell_out} keyField="name" columns={[{ label: 'Product', key: 'name' }, { label: 'City', key: 'city' }, { label: 'Retail units', align: 'right', render: (r) => Number(r.retail_units).toFixed(0) }, { label: 'Back-bar units', align: 'right', render: (r) => Number(r.backbar_units).toFixed(1) }]} />
            </Card>
            <Card title="What salons are doing (30 days)"><HBars format={(v) => `${v}`} items={d.service_trends.slice(0, 10).map((s) => ({ label: `${s.category} · ${s.city}`, value: s.services }))} /></Card>
          </div>
        )}
      </Async>
    </div>
  );
}

function Promotions() {
  const q = useApi('/vendor/promotions');
  const [add, setAdd] = useState(false);
  const [run] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Promotions & sampling</h1><Button icon="plus" onClick={() => setAdd(true)}>New promotion</Button></div>
      <Async q={q}>
        {(d) => (
          <div className="col">
            {d.rows.map((p) => (
              <Card key={p.id}>
                <div className="row between"><b>{p.title}</b><button className={`btn xs ${p.is_active ? 'good' : 'ghost'}`} onClick={() => run(() => patch(`/vendor/promotions/${p.id}`, { is_active: p.is_active ? 0 : 1 }).then(q.reload))}>{p.is_active ? 'Live' : 'Paused'}</button></div>
                <div className="small muted">{p.description}</div>
                <div className="row wrap gap-s mt"><Badge tone="warn">{p.scheme}</Badge><Badge>{p.target_city || 'All cities'}</Badge><Badge>{p.views} views</Badge><Badge tone="good">{p.claims} claims</Badge></div>
                {p.claimed_by.length > 0 && <div className="tiny muted mt">Claimed by {p.claimed_by.map((c) => c.name).join(', ')}</div>}
              </Card>
            ))}
            {!d.rows.length && <Empty title="No promotions" />}
          </div>
        )}
      </Async>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Target salons" onSubmit={(v) => post('/vendor/promotions', v).then(q.reload)} success="Promotion sent to matching salons"
        fields={[{ name: 'title', label: 'Title', required: true }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'scheme', label: 'Scheme' }, { name: 'target_city', label: 'City (blank = all)', type: 'select', half: true, options: [...new Set((q.data?.reach || []).map((r) => r.city))] }, { name: 'target_plan', label: 'Salon plan', type: 'select', half: true, options: ['starter', 'growth', 'pro', 'franchise'] }, { name: 'ends_on', label: 'Ends', type: 'date' }]} />
    </div>
  );
}

function Codes() {
  const q = useApi('/vendor/codes');
  const products = useApi('/vendor/products');
  const [gen, setGen] = useState(false);
  const [codes, setCodes] = useState(null);
  return (
    <div className="page">
      <div className="page-title"><h1>Authenticity codes</h1><Button icon="qr" onClick={() => setGen(true)}>Generate batch</Button></div>
      <Notice icon="shield">Print one code per pack. Salons and clients verify at <b>{location.origin}/verify</b>. Codes scanned many times are flagged as possible copies.</Notice>
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            <div className="card pad-0"><Table rows={d.summary} columns={[{ label: 'Product', key: 'name' }, { label: 'Codes', align: 'right', key: 'codes' }, { label: 'Scans', align: 'right', key: 'scans' }, { label: 'Suspicious', align: 'right', render: (r) => (Number(r.suspicious) ? <b className="bad">{r.suspicious}</b> : 0) }, { label: 'Last batch', key: 'last_batch' }]} /></div>
            <div className="section-title">Recent scans</div>
            <div className="card pad-0"><Table rows={d.recent} keyField="code" columns={[{ label: 'Code', key: 'code' }, { label: 'Product', key: 'name' }, { label: 'Batch', key: 'batch_no' }, { label: 'Scans', align: 'right', render: (r) => <b className={r.verified_count >= 4 ? 'bad' : ''}>{r.verified_count}</b> }, { label: 'Last', render: (r) => (r.last_verified_at ? ago(r.last_verified_at) : 'never') }]} /></div>
          </div>
        )}
      </Async>
      <FormSheet open={gen} onClose={() => setGen(false)} title="Generate codes" initial={{ count: 20 }} onSubmit={async (v) => { const r = await post('/vendor/codes', v); setCodes(r); q.reload(); }} success="Codes generated"
        fields={[{ name: 'vendor_product_id', label: 'Product', type: 'select', required: true, options: (products.data || []).map((p) => [p.id, p.name]) }, { name: 'count', label: 'How many', type: 'number', half: true }, { name: 'batch_no', label: 'Batch no', half: true }, { name: 'expiry_date', label: 'Expiry', type: 'date' }]} />
      <Sheet open={Boolean(codes)} onClose={() => setCodes(null)} title={`Batch ${codes?.batch_no}`}>
        <Textarea readOnly value={(codes?.codes || []).join('\n')} style={{ minHeight: 220, fontFamily: 'monospace' }} />
      </Sheet>
    </div>
  );
}

function Courses() {
  const q = useApi('/vendor/courses');
  const [add, setAdd] = useState(false);
  const [meta, setMeta] = useState({ title: '', badge_name: '', level: 'basic', price: 0 });
  const [lessons, setLessons] = useState([{ title: '', content: '' }]);
  const [run, busy] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Education marketplace</h1><Button icon="plus" onClick={() => setAdd(true)}>New course</Button></div>
      <Notice icon="award">Courses appear in every stylist’s Learn tab. Completing one awards a skill badge salons trust.</Notice>
      <Async q={q}>
        {(rows) => (
          <div className="grid-auto mt">
            {rows.map((c) => <Card key={c.id}><b>{c.title}</b><div className="tiny muted">{c.lessons.length} lessons · {cap(c.level)} · {c.price ? inr(c.price) : 'Free'}</div><div className="row between mt small"><span>🏅 {c.badge_name}</span><span>{c.completed || 0}/{c.enrolled} certified</span></div></Card>)}
            {!rows.length && <Empty title="No courses yet" />}
          </div>
        )}
      </Async>
      <Sheet open={add} onClose={() => setAdd(false)} title="New course" wide>
        <div className="col">
          <div className="grid-2"><Input label="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /><Input label="Badge" value={meta.badge_name} onChange={(e) => setMeta({ ...meta, badge_name: e.target.value })} /></div>
          <div className="grid-2"><Select label="Level" value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })} options={['basic', 'intermediate', 'advanced']} /><Input label="Price ₹" type="number" value={meta.price} onChange={(e) => setMeta({ ...meta, price: e.target.value })} /></div>
          {lessons.map((l, i) => <Card key={i} className="flat"><Input label={`Lesson ${i + 1}`} value={l.title} onChange={(e) => setLessons(lessons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><Textarea value={l.content} onChange={(e) => setLessons(lessons.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} /></Card>)}
          <Button variant="ghost" icon="plus" onClick={() => setLessons([...lessons, { title: '', content: '' }])}>Add lesson</Button>
          <Button busy={busy} disabled={!meta.title} onClick={() => run(() => post('/vendor/courses', { ...meta, lessons }), 'Course published').then(() => { setAdd(false); q.reload(); })}>Publish</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Service() {
  const q = useApi('/vendor/service');
  const [edit, setEdit] = useState(null);
  const [run, busy] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Service, warranty & AMC</h1><Button variant="soft" busy={busy} onClick={() => run(() => post('/vendor/service/amc-reminders'), (r) => `${r.sent} AMC renewal reminders sent`)}>Send AMC reminders</Button></div>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="section-title">Tickets</div>
            <div className="card pad-0"><Table rows={d.tickets} onRow={setEdit} columns={[{ label: 'Salon', render: (t) => <span>{t.salon_name}<div className="tiny muted">{t.area} · {t.phone}</div></span> }, { label: 'Equipment', render: (t) => `${t.equipment} (${t.serial_no})` }, { label: 'Issue', key: 'issue' }, { label: 'Visit', render: (t) => (t.visit_on ? dateShort(t.visit_on) : '—') }, { label: 'Status', render: (t) => <StatusBadge status={t.status} /> }]} /></div>
            <div className="section-title">Installed base</div>
            <div className="card pad-0"><Table rows={d.installed} columns={[{ label: 'Salon', key: 'salon_name' }, { label: 'Equipment', key: 'name' }, { label: 'Warranty', render: (e) => dateShort(e.warranty_until) }, { label: 'AMC', render: (e) => (e.amc_until ? <Badge tone={e.amc_due ? 'warn' : 'good'}>{dateShort(e.amc_until)}</Badge> : '—') }, { label: 'Lead', render: (e) => (e.upgrade_lead ? <Badge tone="primary">Upgrade / AMC lead</Badge> : null) }]} /></div>
          </div>
        )}
      </Async>
      <FormSheet open={Boolean(edit)} onClose={() => setEdit(null)} title="Update ticket" initial={edit || {}} onSubmit={(v) => patch(`/vendor/service/${edit.id}`, v).then(q.reload)}
        fields={[{ name: 'status', label: 'Status', type: 'select', options: ['open', 'scheduled', 'closed'] }, { name: 'visit_on', label: 'Technician visit', type: 'date' }, { name: 'resolution', label: 'Resolution', type: 'textarea' }]} />
    </div>
  );
}

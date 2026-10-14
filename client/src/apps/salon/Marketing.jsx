import { useEffect, useState } from 'react';
import { useApi, api, post, patch } from '../../lib/api.js';
import { useQueryState, useLocation } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Tabs, Card, Sheet, Select, Input, Textarea, useAction, Empty, StatusBadge, Table, Notice, Check } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, pct, dateShort, ago, cap, DOW, time12 } from '../../lib/format.js';

export default function Marketing() {
  const [tab, setTab] = useQueryState('tab', 'campaigns');
  return (
    <div className="page">
      <h1>Marketing</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['campaigns', 'Campaigns'], ['offers', 'Offers & happy hours'], ['referrals', 'Referrals'], ['leads', 'Brand leads'], ['calendar', 'Festival planner']]} />
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'offers' && <Offers />}
      {tab === 'referrals' && <Referrals />}
      {tab === 'leads' && <Leads />}
      {tab === 'calendar' && <Planner />}
    </div>
  );
}

const TEMPLATES = {
  at_risk: 'Hi {name}, we miss you at {salon}! It has been a while — enjoy 15% off your next visit with code {code}. Reply BOOK to pick a slot.',
  lapsed: 'Hi {name}, it has been months! Come back to {salon} this week and get 15% off with code {code}.',
  due: 'Hi {name}, your usual service at {salon} is due. Shall we hold your favourite slot? Reply BOOK.',
  birthday: 'Happy birthday {name}! 🎂 {salon} has a birthday treat for you: 20% off this month. Code {code}.',
  all: 'Hi {name}, Tue–Thu 2–5 pm is happy hour at {salon}: 20% off all services. Code {code}.',
};

function Campaigns() {
  const { id, salon } = useSalon();
  const { query } = useLocation();
  const q = useApi(`/salons/${id}/campaigns`);
  const offers = useApi(`/salons/${id}/offers`);
  const [open, setOpen] = useState(Boolean(query.segment));
  const [f, setF] = useState({ name: '', segment: query.segment || 'at_risk', channel: 'whatsapp', offer_id: '', message: TEMPLATES[query.segment] || TEMPLATES.at_risk });
  const [aud, setAud] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => {
    api(`/salons/${id}/audience?segment=${f.segment}`).then(setAud);
  }, [f.segment, id]);
  const offer = (offers.data || []).find((o) => o.id === Number(f.offer_id));
  const preview = f.message.replace(/\{name\}/g, 'Priya').replace(/\{salon\}/g, salon?.name || '').replace(/\{code\}/g, offer?.code || 'CODE');
  const send = (now) => run(async () => {
    const r = await post(`/salons/${id}/campaigns`, { ...f, name: f.name || `${cap(f.segment)} — ${dateShort(new Date().toISOString())}`, send_now: now });
    setOpen(false);
    q.reload();
    return r;
  }, (r) => (now ? `Sent to ${r.sent} clients` : 'Saved as draft')).catch(() => {});
  return (
    <div className="col">
      <div className="row between"><div className="small muted">Every campaign tracks offer → visit → repeat within 30 days.</div><Button icon="plus" onClick={() => setOpen(true)}>New campaign</Button></div>
      <Async q={q}>
        {(d) => !d.campaigns.length ? <Empty icon="megaphone" title="No campaigns yet" /> : (
          <div className="grid-auto">
            {d.campaigns.map((c) => (
              <Card key={c.id}>
                <div className="row between top"><div><b>{c.name}</b><div className="tiny muted">{cap(c.channel)} · {d.segments[c.segment] || c.segment}{c.offer_code ? ` · ${c.offer_code}` : ''}{c.brand_id && !c.salon_id ? ' · Brand HQ' : ''}</div></div><StatusBadge status={c.status} /></div>
                {c.status === 'sent' ? (
                  <>
                    <div className="grid-2 mt">
                      <div><div className="tiny muted">Sent</div><b>{c.sent_count}</b></div>
                      <div><div className="tiny muted">Visited (30d)</div><b>{c.visited} · {pct(c.conversion)}</b></div>
                      <div><div className="tiny muted">Revenue</div><b>{inr(c.revenue)}</b></div>
                      <div><div className="tiny muted">Repeat visits</div><b>{c.repeat}</b></div>
                      <div><div className="tiny muted">Cost</div><b>{inr(c.cost, { decimals: 2 })}</b></div>
                      <div><div className="tiny muted">Cost / visit · ROI</div><b>{inr(c.cost_per_visit, { decimals: 1 })} · {c.roi}×</b></div>
                    </div>
                    <div className="tiny muted mt">Sent {ago(c.sent_at)}</div>
                  </>
                ) : <Button size="sm" className="mt" busy={busy} onClick={() => run(() => post(`/salons/${id}/campaigns/${c.id}/send`).then(q.reload), 'Campaign sent')}>Send now</Button>}
              </Card>
            ))}
          </div>
        )}
      </Async>
      <Sheet open={open} onClose={() => setOpen(false)} title="New campaign" wide>
        <div className="col">
          <Input label="Campaign name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Win-back October" />
          <div className="grid-2">
            <Select label="Audience" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value, message: TEMPLATES[e.target.value] || f.message })} options={Object.entries(q.data?.segments || { at_risk: 'At risk' })} />
            <Select label="Channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} options={[['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['push', 'App push (free)']]} />
          </div>
          <Select label="Attach offer" value={f.offer_id} onChange={(e) => setF({ ...f, offer_id: e.target.value })} options={[['', 'No offer'], ...(offers.data || []).filter((o) => o.is_active).map((o) => [o.id, `${o.code} — ${o.title}`])]} />
          <Textarea label="Message ({name}, {salon}, {code} are filled in)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <div className="card flat" style={{ background: 'var(--good-soft)' }}><div className="tiny muted">Preview</div><div className="small">{preview}</div></div>
          {aud && <Notice icon="users">{aud.count} clients (opted-in) · est. cost {inr(aud.count * (aud.cost_per_message[f.channel] || 0), { decimals: 2 })}</Notice>}
          <div className="row"><Button variant="ghost" className="grow" busy={busy} onClick={() => send(false)}>Save draft</Button><Button className="grow" busy={busy} onClick={() => send(true)}>Send now</Button></div>
        </div>
      </Sheet>
    </div>
  );
}

function Offers() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/offers`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', code: '', type: 'percent', value: 20, happy_hour: 1, days: [2, 3], start_time: '14:00', end_time: '17:00', first_visit_only: 0, valid_to: '' });
  const [run, busy] = useAction();
  const create = () => run(async () => {
    await post(`/salons/${id}/offers`, { ...f, days: f.happy_hour ? f.days.join(',') : null, start_time: f.happy_hour ? f.start_time : null, end_time: f.happy_hour ? f.end_time : null, valid_to: f.valid_to || null });
    setOpen(false);
    q.reload();
  }, 'Offer live — customers nearby see it in the app').catch(() => {});
  return (
    <div className="col">
      <div className="row between"><div className="small muted">Happy hours fill dead hours: they show as “live now” on the customer app.</div><Button icon="plus" onClick={() => setOpen(true)}>New offer</Button></div>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0">
            <Table rows={rows} columns={[
              { label: 'Offer', render: (o) => <span>{o.title}<div className="tiny muted">{o.code}{o.is_brand ? ' · national (HQ)' : ''}</div></span> },
              { label: 'Value', render: (o) => (o.type === 'percent' ? `${Number(o.value)}%` : inr(o.value)) },
              { label: 'When', render: (o) => (o.happy_hour ? `${String(o.days || '').split(',').filter(Boolean).map((d) => DOW[d]).join(', ')} ${time12(o.start_time)}–${time12(o.end_time)}` : o.first_visit_only ? 'First visit' : 'Any time') },
              { label: 'Redeemed', align: 'right', render: (o) => `${o.redemptions} · ${inr(o.revenue, { compact: true })}` },
              { label: 'Status', render: (o) => (o.is_brand ? <Badge tone="primary">HQ</Badge> : <button className={`btn xs ${o.is_active ? 'good' : 'ghost'}`} onClick={() => run(() => patch(`/salons/${id}/offers/${o.id}`, { is_active: o.is_active ? 0 : 1 }).then(q.reload))}>{o.is_active ? 'Active' : 'Paused'}</button>) },
            ]} />
          </div>
        )}
      </Async>
      <Sheet open={open} onClose={() => setOpen(false)} title="New offer">
        <div className="col">
          <Input label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Weekday happy hour" />
          <div className="grid-2">
            <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="auto" />
            <Input label="% off" type="number" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} />
          </div>
          <Check label="Happy hour (only on chosen days & times)" checked={Boolean(f.happy_hour)} onChange={(e) => setF({ ...f, happy_hour: e.target.checked ? 1 : 0 })} />
          {Boolean(f.happy_hour) && (
            <>
              <div className="chips">{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} className={`chip ${f.days.includes(d) ? 'active' : ''}`} onClick={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}>{DOW[d]}</button>)}</div>
              <div className="grid-2"><Input label="From" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /><Input label="To" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></div>
            </>
          )}
          <Check label="First visit only" checked={Boolean(f.first_visit_only)} onChange={(e) => setF({ ...f, first_visit_only: e.target.checked ? 1 : 0 })} />
          <Input label="Valid till (optional)" type="date" value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} />
          <Button className="block lg" busy={busy} disabled={!f.title} onClick={create}>Publish offer</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Referrals() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/referrals`);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <div className="kpis"><div className="stat"><div className="label">Clients from referrals</div><div className="value">{d.total}</div></div><div className="stat"><div className="label">Reward</div><div className="small">{d.reward}</div></div></div>
          <div className="card pad-0"><Table rows={d.top} columns={[{ label: 'Referrer', key: 'name' }, { label: 'Code', key: 'referral_code' }, { label: 'Friends', align: 'right', key: 'referred' }, { label: 'Friends’ spend', align: 'right', render: (r) => inr(r.referred_spend) }]} empty="No referrals yet" /></div>
        </div>
      )}
    </Async>
  );
}

function Leads() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/leads`);
  const [run] = useAction();
  const set = (l, status) => run(() => patch(`/salons/${id}/leads/${l.id}`, { status }).then(q.reload), `Marked ${status}`);
  return (
    <Async q={q}>
      {(rows) => !rows.length ? <Empty icon="users" title="No leads routed to you">Brand campaigns (Instagram, Google) route enquiries to the nearest outlet here.</Empty> : (
        <div className="col">
          {rows.map((l) => (
            <Card key={l.id}>
              <div className="row between top"><div><b>{l.name}</b> <Badge>{cap(l.source)}</Badge><div className="small muted">{l.service_interest} · {l.area} · {ago(l.created_at)}</div></div><StatusBadge status={l.status} /></div>
              <div className="row wrap mt">
                <a className="btn sm soft" href={`tel:${l.phone}`}><Icon name="phone" size={14} />{l.phone}</a>
                {['assigned', 'new'].includes(l.status) && <Button size="sm" variant="ghost" onClick={() => set(l, 'contacted')}>Contacted</Button>}
                {l.status !== 'booked' && l.status !== 'lost' && <Button size="sm" variant="ghost" onClick={() => set(l, 'booked')}>Booked</Button>}
                {l.status !== 'lost' && l.status !== 'booked' && <Button size="sm" variant="ghost" onClick={() => set(l, 'lost')}>Lost</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}

function Planner() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/calendar`);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Async q={q}>
      {(rows) => (
        <div className="col">
          {rows.filter((r) => r.date >= today).map((r) => (
            <Card key={r.name}><div className="row"><div className="center" style={{ width: 56 }}><b style={{ fontSize: 20 }}>{r.date.slice(8)}</b><div className="tiny muted">{dateShort(r.date).split(' ')[1]}</div></div><div className="grow"><b>{r.name}</b><div className="small muted">{r.idea}</div></div></div></Card>
          ))}
        </div>
      )}
    </Async>
  );
}


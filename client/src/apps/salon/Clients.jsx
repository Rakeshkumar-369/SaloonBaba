import { useEffect, useState } from 'react';
import { useApi, post, patch } from '../../lib/api.js';
import { useQueryState, navigate } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Chips, SearchBox, Table, Card, KV, Textarea, Sheet, useAction, Empty, StatusBadge, Avatar, Notice } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { NewBooking } from './Calendar.jsx';
import { inr, dateShort, daysSince, cap, ago, relDay } from '../../lib/format.js';

const TAG_TONE = { new: 'info', regular: 'good', vip: 'primary', at_risk: 'warn', lapsed: 'bad', due: 'primary' };

export default function Clients({ clientId }) {
  return clientId ? <ClientCard cid={clientId} /> : <ClientList />;
}

function ClientList() {
  const { id, base } = useSalon();
  const [segment, setSegment] = useQueryState('segment', 'all');
  const [s, setS] = useState('');
  const [debounced, setDebounced] = useState('');
  const [add, setAdd] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(s), 300);
    return () => clearTimeout(t);
  }, [s]);
  const segs = useApi(`/salons/${id}/clients/segments`);
  const q = useApi(`/salons/${id}/clients?segment=${segment}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`);
  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Clients</h1><div className="small muted">Your client cloud — it stays with the salon, not with any stylist.</div></div>
        <div className="row">
          {['at_risk', 'lapsed', 'due'].includes(segment) && <Button size="sm" variant="soft" icon="megaphone" onClick={() => navigate(`${base}/marketing?tab=campaigns&segment=${segment}`)}>Message this list</Button>}
          <Button size="sm" icon="plus" onClick={() => setAdd(true)}>Add client</Button>
        </div>
      </div>
      <Chips items={(segs.data || []).map((x) => [x.key, x.label, x.count])} value={segment} onChange={setSegment} />
      <div className="mt"><SearchBox value={s} onChange={setS} placeholder="Search name or phone" /></div>
      {segment === 'due' && <div className="mt"><Notice icon="clock">Clients whose last service is due again (root touch-up, threading, beard…). Automatic WhatsApp reminders go out daily; call the VIPs.</Notice></div>}
      <div className="card pad-0 mt">
        <Async q={q}>
          {(rows) => (
            <Table rows={rows} keyField={segment === 'due' ? 'service_id' : 'id'} onRow={(r) => navigate(`${base}/clients/${r.id}`)} empty="No clients in this list" columns={segment === 'due' ? [
              { label: 'Client', render: (r) => <span>{r.name}<div className="tiny muted">{r.phone}</div></span> },
              { label: 'Due service', key: 'service_name' },
              { label: 'Due', render: (r) => <Badge tone={r.due_on < new Date().toISOString().slice(0, 10) ? 'warn' : 'info'}>{relDay(r.due_on)}</Badge> },
              { label: 'Last done', render: (r) => dateShort(r.last_done) },
            ] : [
              { label: 'Client', render: (r) => <span>{r.name} {r.no_show_count >= 2 && <Badge tone="bad">{r.no_show_count} NS</Badge>}<div className="tiny muted">{r.phone}</div></span> },
              { label: 'Segment', render: (r) => <Badge tone={TAG_TONE[r.tag]}>{cap(r.tag)}</Badge> },
              { label: 'Visits', align: 'right', key: 'visits' },
              { label: 'Spend', align: 'right', render: (r) => inr(r.total_spend) },
              { label: 'Last visit', render: (r) => (r.last_visit ? `${dateShort(r.last_visit)} · ${daysSince(r.last_visit)}d` : '—') },
              { label: 'Stylist', render: (r) => r.preferred_staff || '—' },
            ]} />
          )}
        </Async>
      </div>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add client" submitLabel="Add client" success="Client added"
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile', required: true, inputMode: 'tel' }, { name: 'gender', label: 'Gender', type: 'select', options: [['F', 'Female'], ['M', 'Male'], ['O', 'Other']], half: true }, { name: 'dob', label: 'Birthday', type: 'date', half: true }, { name: 'allergies', label: 'Allergies' }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
        onSubmit={async (v) => { const r = await post(`/salons/${id}/clients`, v); navigate(`${base}/clients/${r.id}`); }} />
    </div>
  );
}

function ClientCard({ cid }) {
  const { id, base, access } = useSalon();
  const q = useApi(`/salons/${id}/clients/${cid}`);
  const staff = useApi(`/salons/${id}/staff`);
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState(false);
  const [topup, setTopup] = useState(false);
  const [book, setBook] = useState(false);
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  return (
    <div className="page">
      <Button size="sm" variant="ghost" icon="left" onClick={() => navigate(`${base}/clients`)}>Clients</Button>
      <Async q={q}>
        {(d) => {
          const c = d.client;
          return (
            <div className="col mt">
              <div className="row">
                <Avatar name={c.name} hue={c.id * 37} size="lg" />
                <div className="grow"><h1 style={{ margin: 0 }}>{c.name}</h1><div className="small muted">{c.phone} · client since {dateShort(c.first_visit || c.created_at)}</div>
                  <div className="row wrap gap-s mt"><Badge tone={TAG_TONE[c.tag]}>{cap(c.tag)}</Badge>{c.no_show_count > 0 && <Badge tone="bad">{c.no_show_count} no-shows</Badge>}{c.referrals > 0 && <Badge tone="good">Referred {c.referrals}</Badge>}{!c.marketing_opt_in && <Badge>Opted out of offers</Badge>}</div></div>
              </div>
              <div className="row wrap">
                <Button size="sm" icon="calendar" onClick={() => setBook(true)}>Book</Button>
                <Button size="sm" variant="soft" icon="receipt" onClick={() => navigate(`${base}/billing?client=${c.id}`)}>Bill</Button>
                <Button size="sm" variant="ghost" icon="whatsapp" onClick={() => setMsg(true)}>Message</Button>
                {access !== 'stylist' && <Button size="sm" variant="ghost" icon="wallet" onClick={() => setTopup(true)}>Wallet top-up</Button>}
                <Button size="sm" variant="ghost" icon="edit" onClick={() => setEdit(true)}>Edit card</Button>
              </div>
              <div className="kpis">
                <div className="stat"><div className="label">Visits</div><div className="value">{c.visits}</div></div>
                <div className="stat"><div className="label">Lifetime spend</div><div className="value">{inr(c.total_spend)}</div></div>
                <div className="stat"><div className="label">Last visit</div><div className="value" style={{ fontSize: 17 }}>{c.last_visit ? `${daysSince(c.last_visit)} days ago` : '—'}</div></div>
                <div className="stat"><div className="label">Wallet</div><div className="value">{inr(c.wallet_balance)}</div></div>
              </div>
              <div className="grid grid-md-2">
                <Card title="Service notes">
                  <KV items={[['Preferred stylist', c.preferred_staff || '—'], ['Colour formula', c.colour_formula || '—'], ['Allergies', c.allergies ? <span className="bad">{c.allergies}</span> : 'None'], ['Birthday', c.dob ? dateShort(c.dob) : '—'], ['Source', cap(c.source || '')], c.referred_by && ['Referred by', c.referred_by]]} />
                  {c.notes && <p className="small mt">{c.notes}</p>}
                </Card>
                <Card title="Upcoming & packages">
                  {d.upcoming.map((u) => <div key={u.id} className="row between small"><span>{relDay(u.start_at)} · {u.services}</span><StatusBadge status={u.status} /></div>)}
                  {!d.upcoming.length && <div className="small muted">No upcoming booking — book the next visit.</div>}
                  <div className="divider" />
                  {d.packages.map((p) => <div key={p.id} className="row between small"><span>{p.name}{p.sessions_total ? ` · ${p.sessions_left}/${p.sessions_total} left` : ''}</span><StatusBadge status={p.status} /></div>)}
                  {!d.packages.length && <div className="small muted">No packages</div>}
                </Card>
              </div>
              <Card title="Visit history" className="pad-0">
                <div className="list">
                  {d.visits.map((v) => (
                    <a key={v.id} className="list-item" href={`/bill/${v.public_token}`} target="_blank" rel="noreferrer">
                      <div className="grow"><div className="small bold">{v.items}</div><div className="tiny muted">{dateShort(v.created_at)} · {v.invoice_no}</div></div>
                      <div className="right"><b className="small">{inr(v.total)}</b>{v.status !== 'paid' && <div><StatusBadge status={v.status} /></div>}</div>
                    </a>
                  ))}
                  {!d.visits.length && <Empty title="No visits yet" />}
                </div>
              </Card>
              {d.prescriptions.length > 0 && (
                <Card title="Home-care prescribed">
                  {d.prescriptions.map((p) => <div key={p.id} className="row between small"><span>{p.product} · {p.staff_name}</span><StatusBadge status={p.status} /></div>)}
                </Card>
              )}
              {d.reviews.length > 0 && <Card title="Feedback">{d.reviews.map((r, i) => <div key={i} className="small">★ {r.overall} · {r.comment || 'No comment'} <StatusBadge status={r.stage} /></div>)}</Card>}
              {d.messages.length > 0 && (
                <Card title="Messages sent">
                  {d.messages.map((m, i) => <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}><Badge>{m.template}</Badge> {m.body.slice(0, 120)}{m.body.length > 120 ? '…' : ''} <span className="tiny muted">{ago(m.created_at)}</span></div>)}
                </Card>
              )}
              <FormSheet open={edit} onClose={() => setEdit(false)} title="Edit client card" initial={c} onSubmit={(v) => patch(`/salons/${id}/clients/${c.id}`, v).then(q.reload)}
                fields={access === 'stylist' ? [{ name: 'colour_formula', label: 'Colour formula' }, { name: 'allergies', label: 'Allergies' }, { name: 'notes', label: 'Notes', type: 'textarea' }] : [
                  { name: 'name', label: 'Name' }, { name: 'dob', label: 'Birthday', type: 'date', half: true },
                  { name: 'preferred_staff_id', label: 'Preferred stylist', type: 'select', half: true, options: (staff.data || []).map((s) => [s.id, s.name]) },
                  { name: 'colour_formula', label: 'Colour formula' }, { name: 'allergies', label: 'Allergies' }, { name: 'notes', label: 'Notes', type: 'textarea' },
                  { name: 'marketing_opt_in', label: 'Receives offers on WhatsApp/SMS', type: 'checkbox' },
                ]} />
              <Sheet open={msg} onClose={() => setMsg(false)} title={`Message ${c.name.split(' ')[0]}`}>
                <div className="col">
                  <div className="chips" style={{ flexWrap: 'wrap' }}>
                    {[`Hi ${c.name.split(' ')[0]}, your usual slot is free this Saturday at 11 am. Shall we book it?`, `Hi ${c.name.split(' ')[0]}, we miss you! Here is 15% off your next visit with code COMEBACK15.`, `Hi ${c.name.split(' ')[0]}, thank you for visiting today. How is your hair feeling?`].map((t) => <button key={t} className="chip" style={{ height: 'auto', padding: 8, textAlign: 'left' }} onClick={() => setText(t)}>{t.slice(0, 60)}…</button>)}
                  </div>
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" />
                  <div className="tiny muted">Sent from the salon’s WhatsApp number — staff never see the client’s number.</div>
                  <Button busy={busy} disabled={!text} onClick={() => run(() => post(`/salons/${id}/clients/${c.id}/message`, { body: text }), 'Sent').then(() => { setMsg(false); setText(''); q.reload(); })}>Send WhatsApp</Button>
                </div>
              </Sheet>
              <FormSheet open={topup} onClose={() => setTopup(false)} title="Wallet top-up" submitLabel="Add to wallet" success="Wallet topped up" initial={{ mode: 'upi', bonus: 0 }}
                fields={[{ name: 'amount', label: 'Amount received ₹', type: 'number', required: true, half: true }, { name: 'bonus', label: 'Bonus credit ₹', type: 'number', half: true }, { name: 'mode', label: 'Paid by', type: 'select', required: true, options: [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card']] }]}
                onSubmit={(v) => post(`/salons/${id}/clients/${c.id}/wallet-topup`, v).then(q.reload)}>
                <Notice>Prepaid balance is a liability until it is spent. It appears in Packages → liability.</Notice>
              </FormSheet>
              {book && <NewBooking presetClient={c} onClose={() => { setBook(false); q.reload(); }} />}
            </div>
          );
        }}
      </Async>
    </div>
  );
}


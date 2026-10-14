import { useEffect, useMemo, useState } from 'react';
import { useApi, api, post, patch } from '../../lib/api.js';
import { useQueryState, useLocation } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Sheet, Select, Input, Textarea, Check, StatusBadge, Tabs, Toggle, useAction, Empty, Notice, Avatar, KV } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { today, addDays, time12, dateDay, inr, parse, cap, hueBg } from '../../lib/format.js';

const SOURCES = [['phone', 'Phone call'], ['walkin', 'Walk-in'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram DM'], ['google', 'Google'], ['app', 'App'], ['website', 'Website']];

export default function Calendar() {
  const { query } = useLocation();
  const [tab, setTab] = useQueryState('tab', 'day');
  const [newOpen, setNewOpen] = useState(query.new === '1');
  return (
    <div className="page">
      <div className="page-title">
        <h1>Calendar & front desk</h1>
        <Button icon="plus" onClick={() => setNewOpen(true)}>New booking</Button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['day', 'Day view'], ['queue', 'Walk-in queue']]} />
      {tab === 'day' ? <DayView onNew={() => setNewOpen(true)} /> : <QueueView />}
      {newOpen && <NewBooking onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function DayView() {
  const { id } = useSalon();
  const [date, setDate] = useQueryState('date', today());
  const [view, setView] = useState(window.innerWidth < 700 ? 'list' : 'grid');
  const [open, setOpen] = useState(null);
  const q = useApi(`/salons/${id}/appointments?date=${date}`);
  useEffect(() => {
    const t = setInterval(() => q.reload(), 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  return (
    <div className="col">
      <div className="row between wrap">
        <div className="row gap-s">
          <button className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="left" /></button>
          <input className="input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
          <button className="icon-btn" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><Icon name="right" /></button>
          {date !== today() && <Button size="sm" variant="ghost" onClick={() => setDate(today())}>Today</Button>}
        </div>
        <Toggle value={view} onChange={setView} options={[['list', 'List'], ['grid', 'Grid']]} />
      </div>
      <Async q={q}>
        {(d) => (
          <>
            <div className="row wrap gap-s small">
              <Badge>{d.appointments.filter((a) => !['cancelled', 'no_show'].includes(a.status)).length} bookings</Badge>
              <Badge tone="good">{d.appointments.filter((a) => a.status === 'completed').length} done</Badge>
              <Badge tone="warn">{d.appointments.filter((a) => ['checked_in', 'in_service'].includes(a.status)).length} in salon</Badge>
              <Badge tone="bad">{d.appointments.filter((a) => a.status === 'no_show').length} no-show</Badge>
              {d.staff.filter((s) => s.off).length > 0 && <Badge>Off: {d.staff.filter((s) => s.off).map((s) => s.name.split(' ')[0]).join(', ')}</Badge>}
            </div>
            {view === 'grid' ? <Grid d={d} onOpen={setOpen} /> : <ListView d={d} onOpen={setOpen} />}
          </>
        )}
      </Async>
      {open && <ApptSheet appt={open} staff={q.data?.staff || []} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); q.reload(); }} />}
    </div>
  );
}

function ListView({ d, onOpen }) {
  if (!d.appointments.length) return <Empty icon="calendar" title="No bookings this day" />;
  return (
    <div className="col gap-s">
      {d.appointments.map((a) => (
        <button key={a.id} className={`appt ${a.status}`} style={{ borderLeftColor: hueBg(a.staff_hue || 260) }} onClick={() => onOpen(a)}>
          <div className="row between">
            <b>{time12(a.start_at)} – {time12(a.end_at)}</b>
            <StatusBadge status={a.status} />
          </div>
          <div className="row between mt" style={{ marginTop: 4 }}>
            <div className="grow"><div className="bold">{a.client_name} {a.no_show_count >= 2 && <Badge tone="bad">{a.no_show_count} no-shows</Badge>} {a.visits === 0 && <Badge tone="info">New</Badge>}</div>
              <div className="small muted">{a.services} · {a.staff_name}</div></div>
            <span className="small muted">{cap(a.source)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Grid({ d, onOpen }) {
  const [oh, om] = d.open.split(':').map(Number);
  const [ch, cm] = d.close.split(':').map(Number);
  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const PX = 1.3;
  const hours = [];
  for (let h = Math.ceil(start / 60); h * 60 < end; h++) hours.push(h);
  const staff = d.staff.filter((s) => !s.off || d.appointments.some((a) => a.staff_id === s.id));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <div className="card pad-0" style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${staff.length}, minmax(150px, 1fr))`, minWidth: 52 + staff.length * 150 }}>
        <div style={{ borderBottom: '1px solid var(--border)' }} />
        {staff.map((s) => (
          <div key={s.id} className="row gap-s" style={{ padding: 8, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }}>
            <Avatar name={s.name} hue={s.hue} size="sm" /><div className="grow" style={{ minWidth: 0 }}><div className="small bold ellipsis">{s.name}</div><div className="tiny muted">{s.off ? 'Off' : `${time12(s.start)}–${time12(s.end)}`}</div></div>
          </div>
        ))}
        <div style={{ position: 'relative', height: (end - start) * PX }}>
          {hours.map((h) => <div key={h} className="tiny muted" style={{ position: 'absolute', top: (h * 60 - start) * PX - 7, right: 6 }}>{h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}</div>)}
        </div>
        {staff.map((s) => (
          <div key={s.id} style={{ position: 'relative', height: (end - start) * PX, borderLeft: '1px solid var(--border)', background: s.off ? 'var(--surface-2)' : undefined }}>
            {hours.map((h) => <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h * 60 - start) * PX, borderTop: '1px dashed var(--border)' }} />)}
            {d.date === today() && nowMin > start && nowMin < end && <div style={{ position: 'absolute', left: 0, right: 0, top: (nowMin - start) * PX, borderTop: '2px solid var(--accent)', zIndex: 2 }} />}
            {d.appointments.filter((a) => a.staff_id === s.id).map((a) => {
              const st = parse(a.start_at);
              const en = parse(a.end_at);
              const top = (st.getHours() * 60 + st.getMinutes() - start) * PX;
              const h = Math.max(24, ((en - st) / 60000) * PX - 2);
              return (
                <button key={a.id} className={`appt ${a.status}`} onClick={() => onOpen(a)}
                  style={{ position: 'absolute', top, left: 4, right: 4, height: h, padding: '4px 6px', overflow: 'hidden', borderLeftColor: hueBg(s.hue), fontSize: 12 }}>
                  <b>{time12(a.start_at)}</b> {a.client_name}<div className="tiny muted ellipsis">{a.services}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApptSheet({ appt: a, staff, onClose, onChanged }) {
  const { id, go } = useSalon();
  const [staffId, setStaffId] = useState(a.staff_id);
  const [run, busy] = useAction();
  const set = (body, msg) => run(() => patch(`/salons/${id}/appointments/${a.id}`, body), msg).then(onChanged).catch(() => {});
  const actions = {
    booked: [['confirmed', 'Confirm'], ['checked_in', 'Check in'], ['no_show', 'No-show'], ['cancelled', 'Cancel']],
    confirmed: [['checked_in', 'Check in'], ['no_show', 'No-show'], ['cancelled', 'Cancel']],
    checked_in: [['in_service', 'Start service'], ['cancelled', 'Cancel']],
    in_service: [],
    cancelled: [['booked', 'Restore']],
    no_show: [['booked', 'Restore']],
  }[a.status] || [];
  return (
    <Sheet open onClose={onClose} title={a.client_name}>
      <div className="col">
        <div className="row wrap gap-s"><StatusBadge status={a.status} /><Badge>{cap(a.source)}</Badge>{a.visits === 0 && <Badge tone="info">First visit</Badge>}{a.no_show_count > 0 && <Badge tone="bad">{a.no_show_count} past no-shows</Badge>}{a.deposit_status !== 'none' && <Badge tone={a.deposit_status === 'paid' ? 'good' : 'warn'}>Deposit {inr(a.deposit_amount)} {a.deposit_status}</Badge>}</div>
        <KV items={[['When', `${dateDay(a.start_at)}, ${time12(a.start_at)}–${time12(a.end_at)}`], ['Services', a.services], ['Price', inr(a.price)], ['Phone', a.client_phone], a.allergies && ['Allergies', <span key="al" className="bad">{a.allergies}</span>], a.colour_formula && ['Formula', a.colour_formula], a.notes && ['Notes', a.notes]]} />
        {['booked', 'confirmed', 'checked_in'].includes(a.status) && (
          <div className="row">
            <div className="grow"><Select label="Stylist" value={staffId} onChange={(e) => setStaffId(Number(e.target.value))} options={staff.map((s) => [s.id, `${s.name}${s.off ? ' (off)' : ''}`])} /></div>
            {staffId !== a.staff_id && <Button style={{ alignSelf: 'flex-end' }} busy={busy} onClick={() => set({ staff_id: staffId }, 'Stylist changed')}>Reassign</Button>}
          </div>
        )}
        <div className="row wrap">
          {actions.map(([s, l]) => <Button key={s} variant={['no_show', 'cancelled'].includes(s) ? 'ghost' : 'soft'} busy={busy} onClick={() => set({ status: s }, `Marked ${l.toLowerCase()}`)}>{l}</Button>)}
          {['checked_in', 'in_service', 'confirmed', 'booked'].includes(a.status) && <Button icon="receipt" onClick={() => go(`billing?appointment=${a.id}`)}>Bill now</Button>}
          {a.status === 'completed' && <Button variant="ghost" icon="receipt" onClick={() => go('billing?tab=bills')}>View bill</Button>}
          <Button variant="ghost" icon="user" onClick={() => go(`clients/${a.client_id}`)}>Client card</Button>
        </div>
      </div>
    </Sheet>
  );
}

export function NewBooking({ onClose, presetClient }) {
  const { id } = useSalon();
  const services = useApi(`/salons/${id}/services`);
  const staffQ = useApi(`/salons/${id}/staff`);
  const [client, setClient] = useState(presetClient || null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [newClient, setNewClient] = useState({ name: '', phone: '' });
  const [f, setF] = useState({ service_ids: [], date: today(), time: '', staff_id: '', source: 'phone', notes: '', request_deposit: 0 });
  const [slots, setSlots] = useState(null);
  const [run, busy] = useAction();

  useEffect(() => {
    if (search.length < 2) return setFound([]);
    const t = setTimeout(() => api(`/salons/${id}/clients/lookup?q=${encodeURIComponent(search)}`).then(setFound), 250);
    return () => clearTimeout(t);
  }, [search, id]);
  useEffect(() => {
    if (!f.service_ids.length) return setSlots(null);
    api(`/salons/${id}/slots?date=${f.date}&services=${f.service_ids.join(',')}${f.staff_id ? `&staff_id=${f.staff_id}` : ''}`).then(setSlots);
  }, [f.service_ids, f.date, f.staff_id, id]);

  const byCat = useMemo(() => {
    const m = {};
    for (const s of services.data || []) (m[s.category] ||= []).push(s);
    return Object.entries(m);
  }, [services.data]);

  const save = () => run(async () => {
    const body = { ...f, ...(client ? { client_id: client.id } : { client: newClient }) };
    const r = await post(`/salons/${id}/appointments`, body);
    onClose();
    return r;
  }, (r) => `Booked${r.deposit ? ` — deposit link sent for ${inr(r.deposit)}` : ''}`).catch(() => {});

  return (
    <Sheet open onClose={onClose} title="New booking" wide>
      <div className="col">
        <div className="section-title" style={{ marginTop: 0 }}>Client</div>
        {client ? (
          <div className="card flat row"><Avatar name={client.name} hue={client.id * 37} size="sm" /><div className="grow"><b>{client.name}</b><div className="tiny muted">{client.phone} · {client.visits ?? 0} visits</div></div>{!presetClient && <Button size="xs" variant="ghost" onClick={() => setClient(null)}>Change</Button>}</div>
        ) : (
          <>
            <Input placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            {found.length > 0 && <div className="card flat pad-0 list">{found.map((c) => <button key={c.id} className="list-item" onClick={() => setClient(c)}><div className="grow"><b className="small">{c.name}</b><div className="tiny muted">{c.phone} · {c.visits} visits{c.no_show_count ? ` · ${c.no_show_count} no-shows` : ''}</div></div></button>)}</div>}
            <div className="grid-2"><Input label="New client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} /><Input label="Mobile" inputMode="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></div>
          </>
        )}
        <div className="section-title">Services</div>
        {byCat.map(([cat, list]) => (
          <div key={cat}><div className="tiny muted mb" style={{ marginBottom: 4 }}>{cat}</div>
            <div className="chips" style={{ flexWrap: 'wrap' }}>{list.map((s) => <button key={s.id} className={`chip ${f.service_ids.includes(s.id) ? 'active' : ''}`} onClick={() => setF({ ...f, time: '', service_ids: f.service_ids.includes(s.id) ? f.service_ids.filter((x) => x !== s.id) : [...f.service_ids, s.id] })}>{s.name} · {inr(s.price)}</button>)}</div>
          </div>
        ))}
        <div className="grid-2">
          <Input label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, time: '' })} />
          <Select label="Stylist" value={f.staff_id} onChange={(e) => setF({ ...f, staff_id: e.target.value, time: '' })} options={[['', 'Auto-assign (skill + fair load)'], ...(staffQ.data || []).filter((s) => s.role !== 'receptionist').map((s) => [s.id, `${s.name} · ${cap(s.level)}`])]} />
        </div>
        {slots && (slots.slots.length ? (
          <div className="slot-grid">{slots.slots.map((s) => <button key={s.time} className={`slot ${f.time === s.time ? 'active' : ''}`} onClick={() => setF({ ...f, time: s.time })}>{time12(s.time)}</button>)}</div>
        ) : <Notice tone="warn">No skilled stylist is free that day for these services.</Notice>)}
        <div className="grid-2">
          <Select label="Booked via" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} options={SOURCES} />
          <div style={{ alignSelf: 'end', paddingBottom: 10 }}><Check label="Ask for UPI deposit" checked={Boolean(f.request_deposit)} onChange={(e) => setF({ ...f, request_deposit: e.target.checked ? 1 : 0 })} /></div>
        </div>
        <Textarea placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Button className="block lg" busy={busy} disabled={!f.time || !f.service_ids.length || (!client && !(newClient.name && newClient.phone))} onClick={save}>Confirm booking</Button>
      </div>
    </Sheet>
  );
}

function QueueView() {
  const { id, go } = useSalon();
  const q = useApi(`/salons/${id}/queue`);
  const staff = useApi(`/salons/${id}/staff`);
  const services = useApi(`/salons/${id}/services`);
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', service_id: '' });
  const [startFor, setStartFor] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => {
    const t = setInterval(() => q.reload(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = (t, action, extra = {}) => run(() => patch(`/salons/${id}/queue/${t.id}`, { action, ...extra }).then(q.reload), action === 'start' ? 'Client called — WhatsApp sent' : 'Updated').catch(() => {});
  const addWalkin = () => run(async () => {
    const r = await post(`/salons/${id}/queue`, f);
    setAdd(false);
    setF({ name: '', phone: '', service_id: '' });
    q.reload();
    return r;
  }, (r) => `Token ${r.token_no} · about ${r.eta_min ?? '?'} min`).catch(() => {});
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <div className="kpis">
            <div className="stat"><div className="label">Seat a new walk-in in</div><div className="value">{d.is_open ? `${d.wait_min ?? '—'} min` : 'Closed'}</div><div className="sub">shown live on the customer app</div></div>
            <div className="stat"><div className="label">Waiting</div><div className="value">{d.waiting}</div></div>
            <div className="stat"><div className="label">On duty</div><div className="value">{d.on_duty}</div></div>
            <div className="stat"><div className="label">Hours</div><div className="value" style={{ fontSize: 16 }}>{time12(d.open_time)}–{time12(d.close_time)}</div></div>
          </div>
          <Button icon="plus" onClick={() => setAdd(true)}>Add walk-in token</Button>
          {d.tokens.length ? d.tokens.map((t) => (
            <div key={t.id} className="card row">
              <div style={{ fontSize: 24, fontWeight: 800, width: 54 }}>T{t.token_no}</div>
              <div className="grow">
                <div className="bold">{t.name} <Badge>{cap(t.source)}</Badge></div>
                <div className="small muted">{t.service_name || 'Service at desk'} · {t.status === 'serving' ? `with ${t.staff_name}` : `#${t.position} · ~${t.eta_min ?? '?'} min${t.likely_staff ? ` · likely ${t.likely_staff}` : ''}`}</div>
              </div>
              <div className="row gap-s">
                {t.status === 'waiting' ? <>
                  <Button size="sm" onClick={() => setStartFor(t)}>Call</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(t, 'left')}>Left</Button>
                </> : <>
                  <Button size="sm" variant="soft" onClick={() => go(`billing?token=${t.id}${t.client_id ? `&client=${t.client_id}` : ''}${t.service_id ? `&service=${t.service_id}&staff=${t.staff_id}` : ''}`)}>Bill</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(t, 'done')}>Done</Button>
                </>}
              </div>
            </div>
          )) : <Empty icon="queue" title="No one waiting">Walk-ins and app users who join remotely show up here.</Empty>}
          <Sheet open={add} onClose={() => setAdd(false)} title="Walk-in token">
            <div className="col">
              <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Input label="Mobile (for WhatsApp alert)" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <Select label="Service" value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })} options={[['', 'Decide at chair'], ...(services.data || []).map((s) => [s.id, s.name])]} />
              <Button className="block lg" busy={busy} disabled={!f.name} onClick={addWalkin}>Give token</Button>
            </div>
          </Sheet>
          <Sheet open={Boolean(startFor)} onClose={() => setStartFor(null)} title={`Call T${startFor?.token_no}`}>
            <div className="col">
              {(staff.data || []).filter((s) => s.role !== 'receptionist' && ['present', 'late'].includes(s.today_status)).map((s) => (
                <button key={s.id} className="list-item card flat" onClick={() => { act(startFor, 'start', { staff_id: s.id }); setStartFor(null); }}>
                  <Avatar name={s.name} hue={s.hue} size="sm" /><div className="grow"><b className="small">{s.name}</b><div className="tiny muted">{cap(s.level)}</div></div><Icon name="right" />
                </button>
              ))}
              {!(staff.data || []).some((s) => ['present', 'late'].includes(s.today_status)) && <Notice tone="warn">No stylist has checked in yet today.</Notice>}
            </div>
          </Sheet>
        </div>
      )}
    </Async>
  );
}

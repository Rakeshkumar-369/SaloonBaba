import { useState } from 'react';
import Shell from '../../ui/Shell.jsx';
import { Routes } from '../../lib/router.jsx';
import { useT } from '../../lib/i18n.js';
import { useApi, api, post, patch } from '../../lib/api.js';
import { Async, Card, Button, Badge, Sheet, Textarea, Input, Select, Check, useAction, Empty, StatusBadge, Progress, Avatar, Stars, Notice, KV, Chips, useToast } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, time12, dateShort, dateDay, today, addDays, ym, monthLabel, cap, ago, DOW, relDay } from '../../lib/format.js';
import { PortfolioTile } from '../customer/Stylist.jsx';

export default function StaffApp() {
  const t = useT();
  const nav = [
    { to: '/staff', label: t('my_day'), icon: 'home', primary: true },
    { to: '/staff/earnings', label: t('earnings'), icon: 'wallet', primary: true },
    { to: '/staff/roster', label: t('attendance'), icon: 'calendar', primary: true },
    { to: '/staff/learn', label: t('learn'), icon: 'book', primary: true },
    { to: '/staff/clients', label: t('clients'), icon: 'users' },
    { to: '/staff/portfolio', label: t('portfolio'), icon: 'image' },
    { to: '/staff/recognition', label: t('leaderboard'), icon: 'award' },
    { to: '/staff/voice', label: t('voice'), icon: 'message' },
  ];
  return (
    <Shell nav={nav} base="/staff" title="SaloonBaba Staff" langSwitch>
      <Routes base="/staff" routes={[
        ['', () => <MyDay />],
        ['/earnings', () => <Earnings />],
        ['/roster', () => <Roster />],
        ['/learn', () => <Learn />],
        ['/clients', () => <ClientBook />],
        ['/portfolio', () => <Portfolio />],
        ['/recognition', () => <Recognition />],
        ['/voice', () => <Voice />],
      ]} fallback={<MyDay />} />
    </Shell>
  );
}

// ---------------------------------------------------------------- My day
function MyDay() {
  const t = useT();
  const q = useApi('/staff-app/home');
  const [checkin, setCheckin] = useState(false);
  const [prescribe, setPrescribe] = useState(null);
  const [run, busy] = useAction();
  const startService = (sid, a) => run(() => patch(`/salons/${sid}/appointments/${a.id}`, { status: a.status === 'checked_in' ? 'in_service' : 'checked_in' }), a.status === 'checked_in' ? 'Service started' : 'Client checked in').then(q.reload).catch(() => {});
  return (
    <div className="page">
      <Async q={q} rows={4}>
        {(d) => (
          <div className="col">
            <div className="row">
              <Avatar name={d.me.name} hue={d.me.hue} size="lg" />
              <div className="grow"><h1 style={{ margin: 0 }}>{d.me.name.split(' ')[0]}</h1><div className="small muted">{cap(d.me.level)} · {d.me.salon_name}</div></div>
              <Stars value={d.me.rating} />
            </div>
            {!d.attendance?.check_in ? (
              <Card style={{ background: 'var(--primary-soft)' }}>
                <div className="row between"><div><b>{d.shift?.is_off ? 'Weekly off today' : `Shift ${time12(d.shift?.shift_start)} – ${time12(d.shift?.shift_end)}`}</b><div className="small muted">Selfie + location check-in</div></div>
                  {!d.shift?.is_off && <Button icon="camera" onClick={() => setCheckin(true)}>{t('check_in')}</Button>}</div>
              </Card>
            ) : (
              <Card>
                <div className="row between"><div><b>Checked in {time12(d.attendance.check_in)}</b> <StatusBadge status={d.attendance.status} /><div className="small muted">{d.attendance.check_out ? `Out ${time12(d.attendance.check_out)}` : 'Have a great day!'}</div></div>
                  {!d.attendance.check_out && <Button variant="ghost" size="sm" busy={busy} onClick={() => run(() => post('/staff-app/attendance/check-out'), 'Checked out').then(q.reload)}>{t('check_out')}</Button>}</div>
              </Card>
            )}
            <div className="kpis">
              <div className="stat"><div className="label">{t('today')} · {t('commission')}</div><div className="value good">{inr(d.today.commission)}</div><div className="sub">{d.today.bills} clients · tips {inr(d.today.tips)}</div></div>
              <div className="stat"><div className="label">{t('this_month')}</div><div className="value">{inr(d.month.gross)}</div><div className="sub">{d.month.next_slab ? `${inr(d.month.to_next_slab)} to +${inr(d.month.next_slab.bonus)} bonus` : 'Top slab reached 🎉'}</div></div>
            </div>
            <Card><div className="row between small"><span>{t('target')}</span><b>{d.month.target_progress}%</b></div><Progress value={d.month.target_progress} /></Card>
            {d.queue.length > 0 && (
              <Card title="Walk-ins assigned to you">
                {d.queue.map((qq) => <div key={qq.id} className="row between small"><span>T{qq.token_no} · {qq.name}</span><StatusBadge status={qq.status === 'serving' ? 'in_service' : 'booked'} /></div>)}
              </Card>
            )}
            <div className="section-title">{t('appointments')} · {dateDay(today())}</div>
            {d.appointments.length ? d.appointments.map((a) => (
              <Card key={a.id}>
                <div className="row between top">
                  <div className="grow"><b>{time12(a.start_at)} · {a.client_name}</b> {a.visits === 0 && <Badge tone="info">New</Badge>}
                    <div className="small">{a.services}</div>
                    {a.last_services && <div className="tiny muted">Last time: {a.last_services}</div>}</div>
                  <StatusBadge status={a.status} />
                </div>
                {(a.allergies || a.colour_formula || a.client_notes) && (
                  <div className="mt"><KV items={[a.allergies && ['Allergy', <b key="a" className="bad">{a.allergies}</b>], a.colour_formula && ['Formula', a.colour_formula], a.client_notes && ['Notes', a.client_notes]]} /></div>
                )}
                <div className="row wrap mt">
                  {['booked', 'confirmed', 'checked_in'].includes(a.status) && <Button size="sm" busy={busy} onClick={() => startService(d.me.salon_id, a)}>{a.status === 'checked_in' ? t('start_service') : 'Client arrived'}</Button>}
                  <Button size="sm" variant="soft" icon="bag" onClick={() => setPrescribe({ id: a.client_id, name: a.client_name })}>{t('prescribe')}</Button>
                </div>
              </Card>
            )) : <Empty icon="calendar" title="No bookings yet today">Walk-ins will be assigned by the front desk.</Empty>}
          </div>
        )}
      </Async>
      <CheckInSheet open={checkin} onClose={() => setCheckin(false)} onDone={() => { setCheckin(false); q.reload(); }} />
      {prescribe && <PrescribeSheet client={prescribe} onClose={() => setPrescribe(null)} />}
    </div>
  );
}

function CheckInSheet({ open, onClose, onDone }) {
  const [photo, setPhoto] = useState(null);
  const [loc, setLoc] = useState(null);
  const [locErr, setLocErr] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const getLoc = () => {
    if (!navigator.geolocation) return setLocErr('Location not available on this device');
    navigator.geolocation.getCurrentPosition((p) => setLoc([p.coords.latitude, p.coords.longitude]), () => setLocErr('Location permission denied'), { enableHighAccuracy: true, timeout: 8000 });
  };
  const submit = (force) => run(async () => {
    const form = new FormData();
    if (photo) form.append('selfie', photo);
    if (loc) { form.append('lat', loc[0]); form.append('lng', loc[1]); }
    if (force) form.append('force', '1');
    return api('/staff-app/attendance/check-in', { method: 'POST', form });
  }).then((r) => { toast(`Checked in (${r.status})`, 'good'); onDone(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Check in">
      <div className="col">
        <label className="card flat center" style={{ cursor: 'pointer', padding: 24 }}>
          <Icon name="camera" size={34} style={{ margin: '0 auto' }} />
          <div className="bold mt">{photo ? `Selfie ready: ${photo.name.slice(0, 20)}` : 'Take a selfie'}</div>
          <input type="file" accept="image/*" capture="user" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </label>
        <Button variant="ghost" icon="pin" onClick={getLoc}>{loc ? `Location captured (${loc[0].toFixed(4)}, ${loc[1].toFixed(4)})` : 'Share my location'}</Button>
        {locErr && <Notice tone="warn">{locErr}. You can still check in — the manager will see it without location.</Notice>}
        <Button className="lg" busy={busy} onClick={() => submit(false)}>Check in now</Button>
        <div className="tiny muted center">Demo tip: on a laptop far from the salon, check-in is blocked by distance. Skip location to test.</div>
      </div>
    </Sheet>
  );
}

function PrescribeSheet({ client, onClose }) {
  const t = useT();
  const products = useApi('/staff-app/products');
  const [sel, setSel] = useState([]);
  const [note, setNote] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => post('/staff-app/prescriptions', { client_id: client.id, product_ids: sel, note }), 'Home-care card sent on WhatsApp — added to the client’s app').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`${t('prescribe')} · ${client.name}`}>
      <div className="col">
        <div className="small muted">Recommend what you used and why. You earn retail incentive when they buy — at the counter or in the app.</div>
        <Async q={products}>
          {(rows) => <div className="col gap-s" style={{ maxHeight: '45vh', overflow: 'auto' }}>{rows.map((p) => <Check key={p.id} label={`${p.name} · ${inr(p.mrp)}`} checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />)}</div>}
        </Async>
        <Textarea placeholder="How to use (e.g. mask once a week after colour)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="lg" busy={busy} disabled={!sel.length} onClick={send}>Send home-care card</Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Earnings wallet
function Earnings() {
  const t = useT();
  const [month, setMonth] = useState(ym());
  const q = useApi(`/staff-app/earnings?month=${month}`);
  const months = Array.from({ length: 3 }, (_, i) => ym(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)));
  return (
    <div className="page">
      <h1>{t('earnings')}</h1>
      <Chips items={months.map((m) => [m, monthLabel(m)])} value={month} onChange={setMonth} />
      <Async q={q}>
        {(e) => (
          <div className="col mt">
            <Card style={{ background: 'linear-gradient(135deg, var(--primary), #db2777)', color: '#fff' }}>
              <div className="small" style={{ opacity: 0.9 }}>{month === ym() ? 'Earned so far this month' : 'Earned'}</div>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{inr(e.net)}</div>
              <div className="small" style={{ opacity: 0.9 }}>{e.clients_served} clients · service sales {inr(e.service_revenue)} · updated after every bill</div>
            </Card>
            <Card title="Breakdown">
              <KV items={[
                ['Base salary', `${inr(e.base)} (${e.days_paid}/${e.days_in_month} days)`],
                [`Service commission ${Number(e.commission_pct)}%`, inr(e.commission)],
                [`Retail & package incentive`, inr(e.retail_incentive)],
                ['Target slab bonus', inr(e.slab_bonus)],
                ['Tips', inr(e.tips)],
                ['Advances deducted', e.advances ? `−${inr(e.advances)}` : '—'],
                [<b key="n">Net</b>, <b key="v">{inr(e.net)}</b>],
              ]} />
            </Card>
            <Card title="Bonus slabs">
              {e.slabs.map((s) => (
                <div key={s.min} className="row between small" style={{ padding: '6px 0' }}>
                  <span>Service sales ≥ {inr(s.min)}</span>
                  {e.service_revenue >= s.min ? <Badge tone="good">+{inr(s.bonus)} ✓</Badge> : <Badge>+{inr(s.bonus)}</Badge>}
                </div>
              ))}
              {e.next_slab && <Notice tone="info" icon="target">{inr(e.to_next_slab)} more in service sales unlocks +{inr(e.next_slab.bonus)}.</Notice>}
            </Card>
            <Card title="By day">
              {e.daily.map((d) => <div key={d.d} className="row between small" style={{ padding: '4px 0' }}><span>{relDay(d.d)}</span><span className="muted">sales {inr(d.service_rev)}{Number(d.retail) ? ` + retail ${inr(d.retail)}` : ''}</span><b className="good">+{inr(d.commission)}</b></div>)}
              {!e.daily.length && <div className="small muted">No bills yet</div>}
            </Card>
            {e.payslips.length > 0 && (
              <Card title="Payslips">
                {e.payslips.map((p) => <div key={p.id} className="row between small" style={{ padding: '4px 0' }}><span>{monthLabel(p.month)}</span><StatusBadge status={p.status} /><b>{inr(p.net)}</b></div>)}
              </Card>
            )}
          </div>
        )}
      </Async>
    </div>
  );
}

// ---------------------------------------------------------------- Roster, leave, swaps
function Roster() {
  const t = useT();
  const q = useApi('/staff-app/roster');
  const att = useApi('/staff-app/attendance');
  const [req, setReq] = useState(null);
  const [run, busy] = useAction();
  const submit = () => run(() => post('/staff-app/leave', req), 'Request sent to your manager').then(() => { setReq(null); q.reload(); }).catch(() => {});
  return (
    <div className="page">
      <h1>{t('roster')} & {t('attendance')}</h1>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {d.shifts.map((s) => (
                <div key={s.date} className="card flat center" style={{ padding: 10, borderColor: s.date === today() ? 'var(--primary)' : undefined }}>
                  <div className="tiny muted">{DOW[new Date(s.date).getDay()]} {s.date.slice(8)}</div>
                  {s.is_off ? <Badge>Off</Badge> : <div className="small bold">{time12(s.shift_start)}<br />{time12(s.shift_end)}</div>}
                </div>
              ))}
            </div>
            <div className="row">
              <Button variant="soft" onClick={() => setReq({ type: 'leave', from_date: addDays(today(), 3), to_date: addDays(today(), 3), reason: '' })}>Request {t('leave')}</Button>
              <Button variant="ghost" onClick={() => setReq({ type: 'swap', from_date: addDays(today(), 2), swap_with_staff_id: d.team[0]?.id, reason: '' })}>Swap a shift</Button>
            </div>
            <div className="section-title">My requests</div>
            {d.requests.length ? d.requests.map((r) => <Card key={r.id}><div className="row between"><span className="small">{r.type === 'swap' ? `Swap with ${r.swap_with}` : cap(r.type)} · {dateShort(r.from_date)}{r.to_date !== r.from_date ? `–${dateShort(r.to_date)}` : ''}</span><StatusBadge status={r.status} /></div></Card>) : <div className="small muted">No requests</div>}
            <Sheet open={Boolean(req)} onClose={() => setReq(null)} title={req?.type === 'swap' ? 'Swap a shift' : 'Request leave'}>
              {req && (
                <div className="col">
                  <div className="grid-2"><Input label="From" type="date" value={req.from_date} onChange={(e) => setReq({ ...req, from_date: e.target.value })} />{req.type === 'leave' && <Input label="To" type="date" value={req.to_date} onChange={(e) => setReq({ ...req, to_date: e.target.value })} />}</div>
                  {req.type === 'swap' && <Select label="Swap with" value={req.swap_with_staff_id} onChange={(e) => setReq({ ...req, swap_with_staff_id: e.target.value })} options={d.team.map((m) => [m.id, m.name])} />}
                  <Textarea placeholder="Reason" value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} />
                  <Button busy={busy} onClick={submit}>Send request</Button>
                </div>
              )}
            </Sheet>
          </div>
        )}
      </Async>
      <div className="section-title">This month</div>
      <Async q={att}>
        {(a) => (
          <div className="col">
            <div className="row wrap gap-s"><Badge tone="good">Present {a.summary.present}</Badge><Badge tone="warn">Late {a.summary.late}</Badge><Badge tone="bad">Absent {a.summary.absent}</Badge><Badge tone="info">Leave {a.summary.leave}</Badge></div>
            <div className="card pad-0 list">
              {a.rows.slice(0, 20).map((r) => <div key={r.id} className="list-item"><span className="grow small">{dateDay(r.date)}</span><span className="small muted">{r.check_in ? `${time12(r.check_in)}${r.check_out ? ` – ${time12(r.check_out)}` : ''}` : ''}</span><StatusBadge status={r.status} /></div>)}
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

// ---------------------------------------------------------------- Client book (masked)
function ClientBook() {
  const t = useT();
  const [s, setS] = useState('');
  const q = useApi(`/staff-app/clients${s ? `?q=${encodeURIComponent(s)}` : ''}`);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState({});
  const [run, busy] = useAction();
  const [prescribe, setPrescribe] = useState(null);
  return (
    <div className="page">
      <h1>{t('clients')}</h1>
      <Notice icon="lock">Phone numbers are hidden. Messages go from the salon’s WhatsApp — your regulars stay in touch with you here.</Notice>
      <div className="mt"><Input placeholder="Search" value={s} onChange={(e) => setS(e.target.value)} /></div>
      <Async q={q}>
        {(rows) => !rows.length ? <Empty title="No clients yet" /> : (
          <div className="card pad-0 list mt">
            {rows.map((c) => (
              <button key={c.id} className="list-item" onClick={() => { setOpen(c); setNotes({ colour_formula: c.colour_formula || '', allergies: c.allergies || '' }); setMsg(''); }}>
                <Avatar name={c.name} hue={c.id * 37} size="sm" />
                <div className="grow"><b className="small">{c.name}</b><div className="tiny muted">{c.phone} · {c.visits} visits · last with you {c.my_last ? ago(c.my_last) : '—'}</div></div>
                {c.allergies && <Badge tone="bad">Allergy</Badge>}
              </button>
            ))}
          </div>
        )}
      </Async>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name}>
        {open && (
          <div className="col">
            <Input label="Colour formula" value={notes.colour_formula} onChange={(e) => setNotes({ ...notes, colour_formula: e.target.value })} />
            <Input label="Allergies" value={notes.allergies} onChange={(e) => setNotes({ ...notes, allergies: e.target.value })} />
            <Button variant="soft" busy={busy} onClick={() => run(() => patch(`/staff-app/clients/${open.id}/notes`, notes), 'Notes saved').then(q.reload)}>Save notes</Button>
            <div className="divider" />
            <Textarea placeholder={`Hi ${open.name.split(' ')[0]}, your root touch-up is due — shall I hold Saturday 11 am?`} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="row"><Button className="grow" icon="whatsapp" busy={busy} disabled={!msg} onClick={() => run(() => post(`/staff-app/clients/${open.id}/message`, { body: msg }), 'Sent from salon number').then(() => setOpen(null))}>Send</Button><Button variant="ghost" icon="bag" onClick={() => { setPrescribe({ id: open.id, name: open.name }); setOpen(null); }}>Prescribe</Button></div>
          </div>
        )}
      </Sheet>
      {prescribe && <PrescribeSheet client={prescribe} onClose={() => setPrescribe(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Portfolio & reviews
function Portfolio() {
  const t = useT();
  const q = useApi('/staff-app/portfolio');
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ title: '', category: 'Hair', image: null });
  const [run, busy] = useAction();
  const upload = () => run(async () => {
    const form = new FormData();
    form.append('title', f.title);
    form.append('category', f.category);
    if (f.image) form.append('image', f.image);
    await api('/staff-app/portfolio', { method: 'POST', form });
    setAdd(false);
    q.reload();
  }, 'Added — clients see it on your profile').catch(() => {});
  return (
    <div className="page">
      <div className="page-title"><h1>{t('portfolio')}</h1><Button icon="camera" onClick={() => setAdd(true)}>Add look</Button></div>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <Card><div className="row between"><span>Your rating from verified clients</span><Stars value={d.rating} count={d.rating_count} /></div></Card>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>{d.items.map((p) => <PortfolioTile key={p.id} p={p} />)}</div>
            <div className="section-title">Recent reviews</div>
            {d.reviews.map((r, i) => <Card key={i} className="flat"><div className="row between"><b className="small">{r.client_name?.split(' ')[0]}</b><span className="row gap-s"><Stars value={r.overall} /><StatusBadge status={r.stage} /></span></div>{r.comment && <div className="small mt">{r.comment}</div>}<div className="tiny muted">{ago(r.created_at)}</div></Card>)}
          </div>
        )}
      </Async>
      <Sheet open={add} onClose={() => setAdd(false)} title="Add a look">
        <div className="col">
          <Input label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Caramel balayage" />
          <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={['Hair', 'Colour', 'Men', 'Makeup', 'Skin', 'Nails', 'Treatments']} />
          <label className="btn ghost" style={{ cursor: 'pointer' }}>📷 {f.image ? f.image.name.slice(0, 24) : 'Choose photo'}<input type="file" accept="image/*" hidden onChange={(e) => setF({ ...f, image: e.target.files?.[0] || null })} /></label>
          <Button busy={busy} disabled={!f.title} onClick={upload}>Upload</Button>
        </div>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- Learn & career ladder
function Learn() {
  const t = useT();
  const q = useApi('/staff-app/learn');
  const [open, setOpen] = useState(null);
  return (
    <div className="page">
      <h1>{t('learn')}</h1>
      <Async q={q}>
        {(d) => (
          <div className="col">
            {d.ladder.next && (
              <Card title={`Career ladder: ${cap(d.ladder.current)} → ${cap(d.ladder.next)}`}>
                {d.ladder.checks.map((c) => <div key={c.label} style={{ marginBottom: 8 }}><div className="row between small"><span>{c.done ? '✅' : '⬜'} {c.label}</span><b>{c.value}</b></div><Progress value={c.progress} /></div>)}
                <div className="tiny muted">Rules are the same for everyone — your progress is visible to you and the owner.</div>
              </Card>
            )}
            <div className="row wrap gap-s">{d.badges.map((b) => <Badge key={b.name} tone="primary">🏅 {b.name}</Badge>)}{!d.badges.length && <span className="small muted">Finish a course to earn your first badge.</span>}</div>
            <div className="section-title">Courses</div>
            {d.courses.map((c) => (
              <button key={c.id} className="card" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(c)}>
                <div className="row between top"><div><b>{c.title}</b><div className="tiny muted">{c.brand_name || c.vendor_name || 'SaloonBaba'} · {c.duration_min} min · {cap(c.level)}{c.assigned ? ' · assigned' : ''}</div></div>{c.completed_at ? <Badge tone="good">🏅 {c.badge_name}</Badge> : <Badge>{c.progress || 0}%</Badge>}</div>
                <Progress value={c.progress || 0} />
              </button>
            ))}
          </div>
        )}
      </Async>
      {open && <CourseSheet course={open} onClose={() => { setOpen(null); q.reload(); }} />}
    </div>
  );
}

function CourseSheet({ course, onClose }) {
  const [done, setDone] = useState(new Set(course.done_lessons || []));
  const [idx, setIdx] = useState(() => Math.min(course.lessons.length - 1, [...(course.done_lessons || [])].length));
  const [answer, setAnswer] = useState(null);
  const [run, busy] = useAction();
  const lesson = course.lessons[idx];
  const complete = () => run(() => post(`/staff-app/learn/${course.id}/lessons/${idx}/complete`, { answer }), (r) => (r.badge ? `Course complete — badge “${r.badge}” earned! 🏅` : 'Lesson complete')).then((r) => {
    setDone(new Set([...done, idx]));
    setAnswer(null);
    if (idx < course.lessons.length - 1) setIdx(idx + 1);
    else if (r.completed) onClose();
  }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={course.title}>
      <div className="col">
        <div className="chips">{course.lessons.map((l, i) => <button key={i} className={`chip ${i === idx ? 'active' : ''}`} onClick={() => { setIdx(i); setAnswer(null); }}>{done.has(i) ? '✓ ' : ''}{i + 1}</button>)}</div>
        <h3>{lesson.title}</h3>
        <p>{lesson.content}</p>
        {lesson.quiz && (
          <Card className="flat">
            <b className="small">Quick check: {lesson.quiz.q}</b>
            <div className="col gap-s mt">{lesson.quiz.options.map((o, i) => <label key={o} className="check"><input type="radio" name="quiz" checked={answer === i} onChange={() => setAnswer(i)} />{o}</label>)}</div>
          </Card>
        )}
        <Button busy={busy} disabled={lesson.quiz && answer === null} onClick={complete}>{done.has(idx) ? 'Done ✓ — next' : 'Mark lesson complete'}</Button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Recognition
function Recognition() {
  const t = useT();
  const q = useApi('/staff-app/recognition');
  return (
    <div className="page">
      <h1>{t('leaderboard')}</h1>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <div className="small muted">Week from {dateShort(d.week_start)}</div>
            <div className="grid-auto">{d.awards.map((a) => <Card key={a.title} className="center"><div style={{ fontSize: 26 }}>🏆</div><b>{a.title}</b><div className="small muted">{a.staff}</div></Card>)}</div>
            <div className="card pad-0 list">
              {d.board.map((b, i) => (
                <div key={b.id} className="list-item" style={b.id === d.me ? { background: 'var(--primary-soft)' } : undefined}>
                  <b style={{ width: 22 }}>{i + 1}</b><Avatar name={b.name} hue={b.hue} size="sm" />
                  <div className="grow"><b className="small">{b.name}{b.id === d.me ? ' (you)' : ''}</b><div className="tiny muted">{b.clients} clients · retail {inr(b.retail)}</div></div>
                  <b className="small">{inr(b.service_revenue, { compact: true })}</b>
                </div>
              ))}
            </div>
            <div className="section-title">My badges</div>
            <div className="row wrap gap-s">{d.badges.map((b) => <Badge key={b.name} tone="primary">🏅 {b.name}</Badge>)}</div>
          </div>
        )}
      </Async>
    </div>
  );
}

// ---------------------------------------------------------------- Voice
function Voice() {
  const t = useT();
  const q = useApi('/staff-app/voice');
  const [f, setF] = useState({ category: 'workload', message: '', anonymous: true });
  const [run, busy] = useAction();
  return (
    <div className="page">
      <h1>{t('voice')}</h1>
      <p className="muted small">Tell the owner what is not working — workload, pay, safety, ideas. Anonymous by default.</p>
      <Card>
        <div className="col">
          <Select label="About" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={['workload', 'pay', 'manager', 'safety', 'idea', 'other']} />
          <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Write freely…" />
          <Check label="Send anonymously" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />
          <Button busy={busy} disabled={!f.message} onClick={() => run(() => post('/staff-app/voice', f), 'Sent to the owner').then(() => { setF({ ...f, message: '' }); q.reload(); })}>Send</Button>
        </div>
      </Card>
      <div className="section-title">My named messages</div>
      <Async q={q}>{(rows) => rows.length ? rows.map((v) => <Card key={v.id} className="flat"><div className="small">{v.message}</div>{v.reply && <div className="small good mt">Owner: {v.reply}</div>}<div className="tiny muted">{ago(v.created_at)}</div></Card>) : <div className="small muted">Anonymous messages are not shown here.</div>}</Async>
    </div>
  );
}


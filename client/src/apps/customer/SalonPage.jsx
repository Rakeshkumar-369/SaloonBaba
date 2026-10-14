import { useEffect, useMemo, useState } from 'react';
import { useApi, post, api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.js';
import { navigate, useLocation } from '../../lib/router.jsx';
import { Async, Button, Badge, Stars, Tabs, Sheet, Avatar, Empty, Notice, Textarea, useAction, Select, Progress, useToast } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import { gradient, priceLevel, time12, inr, today, addDays, dateDay, ago, cap } from '../../lib/format.js';

export default function SalonPage({ slug }) {
  const q = useApi(`/customer/salons/${slug}`);
  return <Async q={q}>{(d) => <SalonView d={d} reload={q.reload} />}</Async>;
}

function SalonView({ d, reload }) {
  const t = useT();
  const { user } = useAuth();
  const { query } = useLocation();
  const toast = useToast();
  const s = d.salon;
  const [tab, setTab] = useState('menu');
  const [cart, setCart] = useState([]);
  const [booking, setBooking] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [fav, setFav] = useState(d.favourite);

  useEffect(() => {
    if (query.rebook === '1' && d.last_visit) rebookSame();
    else if (query.book === '1') setTab('menu');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needLogin = () => {
    if (user) return false;
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    return true;
  };
  const toggle = (id) => setCart((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const rebookSame = () => {
    if (needLogin()) return;
    const ids = String(d.last_visit.service_ids).split(',').map(Number).filter((id) => d.services.some((x) => x.id === id));
    setBooking({ serviceIds: ids, staffId: d.last_visit.staff_id });
  };
  const toggleFav = async () => {
    if (needLogin()) return;
    const r = await post(`/customer/favourites/${s.id}`);
    setFav(r.favourite);
    toast(r.favourite ? 'Saved to favourites' : 'Removed from favourites');
  };

  const cats = useMemo(() => {
    const m = {};
    for (const x of d.services) (m[x.category] ||= []).push(x);
    return Object.entries(m);
  }, [d.services]);
  const cartTotal = d.services.filter((x) => cart.includes(x.id)).reduce((a, x) => a + Number(x.price), 0);
  const cartMins = d.services.filter((x) => cart.includes(x.id)).reduce((a, x) => a + x.duration_min, 0);

  return (
    <div className="page" style={{ paddingBottom: cart.length ? 170 : undefined }}>
      <div className="cover" style={{ background: gradient(s.hue), height: 170 }}>
        <div className="grow">
          {s.brand_name && <div className="small" style={{ opacity: 0.9 }}>{s.brand_name}</div>}
          <h1 style={{ color: '#fff', margin: 0 }}>{s.name}</h1>
          <div className="small" style={{ opacity: 0.95 }}>{s.tagline}</div>
        </div>
        <button className="icon-btn" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }} onClick={toggleFav} aria-label="Favourite"><Icon name="heart" style={fav ? { fill: '#fff' } : undefined} /></button>
      </div>

      <div className="card mt">
        <div className="row between wrap">
          <Stars value={s.rating} count={`${s.rating_count} verified`} />
          <span className="small muted">{priceLevel(s.price_level)} · {cap(s.gender_type)} · {time12(s.open_time)}–{time12(s.close_time)}</span>
        </div>
        <div className="small muted mt row gap-s"><Icon name="pin" size={15} />{s.address}</div>
        <div className="row wrap gap-s mt">
          {s.hygiene_score >= 85 && <Badge tone="good"><Icon name="shield" size={12} />Hygiene {s.hygiene_score}/100</Badge>}
          {s.women_staff ? <Badge>Women staff</Badge> : null}
          {s.private_rooms ? <Badge>Private rooms</Badge> : null}
          {s.home_service ? <Badge>Home service</Badge> : null}
          {s.gold_partner ? <Badge tone="primary">Gold member prices</Badge> : null}
        </div>
        <div className="divider" />
        <div className="row between">
          <div>
            <div className="small muted">{s.open_now ? 'Live walk-in wait' : 'Closed now'}</div>
            <div className="bold" style={{ fontSize: 18 }}>
              {s.open_now ? (d.queue.wait_min === 0 ? 'Seat now' : d.queue.wait_min !== null ? `${t('seat_in')} ${d.queue.wait_min} ${t('min')}` : 'Fully booked today') : `Opens ${time12(s.open_time)}`}
            </div>
            {s.open_now && <div className="tiny muted">{d.queue.waiting} waiting · {d.queue.on_duty} stylists on duty</div>}
          </div>
          {s.open_now && <Button variant="soft" icon="queue" onClick={() => !needLogin() && setQueueOpen(true)}>{t('join_queue')}</Button>}
        </div>
        {d.last_visit && (
          <Button variant="ghost" className="block mt" icon="refresh" onClick={rebookSame}>Same as last time: {d.last_visit.services}</Button>
        )}
      </div>

      {d.offers.length > 0 && (
        <div className="chips mt">
          {d.offers.map((o) => (
            <div key={o.id} className="chip" style={{ height: 'auto', padding: '8px 12px', background: o.live_now ? 'var(--warn-soft)' : undefined }}>
              <Icon name="gift" size={16} /><div><div className="small bold">{o.title}</div><div className="tiny muted">Code {o.code}{o.live_now && o.happy_hour ? ' · live now' : ''}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-l">
        <Tabs value={tab} onChange={setTab} tabs={[['menu', 'Menu & prices'], ['stylists', `Stylists (${d.staff.length})`], ['reviews', 'Reviews'], ['packages', 'Packages'], ['about', 'About']]} />
        {tab === 'menu' && (
          <div className="col">
            <div className="tiny muted">All prices include GST. No surprise add-ons.</div>
            {cats.map(([cat, list]) => (
              <div key={cat}>
                <div className="section-title">{cat}</div>
                <div className="card pad-0 list">
                  {list.map((x) => (
                    <button key={x.id} className="list-item" onClick={() => toggle(x.id)}>
                      <div className="grow">
                        <div className="title">{x.name}</div>
                        <div className="meta">{x.duration_min} min{x.tags ? ` · ${x.tags.split(',').slice(0, 2).join(', ')}` : ''}</div>
                      </div>
                      <b className="num">{inr(x.price)}</b>
                      <span className={`btn xs ${cart.includes(x.id) ? '' : 'ghost'}`}>{cart.includes(x.id) ? 'Added' : 'Add'}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'stylists' && (
          <div className="grid-auto">
            {d.staff.map((st) => (
              <div key={st.id} className="card col">
                <div className="row">
                  <Avatar name={st.name} hue={st.hue} />
                  <div className="grow"><div className="bold">{st.name}</div><div className="small muted">{st.title || cap(st.level)}</div></div>
                  <Stars value={st.rating} count={st.rating_count} />
                </div>
                {st.specialities && <div className="small">{st.specialities}</div>}
                <div className="row">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/app/stylist/${st.id}`)}>Portfolio ({st.portfolio_count})</Button>
                  <Button size="sm" onClick={() => !needLogin() && setBooking({ serviceIds: cart, staffId: st.id })}>Book {st.name.split(' ')[0]}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'reviews' && (
          <div className="col">
            {d.breakdown?.result && (
              <div className="card col gap-s">
                {[['Result', d.breakdown.result], ['Hygiene', d.breakdown.hygiene], ['Waiting time', d.breakdown.wait], ['Value', d.breakdown.value], ['Behaviour', d.breakdown.behaviour]].map(([l, v]) => (
                  <div key={l} className="row"><span className="small" style={{ width: 110 }}>{l}</span><div className="grow"><Progress value={Number(v)} max={5} /></div><b className="small num">{Number(v).toFixed(1)}</b></div>
                ))}
                <div className="tiny muted">Only clients with a billed visit can review. Ratings are split so you know what to expect.</div>
              </div>
            )}
            {d.reviews.length ? d.reviews.map((r) => (
              <div key={r.id} className="card flat">
                <div className="row between"><b className="small">{r.client_name?.split(' ')[0]} · <span className="muted">with {r.staff_name || 'team'}</span></b><Stars value={r.overall} /></div>
                {r.comment && <p className="small mt">{r.comment}</p>}
                <div className="tiny muted">{ago(r.created_at)} · Verified visit</div>
              </div>
            )) : <Empty icon="star" title="No reviews yet" />}
          </div>
        )}
        {tab === 'packages' && (
          d.packages.length ? (
            <div className="grid-auto">
              {d.packages.map((p) => (
                <div key={p.id} className="card">
                  <Badge tone="primary">{cap(p.type)}</Badge>
                  <h3 className="mt">{p.name}</h3>
                  <div className="small muted">{p.description}</div>
                  <div className="row between mt"><b style={{ fontSize: 20 }}>{inr(p.price)}</b><span className="small muted">valid {p.validity_days} days</span></div>
                  <div className="tiny muted mt">Buy at the salon counter — it is added to your wallet in the app.</div>
                </div>
              ))}
            </div>
          ) : <Empty title="No packages" />
        )}
        {tab === 'about' && (
          <div className="col">
            <div className="card"><p>{s.description}</p>
              {s.last_checklist && <Notice tone="good" icon="shield">Hygiene checklist completed on {dateDay(s.last_checklist.run_date)} ({s.last_checklist.score}%).</Notice>}
              <div className="row mt">
                <a className="btn ghost sm" href={`tel:${s.phone}`}><Icon name="phone" size={16} />Call</a>
                <a className="btn ghost sm" href={`https://wa.me/91${s.whatsapp}?text=${encodeURIComponent('MENU ' + s.slug)}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={16} />WhatsApp</a>
                <a className="btn ghost sm" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`} target="_blank" rel="noreferrer"><Icon name="map" size={16} />Directions</a>
              </div>
            </div>
            <iframe title="Map" style={{ border: 0, width: '100%', height: 260, borderRadius: 14 }} loading="lazy"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.008}%2C${s.lat - 0.005}%2C${s.lng + 0.008}%2C${s.lat + 0.005}&layer=mapnik&marker=${s.lat}%2C${s.lng}`} />
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))', padding: 12, zIndex: 25 }}>
          <div className="card row" style={{ maxWidth: 640, margin: '0 auto', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
            <div className="grow"><b>{cart.length} service{cart.length > 1 ? 's' : ''} · {inr(cartTotal)}</b><div className="tiny muted">{cartMins} min · incl. GST</div></div>
            <Button onClick={() => !needLogin() && setBooking({ serviceIds: cart })}>{t('book_now')}</Button>
          </div>
        </div>
      )}

      {booking && <BookingSheet salon={s} services={d.services} staff={d.staff} init={booking} onClose={() => setBooking(null)} onDone={() => { setBooking(null); setCart([]); navigate('/app/bookings'); }} />}
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} salon={s} services={d.services} queue={d.queue} onDone={() => { setQueueOpen(false); reload(); navigate('/app/bookings'); }} />
    </div>
  );
}

/** Pick services → day → stylist → slot → confirm (+ UPI deposit when required). */
export function BookingSheet({ salon, services, staff, init, onClose, onDone, reschedule }) {
  const [serviceIds, setServiceIds] = useState(init.serviceIds || []);
  const [date, setDate] = useState(init.date || today());
  const [staffId, setStaffId] = useState(init.staffId || '');
  const [time, setTime] = useState('');
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState(null);
  const [run, busy] = useAction();
  const pay = usePay();
  const toast = useToast();

  useEffect(() => {
    if (!serviceIds.length) return setSlots(null);
    setSlots(null);
    setTime('');
    api(`/customer/salons/${salon.id}/slots?date=${date}&services=${serviceIds.join(',')}${staffId ? `&staff_id=${staffId}` : ''}`).then(setSlots).catch(() => setSlots({ slots: [] }));
  }, [serviceIds, date, staffId, salon.id]);

  const chosen = services.filter((x) => serviceIds.includes(x.id));
  const total = chosen.reduce((a, x) => a + Number(x.price), 0) * guests;
  const mins = chosen.reduce((a, x) => a + x.duration_min, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));

  const confirm = () => run(async () => {
    if (reschedule) {
      await api(`/customer/bookings/${reschedule}`, { method: 'PATCH', body: { action: 'reschedule', date, time } });
      toast('Booking moved', 'good');
      return onDone();
    }
    const r = await post('/customer/bookings', { salon_id: salon.id, service_ids: serviceIds, staff_id: staffId || undefined, date, time, guests, notes });
    if (r.payment) {
      try {
        await pay(r.payment);
        toast('Deposit paid — booking confirmed', 'good');
      } catch {
        toast('Booked. Pay the deposit from My bookings to confirm.', 'info');
      }
    } else toast('Booking confirmed! See you soon.', 'good');
    onDone();
  }).catch(() => {});

  return (
    <Sheet open onClose={onClose} title={reschedule ? 'Reschedule' : `Book at ${salon.name}`}>
      <div className="col">
        {!reschedule && (
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>Services</div>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {services.map((x) => (
                <button key={x.id} className={`chip ${serviceIds.includes(x.id) ? 'active' : ''}`} onClick={() => setServiceIds((c) => (c.includes(x.id) ? c.filter((y) => y !== x.id) : [...c, x.id]))}>{x.name} · {inr(x.price)}</button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="section-title">Day</div>
          <div className="chips">
            {days.map((dd, i) => <button key={dd} className={`chip ${date === dd ? 'active' : ''}`} onClick={() => setDate(dd)}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dateDay(dd)}</button>)}
          </div>
        </div>
        {!reschedule && (
          <Select label="Stylist" value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[['', 'Any available stylist'], ...staff.map((st) => [st.id, `${st.name} · ★${Number(st.rating).toFixed(1)} · ${cap(st.level)}`])]} />
        )}
        <div>
          <div className="section-title">Time</div>
          {!serviceIds.length ? <div className="small muted">Pick a service first</div> : !slots ? <div className="skeleton" style={{ height: 90 }} /> : slots.slots.length ? (
            <div className="slot-grid">
              {slots.slots.map((sl) => <button key={sl.time} className={`slot ${time === sl.time ? 'active' : ''}`} onClick={() => setTime(sl.time)}>{time12(sl.time)}</button>)}
            </div>
          ) : <Notice tone="warn">No free slots that day. Try another day or stylist.</Notice>}
        </div>
        {!reschedule && (
          <div className="grid-2">
            <Select label="People (group / bridal party)" value={guests} onChange={(e) => setGuests(Number(e.target.value))} options={[1, 2, 3, 4, 5, 6].map((n) => [n, n === 1 ? 'Just me' : `${n} people`])} />
            <div className="field"><span>Estimated total</span><div className="bold" style={{ fontSize: 20, paddingTop: 6 }}>{inr(total)} <span className="small muted">· {mins} min</span></div></div>
          </div>
        )}
        {!reschedule && <Textarea placeholder="Notes for the stylist (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        {!reschedule && (mins >= salon.deposit_min_duration) && <Notice tone="info" icon="lock">A {salon.deposit_pct}% UPI deposit holds long appointments. It is adjusted in your bill; free cancellation up to 4 hours before.</Notice>}
        <Button className="block lg" busy={busy} disabled={!time || !serviceIds.length} onClick={confirm}>{reschedule ? 'Move booking' : time ? `Confirm ${dateDay(date)}, ${time12(time)}` : 'Pick a time'}</Button>
      </div>
    </Sheet>
  );
}

function QueueSheet({ open, onClose, salon, services, queue, onDone }) {
  const [serviceId, setServiceId] = useState('');
  const [run, busy] = useAction();
  const join = () => run(async () => {
    const r = await post('/customer/queue', { salon_id: salon.id, service_id: serviceId || undefined });
    onDone(r);
  }, (r) => 'You are in the queue — we will notify you').catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Join the walk-in queue">
      <div className="col">
        <div className="card flat center">
          <div className="muted small">Estimated wait right now</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{queue.wait_min ?? '—'} min</div>
          <div className="small muted">{queue.waiting} people ahead · {queue.on_duty} stylists on duty</div>
        </div>
        <Select label="What do you need? (helps us pick the right stylist)" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={[['', 'Decide at the salon'], ...services.filter((x) => x.duration_min <= 60).map((x) => [x.id, `${x.name} · ${inr(x.price)}`])]} />
        <Notice tone="info" icon="bell">We will send a WhatsApp when your stylist is ready, so you can wait at home or nearby.</Notice>
        <Button className="block lg" busy={busy} onClick={join}>Get my token</Button>
      </div>
    </Sheet>
  );
}

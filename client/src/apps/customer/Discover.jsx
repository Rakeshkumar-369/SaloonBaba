import { lazy, Suspense, useEffect, useState } from 'react';
import { useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/i18n.js';
import { navigate, Link } from '../../lib/router.jsx';
import { Chips, SearchBox, Async, Empty, Badge, Stars, Toggle, Select, Button } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { gradient, priceLevel, time12, inr, dateDay } from '../../lib/format.js';

const MapView = lazy(() => import('./MapView.jsx'));

const QUICK = [['open_now', 'Open now'], ['offers', 'Offers'], ['hygiene', 'Hygiene badge'], ['women_staff', 'Women staff'], ['home_service', 'Home service']];
const NEEDS = ['Haircut', 'Curly hair', 'Bridal', 'Beard', 'Keratin', 'Threading', 'Facial', 'Balayage'];

export default function Discover() {
  const t = useT();
  const { user } = useAuth();
  const cities = useApi('/customer/cities');
  const [city, setCity] = useState(() => localStorage.getItem('sb_city') || user?.city || 'Chennai');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [flags, setFlags] = useState([]);
  const [gender, setGender] = useState('any');
  const [sort, setSort] = useState('');
  const [view, setView] = useState('list');
  const [loc, setLoc] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => localStorage.setItem('sb_city', city), [city]);

  const qs = new URLSearchParams({ city, gender, ...(debounced ? { q: debounced } : {}), ...(sort ? { sort } : {}), ...(loc ? { lat: loc[0], lng: loc[1] } : {}) });
  for (const f of flags) qs.set(f, '1');
  const salons = useApi(`/customer/salons?${qs}`);
  const queue = useApi(user ? '/customer/queue/mine' : null);
  const profile = useApi(user ? '/customer/profile' : null);
  const due = profile.data?.due?.filter((d) => d.due_on <= new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)) || [];

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => { setLoc([p.coords.latitude, p.coords.longitude]); setSort('distance'); },
      () => alert('Location permission denied — showing all salons in the city.'),
    );
  };

  return (
    <div className="page">
      <div className="row between mb">
        <div>
          <div className="small muted">Salons near you in</div>
          <select className="input sm" style={{ width: 'auto', fontWeight: 700 }} value={city} onChange={(e) => setCity(e.target.value)}>
            {(cities.data || ['Chennai', 'Bengaluru']).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Button variant="ghost" size="sm" icon="pin" onClick={locate}>{loc ? 'Near me ✓' : 'Near me'}</Button>
      </div>

      {queue.data?.map((q) => (
        <Link key={q.id} to="/app/bookings" className="notice good mb" style={{ display: 'flex' }}>
          <Icon name="queue" /><div className="grow"><b>Token {q.token_no} at {q.salon_name}</b><div className="small">{q.ready ? 'Your stylist is ready — please walk in' : `#${q.position} in line · about ${q.eta_min ?? '—'} min`}</div></div><Icon name="right" />
        </Link>
      ))}
      {due.slice(0, 1).map((d) => (
        <Link key={d.service_id} to={`/app/s/${d.slug}?rebook=1`} className="notice info mb" style={{ display: 'flex' }}>
          <Icon name="clock" /><div className="grow"><b>{d.service_name} due {dateDay(d.due_on)}</b><div className="small">At {d.salon_name} · book the same as last time</div></div><Icon name="right" />
        </Link>
      ))}

      <SearchBox value={search} onChange={setSearch} placeholder={t('search_need')} />
      <div className="chips mt">
        {NEEDS.map((n) => <button key={n} className={`chip ${search === n ? 'active' : ''}`} onClick={() => setSearch(search === n ? '' : n)}>{n}</button>)}
      </div>
      <div className="mt"><Chips items={QUICK} value={flags} onChange={setFlags} multi /></div>
      <div className="row between mt wrap">
        <Toggle value={gender} onChange={setGender} options={[['any', 'All'], ['women', 'Women'], ['men', 'Men']]} />
        <div className="row">
          <Select value={sort} onChange={(e) => setSort(e.target.value)} options={[['', 'Recommended'], ['wait', 'Shortest wait'], ['distance', 'Nearest'], ['rating', 'Top rated'], ['price', 'Price: low to high']]} />
          <Toggle value={view} onChange={setView} options={[['list', 'List'], ['map', 'Map']]} />
        </div>
      </div>

      <div className="mt-l">
        <Async q={salons}>
          {(rows) => !rows.length ? <Empty icon="search" title="No salons match">Try removing a filter.</Empty> : view === 'map' ? (
            <Suspense fallback={<div className="skeleton" style={{ height: 360 }} />}><MapView salons={rows} center={loc} /></Suspense>
          ) : (
            <div className="grid-auto">{rows.map((s) => <SalonCard key={s.id} s={s} />)}</div>
          )}
        </Async>
      </div>
    </div>
  );
}

export function SalonCard({ s }) {
  const t = useT();
  return (
    <button className="card pad-0" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', font: 'inherit', color: 'inherit' }} onClick={() => navigate(`/app/s/${s.slug}`)}>
      <div className="cover" style={{ background: gradient(s.hue), borderRadius: 0, height: 110 }}>
        <div className="grow">
          {s.brand_name && <div className="tiny" style={{ opacity: 0.9 }}>{s.brand_name}</div>}
          <div className="bold" style={{ fontSize: 17 }}>{s.name}</div>
        </div>
        {s.open_now ? (
          <span className="badge good" style={{ background: '#fff' }}>{s.wait_min === null ? t('open_now') : s.wait_min === 0 ? 'Seat now' : `${t('seat_in')} ${s.wait_min} ${t('min')}`}</span>
        ) : <span className="badge" style={{ background: '#fff' }}>Opens {time12(s.open_time)}</span>}
      </div>
      <div style={{ padding: 12 }} className="col gap-s">
        <div className="row between small">
          <Stars value={s.rating} count={s.rating_count} />
          <span className="muted">{priceLevel(s.price_level)} · {s.area}{s.distance_km !== null ? ` · ${s.distance_km} km` : ''}</span>
        </div>
        <div className="row wrap gap-s">
          {s.hygiene_score >= 85 && <Badge tone="good"><Icon name="shield" size={12} />Hygiene {s.hygiene_score}</Badge>}
          {s.offer_count > 0 && <Badge tone="warn"><Icon name="gift" size={12} />{s.offer_count} offers</Badge>}
          {s.women_staff ? <Badge>Women staff</Badge> : null}
          {s.home_service ? <Badge>Home service</Badge> : null}
          {s.gold_partner ? <Badge tone="primary">Gold partner</Badge> : null}
          <Badge>{s.gender_type === 'unisex' ? 'Unisex' : s.gender_type === 'men' ? 'Men' : 'Women'}</Badge>
        </div>
        {s.min_price && <div className="tiny muted">Services from {inr(s.min_price)} · prices include GST</div>}
      </div>
    </button>
  );
}

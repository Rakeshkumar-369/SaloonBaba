import { useApi } from '../../lib/api.js';
import { navigate } from '../../lib/router.jsx';
import { Async, Empty, Badge } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { gradient, time12, dateShort } from '../../lib/format.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Offers() {
  const city = localStorage.getItem('sb_city') || 'Chennai';
  const q = useApi(`/customer/offers?city=${encodeURIComponent(city)}`);
  return (
    <div className="page">
      <h1>Offers in {city}</h1>
      <p className="muted small">Off-peak happy hours are cheaper because chairs are free — everyone wins.</p>
      <Async q={q}>
        {(rows) => !rows.length ? <Empty icon="gift" title="No offers right now" /> : (
          <div className="grid-auto">
            {rows.map((o) => (
              <button key={`${o.id}-${o.slug}`} className="card pad-0" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', border: '1px solid var(--border)' }} onClick={() => navigate(`/app/s/${o.slug}`)}>
                <div style={{ background: gradient(o.hue), color: '#fff', padding: 14 }}>
                  <div className="row between"><b style={{ fontSize: 22 }}>{o.type === 'percent' ? `${Number(o.value)}% OFF` : `₹${Number(o.value)} OFF`}</b>{o.live_now && o.happy_hour ? <Badge tone="good">Live now</Badge> : null}</div>
                  <div className="small">{o.salon_name} · {o.area}</div>
                </div>
                <div style={{ padding: 12 }}>
                  <div className="bold">{o.title}</div>
                  {o.description && <div className="small muted">{o.description}</div>}
                  <div className="row wrap gap-s mt tiny">
                    <Badge tone="primary"><Icon name="percent" size={12} />{o.code}</Badge>
                    {o.happy_hour ? <Badge>{String(o.days || '').split(',').filter(Boolean).map((d) => DAYS[d]).join(', ')} {time12(o.start_time)}–{time12(o.end_time)}</Badge> : null}
                    {o.first_visit_only ? <Badge>First visit</Badge> : null}
                    {o.valid_to && <Badge>Till {dateShort(o.valid_to)}</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

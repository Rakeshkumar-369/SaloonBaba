import { useApi } from '../../lib/api.js';
import { navigate } from '../../lib/router.jsx';
import { Async, Avatar, Stars, Badge, Button, Empty } from '../../ui/kit.jsx';
import { cap, ago } from '../../lib/format.js';

export const PortfolioTile = ({ p }) => (
  <div className="tile-img" style={{ background: `linear-gradient(135deg, hsl(${p.before_hue} 45% 55%) 0 50%, hsl(${p.after_hue} 70% 45%) 50% 100%)` }}>
    {p.image_path && <img src={p.image_path} alt={p.title} loading="lazy" />}
    <span style={{ position: 'relative', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>{p.title}<br />♥ {p.likes}</span>
  </div>
);

export default function Stylist({ id }) {
  const q = useApi(`/customer/staff/${id}/portfolio`);
  return (
    <div className="page">
      <Async q={q}>
        {({ staff, items, reviews, badges }) => (
          <div className="col">
            <div className="row">
              <Avatar name={staff.name} hue={staff.hue} size="lg" />
              <div className="grow"><h1 style={{ margin: 0 }}>{staff.name}</h1><div className="small muted">{staff.title || cap(staff.level)} · {staff.salon_name}</div><Stars value={staff.rating} count={staff.rating_count} /></div>
            </div>
            {staff.bio && <p>{staff.bio}</p>}
            <div className="row wrap gap-s">{badges.map((b) => <Badge key={b.name} tone="primary">🏅 {b.name}</Badge>)}</div>
            <Button onClick={() => navigate(`/app/s/${staff.slug}`)}>Book with {staff.name.split(' ')[0]}</Button>
            <div className="section-title">Before / after</div>
            {items.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>{items.map((p) => <PortfolioTile key={p.id} p={p} />)}</div> : <Empty title="No portfolio yet" />}
            <div className="section-title">Reviews</div>
            {reviews.map((r, i) => (
              <div key={i} className="card flat"><div className="row between"><b className="small">{r.client_name?.split(' ')[0]}</b><Stars value={r.overall} /></div>{r.comment && <p className="small mt">{r.comment}</p>}<div className="tiny muted">{ago(r.created_at)}</div></div>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

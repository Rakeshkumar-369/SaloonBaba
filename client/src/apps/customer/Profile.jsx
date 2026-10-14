import { useState } from 'react';
import { useApi, patch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { navigate } from '../../lib/router.jsx';
import { LANGS, useT } from '../../lib/i18n.js';
import { Async, Card, Button, Badge, Empty, Select, Input, useAction, Avatar, Notice } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, dateShort, dateDay, relDay } from '../../lib/format.js';

export default function Profile() {
  const q = useApi('/customer/profile');
  const { user, setLang, logout } = useAuth();
  const t = useT();
  const [allergies, setAllergies] = useState(null);
  const [run, busy] = useAction();
  return (
    <div className="page">
      <div className="row">
        <Avatar name={user.name} hue={280} size="lg" />
        <div className="grow"><h1 style={{ margin: 0 }}>{user.name}</h1><div className="small muted">{user.phone} · {user.email}</div></div>
      </div>
      <Async q={q}>
        {(d) => (
          <div className="col mt-l">
            <div className="section-title" style={{ marginTop: 0 }}>Coming up for you</div>
            {d.due.length ? d.due.map((x) => (
              <button key={`${x.service_id}-${x.salon_id}`} className="card row" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => navigate(`/app/s/${x.slug}?rebook=1`)}>
                <Icon name="clock" /><div className="grow"><div className="bold">{x.service_name} due {relDay(x.due_on)}</div><div className="small muted">{x.salon_name} · last done {dateShort(x.last_done)}</div></div><Badge tone="primary">Book</Badge>
              </button>
            )) : <Notice>We remind you when a service is due — root touch-up, threading, beard trim.</Notice>}

            <div className="section-title">My beauty profile</div>
            {d.cards.map((c) => (
              <Card key={c.id}>
                <div className="row between"><b>{c.salon_name}</b><span className="small muted">{c.visits} visits</span></div>
                <dl className="kv mt small">
                  <dt>Preferred stylist</dt><dd>{c.preferred_staff || '—'}</dd>
                  <dt>Colour formula</dt><dd>{c.colour_formula || '—'}</dd>
                  <dt>Allergies</dt><dd>{c.allergies || 'None recorded'}</dd>
                  <dt>Last visit</dt><dd>{c.last_visit ? dateDay(c.last_visit) : '—'}</dd>
                </dl>
              </Card>
            ))}
            <Card title="Allergies & sensitivities" action={<Icon name="shield" />}>
              <div className="small muted mb">Shared with every salon you visit so stylists can keep you safe.</div>
              <div className="row">
                <div className="grow"><Input value={allergies ?? d.cards[0]?.allergies ?? ''} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. PPD sensitivity, nut oils" /></div>
                <Button busy={busy} disabled={allergies === null} onClick={() => run(() => patch('/customer/profile', { allergies }).then(q.reload), 'Saved')}>Save</Button>
              </div>
            </Card>

            <div className="section-title">Visit history</div>
            {d.history.length ? (
              <div className="card pad-0 list">
                {d.history.map((h) => (
                  <div key={h.id} className="list-item">
                    <div className="grow"><div className="title small">{h.items}</div><div className="meta tiny">{h.salon_name} · {dateShort(h.created_at)}{h.staff_name ? ` · ${h.staff_name}` : ''}</div></div>
                    <div className="right"><b className="small">{inr(h.total)}</b><div className="row gap-s">
                      <button className="btn xs ghost" onClick={() => navigate(`/bill/${h.public_token}`)}>Bill</button>
                      {!h.review_id && <button className="btn xs soft" onClick={() => navigate(`/bill/${h.public_token}?feedback=1`)}>Rate</button>}
                    </div></div>
                  </div>
                ))}
              </div>
            ) : <Empty title="No visits yet" />}

            {d.prescriptions.length > 0 && (
              <>
                <div className="section-title">Recommended by your stylist</div>
                <div className="card pad-0 list">
                  {d.prescriptions.map((p) => (
                    <div key={p.id} className="list-item">
                      <Icon name="bag" /><div className="grow"><div className="title small">{p.name}</div><div className="meta tiny">{p.staff_name} · {p.salon_name}{p.note ? ` · “${p.note}”` : ''}</div></div>
                      <Badge tone={p.status === 'bought' ? 'good' : 'primary'}>{p.status === 'bought' ? 'Bought' : inr(p.mrp)}</Badge>
                    </div>
                  ))}
                </div>
                <Button variant="soft" icon="bag" onClick={() => navigate('/app/shop')}>Open shop</Button>
              </>
            )}

            {d.favourites.length > 0 && (
              <>
                <div className="section-title">Favourite salons</div>
                <div className="chips">{d.favourites.map((f) => <button key={f.id} className="chip" onClick={() => navigate(`/app/s/${f.slug}`)}><Icon name="heart" size={14} />{f.name}</button>)}</div>
              </>
            )}

            <div className="section-title">Settings</div>
            <Card>
              <Select label={t('language')} value={user.lang || 'en'} onChange={(e) => setLang(e.target.value)} options={LANGS} />
              <Button variant="ghost" className="block mt" icon="logout" onClick={() => { logout(); navigate('/'); }}>{t('logout')}</Button>
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}

import { useState } from 'react';
import { useApi, post, patch } from '../../lib/api.js';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Button, Badge, useAction, Empty, Stat, Notice } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { inr, cap } from '../../lib/format.js';

export default function Packages() {
  const { id, isOwner, go } = useSalon();
  const q = useApi(`/salons/${id}/packages`);
  const services = useApi(`/salons/${id}/services`);
  const ledger = useApi(isOwner ? `/salons/${id}/packages/ledger` : null);
  const [add, setAdd] = useState(false);
  const [run] = useAction();
  return (
    <div className="page">
      <div className="page-title"><h1>Packages & memberships</h1>{isOwner && <Button icon="plus" onClick={() => setAdd(true)}>New package</Button>}</div>
      <Notice icon="gift">Prepaid packages lock in repeat visits. Sell them at billing; clients see sessions left in their app.</Notice>
      {ledger.data && (
        <div className="kpis mt">
          <Stat label="Unredeemed sessions" value={ledger.data.summary.sessions_outstanding} sub={inr(ledger.data.summary.package_liability)} />
          <Stat label="Wallet balances" value={inr(ledger.data.summary.wallet_liability)} />
          <Stat label="Expiring in 30 days" value={ledger.data.summary.expiring_30d} />
          <Stat label="Lifetime sold" value={inr(ledger.data.summary.sold_value, { compact: true })} />
        </div>
      )}
      <Async q={q}>
        {(rows) => !rows.length ? <Empty title="No packages yet" /> : (
          <div className="grid-auto mt">
            {rows.map((p) => (
              <Card key={p.id}>
                <div className="row between"><Badge tone="primary">{cap(p.type)}</Badge>{p.is_active ? <Badge tone="good">Selling</Badge> : <Badge>Paused</Badge>}</div>
                <h3 className="mt">{p.name}</h3>
                <div className="small muted">{p.description}</div>
                <div className="row between mt"><b style={{ fontSize: 20 }}>{inr(p.price)}</b><span className="small muted">{p.sold} sold</span></div>
                <div className="tiny muted">{p.sessions ? `${p.sessions} × ${p.service_name}` : `${Number(p.discount_pct)}% off${p.value_amount ? ` + ${inr(p.value_amount)} wallet` : ''}`} · {p.validity_days} days</div>
                {isOwner && <Button size="xs" variant="ghost" className="mt" onClick={() => run(() => patch(`/salons/${id}/packages/${p.id}`, { is_active: p.is_active ? 0 : 1 }).then(q.reload))}>{p.is_active ? 'Pause' : 'Resume'}</Button>}
              </Card>
            ))}
          </div>
        )}
      </Async>
      {isOwner && <Button variant="ghost" className="mt" onClick={() => go('finance?tab=liability')}>See prepaid liability ledger</Button>}
      <FormSheet open={add} onClose={() => setAdd(false)} title="New package" initial={{ type: 'package', validity_days: 180 }} onSubmit={(v) => post(`/salons/${id}/packages`, v).then(q.reload)}
        fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', half: true, options: [['package', 'Session package'], ['membership', 'Membership']] }, { name: 'price', label: 'Price ₹', type: 'number', required: true, half: true },
          { name: 'service_id', label: 'Service (packages)', type: 'select', options: (services.data || []).map((s) => [s.id, s.name]) }, { name: 'sessions', label: 'Sessions', type: 'number', half: true }, { name: 'validity_days', label: 'Valid days', type: 'number', half: true },
          { name: 'discount_pct', label: 'Member discount % (memberships)', type: 'number', half: true }, { name: 'value_amount', label: 'Wallet credit ₹', type: 'number', half: true },
          { name: 'description', label: 'Description' },
        ]} />
    </div>
  );
}

import { useState } from 'react';
import { useApi } from '../../lib/api.js';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Stat, Table, Badge, Chips, Notice } from '../../ui/kit.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { inr, pct, dateShort, dateTime, cap, time12 } from '../../lib/format.js';

const ACTION_TONE = { void: 'bad', discount: 'warn', cancel: '', no_show: '', cash_variance: 'bad', stock_shortage: 'bad', expense_delete: 'warn', queue_left: '' };

const detail = (t) => {
  const d = typeof t.details === 'string' ? JSON.parse(t.details || 'null') : t.details;
  if (!d) return '';
  if (t.action === 'discount') return `${inr(d.amount)} (${d.pct}%) — ${d.reason || ''}${d.approval ? ' · OTP approved' : ''}`;
  if (t.action === 'cash_variance') return `${inr(d.variance)} on ${dateShort(d.date)}`;
  if (t.action === 'stock_shortage') return `${d.diff} units (${inr(d.value)})`;
  return d.reason || '';
};

export default function Loss() {
  const { id } = useSalon();
  const [range, setRange] = useState('30');
  const [filter, setFilter] = useState('all');
  const q = useApi(`/salons/${id}/loss?${rangeQs(range)}`);
  return (
    <div className="page">
      <h1>Loss prevention</h1>
      <p className="muted small">Cash jobs not billed, discounts without approval and over-used colour are the silent profit killers. Everything is logged here.</p>
      <RangeChips value={range} onChange={setRange} />
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            <div className="kpis">
              <Stat label="Voided bills" value={d.summary.voids} tone={d.summary.voids ? 'warn' : ''} />
              <Stat label="Discounts > limit" value={d.summary.discounts} />
              <Stat label="Cash variance" value={inr(d.summary.cash_variance_total)} tone={d.summary.cash_variance_total < 0 ? 'bad' : ''} />
              <Stat label="Stock shortages" value={d.summary.stock_shortages} />
            </div>
            {d.unbilled.length > 0 && (
              <Notice tone="bad" icon="alert">
                <b>{d.unbilled.length} appointments were checked in but never billed:</b>
                {d.unbilled.slice(0, 5).map((u) => <div key={u.id} className="small">{dateTime(u.start_at)} · {u.client_name} · {u.staff_name}</div>)}
              </Notice>
            )}
            <Card title="Billed hours vs attended hours" className="pad-0">
              <div className="small muted" style={{ padding: '0 14px 8px' }}>Low billed % with full attendance can mean unbilled services or home visits for salon clients.</div>
              <Table rows={d.hours} columns={[
                { label: 'Stylist', key: 'name' },
                { label: 'Attended', align: 'right', render: (h) => `${Math.round(h.attended_min / 60)} h` },
                { label: 'Billed', align: 'right', render: (h) => `${Math.round(h.billed_min / 60)} h` },
                { label: 'Billed %', align: 'right', render: (h) => <b className={h.flag ? 'bad' : ''}>{pct(h.billed_pct)}</b> },
                { label: '', render: (h) => (h.flag ? <Badge tone="bad">Check</Badge> : null) },
              ]} />
            </Card>
            <div className="grid grid-md-2">
              <Card title="Discounts by person" className="pad-0">
                <Table rows={d.discounts} keyField="name" columns={[{ label: 'Billed by', render: (x) => x.name || 'System' }, { label: 'Bills', align: 'right', key: 'bills' }, { label: 'Discount', align: 'right', render: (x) => inr(x.discount) }, { label: '% of gross', align: 'right', render: (x) => <b className={x.discount_pct > 10 ? 'bad' : ''}>{pct(x.discount_pct)}</b> }]} />
              </Card>
              <Card title="Cash variance days" className="pad-0">
                <Table rows={d.cash_flags} empty="No cash variance above ₹200" columns={[{ label: 'Date', render: (c) => dateShort(c.date) }, { label: 'Expected', align: 'right', render: (c) => inr(c.expected_cash) }, { label: 'Counted', align: 'right', render: (c) => inr(c.counted_cash) }, { label: 'Variance', align: 'right', render: (c) => <b className="bad">{inr(c.variance)}</b> }]} />
              </Card>
            </div>
            <div className="section-title">Audit trail</div>
            <Chips value={filter} onChange={setFilter} items={[['all', 'All'], ...[...new Set(d.trail.map((t) => t.action))].map((a) => [a, cap(a)])]} />
            <div className="card pad-0">
              <Table rows={d.trail.filter((t) => filter === 'all' || t.action === filter).slice(0, 150)} columns={[
                { label: 'Action', render: (t) => <Badge tone={ACTION_TONE[t.action]}>{cap(t.action)}</Badge> },
                { label: 'Detail', render: (t) => <span className="small">{cap(t.entity || '')} #{t.entity_id || ''} {detail(t)}</span> },
                { label: 'By', render: (t) => t.user_name || 'System' },
                { label: 'When', render: (t) => `${dateShort(t.created_at)} ${time12(t.created_at)}` },
              ]} />
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

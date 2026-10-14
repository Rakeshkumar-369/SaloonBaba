import { useApi } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Stat, Table, Avatar, Button } from '../../ui/kit.jsx';
import { RevenueBars, Heatmap, Donut, HBars } from '../../ui/charts.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, pct, cap } from '../../lib/format.js';

const SRC_COLORS = { walkin: '#94a3b8', phone: '#7c3aed', app: '#db2777', whatsapp: '#16a34a', instagram: '#f59e0b', google: '#0ea5e9', rebook: '#4f46e5', website: '#64748b' };

export default function Insights() {
  const { id, go, isOwner } = useSalon();
  const [range, setRange] = useQueryState('range', '30');
  const q = useApi(`/salons/${id}/insights?${rangeQs(range)}`);
  return (
    <div className="page">
      <h1>Insights & alerts</h1>
      <RangeChips value={range} onChange={setRange} />
      <Async q={q} rows={5}>
        {(d) => (
          <div className="col mt">
            <div className="kpis">
              <Stat label="Revenue" value={inr(d.kpi.revenue, { compact: true })} now={d.kpi.revenue} prev={d.prev.revenue} />
              <Stat label="Bills" value={d.kpi.bills} now={d.kpi.bills} prev={d.prev.bills} />
              <Stat label="Average bill" value={inr(d.kpi.avg_bill)} now={d.kpi.avg_bill} prev={d.prev.avg_bill} />
              <Stat label="New clients" value={d.kpi.new_clients} now={d.kpi.new_clients} prev={d.prev.new_clients} />
              <Stat label="2nd-visit return" value={pct(d.kpi.second_visit_rate)} sub={`cohort of ${d.kpi.cohort_size}`} />
              <Stat label="Rebooking" value={pct(d.kpi.rebooking_rate)} now={d.kpi.rebooking_rate} prev={d.prev.rebooking_rate} />
              <Stat label="Retail %" value={pct(d.kpi.retail_pct)} now={d.kpi.retail_pct} prev={d.prev.retail_pct} />
              <Stat label="Utilisation" value={pct(d.kpi.utilisation)} now={d.kpi.utilisation} prev={d.prev.utilisation} />
              <Stat label="No-shows" value={pct(d.kpi.no_show_rate)} now={d.kpi.no_show_rate} prev={d.prev.no_show_rate} invert />
              <Stat label="Online bookings" value={pct(d.kpi.online_share)} sub="app, WhatsApp, web" />
              <Stat label="Discounts" value={pct(d.kpi.discount_pct)} sub="of gross" invert />
              {isOwner && <Stat label="Payroll %" value={pct(d.kpi.payroll_pct)} sub="target 30–35%" />}
            </div>
            <div className="grid-auto">
              {d.nudges.map((n) => (
                <Card key={n.type} className="col gap-s"><b><Icon name="zap" size={16} /> {n.title}</b><div className="small muted">{n.body}</div><Button size="sm" variant="soft" onClick={() => go(n.action.to)}>{n.action.label}</Button></Card>
              ))}
            </div>
            <Card title="Revenue by day"><RevenueBars series={d.series} /></Card>
            <Card title="How full are the chairs? (last 4 weeks)"><Heatmap heat={d.heat} /></Card>
            <div className="grid grid-md-2">
              <Card title="Where bookings come from"><Donut parts={d.sources.map((s) => ({ label: cap(s.source), value: s.n, color: SRC_COLORS[s.source] || '#999' }))} /></Card>
              <Card title="Top services"><HBars items={d.top_services.map((s) => ({ label: `${s.name} (${s.n})`, value: s.revenue }))} /></Card>
            </div>
            <Card title="Stylist leaderboard" className="pad-0">
              <Table rows={d.leaders} columns={[
                { label: 'Stylist', render: (l) => <span className="row gap-s"><Avatar name={l.name} hue={l.hue} size="sm" />{l.name}</span> },
                { label: 'Service sales', align: 'right', render: (l) => inr(l.service_revenue) },
                { label: 'Clients', align: 'right', key: 'bills' },
                { label: 'Rebook %', align: 'right', render: (l) => pct(l.rebook_pct) },
                { label: 'Retail', align: 'right', render: (l) => `${inr(l.retail_revenue, { compact: true })} · ${pct(l.retail_pct)}` },
                { label: 'Rating', align: 'right', render: (l) => `★ ${Number(l.rating).toFixed(1)}` },
              ]} />
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}

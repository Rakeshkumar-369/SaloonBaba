import { useApi } from '../../lib/api.js';
import { navigate, useQueryState } from '../../lib/router.jsx';
import { Async, Stat, Table, Badge } from '../../ui/kit.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { inr, pct } from '../../lib/format.js';

export default function Rollup() {
  const [range, setRange] = useQueryState('range', '30');
  const q = useApi(`/salons/rollup?${rangeQs(range)}`);
  return (
    <div className="page">
      <h1>All my outlets</h1>
      <RangeChips value={range} onChange={setRange} />
      <Async q={q}>
        {(d) => (
          <div className="col mt">
            {d.total && (
              <div className="kpis">
                <Stat label="Revenue" value={inr(d.total.revenue, { compact: true })} sub={`${d.outlets.length} outlets`} />
                <Stat label="Bills" value={d.total.bills} sub={`avg ${inr(d.total.avg_bill)}`} />
                <Stat label="2nd-visit return" value={pct(d.total.second_visit_rate)} />
                <Stat label="Payroll %" value={pct(d.total.payroll_pct)} sub="target 30–35%" />
              </div>
            )}
            <div className="card pad-0">
              <Table rows={d.outlets} onRow={(o) => navigate(`/salon/${o.id}`)} columns={[
                { label: 'Outlet', render: (o) => <span>{o.name}<div className="tiny muted">{o.area}, {o.city}</div></span> },
                { label: 'Revenue', align: 'right', render: (o) => inr(o.kpi.revenue, { compact: true }) },
                { label: 'Avg bill', align: 'right', render: (o) => inr(o.kpi.avg_bill) },
                { label: '2nd visit', align: 'right', render: (o) => <b className={o.kpi.second_visit_rate < 45 ? 'bad' : ''}>{pct(o.kpi.second_visit_rate)}</b> },
                { label: 'Rebook', align: 'right', render: (o) => pct(o.kpi.rebooking_rate) },
                { label: 'Retail', align: 'right', render: (o) => pct(o.kpi.retail_pct) },
                { label: 'Utilisation', align: 'right', render: (o) => pct(o.kpi.utilisation) },
                { label: 'Payroll', align: 'right', render: (o) => <Badge tone={o.kpi.payroll_pct > 40 ? 'bad' : 'good'}>{pct(o.kpi.payroll_pct)}</Badge> },
              ]} />
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

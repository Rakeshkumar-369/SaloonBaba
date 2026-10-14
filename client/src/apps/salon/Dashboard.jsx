import { useApi } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Stat, Button, Avatar, Badge, Empty } from '../../ui/kit.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { RevenueBars } from '../../ui/charts.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, pct, num, dateDay, today } from '../../lib/format.js';

const TONE_ICON = { warn: 'zap', bad: 'alert', info: 'trend' };

export default function Dashboard() {
  const { id, go, salon, isOwner } = useSalon();
  const [range, setRange] = useQueryState('range', '30');
  const q = useApi(`/salons/${id}/dashboard?${rangeQs(range)}`);
  return (
    <div className="page">
      <div className="page-title">
        <div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h1><div className="small muted">{dateDay(today())} · {salon?.name}</div></div>
        <div className="row"><Button size="sm" icon="plus" onClick={() => go('calendar?new=1')}>Booking</Button><Button size="sm" variant="soft" icon="receipt" onClick={() => go('billing')}>New bill</Button></div>
      </div>
      <Async q={q} rows={5}>
        {(d) => (
          <div className="col">
            <div className="kpis">
              <Stat label="Today’s revenue" icon="rupee" value={inr(d.today.revenue)} sub={`${d.today.bills} bills`} />
              <Stat label="Appointments today" icon="calendar" value={num(d.counts.appts_today)} sub={`${d.counts.upcoming_today} still to come`} />
              <Stat label="Walk-ins waiting" icon="queue" value={num(d.counts.queue_waiting)} sub="live queue" />
              <Stat label="Staff present" icon="users" value={`${d.counts.staff_present}/${d.counts.staff_total}`} sub="checked in today" />
            </div>

            {[
              d.counts.approvals > 0 && isOwner && ['checkCircle', `${d.counts.approvals} discount/void approvals waiting`, 'approvals'],
              d.counts.private_feedback > 0 && ['star', `${d.counts.private_feedback} unhappy clients told you privately`, 'reviews?stage=private'],
              d.counts.low_stock > 0 && ['box', `${d.counts.low_stock} products low on stock`, 'inventory?tab=low'],
              d.counts.leave_pending > 0 && ['calendar', `${d.counts.leave_pending} leave / swap requests`, 'staff?tab=leave'],
            ].filter(Boolean).map(([ic, t, to]) => (
              <button key={to} className="notice warn" style={{ border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => go(to)}>
                <Icon name={ic} size={18} /><div className="grow">{t}</div><Icon name="right" size={18} />
              </button>
            ))}

            <div className="row between mt">
              <h2 style={{ margin: 0 }}>Numbers that decide profit</h2>
            </div>
            <RangeChips value={range} onChange={setRange} />
            <div className="kpis">
              <Stat label="Revenue" value={inr(d.kpi.revenue, { compact: true })} now={d.kpi.revenue} prev={d.prev.revenue} sub="vs previous period" />
              <Stat label="Average bill" value={inr(d.kpi.avg_bill)} now={d.kpi.avg_bill} prev={d.prev.avg_bill} />
              <Stat label="2nd-visit return" value={pct(d.kpi.second_visit_rate)} sub="average salon 45% · best 70%" tone={d.kpi.second_visit_rate >= 60 ? 'good' : d.kpi.second_visit_rate < 45 ? 'bad' : ''} />
              <Stat label="Rebooked at checkout" value={pct(d.kpi.rebooking_rate)} now={d.kpi.rebooking_rate} prev={d.prev.rebooking_rate} />
              <Stat label="Retail share" value={pct(d.kpi.retail_pct)} sub="leaders 20–25%" tone={d.kpi.retail_pct >= 20 ? 'good' : ''} />
              <Stat label="Chair utilisation" value={pct(d.kpi.utilisation)} now={d.kpi.utilisation} prev={d.prev.utilisation} />
              <Stat label="No-shows" value={pct(d.kpi.no_show_rate)} now={d.kpi.no_show_rate} prev={d.prev.no_show_rate} invert />
              {isOwner && <Stat label="Payroll % of sales" value={pct(d.kpi.payroll_pct)} sub="target 30–35%" tone={d.kpi.payroll_pct > 40 ? 'bad' : d.kpi.payroll_pct <= 35 ? 'good' : 'warn'} />}
            </div>

            {d.nudges.length > 0 && (
              <>
                <div className="section-title">What to do next</div>
                <div className="grid-auto">
                  {d.nudges.map((n) => (
                    <Card key={n.type} className="col gap-s">
                      <div className="row"><span className={n.tone === 'bad' ? 'bad' : n.tone === 'warn' ? 'warn' : ''}><Icon name={TONE_ICON[n.tone] || 'zap'} /></span><b className="grow">{n.title}</b></div>
                      <div className="small muted">{n.body}</div>
                      <Button size="sm" variant="soft" onClick={() => go(n.action.to)}>{n.action.label}</Button>
                    </Card>
                  ))}
                </div>
              </>
            )}

            <div className="grid grid-md-2">
              <Card title="Daily revenue" action={<Badge>{d.kpi.bills} bills · {d.kpi.new_clients} new clients</Badge>}>
                <RevenueBars series={d.series} />
              </Card>
              <Card title="Stylist leaderboard" action={<Button size="xs" variant="ghost" onClick={() => go('insights')}>All</Button>}>
                {d.leaders.length ? (
                  <div className="list">
                    {d.leaders.map((l, i) => (
                      <div key={l.id} className="list-item" style={{ padding: '8px 0' }}>
                        <b className="muted" style={{ width: 18 }}>{i + 1}</b>
                        <Avatar name={l.name} hue={l.hue} size="sm" />
                        <div className="grow"><div className="small bold">{l.name}</div><div className="tiny muted">{l.bills} clients · rebook {pct(l.rebook_pct)} · retail {pct(l.retail_pct)}</div></div>
                        <b className="small num">{inr(l.service_revenue, { compact: true })}</b>
                      </div>
                    ))}
                  </div>
                ) : <Empty title="No bills yet" />}
              </Card>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

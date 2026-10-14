import { useState } from 'react';
import { useApi, api, post, del, download } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Tabs, Card, Input, useAction, StatusBadge, Table, Notice, KV, Progress, Stat } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { Lines, HBars, Donut } from '../../ui/charts.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { inr, pct, dateShort, cap, today, ym, monthLabel, dateDay } from '../../lib/format.js';

const CATS = ['rent', 'electricity', 'salary', 'maintenance', 'product', 'marketing', 'amc', 'laundry', 'other'];

export default function Finance() {
  const { isOwner, brand } = useSalon();
  const [tab, setTab] = useQueryState('tab', isOwner ? 'pnl' : 'cash');
  const tabs = isOwner
    ? [['pnl', 'P&L'], ['breakeven', 'Break-even'], ['expenses', 'Expenses'], ['cash', 'Cash closing'], ['gst', 'GST & Tally'], ...(brand ? [['royalty', 'Royalty']] : []), ['liability', 'Prepaid liability']]
    : [['cash', 'Cash closing'], ['expenses', 'Expenses']];
  return (
    <div className="page">
      <h1>Finance</h1>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'pnl' && <Pnl />}
      {tab === 'breakeven' && <BreakEven />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'cash' && <Cash />}
      {tab === 'gst' && <Gst />}
      {tab === 'royalty' && <Royalty />}
      {tab === 'liability' && <Liability />}
    </div>
  );
}

function Pnl() {
  const { id, brand } = useSalon();
  const months = Array.from({ length: 4 }, (_, i) => ym(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)));
  const [month, setMonth] = useState(months[1]);
  const q = useApi(`/salons/${id}/pnl?month=${month}`);
  return (
    <div className="col">
      <div className="chips">{months.map((m) => <button key={m} className={`chip ${month === m ? 'active' : ''}`} onClick={() => setMonth(m)}>{monthLabel(m)}{m === ym() ? ' (MTD)' : ''}</button>)}</div>
      <Async q={q} rows={4}>
        {(p) => (
          <>
            <div className="kpis">
              <Stat label="Net sales (ex-GST)" value={inr(p.revenue.net_sales, { compact: true })} sub={`${p.revenue.bills} bills`} />
              <Stat label="Total costs" value={inr(p.costs.total, { compact: true })} />
              <Stat label={brand ? 'Profit after royalty' : 'Net profit'} value={inr(p.net_profit, { compact: true })} tone={p.net_profit >= 0 ? 'good' : 'bad'} sub={`${pct(p.net_margin)} margin`} />
              <Stat label="Payroll %" value={pct(p.payroll_pct)} sub={p.costs.payroll_is_estimate ? 'estimate (not finalised)' : 'finalised'} tone={p.payroll_pct > 40 ? 'bad' : ''} />
            </div>
            <div className="grid grid-md-2">
              <Card title="Profit & loss">
                <dl className="kv">
                  <dt>Services</dt><dd>{inr(p.revenue.services)}</dd>
                  <dt>Retail</dt><dd>{inr(p.revenue.retail)}</dd>
                  <dt>Packages & memberships</dt><dd>{inr(p.revenue.packages)}</dd>
                  <dt className="bold">Net sales</dt><dd className="bold">{inr(p.revenue.net_sales)}</dd>
                  <dt>Product cost (retail + back-bar)</dt><dd>−{inr(p.costs.product_cost)}</dd>
                  {p.costs.shrinkage > 0 && <><dt className="bad">· of which stock shortage</dt><dd className="bad">{inr(p.costs.shrinkage)}</dd></>}
                  <dt>Payroll{p.costs.payroll_is_estimate ? ' (est.)' : ''}</dt><dd>−{inr(p.costs.payroll)}</dd>
                  {p.costs.expenses.map((e) => [<dt key={`k${e.category}`}>{cap(e.category)}</dt>, <dd key={`v${e.category}`}>−{inr(e.amount)}</dd>])}
                  {brand && <><dt>Royalty {p.costs.royalty_pct}%</dt><dd>−{inr(p.costs.royalty)}</dd><dt>Marketing fee {p.costs.marketing_fee_pct}%</dt><dd>−{inr(p.costs.marketing_fee)}</dd></>}
                  <dt className="bold">Net profit</dt><dd className={`bold ${p.net_profit >= 0 ? 'good' : 'bad'}`}>{inr(p.net_profit)}</dd>
                </dl>
                {month === ym() && <div className="tiny warn mt">Month to date: fixed costs such as rent are booked on the day they are paid, so profit catches up as the month progresses.</div>}
                <div className="tiny muted mt">GST collected {inr(p.revenue.gst)} is excluded (payable to government). Product purchases are counted when used or sold, not when bought.</div>
              </Card>
              <Card title="Where the money goes">
                <Donut label={pct(p.net_margin)} parts={[
                  { label: 'Payroll', value: p.costs.payroll, color: '#7c3aed' },
                  { label: 'Products', value: p.costs.product_cost, color: '#db2777' },
                  { label: 'Rent & bills', value: p.costs.expenses_total, color: '#f59e0b' },
                  ...(brand ? [{ label: 'Royalty', value: p.costs.royalty + p.costs.marketing_fee, color: '#0ea5e9' }] : []),
                  { label: 'Profit', value: Math.max(0, p.net_profit), color: '#16a34a' },
                ]} />
              </Card>
            </div>
            <Card title="Daily profit">
              <Lines labels={p.daily.map((x) => x.date.slice(8))} series={[{ label: 'Net sales', values: p.daily.map((x) => x.net_sales), color: 'var(--primary)' }, { label: 'Profit', values: p.daily.map((x) => x.profit), color: '#16a34a' }]} />
            </Card>
            <Card title="Which services make money" className="pad-0">
              <Table rows={p.services} keyField="category" columns={[
                { label: 'Category', key: 'category' },
                { label: 'Services', align: 'right', key: 'count' },
                { label: 'Net sales', align: 'right', render: (r) => inr(r.net_sales) },
                { label: 'Commission', align: 'right', render: (r) => inr(r.commission) },
                { label: 'Product', align: 'right', render: (r) => inr(r.product_cost) },
                { label: 'Margin', align: 'right', render: (r) => <b>{pct(r.margin_pct)}</b> },
                { label: 'Margin / chair hour', align: 'right', render: (r) => inr(r.per_hour) },
              ]} />
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}

function BreakEven() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/break-even`);
  return (
    <Async q={q}>
      {(b) => (
        <div className="col">
          <Card>
            <div className="small muted">{monthLabel(b.month)} — sales needed to cover fixed costs</div>
            <div className="row between mt"><b style={{ fontSize: 26 }}>{inr(b.mtd_sales, { compact: true })}</b><span className="muted">of {inr(b.break_even_sales, { compact: true })}</span></div>
            <Progress value={b.progress_pct} />
            <div className="small mt">{b.progress_pct >= 100 ? '🎉 Break-even crossed — everything from here is profit.' : b.break_even_day ? `At the current pace you break even on ${dateDay(b.break_even_day)}.` : 'At the current pace you will not break even this month.'}</div>
          </Card>
          <div className="kpis">
            <Stat label="Fixed costs / month" value={inr(b.fixed_costs, { compact: true })} sub="rent, bills, base salaries" />
            <Stat label="Variable costs" value={pct(b.variable_cost_pct)} sub="products, commission, royalty" />
            <Stat label="Projected month sales" value={inr(b.projected_sales, { compact: true })} tone={b.projected_sales >= b.break_even_sales ? 'good' : 'bad'} />
            <Stat label="Break-even sales" value={inr(b.break_even_sales, { compact: true })} />
          </div>
        </div>
      )}
    </Async>
  );
}

function Expenses() {
  const { id, isOwner } = useSalon();
  const [range, setRange] = useState('30');
  const q = useApi(`/salons/${id}/expenses?${rangeQs(range)}`);
  const rec = useApi(isOwner ? `/salons/${id}/recurring` : null);
  const [add, setAdd] = useState(false);
  const [run, busy] = useAction();
  const submit = async (v) => {
    const form = new FormData();
    for (const [k, val] of Object.entries(v)) if (val !== undefined && val !== null && val !== '') form.append(k, val);
    await api(`/salons/${id}/expenses`, { method: 'POST', form });
    q.reload();
  };
  return (
    <div className="col">
      <div className="row between wrap"><RangeChips value={range} onChange={setRange} /><Button icon="camera" onClick={() => setAdd(true)}>Snap a bill</Button></div>
      <Async q={q}>
        {(d) => (
          <>
            <Card title={`Spent ${inr(d.total)}`}><HBars items={Object.entries(d.by_category).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: cap(k), value: v }))} /></Card>
            <div className="card pad-0">
              <Table rows={d.rows} columns={[
                { label: 'Category', render: (e) => <span>{cap(e.category)}<div className="tiny muted">{e.note}</div></span> },
                { label: 'Date', render: (e) => dateShort(e.expense_date) },
                { label: 'Amount', align: 'right', render: (e) => <b>{inr(e.amount)}</b> },
                { label: 'Bill', render: (e) => (e.bill_path ? <a href={e.bill_path} target="_blank" rel="noreferrer">View</a> : e.recurring_id ? <Badge>Recurring</Badge> : '—') },
                ...(isOwner ? [{ label: '', render: (e) => <button className="btn xs ghost" onClick={() => run(() => del(`/salons/${id}/expenses/${e.id}`).then(q.reload), 'Deleted')}>Delete</button> }] : []),
              ]} />
            </div>
          </>
        )}
      </Async>
      {isOwner && (
        <Async q={rec}>
          {(rows) => (
            <Card title="Recurring costs" action={<Button size="sm" variant="soft" busy={busy} onClick={() => run(() => post(`/salons/${id}/recurring/apply`, {}), (r) => `${r.created} expenses posted for this month`).then(q.reload)}>Post this month</Button>}>
              {rows.map((r) => <div key={r.id} className="row between small" style={{ padding: '4px 0' }}><span>{cap(r.category)} · {r.note} · day {r.day_of_month}</span><b>{inr(r.amount)}</b></div>)}
            </Card>
          )}
        </Async>
      )}
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add expense" initial={{ expense_date: today(), category: 'maintenance' }} onSubmit={submit} success="Expense saved"
        fields={[
          { name: 'category', label: 'Category', type: 'select', required: true, half: true, options: (isOwner ? CATS : CATS.filter((c) => !['rent', 'salary'].includes(c))).map((c) => [c, cap(c)]) },
          { name: 'amount', label: 'Amount ₹', type: 'number', required: true, half: true },
          { name: 'expense_date', label: 'Date', type: 'date', half: true }, { name: 'note', label: 'Note', half: true },
          { name: 'bill', label: 'Photo of bill', type: 'file', accept: 'image/*,application/pdf', capture: 'environment' },
        ]} />
    </div>
  );
}

function Cash() {
  const { id } = useSalon();
  const [date, setDate] = useState(today());
  const q = useApi(`/salons/${id}/cash-closing?date=${date}`);
  const [f, setF] = useState({ counted_cash: '', cash_expenses: '', notes: '' });
  const [run, busy] = useAction();
  return (
    <div className="col">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Async q={q}>
        {(d) => {
          const expected = d.opening_cash + d.cash - Number(f.cash_expenses || 0);
          return (
            <>
              <div className="kpis">
                <Stat label="Cash sales" value={inr(d.cash)} />
                <Stat label="UPI" value={inr(d.upi)} />
                <Stat label="Card" value={inr(d.card)} />
                <Stat label="Wallet / deposits" value={inr(d.wallet + d.deposit)} />
              </div>
              {d.voids.n > 0 && <Notice tone="warn">{d.voids.n} bill(s) voided today worth {inr(d.voids.amt)}.</Notice>}
              {d.closing ? (
                <Card title={`Closed by ${d.closing.closed_by_name}`}>
                  <KV items={[['Opening cash', inr(d.closing.opening_cash)], ['Cash sales', inr(d.closing.cash_sales)], ['Cash expenses', inr(d.closing.cash_expenses)], ['Expected', inr(d.closing.expected_cash)], ['Counted', inr(d.closing.counted_cash)], ['Variance', <b key="v" className={Math.abs(d.closing.variance) >= 200 ? 'bad' : 'good'}>{inr(d.closing.variance)}</b>]]} />
                  {d.closing.notes && <div className="small mt">{d.closing.notes}</div>}
                </Card>
              ) : (
                <Card title="Close the day">
                  <div className="grid-2">
                    <Input label="Cash paid out today ₹" type="number" value={f.cash_expenses} onChange={(e) => setF({ ...f, cash_expenses: e.target.value })} />
                    <Input label="Cash counted in drawer ₹" type="number" value={f.counted_cash} onChange={(e) => setF({ ...f, counted_cash: e.target.value })} />
                  </div>
                  <div className="row between mt"><span className="small">Opening {inr(d.opening_cash)} + cash sales − paid out =</span><b>Expected {inr(expected)}</b></div>
                  {f.counted_cash !== '' && <div className={`bold mt ${Math.abs(Number(f.counted_cash) - expected) >= 200 ? 'bad' : 'good'}`}>Variance {inr(Number(f.counted_cash) - expected)}</div>}
                  <Input label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
                  <Button className="mt block" busy={busy} disabled={f.counted_cash === ''} onClick={() => run(() => post(`/salons/${id}/cash-closing`, { ...f, date }), (r) => (Math.abs(r.variance) >= 200 ? `Closed with variance ${inr(r.variance)} — owner alerted` : 'Day closed')).then(q.reload)}>Close day</Button>
                </Card>
              )}
              <div className="section-title">Last 14 days</div>
              <div className="card pad-0"><Table rows={d.history} columns={[{ label: 'Date', render: (c) => dateShort(c.date) }, { label: 'Cash', align: 'right', render: (c) => inr(c.cash_sales) }, { label: 'UPI', align: 'right', render: (c) => inr(c.upi_total) }, { label: 'Card', align: 'right', render: (c) => inr(c.card_total) }, { label: 'Variance', align: 'right', render: (c) => <b className={Math.abs(c.variance) >= 200 ? 'bad' : ''}>{inr(c.variance)}</b> }]} /></div>
            </>
          );
        }}
      </Async>
    </div>
  );
}

function Gst() {
  const { id } = useSalon();
  const [range, setRange] = useState('month');
  const q = useApi(`/salons/${id}/gst?${rangeQs(range)}`);
  const [run, busy] = useAction();
  return (
    <div className="col">
      <RangeChips value={range} onChange={setRange} />
      <Async q={q}>
        {(d) => (
          <>
            <div className="kpis">
              <Stat label="Taxable value" value={inr(d.totals.taxable)} />
              <Stat label="CGST 9%" value={inr(d.totals.cgst)} />
              <Stat label="SGST 9%" value={inr(d.totals.sgst)} />
              <Stat label="Invoices" value={d.totals.bills} sub={`GSTIN ${d.gstin || '—'}`} />
            </div>
            <div className="row wrap">
              <Button icon="download" variant="soft" busy={busy} onClick={() => run(() => download(`/salons/${id}/gst?${rangeQs(range)}&format=csv`, `gst-${d.from}-${d.to}.csv`), 'Downloaded')}>GSTR-1 CSV</Button>
              <Button icon="download" variant="soft" busy={busy} onClick={() => run(() => download(`/salons/${id}/tally?${rangeQs(range)}`, `tally-${d.from}-${d.to}.xml`), 'Downloaded')}>Tally XML</Button>
            </div>
            <div className="card pad-0"><Table rows={d.rows} keyField="date" columns={[{ label: 'Date', render: (r) => dateShort(r.date) }, { label: 'Bills', align: 'right', key: 'bills' }, { label: 'Taxable', align: 'right', render: (r) => inr(r.taxable, { decimals: 2 }) }, { label: 'CGST', align: 'right', render: (r) => inr(r.cgst, { decimals: 2 }) }, { label: 'SGST', align: 'right', render: (r) => inr(r.sgst, { decimals: 2 }) }, { label: 'Total', align: 'right', render: (r) => inr(r.total, { decimals: 2 }) }]} /></div>
          </>
        )}
      </Async>
    </div>
  );
}

function Royalty() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/royalty`);
  const pay = usePay();
  const [run] = useAction();
  const payNow = (r) => run(async () => { await pay(await post(`/salons/${id}/royalty/${r.id}/pay`)); q.reload(); }, 'Royalty paid').catch(() => {});
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          {d.brand && <Notice icon="building">{d.brand.name}: royalty {Number(d.brand.royalty_pct)}% + marketing fee {Number(d.brand.marketing_fee_pct)}% on net billed sales. Calculated automatically — no disputes.</Notice>}
          <div className="card pad-0">
            <Table rows={d.rows} empty="No royalty invoices" columns={[
              { label: 'Month', render: (r) => monthLabel(r.month) },
              { label: 'Net sales', align: 'right', render: (r) => inr(r.net_sales) },
              { label: 'Royalty', align: 'right', render: (r) => inr(r.royalty_amount) },
              { label: 'Marketing', align: 'right', render: (r) => inr(r.marketing_fee) },
              { label: 'Total', align: 'right', render: (r) => <b>{inr(r.total)}</b> },
              { label: 'Due', render: (r) => dateShort(r.due_date) },
              { label: 'Status', render: (r) => (r.status === 'due' ? <Button size="xs" onClick={() => payNow(r)}>Pay by UPI</Button> : <StatusBadge status="paid" />) },
            ]} />
          </div>
        </div>
      )}
    </Async>
  );
}

function Liability() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/packages/ledger`);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <div className="kpis">
            <Stat label="Package liability" value={inr(d.summary.package_liability)} sub={`${d.summary.sessions_outstanding} sessions owed`} />
            <Stat label="Wallet balances" value={inr(d.summary.wallet_liability)} sub={`${d.summary.wallet_clients} clients`} />
            <Stat label="Packages sold" value={inr(d.summary.sold_value, { compact: true })} />
            <Stat label="Expiring in 30 days" value={d.summary.expiring_30d} sub="remind these clients" />
          </div>
          <div className="card pad-0"><Table rows={d.rows} columns={[{ label: 'Client', render: (r) => <span>{r.client_name}<div className="tiny muted">{r.client_phone}</div></span> }, { label: 'Package', key: 'name' }, { label: 'Left', align: 'right', render: (r) => (r.sessions_total ? `${r.sessions_left}/${r.sessions_total}` : `${Number(r.discount_pct)}% off`) }, { label: 'Liability', align: 'right', render: (r) => inr(r.liability) }, { label: 'Expires', render: (r) => dateShort(r.expires_at) }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></div>
        </div>
      )}
    </Async>
  );
}

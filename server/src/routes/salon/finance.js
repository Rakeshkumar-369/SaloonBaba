import { Router } from 'express';
import { q, one, insert } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { upload, filePath } from '../../upload.js';
import { pnl, serviceProfit, breakEven, tallyXml } from '../../services/finance.js';
import { startPayment } from '../../services/payments.js';
import { audit, notifyUser } from '../../services/notify.js';
import { bad, need, notFound, round2, range, today, monthRange, ym, pick } from '../../util.js';

const r = Router({ mergeParams: true });

// ------------------------------------------------------------ Expenses (snap-a-bill)
r.get('/expenses', allow('manager'), async (req, res) => {
  const { from, to } = range(req.query, 30);
  const rows = await q(
    `SELECT e.*, u.name AS created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
     WHERE e.salon_id = ? AND e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date DESC, e.id DESC`,
    [req.salon.id, from, to],
  );
  const byCat = {};
  for (const e of rows) byCat[e.category] = round2((byCat[e.category] || 0) + Number(e.amount));
  res.json({ from, to, rows, by_category: byCat, total: round2(rows.reduce((t, e) => t + Number(e.amount), 0)) });
});

r.post('/expenses', allow('manager'), upload.single('bill'), async (req, res) => {
  const b = need(req.body, 'category', 'amount');
  if (!(Number(b.amount) > 0)) throw bad('Amount must be positive');
  if (req.access === 'manager' && ['salary', 'royalty', 'rent'].includes(b.category)) throw bad('Only the owner records this expense');
  const id = await insert('expenses', {
    salon_id: req.salon.id, category: b.category, amount: Number(b.amount), expense_date: b.expense_date || today(),
    note: b.note || null, bill_path: filePath(req.file), created_by: req.user.id,
  });
  res.status(201).json({ id });
});

r.delete('/expenses/:id', allow(), async (req, res) => {
  const e = await one('SELECT * FROM expenses WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!e) throw notFound();
  await q('DELETE FROM expenses WHERE id = ?', [e.id]);
  await audit(req.salon.id, req.user.id, 'expense_delete', 'expense', e.id, { amount: e.amount, category: e.category });
  res.json({ ok: true });
});

r.get('/recurring', allow(), async (req, res) => res.json(await q('SELECT * FROM recurring_expenses WHERE salon_id = ? ORDER BY day_of_month', [req.salon.id])));

r.post('/recurring', allow(), async (req, res) => {
  const b = need(req.body, 'category', 'amount');
  res.status(201).json({ id: await insert('recurring_expenses', { salon_id: req.salon.id, ...pick(b, ['category', 'amount', 'day_of_month', 'note']) }) });
});

r.patch('/recurring/:id', allow(), async (req, res) => {
  await q('UPDATE recurring_expenses SET ? WHERE id = ? AND salon_id = ?', [pick(req.body, ['amount', 'is_active', 'note', 'day_of_month']), req.params.id, req.salon.id]);
  res.json({ ok: true });
});

/** Post this month's recurring costs (rent, EB, AMC…) as expenses — idempotent. */
r.post('/recurring/apply', allow(), async (req, res) => {
  const month = req.body.month || ym();
  const { days } = monthRange(month);
  const items = await q('SELECT * FROM recurring_expenses WHERE salon_id = ? AND is_active = 1', [req.salon.id]);
  let created = 0;
  for (const it of items) {
    const exists = await one(`SELECT id FROM expenses WHERE recurring_id = ? AND DATE_FORMAT(expense_date, '%Y-%m') = ?`, [it.id, month]);
    if (exists) continue;
    await insert('expenses', {
      salon_id: req.salon.id, category: it.category, amount: it.amount, expense_date: `${month}-${String(Math.min(it.day_of_month, days)).padStart(2, '0')}`,
      note: it.note, recurring_id: it.id, created_by: req.user.id,
    });
    created++;
  }
  res.json({ created });
});

// ------------------------------------------------------------ Daily cash closing
async function closingFigures(salonId, date) {
  const pays = await q(
    `SELECT p.mode, SUM(p.amount) AS amt FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
     WHERE p.salon_id = ? AND DATE(p.created_at) = ? AND (i.id IS NULL OR i.status = 'paid') GROUP BY p.mode`,
    [salonId, date],
  );
  const by = Object.fromEntries(pays.map((p) => [p.mode, round2(p.amt)]));
  const prev = await one('SELECT counted_cash FROM cash_closings WHERE salon_id = ? AND date < ? ORDER BY date DESC LIMIT 1', [salonId, date]);
  const voids = await one(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS amt FROM invoices WHERE salon_id = ? AND DATE(created_at) = ? AND status = 'void'`, [salonId, date]);
  return {
    date, opening_cash: round2(prev?.counted_cash || 0), cash: by.cash || 0, upi: by.upi || 0, card: by.card || 0,
    wallet: by.wallet || 0, deposit: by.deposit || 0, voids,
  };
}

r.get('/cash-closing', allow('manager'), async (req, res) => {
  const date = req.query.date || today();
  const fig = await closingFigures(req.salon.id, date);
  const closing = await one('SELECT c.*, u.name AS closed_by_name FROM cash_closings c LEFT JOIN users u ON u.id = c.closed_by WHERE c.salon_id = ? AND c.date = ?', [req.salon.id, date]);
  const history = await q('SELECT * FROM cash_closings WHERE salon_id = ? ORDER BY date DESC LIMIT 14', [req.salon.id]);
  res.json({ ...fig, closing, history });
});

r.post('/cash-closing', allow('manager'), async (req, res) => {
  const b = need(req.body, 'counted_cash');
  const date = b.date || today();
  if (await one('SELECT id FROM cash_closings WHERE salon_id = ? AND date = ?', [req.salon.id, date])) throw bad('This day is already closed');
  const fig = await closingFigures(req.salon.id, date);
  const cashExpenses = round2(Number(b.cash_expenses || 0));
  const expected = round2(fig.opening_cash + fig.cash - cashExpenses - Number(b.cash_deposited_to_bank || 0));
  const variance = round2(Number(b.counted_cash) - expected);
  await insert('cash_closings', {
    salon_id: req.salon.id, date, opening_cash: fig.opening_cash, cash_sales: fig.cash, cash_expenses: cashExpenses, expected_cash: expected,
    counted_cash: Number(b.counted_cash), upi_total: fig.upi, card_total: fig.card, variance, notes: b.notes || null, closed_by: req.user.id,
  });
  if (Math.abs(variance) >= 200) {
    await audit(req.salon.id, req.user.id, 'cash_variance', 'cash_closing', null, { date, variance });
    await notifyUser(req.salon.owner_user_id, `Cash variance ₹${variance}`, `${req.salon.name} closing on ${date} by ${req.user.name}`, 'finance?tab=cash');
  }
  res.status(201).json({ expected, variance });
});

// ------------------------------------------------------------ P&L, break-even, service profit
r.get('/pnl', allow(), async (req, res) => {
  let from;
  let to;
  if (req.query.month) ({ from, to } = monthRange(req.query.month));
  else ({ from, to } = range(req.query, 30));
  if (to > today()) to = today();
  const [p, services] = await Promise.all([pnl(req.salon.id, from, to), serviceProfit(req.salon.id, from, to)]);
  // Daily series: net sales vs variable costs + fixed cost per day
  const daily = await q(
    `SELECT x.d, x.net, COALESCE(y.comm, 0) AS comm FROM
       (SELECT DATE(created_at) AS d, SUM(taxable) AS net FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ? GROUP BY DATE(created_at)) x
     LEFT JOIN
       (SELECT DATE(i.created_at) AS d, SUM(ii.commission_amount) AS comm FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? GROUP BY DATE(i.created_at)) y ON y.d = x.d
     ORDER BY x.d`,
    [req.salon.id, `${from} 00:00:00`, `${to} 23:59:59`, req.salon.id, `${from} 00:00:00`, `${to} 23:59:59`],
  );
  const fixedPerDay = round2((p.costs.payroll - p.costs.commissions + p.costs.expenses_total) / p.days);
  const productRatio = p.revenue.net_sales ? p.costs.product_cost / p.revenue.net_sales : 0;
  const royaltyRatio = p.revenue.net_sales ? (p.costs.royalty + p.costs.marketing_fee) / p.revenue.net_sales : 0;
  const series = daily.map((d) => ({
    date: d.d, net_sales: round2(d.net),
    profit: round2(d.net - d.comm - d.net * productRatio - d.net * royaltyRatio - fixedPerDay),
  }));
  res.json({ ...p, services, daily: series });
});

r.get('/break-even', allow(), async (req, res) => res.json(await breakEven(req.salon.id)));

// ------------------------------------------------------------ GST & Tally
r.get('/gst', allow(), async (req, res) => {
  const { from, to, fromDt, toDt } = range(req.query, 30);
  const rows = await q(
    `SELECT DATE(created_at) AS date, COUNT(*) AS bills, SUM(taxable) AS taxable, SUM(cgst) AS cgst, SUM(sgst) AS sgst, SUM(total) AS total
     FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY date`,
    [req.salon.id, fromDt, toDt],
  );
  const sum = (k) => round2(rows.reduce((t, r) => t + Number(r[k]), 0));
  if (req.query.format === 'csv') {
    const inv = await q(
      `SELECT i.invoice_no, i.created_at, c.name, i.taxable, i.cgst, i.sgst, i.total FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? ORDER BY i.created_at`,
      [req.salon.id, fromDt, toDt],
    );
    const csv = ['Invoice No,Date,Customer,Taxable Value,CGST 9%,SGST 9%,Invoice Total,SAC']
      .concat(inv.map((i) => [i.invoice_no, i.created_at.slice(0, 10), `"${i.name.replace(/"/g, '')}"`, i.taxable, i.cgst, i.sgst, i.total, '999721'].join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gst-${req.salon.slug}-${from}-to-${to}.csv"`);
    return res.send(csv);
  }
  res.json({ from, to, gstin: req.salon.gst_number, rows, totals: { bills: rows.reduce((t, r) => t + r.bills, 0), taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), total: sum('total') } });
});

r.get('/tally', allow(), async (req, res) => {
  const { from, to } = range(req.query, 30);
  const xml = await tallyXml(req.salon.id, from, to);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="tally-${req.salon.slug}-${from}-to-${to}.xml"`);
  res.send(xml);
});

// ------------------------------------------------------------ Franchisee royalty
r.get('/royalty', allow(), async (req, res) => {
  if (!req.salon.brand_id) return res.json({ rows: [], brand: null });
  const brand = await one('SELECT name, royalty_pct, marketing_fee_pct FROM brands WHERE id = ?', [req.salon.brand_id]);
  res.json({ brand, rows: await q('SELECT * FROM royalty_invoices WHERE salon_id = ? ORDER BY month DESC', [req.salon.id]) });
});

r.post('/royalty/:id/pay', allow(), async (req, res) => {
  const ri = await one(`SELECT * FROM royalty_invoices WHERE id = ? AND salon_id = ? AND status = 'due'`, [req.params.id, req.salon.id]);
  if (!ri) throw notFound();
  res.json(await startPayment({ userId: req.user.id, purpose: 'royalty', refId: ri.id, amount: ri.total, description: `Royalty ${ri.month}` }));
});

export default r;

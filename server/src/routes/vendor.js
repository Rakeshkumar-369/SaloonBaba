import crypto from 'node:crypto';
import { Router } from 'express';
import { q, one, insert, update } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { sendMessage, notifySalonAdmins } from '../services/notify.js';
import { bad, need, notFound, forbidden, now, pick, round2, parseJson, ymd, addDays, today } from '../util.js';

const r = Router();
r.use(requireRole('vendor'));
r.use(async (req, _res, next) => {
  req.vendor = req.user.role === 'admin' && req.query.vendor_id
    ? await one('SELECT * FROM vendors WHERE id = ?', [req.query.vendor_id])
    : await one('SELECT * FROM vendors WHERE user_id = ?', [req.user.id]);
  if (!req.vendor) throw forbidden('No vendor profile for this account');
  next();
});

r.get('/overview', async (req, res) => {
  const v = req.vendor;
  const orders = await one(
    `SELECT SUM(status = 'placed') AS new_orders, SUM(status IN ('accepted','dispatched')) AS in_transit,
       COALESCE(SUM(CASE WHEN status <> 'cancelled' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN total END),0) AS mtd_value,
       COALESCE(SUM(CASE WHEN status = 'delivered' THEN total - paid_amount END),0) AS outstanding,
       COALESCE(SUM(CASE WHEN status = 'delivered' AND due_date < CURDATE() THEN total - paid_amount END),0) AS overdue,
       COUNT(DISTINCT salon_id) AS salons
     FROM purchase_orders WHERE vendor_id = ?`,
    [v.id],
  );
  const series = await q(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, SUM(total) AS value, COUNT(*) AS n FROM purchase_orders WHERE vendor_id = ? AND status <> 'cancelled'
     AND created_at >= CURDATE() - INTERVAL 6 MONTH GROUP BY m ORDER BY m`,
    [v.id],
  );
  const top = await q(
    `SELECT s.name, s.city, SUM(po.total) AS value, COUNT(*) AS orders FROM purchase_orders po JOIN salons s ON s.id = po.salon_id
     WHERE po.vendor_id = ? AND po.status <> 'cancelled' GROUP BY s.id ORDER BY value DESC LIMIT 5`,
    [v.id],
  );
  const extra = {
    promotions: await one('SELECT COUNT(*) AS n, COALESCE(SUM(claims),0) AS claims FROM vendor_promotions WHERE vendor_id = ? AND is_active = 1', [v.id]),
    courses: await one(`SELECT COUNT(DISTINCT c.id) AS n, COUNT(e.id) AS enrolled, SUM(e.completed_at IS NOT NULL) AS completed FROM courses c LEFT JOIN course_enrollments e ON e.course_id = c.id WHERE c.vendor_id = ?`, [v.id]),
    tickets: await one(`SELECT SUM(status <> 'closed') AS open, COUNT(*) AS total FROM service_tickets WHERE vendor_id = ?`, [v.id]),
    codes: await one('SELECT COUNT(*) AS n, COALESCE(SUM(verified_count),0) AS scans, SUM(verified_count >= 4) AS suspicious FROM authenticity_codes WHERE vendor_id = ?', [v.id]),
  };
  res.json({ vendor: v, orders, series, top, ...extra });
});

// ------------------------------------------------------------ Storefront (catalogue, trade pricing, MOQ, schemes)
r.get('/products', async (req, res) => {
  res.json(await q(
    `SELECT vp.*, (SELECT COALESCE(SUM(pi.qty),0) FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id WHERE pi.vendor_product_id = vp.id AND po.status <> 'cancelled') AS units_ordered
     FROM vendor_products vp WHERE vp.vendor_id = ? ORDER BY vp.is_active DESC, vp.category, vp.name`,
    [req.vendor.id],
  ));
});

const VP_FIELDS = ['name', 'brand', 'category', 'unit', 'trade_price', 'mrp', 'moq', 'scheme', 'stock', 'is_active'];
r.post('/products', async (req, res) => {
  need(req.body, 'name', 'trade_price', 'mrp');
  if (Number(req.body.trade_price) > Number(req.body.mrp)) throw bad('Trade price cannot exceed MRP');
  res.status(201).json({ id: await insert('vendor_products', { vendor_id: req.vendor.id, ...pick(req.body, VP_FIELDS) }) });
});
r.patch('/products/:id', async (req, res) => {
  const p = await one('SELECT id FROM vendor_products WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
  if (!p) throw notFound();
  await update('vendor_products', p.id, pick(req.body, VP_FIELDS));
  res.json({ ok: true });
});

// ------------------------------------------------------------ Orders from salons
r.get('/orders', async (req, res) => {
  res.json(await q(
    `SELECT po.*, s.name AS salon_name, s.area, s.city, (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) AS item_count
     FROM purchase_orders po JOIN salons s ON s.id = po.salon_id WHERE po.vendor_id = ? AND po.status <> 'draft' ${req.query.status ? 'AND po.status = ?' : ''}
     ORDER BY FIELD(po.status,'placed','accepted','dispatched','delivered','cancelled'), po.id DESC LIMIT 200`,
    req.query.status ? [req.vendor.id, req.query.status] : [req.vendor.id],
  ));
});

r.get('/orders/:id', async (req, res) => {
  const po = await one(`SELECT po.*, s.name AS salon_name, s.address, s.phone FROM purchase_orders po JOIN salons s ON s.id = po.salon_id WHERE po.id = ? AND po.vendor_id = ? AND po.status <> 'draft'`, [req.params.id, req.vendor.id]);
  if (!po) throw notFound();
  po.items = await q('SELECT * FROM po_items WHERE po_id = ?', [po.id]);
  res.json(po);
});

r.patch('/orders/:id', async (req, res) => {
  const po = await one('SELECT * FROM purchase_orders WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
  if (!po) throw notFound();
  const next = { accept: ['placed', 'accepted'], dispatch: ['accepted', 'dispatched'], reject: ['placed', 'cancelled'] }[req.body.action];
  if (!next || po.status !== next[0]) throw bad(`Cannot ${req.body.action} an order that is ${po.status}`);
  if (req.body.action === 'accept') {
    const acct = await one('SELECT credit_limit FROM vendor_accounts WHERE vendor_id = ? AND salon_id = ?', [req.vendor.id, po.salon_id]);
    const out = await one(`SELECT COALESCE(SUM(total - paid_amount),0) AS o FROM purchase_orders WHERE vendor_id = ? AND salon_id = ? AND status IN ('accepted','dispatched','delivered')`, [req.vendor.id, po.salon_id]);
    if (acct && Number(out.o) + Number(po.total) > Number(acct.credit_limit) && !req.body.override)
      throw bad(`Order exceeds the salon's credit limit (₹${acct.credit_limit}, outstanding ₹${round2(out.o)})`, { creditLimit: true });
  }
  await update('purchase_orders', po.id, { status: next[1] });
  await notifySalonAdmins(po.salon_id, `Order ${po.po_no} ${next[1]}`, `${req.vendor.name} ${next[1]} your order`, 'inventory?tab=orders');
  res.json({ ok: true });
});

// ------------------------------------------------------------ Credit & collections
r.get('/credit', async (req, res) => {
  const rows = await q(
    `SELECT s.id AS salon_id, s.name, s.area, s.city, s.phone, va.credit_limit, va.credit_days,
       COALESCE(SUM(CASE WHEN po.status = 'delivered' THEN po.total - po.paid_amount END),0) AS outstanding,
       COALESCE(SUM(CASE WHEN po.status = 'delivered' AND po.due_date < CURDATE() THEN po.total - po.paid_amount END),0) AS overdue,
       MAX(CASE WHEN po.status = 'delivered' AND po.paid_amount < po.total THEN DATEDIFF(CURDATE(), po.due_date) END) AS max_days_overdue,
       (SELECT MAX(paid_at) FROM vendor_payments vpay WHERE vpay.vendor_id = ? AND vpay.salon_id = s.id) AS last_payment,
       COALESCE(SUM(CASE WHEN po.status <> 'cancelled' THEN po.total END),0) AS lifetime
     FROM salons s LEFT JOIN vendor_accounts va ON va.salon_id = s.id AND va.vendor_id = ?
     LEFT JOIN purchase_orders po ON po.salon_id = s.id AND po.vendor_id = ?
     WHERE va.id IS NOT NULL OR po.id IS NOT NULL GROUP BY s.id ORDER BY overdue DESC, outstanding DESC`,
    [req.vendor.id, req.vendor.id, req.vendor.id],
  );
  // Salon health signal for credit decisions: last-30-day billed sales from Salon OS (consented)
  for (const r0 of rows) {
    const s = await one(`SELECT COALESCE(SUM(total),0) AS sales FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at >= CURDATE() - INTERVAL 30 DAY`, [r0.salon_id]);
    r0.sales_30d = round2(s.sales);
    r0.suggested_limit = Math.round((s.sales * 0.15) / 1000) * 1000;
  }
  res.json(rows);
});

r.post('/credit', async (req, res) => {
  const b = need(req.body, 'salon_id', 'credit_limit');
  await q(
    `INSERT INTO vendor_accounts (vendor_id, salon_id, credit_limit, credit_days) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE credit_limit = VALUES(credit_limit), credit_days = VALUES(credit_days)`,
    [req.vendor.id, b.salon_id, b.credit_limit, b.credit_days || 30],
  );
  res.json({ ok: true });
});

r.post('/credit/:salonId/remind', async (req, res) => {
  const s = await one('SELECT id, name, phone FROM salons WHERE id = ?', [req.params.salonId]);
  const due = await one(`SELECT COALESCE(SUM(total - paid_amount),0) AS d FROM purchase_orders WHERE vendor_id = ? AND salon_id = ? AND status = 'delivered'`, [req.vendor.id, s.id]);
  if (!due.d) throw bad('Nothing outstanding');
  await sendMessage({ salonId: s.id, to: s.phone, name: s.name, template: 'collection_reminder', refType: 'vendor', refId: req.vendor.id, body: `${req.vendor.name}: ₹${round2(due.d)} is outstanding on your account. Pay by UPI in SaloonBaba → Inventory → Orders. Thank you!` });
  res.json({ ok: true });
});

r.post('/payments', async (req, res) => {
  const b = need(req.body, 'po_id', 'amount');
  const po = await one('SELECT * FROM purchase_orders WHERE id = ? AND vendor_id = ?', [b.po_id, req.vendor.id]);
  if (!po) throw notFound();
  const amount = Math.min(Number(b.amount), round2(po.total - po.paid_amount));
  if (amount <= 0) throw bad('Nothing due on this order');
  await q('UPDATE purchase_orders SET paid_amount = paid_amount + ? WHERE id = ?', [amount, po.id]);
  await insert('vendor_payments', { vendor_id: req.vendor.id, salon_id: po.salon_id, po_id: po.id, amount, mode: b.mode || 'upi', ref: b.ref || null, paid_at: now() });
  res.json({ ok: true, amount });
});

// ------------------------------------------------------------ Sell-through & usage insights (aggregated)
r.get('/insights', async (req, res) => {
  const v = req.vendor;
  const sellIn = await q(
    `SELECT vp.name, vp.brand, SUM(pi.qty) AS units, SUM(pi.amount) AS value, COUNT(DISTINCT po.salon_id) AS salons
     FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id JOIN vendor_products vp ON vp.id = pi.vendor_product_id
     WHERE vp.vendor_id = ? AND po.status <> 'cancelled' AND po.created_at >= CURDATE() - INTERVAL 90 DAY GROUP BY vp.id ORDER BY value DESC`,
    [v.id],
  );
  // Sell-through to consumers and back-bar usage in salons (from Salon OS)
  const sellOut = await q(
    `SELECT vp.name, s.city, -SUM(CASE WHEN m.type = 'sale' THEN m.qty ELSE 0 END) AS retail_units, -SUM(CASE WHEN m.type = 'backbar' THEN m.qty ELSE 0 END) AS backbar_units
     FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN vendor_products vp ON vp.id = p.vendor_product_id JOIN salons s ON s.id = m.salon_id
     WHERE vp.vendor_id = ? AND m.created_at >= CURDATE() - INTERVAL 90 DAY AND m.type IN ('sale','backbar') GROUP BY vp.id, s.city ORDER BY retail_units DESC`,
    [v.id],
  );
  const byCity = await q(
    `SELECT s.city, COUNT(DISTINCT s.id) AS salons, SUM(po.total) AS value FROM purchase_orders po JOIN salons s ON s.id = po.salon_id
     WHERE po.vendor_id = ? AND po.status <> 'cancelled' GROUP BY s.city ORDER BY value DESC`,
    [v.id],
  );
  const services = await q(
    `SELECT s.city, sv.category, COUNT(*) AS services FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN services sv ON sv.id = ii.ref_id
     JOIN salons s ON s.id = i.salon_id WHERE ii.item_type = 'service' AND i.created_at >= CURDATE() - INTERVAL 30 DAY GROUP BY s.city, sv.category ORDER BY services DESC LIMIT 20`,
  );
  res.json({ sell_in: sellIn, sell_out: sellOut, by_city: byCity, service_trends: services, note: 'Aggregated from salons that consented to share anonymised usage data.' });
});

// ------------------------------------------------------------ Promotions & sampling
r.get('/promotions', async (req, res) => {
  const rows = await q('SELECT * FROM vendor_promotions WHERE vendor_id = ? ORDER BY id DESC', [req.vendor.id]);
  for (const p of rows)
    p.claimed_by = await q('SELECT s.name, s.city, c.created_at FROM promotion_claims c JOIN salons s ON s.id = c.salon_id WHERE c.promotion_id = ? ORDER BY c.id DESC', [p.id]);
  const reach = await q(`SELECT city, plan, COUNT(*) AS salons FROM salons WHERE is_active = 1 GROUP BY city, plan ORDER BY city`);
  res.json({ rows, reach });
});

r.post('/promotions', async (req, res) => {
  const b = need(req.body, 'title');
  const id = await insert('vendor_promotions', {
    vendor_id: req.vendor.id, ...pick(b, ['title', 'description', 'target_city', 'target_plan', 'scheme', 'starts_on', 'ends_on']),
    target_city: b.target_city || null, target_plan: b.target_plan || null, starts_on: b.starts_on || today(), ends_on: b.ends_on || ymd(addDays(today(), 30)),
  });
  const salons = await q(`SELECT id FROM salons WHERE is_active = 1 ${b.target_city ? 'AND city = ?' : ''} ${b.target_plan ? 'AND plan = ?' : ''}`, [b.target_city, b.target_plan].filter(Boolean));
  for (const s of salons) await notifySalonAdmins(s.id, `Offer from ${req.vendor.name}`, b.title, 'inventory?tab=promotions');
  res.status(201).json({ id, reached: salons.length });
});

r.patch('/promotions/:id', async (req, res) => {
  await q('UPDATE vendor_promotions SET is_active = ? WHERE id = ? AND vendor_id = ?', [req.body.is_active ? 1 : 0, req.params.id, req.vendor.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Education marketplace (academies & brands)
r.get('/courses', async (req, res) => {
  const rows = await q(
    `SELECT c.*, COUNT(e.id) AS enrolled, SUM(e.completed_at IS NOT NULL) AS completed FROM courses c LEFT JOIN course_enrollments e ON e.course_id = c.id
     WHERE c.vendor_id = ? GROUP BY c.id ORDER BY c.id DESC`,
    [req.vendor.id],
  );
  res.json(rows.map((c) => ({ ...c, lessons: parseJson(c.lessons, []) })));
});

r.post('/courses', async (req, res) => {
  const b = need(req.body, 'title', 'lessons');
  const lessons = (b.lessons || []).filter((l) => l.title && l.content);
  if (!lessons.length) throw bad('Add at least one lesson');
  const id = await insert('courses', {
    vendor_id: req.vendor.id, title: b.title, category: b.category || 'Technique', level: b.level || 'basic', duration_min: b.duration_min || lessons.length * 4,
    lessons: JSON.stringify(lessons), badge_name: b.badge_name || null, price: b.price || 0,
  });
  res.status(201).json({ id });
});

// ------------------------------------------------------------ Equipment service (warranty, AMC, tickets)
r.get('/service', async (req, res) => {
  const tickets = await q(
    `SELECT t.*, e.name AS equipment, e.serial_no, s.name AS salon_name, s.area, s.phone FROM service_tickets t JOIN equipment e ON e.id = t.equipment_id
     JOIN salons s ON s.id = t.salon_id WHERE t.vendor_id = ? ORDER BY FIELD(t.status,'open','scheduled','closed'), t.id DESC`,
    [req.vendor.id],
  );
  const installed = await q(
    `SELECT e.*, s.name AS salon_name, (e.amc_until IS NOT NULL AND e.amc_until <= CURDATE() + INTERVAL 45 DAY) AS amc_due,
       (e.warranty_until < CURDATE() AND (e.amc_until IS NULL OR e.amc_until < CURDATE())) AS upgrade_lead
     FROM equipment e JOIN salons s ON s.id = e.salon_id WHERE e.vendor_id = ? ORDER BY e.amc_until`,
    [req.vendor.id],
  );
  res.json({ tickets, installed });
});

r.patch('/service/:id', async (req, res) => {
  const t = await one('SELECT * FROM service_tickets WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
  if (!t) throw notFound();
  const data = pick(req.body, ['status', 'visit_on', 'resolution']);
  if (data.status === 'closed') data.resolved_at = now();
  await update('service_tickets', t.id, data);
  await notifySalonAdmins(t.salon_id, `Service ticket ${data.status || 'updated'}`, data.visit_on ? `Technician visit on ${data.visit_on}` : data.resolution || '', 'inventory?tab=equipment');
  res.json({ ok: true });
});

r.post('/service/amc-reminders', async (req, res) => {
  const due = await q(
    `SELECT e.*, s.name AS salon_name, s.phone FROM equipment e JOIN salons s ON s.id = e.salon_id
     WHERE e.vendor_id = ? AND e.amc_until IS NOT NULL AND e.amc_until <= CURDATE() + INTERVAL 45 DAY`,
    [req.vendor.id],
  );
  for (const e of due)
    await sendMessage({ salonId: e.salon_id, to: e.phone, name: e.salon_name, template: 'amc_reminder', refType: 'equipment', refId: e.id, body: `${req.vendor.name}: AMC for your ${e.name} (${e.serial_no}) ends on ${e.amc_until}. Renew to keep free service visits.` });
  res.json({ sent: due.length });
});

// ------------------------------------------------------------ Authenticity (batch / QR codes)
r.get('/codes', async (req, res) => {
  const summary = await q(
    `SELECT vp.id, vp.name, COUNT(ac.id) AS codes, COALESCE(SUM(ac.verified_count),0) AS scans, SUM(ac.verified_count >= 4) AS suspicious, MAX(ac.batch_no) AS last_batch
     FROM vendor_products vp LEFT JOIN authenticity_codes ac ON ac.vendor_product_id = vp.id WHERE vp.vendor_id = ? GROUP BY vp.id ORDER BY codes DESC`,
    [req.vendor.id],
  );
  const recent = await q(
    `SELECT ac.code, ac.batch_no, ac.verified_count, ac.last_verified_at, vp.name FROM authenticity_codes ac JOIN vendor_products vp ON vp.id = ac.vendor_product_id
     WHERE ac.vendor_id = ? ORDER BY ac.last_verified_at IS NULL, ac.last_verified_at DESC, ac.id DESC LIMIT 30`,
    [req.vendor.id],
  );
  res.json({ summary, recent });
});

r.post('/codes', async (req, res) => {
  const b = need(req.body, 'vendor_product_id', 'count');
  const vp = await one('SELECT * FROM vendor_products WHERE id = ? AND vendor_id = ?', [b.vendor_product_id, req.vendor.id]);
  if (!vp) throw notFound();
  const count = Math.min(500, Math.max(1, Number(b.count)));
  const batch = b.batch_no || `B${Date.now().toString(36).toUpperCase()}`;
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = `SB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await insert('authenticity_codes', { vendor_id: req.vendor.id, vendor_product_id: vp.id, code, batch_no: batch, mfg_date: b.mfg_date || today(), expiry_date: b.expiry_date || ymd(addDays(today(), 730)) });
    codes.push(code);
  }
  res.status(201).json({ batch_no: batch, codes });
});

export default r;

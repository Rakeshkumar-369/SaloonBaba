import { Router } from 'express';
import { q, one, insert, update, tx } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { salonKpis, staffLeaderboard } from '../services/kpi.js';
import { pnl } from '../services/finance.js';
import { sendMessage, notifySalonAdmins, notifyUser } from '../services/notify.js';
import { bad, need, notFound, forbidden, now, today, ymd, addDays, range, monthRange, ym, round2, haversineKm, pick, parseJson } from '../util.js';

const r = Router();
r.use(requireRole('franchisor', 'area_manager'));

/** Resolve the brand this HQ user works on. */
r.use(async (req, _res, next) => {
  const brands = req.user.role === 'admin'
    ? await q('SELECT * FROM brands')
    : req.user.role === 'franchisor'
      ? await q('SELECT * FROM brands WHERE owner_user_id = ?', [req.user.id])
      : await q('SELECT b.* FROM brands b JOIN brand_members m ON m.brand_id = b.id WHERE m.user_id = ?', [req.user.id]);
  if (!brands.length) throw forbidden('No brand linked to this account');
  req.brand = brands.find((b) => b.id === Number(req.query.brand_id || req.headers['x-brand-id'])) || brands[0];
  req.brands = brands;
  req.isHq = req.user.role !== 'area_manager';
  next();
});

const hqOnly = (req, _res, next) => {
  if (!req.isHq) throw forbidden('Only brand HQ can do this');
  next();
};

const outletsOf = (brandId) =>
  q(
    `SELECT s.id, s.name, s.slug, s.area, s.city, s.lat, s.lng, s.hygiene_score, s.rating, s.rating_count, u.name AS franchisee, u.phone AS franchisee_phone
     FROM salons s JOIN users u ON u.id = s.owner_user_id WHERE s.brand_id = ? AND s.is_active = 1 ORDER BY s.city, s.name`,
    [brandId],
  );

/** Network dashboard: every outlet's KPIs side by side, ranked. */
r.get('/overview', async (req, res) => {
  const { from, to } = range(req.query, 30);
  const outlets = await outletsOf(req.brand.id);
  const rows = [];
  for (const o of outlets) {
    const k = await salonKpis(o.id, from, to);
    const audit = await one('SELECT score, audit_date FROM audits WHERE salon_id = ? ORDER BY audit_date DESC LIMIT 1', [o.id]);
    const openActions = await one(`SELECT COUNT(*) AS n FROM audit_actions WHERE salon_id = ? AND status <> 'closed'`, [o.id]);
    rows.push({ ...o, kpi: k, audit_score: audit?.score ?? null, audit_date: audit?.audit_date ?? null, open_actions: openActions.n });
  }
  // Composite score for ranking: retention, rebooking, retail, utilisation, rating, hygiene
  const score = (o) => Math.round(
    o.kpi.second_visit_rate * 0.25 + o.kpi.rebooking_rate * 0.2 + Math.min(30, o.kpi.retail_pct) * 0.5 + o.kpi.utilisation * 0.15 +
    (o.rating || 0) * 4 + (o.hygiene_score || 0) * 0.1,
  );
  rows.forEach((o) => { o.score = score(o); });
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((o, i) => { o.rank = i + 1; });
  const total = outlets.length ? await salonKpis(outlets.map((o) => o.id), from, to) : null;
  const royalty = await one(
    `SELECT COALESCE(SUM(CASE WHEN status='due' THEN total END),0) AS due, COALESCE(SUM(CASE WHEN status='paid' THEN total END),0) AS collected,
       SUM(status='due' AND due_date < CURDATE()) AS overdue FROM royalty_invoices WHERE brand_id = ?`,
    [req.brand.id],
  );
  const leads = await one(
    `SELECT COUNT(*) AS total, SUM(status IN ('new','assigned')) AS pending, SUM(status = 'booked') AS booked FROM leads WHERE brand_id = ? AND created_at >= ?`,
    [req.brand.id, `${from} 00:00:00`],
  );
  const alerts = [];
  for (const o of rows) {
    if (o.kpi.second_visit_rate && o.kpi.second_visit_rate < 45) alerts.push({ salon: o.name, text: `2nd-visit return ${Math.round(o.kpi.second_visit_rate)}% (network avg ${Math.round(total?.second_visit_rate || 0)}%)` });
    if (o.hygiene_score < 80) alerts.push({ salon: o.name, text: `Hygiene score ${o.hygiene_score}` });
    if (o.kpi.discount_pct > 12) alerts.push({ salon: o.name, text: `Discounts at ${Math.round(o.kpi.discount_pct * 10) / 10}% of gross sales` });
    if (o.open_actions > 2) alerts.push({ salon: o.name, text: `${o.open_actions} audit actions still open` });
  }
  res.json({ brand: req.brand, brands: req.brands, is_hq: req.isHq, from, to, outlets: rows, total, royalty, leads, alerts });
});

/** Drill-down to one outlet and its stylists. */
r.get('/outlets/:id', async (req, res) => {
  const o = await one('SELECT * FROM salons WHERE id = ? AND brand_id = ?', [req.params.id, req.brand.id]);
  if (!o) throw notFound();
  const { from, to } = range(req.query, 30);
  const [kpi, staff, p] = await Promise.all([salonKpis(o.id, from, to), staffLeaderboard(o.id, from, to), pnl(o.id, from, to)]);
  const audits = await q('SELECT a.*, u.name AS auditor FROM audits a JOIN users u ON u.id = a.auditor_id WHERE a.salon_id = ? ORDER BY audit_date DESC LIMIT 5', [o.id]);
  const actions = await q(`SELECT * FROM audit_actions WHERE salon_id = ? ORDER BY FIELD(status,'open','in_progress','closed'), due_date`, [o.id]);
  res.json({ outlet: o, kpi, staff, pnl: req.isHq ? { net_sales: p.revenue.net_sales, royalty: p.costs.royalty, marketing_fee: p.costs.marketing_fee } : null, audits, actions });
});

// ------------------------------------------------------------ Royalty engine
r.get('/royalty', hqOnly, async (req, res) => {
  const rows = await q(
    `SELECT ri.*, s.name AS salon_name, s.area, u.name AS franchisee FROM royalty_invoices ri JOIN salons s ON s.id = ri.salon_id JOIN users u ON u.id = s.owner_user_id
     WHERE ri.brand_id = ? ${req.query.month ? 'AND ri.month = ?' : ''} ORDER BY ri.month DESC, s.name`,
    req.query.month ? [req.brand.id, req.query.month] : [req.brand.id],
  );
  res.json({ brand: req.brand, rows });
});

r.post('/royalty/generate', hqOnly, async (req, res) => {
  const month = req.body.month || ym(addDays(today(), -28));
  if (month >= ym()) throw bad('Royalty is generated after the month closes');
  const { from, to } = monthRange(month);
  const outlets = await outletsOf(req.brand.id);
  let created = 0;
  for (const o of outlets) {
    const sales = await one(`SELECT COALESCE(SUM(taxable),0) AS net FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ?`, [o.id, `${from} 00:00:00`, `${to} 23:59:59`]);
    const royalty = round2((sales.net * req.brand.royalty_pct) / 100);
    const fee = round2((sales.net * req.brand.marketing_fee_pct) / 100);
    const res0 = await q(
      `INSERT INTO royalty_invoices (brand_id, salon_id, month, net_sales, royalty_pct, royalty_amount, marketing_fee, total, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,'due',?) ON DUPLICATE KEY UPDATE net_sales = IF(status='due', VALUES(net_sales), net_sales),
       royalty_amount = IF(status='due', VALUES(royalty_amount), royalty_amount), marketing_fee = IF(status='due', VALUES(marketing_fee), marketing_fee),
       total = IF(status='due', VALUES(total), total)`,
      [req.brand.id, o.id, month, round2(sales.net), req.brand.royalty_pct, royalty, fee, round2(royalty + fee), ymd(addDays(to, 10))],
    );
    if (res0.affectedRows === 1) {
      created++;
      await notifySalonAdmins(o.id, `Royalty invoice ${month}`, `₹${round2(royalty + fee)} due by ${ymd(addDays(to, 10))}`, 'finance?tab=royalty');
    }
  }
  res.json({ month, created });
});

r.post('/royalty/:id/mark-paid', hqOnly, async (req, res) => {
  await q(`UPDATE royalty_invoices SET status = 'paid', paid_at = ? WHERE id = ? AND brand_id = ?`, [now(), req.params.id, req.brand.id]);
  res.json({ ok: true });
});

r.post('/royalty/:id/remind', hqOnly, async (req, res) => {
  const ri = await one(
    `SELECT ri.*, s.name, u.phone, u.name AS owner FROM royalty_invoices ri JOIN salons s ON s.id = ri.salon_id JOIN users u ON u.id = s.owner_user_id WHERE ri.id = ? AND ri.brand_id = ?`,
    [req.params.id, req.brand.id],
  );
  if (!ri) throw notFound();
  await sendMessage({ salonId: ri.salon_id, to: ri.phone, name: ri.owner, template: 'royalty_reminder', refType: 'royalty', refId: ri.id, body: `${req.brand.name}: royalty of ₹${ri.total} for ${ri.month} (${ri.name}) is due on ${ri.due_date}. Pay by UPI from Salon OS → Finance → Royalty.` });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Central catalogue & pricing
r.get('/catalogue', async (req, res) => {
  const items = await q(
    `SELECT bs.*, (SELECT COUNT(*) FROM services s WHERE s.brand_service_id = bs.id AND s.is_active = 1) AS outlets_live,
       (SELECT COUNT(*) FROM services s WHERE s.brand_service_id = bs.id AND s.price <> bs.price) AS overrides,
       (SELECT MIN(s.price) FROM services s WHERE s.brand_service_id = bs.id) AS min_price, (SELECT MAX(s.price) FROM services s WHERE s.brand_service_id = bs.id) AS max_price
     FROM brand_services bs WHERE bs.brand_id = ? ORDER BY bs.category, bs.price`,
    [req.brand.id],
  );
  const outlets = await one('SELECT COUNT(*) AS n FROM salons WHERE brand_id = ? AND is_active = 1', [req.brand.id]);
  res.json({ items, outlet_count: outlets.n });
});

r.post('/catalogue', hqOnly, async (req, res) => {
  const b = need(req.body, 'name', 'category', 'price', 'duration_min');
  const id = await insert('brand_services', { brand_id: req.brand.id, ...pick(b, ['name', 'category', 'price', 'duration_min', 'cycle_days', 'gender', 'tags', 'allow_override']) });
  res.status(201).json({ id });
});

r.patch('/catalogue/:id', hqOnly, async (req, res) => {
  const bs = await one('SELECT * FROM brand_services WHERE id = ? AND brand_id = ?', [req.params.id, req.brand.id]);
  if (!bs) throw notFound();
  await update('brand_services', bs.id, pick(req.body, ['name', 'category', 'price', 'duration_min', 'cycle_days', 'gender', 'tags', 'allow_override', 'is_active']));
  res.json({ ok: true });
});

/** Push the central menu to every outlet. Locked items overwrite local price; others keep local overrides. */
r.post('/catalogue/push', hqOnly, async (req, res) => {
  const items = await q('SELECT * FROM brand_services WHERE brand_id = ?', [req.brand.id]);
  const outlets = await outletsOf(req.brand.id);
  let added = 0;
  let updated = 0;
  await tx(async (conn) => {
    for (const o of outlets) {
      for (const bs of items) {
        const s = await one('SELECT * FROM services WHERE salon_id = ? AND brand_service_id = ?', [o.id, bs.id], conn);
        if (!s && bs.is_active) {
          await insert('services', { salon_id: o.id, brand_service_id: bs.id, name: bs.name, category: bs.category, price: bs.price, duration_min: bs.duration_min, cycle_days: bs.cycle_days, gender: bs.gender, tags: bs.tags }, conn);
          added++;
        } else if (s) {
          const data = { duration_min: bs.duration_min, cycle_days: bs.cycle_days, category: bs.category, is_active: bs.is_active };
          if (!bs.allow_override) Object.assign(data, { name: bs.name, price: bs.price });
          await update('services', s.id, data, conn);
          updated++;
        }
      }
    }
  });
  for (const o of outlets) await notifySalonAdmins(o.id, 'Brand menu updated', `${req.brand.name} HQ pushed the latest service menu and prices.`, 'settings?tab=menu');
  res.json({ added, updated, outlets: outlets.length });
});

// ------------------------------------------------------------ National offers & SOP checklists
r.get('/offers', async (req, res) => {
  res.json(await q(
    `SELECT o.*, (SELECT COUNT(*) FROM invoices i WHERE i.offer_id = o.id AND i.status = 'paid') AS redemptions,
       (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.offer_id = o.id AND i.status = 'paid') AS revenue
     FROM offers o WHERE o.brand_id = ? AND o.salon_id IS NULL ORDER BY o.id DESC`,
    [req.brand.id],
  ));
});

r.post('/offers', hqOnly, async (req, res) => {
  const b = need(req.body, 'title', 'code', 'type', 'value');
  const id = await insert('offers', {
    brand_id: req.brand.id, code: String(b.code).toUpperCase(),
    ...pick(b, ['title', 'description', 'type', 'value', 'min_bill', 'first_visit_only', 'happy_hour', 'days', 'start_time', 'end_time', 'valid_from', 'valid_to']),
  });
  for (const o of await outletsOf(req.brand.id)) await notifySalonAdmins(o.id, 'New national offer', `${b.title} (code ${String(b.code).toUpperCase()})`, 'marketing?tab=offers');
  res.status(201).json({ id });
});

r.patch('/offers/:id', hqOnly, async (req, res) => {
  await q('UPDATE offers SET is_active = ? WHERE id = ? AND brand_id = ?', [req.body.is_active ? 1 : 0, req.params.id, req.brand.id]);
  res.json({ ok: true });
});

r.get('/sop', async (req, res) => {
  const t = await q('SELECT * FROM checklist_templates WHERE brand_id = ?', [req.brand.id]);
  const compliance = await q(
    `SELECT s.id, s.name, s.hygiene_score, COUNT(cr.id) AS runs_14d, ROUND(AVG(cr.score)) AS avg_score FROM salons s
     LEFT JOIN checklist_runs cr ON cr.salon_id = s.id AND cr.run_date >= CURDATE() - INTERVAL 14 DAY
     WHERE s.brand_id = ? GROUP BY s.id ORDER BY avg_score`,
    [req.brand.id],
  );
  res.json({ templates: t.map((x) => ({ ...x, items: parseJson(x.items, []) })), compliance });
});

r.post('/sop', hqOnly, async (req, res) => {
  const b = need(req.body, 'name', 'kind', 'items');
  const items = (Array.isArray(b.items) ? b.items : String(b.items).split('\n')).map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) throw bad('Add checklist items');
  res.status(201).json({ id: await insert('checklist_templates', { brand_id: req.brand.id, name: b.name, kind: b.kind, items: JSON.stringify(items) }) });
});

// ------------------------------------------------------------ Digital audits (area manager app)
export const AUDIT_TEMPLATE = [
  { section: 'Hygiene', items: ['Tools sterilised (UV/autoclave log up to date)', 'Fresh towel per client, used towels binned', 'Stations wiped between clients', 'Washroom clean and stocked'] },
  { section: 'Service SOP', items: ['Consultation done before service', 'Patch test recorded for colour', 'Service steps followed as per brand SOP', 'Home-care recommendation given'] },
  { section: 'Brand standards', items: ['Uniform and name badge', 'Price menu displayed and matches system', 'Only brand-approved products on back bar', 'National offer communicated'] },
  { section: 'Front desk', items: ['Every client billed in system', 'Walk-in queue tokens used', 'Rebooking offered at checkout', 'Cash closing done previous day'] },
];

r.get('/audit-template', (_req, res) => res.json(AUDIT_TEMPLATE));

r.get('/audits', async (req, res) => {
  const audits = await q(
    `SELECT a.id, a.audit_date, a.score, a.summary, s.name AS salon_name, s.id AS salon_id, u.name AS auditor,
       (SELECT COUNT(*) FROM audit_actions x WHERE x.audit_id = a.id AND x.status <> 'closed') AS open_actions
     FROM audits a JOIN salons s ON s.id = a.salon_id JOIN users u ON u.id = a.auditor_id WHERE a.brand_id = ? ORDER BY a.audit_date DESC LIMIT 100`,
    [req.brand.id],
  );
  const actions = await q(
    `SELECT x.*, s.name AS salon_name, a.audit_date FROM audit_actions x JOIN audits a ON a.id = x.audit_id JOIN salons s ON s.id = x.salon_id
     WHERE a.brand_id = ? ORDER BY FIELD(x.status,'open','in_progress','closed'), x.due_date LIMIT 200`,
    [req.brand.id],
  );
  res.json({ audits, actions, outlets: await outletsOf(req.brand.id) });
});

r.get('/audits/:id', async (req, res) => {
  const a = await one('SELECT a.*, s.name AS salon_name, u.name AS auditor FROM audits a JOIN salons s ON s.id = a.salon_id JOIN users u ON u.id = a.auditor_id WHERE a.id = ? AND a.brand_id = ?', [req.params.id, req.brand.id]);
  if (!a) throw notFound();
  a.items = parseJson(a.items, []);
  a.actions = await q('SELECT * FROM audit_actions WHERE audit_id = ?', [a.id]);
  res.json(a);
});

r.post('/audits', async (req, res) => {
  const b = need(req.body, 'salon_id', 'items');
  const o = await one('SELECT * FROM salons WHERE id = ? AND brand_id = ?', [b.salon_id, req.brand.id]);
  if (!o) throw notFound('Outlet not found');
  const items = b.items.map((i) => ({ section: i.section, label: i.label, result: ['pass', 'partial', 'fail'].includes(i.result) ? i.result : 'fail', note: i.note || '' }));
  const pts = { pass: 2, partial: 1, fail: 0 };
  const score = Math.round((items.reduce((t, i) => t + pts[i.result], 0) / Math.max(1, items.length * 2)) * 100);
  const id = await tx(async (conn) => {
    const aid = await insert('audits', { brand_id: req.brand.id, salon_id: o.id, auditor_id: req.user.id, audit_date: b.audit_date || today(), score, items: JSON.stringify(items), summary: b.summary || null }, conn);
    const actions = (b.actions || []).filter((x) => x.title);
    for (const i of items.filter((x) => x.result === 'fail' && !actions.some((a) => a.title === x.label))) actions.push({ title: `Fix: ${i.label}`, due_date: ymd(addDays(today(), 7)) });
    for (const a of actions) await insert('audit_actions', { audit_id: aid, salon_id: o.id, title: a.title.slice(0, 200), due_date: a.due_date || ymd(addDays(today(), 7)) }, conn);
    return aid;
  });
  await notifySalonAdmins(o.id, `Audit score ${score}%`, `${req.user.name} audited ${o.name}. Open action items need closure.`, 'checklists?tab=audits');
  res.status(201).json({ id, score });
});

r.patch('/actions/:id', async (req, res) => {
  const x = await one('SELECT x.* FROM audit_actions x JOIN audits a ON a.id = x.audit_id WHERE x.id = ? AND a.brand_id = ?', [req.params.id, req.brand.id]);
  if (!x) throw notFound();
  const status = req.body.status;
  if (!['open', 'in_progress', 'closed'].includes(status)) throw bad('Invalid status');
  await update('audit_actions', x.id, { status, closed_at: status === 'closed' ? now() : null });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Central procurement
r.get('/procurement', async (req, res) => {
  const approved = await q(
    `SELECT bvp.id, bvp.negotiated_price, vp.id AS vendor_product_id, vp.name, vp.brand, vp.category, vp.trade_price, vp.mrp, v.name AS vendor_name, v.id AS vendor_id,
       ROUND((1 - bvp.negotiated_price / vp.trade_price) * 100, 1) AS saving_pct
     FROM brand_vendor_prices bvp JOIN vendor_products vp ON vp.id = bvp.vendor_product_id JOIN vendors v ON v.id = vp.vendor_id
     WHERE bvp.brand_id = ? ORDER BY v.name, vp.name`,
    [req.brand.id],
  );
  const catalogue = await q(
    `SELECT vp.id, vp.name, vp.brand, vp.category, vp.trade_price, v.name AS vendor_name FROM vendor_products vp JOIN vendors v ON v.id = vp.vendor_id
     WHERE vp.is_active = 1 AND v.type IN ('distributor','brand') ORDER BY v.name, vp.name`,
  );
  const volume = await q(
    `SELECT v.name AS vendor_name, COUNT(po.id) AS orders, COALESCE(SUM(po.total),0) AS value, s.name AS salon_name FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id JOIN salons s ON s.id = po.salon_id WHERE s.brand_id = ? AND po.status <> 'cancelled' AND po.created_at >= CURDATE() - INTERVAL 90 DAY
     GROUP BY v.id, s.id ORDER BY value DESC`,
    [req.brand.id],
  );
  res.json({ approved, catalogue, volume });
});

r.post('/procurement', hqOnly, async (req, res) => {
  const b = need(req.body, 'vendor_product_id', 'negotiated_price');
  await q(
    `INSERT INTO brand_vendor_prices (brand_id, vendor_product_id, negotiated_price) VALUES (?,?,?) ON DUPLICATE KEY UPDATE negotiated_price = VALUES(negotiated_price)`,
    [req.brand.id, b.vendor_product_id, b.negotiated_price],
  );
  res.status(201).json({ ok: true });
});

r.delete('/procurement/:id', hqOnly, async (req, res) => {
  await q('DELETE FROM brand_vendor_prices WHERE id = ? AND brand_id = ?', [req.params.id, req.brand.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Lead routing
r.get('/leads', async (req, res) => {
  const rows = await q(
    `SELECT l.*, s.name AS salon_name, TIMESTAMPDIFF(MINUTE, l.created_at, COALESCE(l.contacted_at, NOW())) AS response_min
     FROM leads l LEFT JOIN salons s ON s.id = l.salon_id WHERE l.brand_id = ? ${req.query.status ? 'AND l.status = ?' : ''} ORDER BY l.created_at DESC LIMIT 200`,
    req.query.status ? [req.brand.id, req.query.status] : [req.brand.id],
  );
  const byOutlet = await q(
    `SELECT s.name, COUNT(l.id) AS leads, SUM(l.status = 'booked') AS booked, SUM(l.status IN ('new','assigned')) AS pending,
       ROUND(AVG(CASE WHEN l.contacted_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, l.created_at, l.contacted_at) END)) AS avg_response_min
     FROM salons s LEFT JOIN leads l ON l.salon_id = s.id WHERE s.brand_id = ? GROUP BY s.id ORDER BY leads DESC`,
    [req.brand.id],
  );
  res.json({ rows, by_outlet: byOutlet });
});

async function routeLead(brandId, lead) {
  const outlets = await outletsOf(brandId);
  if (!outlets.length) return null;
  let best = outlets.find((o) => lead.area && o.area?.toLowerCase() === String(lead.area).toLowerCase());
  if (!best && lead.lat && lead.lng) best = [...outlets].sort((a, b) => haversineKm(lead.lat, lead.lng, a.lat, a.lng) - haversineKm(lead.lat, lead.lng, b.lat, b.lng))[0];
  if (!best && lead.city) best = outlets.find((o) => o.city === lead.city);
  return best || outlets[0];
}

r.post('/leads', async (req, res) => {
  const b = need(req.body, 'name', 'phone');
  const lead = { ...b, lat: b.lat ? Number(b.lat) : null, lng: b.lng ? Number(b.lng) : null };
  const outlet = await routeLead(req.brand.id, lead);
  const id = await insert('leads', {
    brand_id: req.brand.id, salon_id: outlet?.id || null, name: b.name, phone: String(b.phone).replace(/\D/g, '').slice(-10), city: b.city || outlet?.city,
    area: b.area || null, lat: lead.lat, lng: lead.lng, service_interest: b.service_interest || null, source: b.source || 'instagram',
    status: outlet ? 'assigned' : 'new', assigned_at: outlet ? now() : null, created_at: now(),
  });
  if (outlet) await notifySalonAdmins(outlet.id, 'New lead from brand campaign', `${b.name} · ${b.service_interest || 'enquiry'} — call within 30 min`, 'marketing?tab=leads');
  res.status(201).json({ id, routed_to: outlet?.name || null });
});

r.post('/leads/:id/reassign', hqOnly, async (req, res) => {
  const o = await one('SELECT id FROM salons WHERE id = ? AND brand_id = ?', [req.body.salon_id, req.brand.id]);
  if (!o) throw notFound('Outlet not found');
  await q(`UPDATE leads SET salon_id = ?, status = 'assigned', assigned_at = ? WHERE id = ? AND brand_id = ?`, [o.id, now(), req.params.id, req.brand.id]);
  await notifySalonAdmins(o.id, 'Lead reassigned to you', 'Brand HQ routed a lead to your outlet', 'marketing?tab=leads');
  res.json({ ok: true });
});

// ------------------------------------------------------------ Training & certification
r.get('/training', async (req, res) => {
  const courses = await q(
    `SELECT c.*, (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrolled,
       (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.completed_at IS NOT NULL) AS completed
     FROM courses c WHERE c.brand_id = ? OR (c.vendor_id IS NOT NULL AND c.is_published = 1) ORDER BY c.brand_id IS NULL, c.id DESC`,
    [req.brand.id],
  );
  const byOutlet = await q(
    `SELECT s.name, COUNT(DISTINCT ss.user_id) AS staff, COUNT(e.id) AS enrollments, SUM(e.completed_at IS NOT NULL) AS completed,
       (SELECT COUNT(*) FROM user_badges b JOIN salon_staff s2 ON s2.user_id = b.user_id WHERE s2.salon_id = s.id) AS badges
     FROM salons s JOIN salon_staff ss ON ss.salon_id = s.id AND ss.is_active = 1 LEFT JOIN course_enrollments e ON e.user_id = ss.user_id
     WHERE s.brand_id = ? GROUP BY s.id ORDER BY s.name`,
    [req.brand.id],
  );
  res.json({ courses: courses.map((c) => ({ ...c, lessons: parseJson(c.lessons, []) })), by_outlet: byOutlet });
});

r.post('/courses', hqOnly, async (req, res) => {
  const b = need(req.body, 'title', 'lessons');
  const lessons = (Array.isArray(b.lessons) ? b.lessons : []).filter((l) => l.title && l.content);
  if (!lessons.length) throw bad('Add at least one lesson');
  const id = await insert('courses', {
    brand_id: req.brand.id, title: b.title, category: b.category || 'SOP', level: b.level || 'basic', duration_min: b.duration_min || lessons.length * 3,
    lessons: JSON.stringify(lessons), badge_name: b.badge_name || null,
  });
  res.status(201).json({ id });
});

r.post('/courses/:id/assign', hqOnly, async (req, res) => {
  const c = await one('SELECT * FROM courses WHERE id = ? AND (brand_id = ? OR vendor_id IS NOT NULL)', [req.params.id, req.brand.id]);
  if (!c) throw notFound();
  const levelFilter = req.body.level ? 'AND ss.level = ?' : '';
  const staff = await q(
    `SELECT DISTINCT ss.user_id FROM salon_staff ss JOIN salons s ON s.id = ss.salon_id WHERE s.brand_id = ? AND ss.is_active = 1 ${levelFilter}`,
    req.body.level ? [req.brand.id, req.body.level] : [req.brand.id],
  );
  let n = 0;
  for (const s of staff) {
    const r0 = await q('INSERT IGNORE INTO course_enrollments (course_id, user_id, assigned_by, done_lessons) VALUES (?,?,?,?)', [c.id, s.user_id, req.user.id, '[]']);
    if (r0.affectedRows) {
      n++;
      await notifyUser(s.user_id, 'New course assigned', `${c.title} — ${c.duration_min} min`, 'learn');
    }
  }
  res.json({ assigned: n });
});

export default r;

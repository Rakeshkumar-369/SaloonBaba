import { Router } from 'express';
import { q, one, update } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { integrationsStatus } from '../config.js';
import { runAll } from '../services/automations.js';
import { PLANS } from './public.js';
import { bad, notFound, pick, round2 } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

r.get('/overview', async (_req, res) => {
  const stats = await one(
    `SELECT (SELECT COUNT(*) FROM salons) AS salons, (SELECT COUNT(*) FROM salons WHERE is_active = 1) AS active_salons,
       (SELECT COUNT(*) FROM brands) AS brands, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
       (SELECT COUNT(*) FROM vendors) AS vendors, (SELECT COUNT(*) FROM appointments WHERE created_at >= CURDATE() - INTERVAL 30 DAY) AS bookings_30d,
       (SELECT COUNT(*) FROM appointments WHERE source = 'app' AND created_at >= CURDATE() - INTERVAL 30 DAY) AS app_bookings_30d,
       (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status = 'paid' AND created_at >= CURDATE() - INTERVAL 30 DAY) AS gmv_30d,
       (SELECT COUNT(*) FROM demo_requests WHERE status = 'new') AS new_leads,
       (SELECT COUNT(*) FROM message_log WHERE created_at >= CURDATE() - INTERVAL 1 DAY) AS messages_24h`,
  );
  const plans = await q('SELECT plan, COUNT(*) AS n FROM salons WHERE is_active = 1 GROUP BY plan');
  const price = Object.fromEntries(PLANS.map((p) => [p.id, p.price || 0]));
  const mrr = plans.reduce((t, p) => t + (p.plan === 'franchise' ? 1999 : price[p.plan]) * p.n, 0);
  const byCity = await q(`SELECT city, COUNT(*) AS salons FROM salons GROUP BY city ORDER BY salons DESC`);
  res.json({ stats: { ...stats, mrr: round2(mrr) }, plans, by_city: byCity, integrations: integrationsStatus() });
});

r.get('/salons', async (_req, res) => {
  res.json(await q(
    `SELECT s.id, s.name, s.city, s.area, s.plan, s.is_active, s.rating, s.hygiene_score, s.created_at, u.name AS owner, u.phone AS owner_phone, b.name AS brand,
       (SELECT COUNT(*) FROM salon_staff ss WHERE ss.salon_id = s.id AND ss.is_active = 1) AS staff,
       (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.salon_id = s.id AND i.status = 'paid' AND i.created_at >= CURDATE() - INTERVAL 30 DAY) AS gmv_30d,
       (SELECT MAX(created_at) FROM invoices i WHERE i.salon_id = s.id) AS last_bill
     FROM salons s JOIN users u ON u.id = s.owner_user_id LEFT JOIN brands b ON b.id = s.brand_id ORDER BY s.id`,
  ));
});

r.patch('/salons/:id', async (req, res) => {
  const data = pick(req.body, ['plan', 'is_active']);
  if (data.plan && !PLANS.some((p) => p.id === data.plan)) throw bad('Unknown plan');
  await update('salons', req.params.id, data);
  res.json({ ok: true });
});

r.get('/users', async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  res.json(await q(
    `SELECT id, name, email, phone, role, city, is_active, last_login_at, created_at FROM users
     WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?) ${req.query.role ? 'AND role = ?' : ''} ORDER BY id DESC LIMIT 100`,
    [s, s, s, ...(req.query.role ? [req.query.role] : [])],
  ));
});

r.patch('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw bad('You cannot disable yourself');
  await update('users', req.params.id, pick(req.body, ['is_active']));
  res.json({ ok: true });
});

r.get('/demo-requests', async (_req, res) => res.json(await q('SELECT * FROM demo_requests ORDER BY id DESC LIMIT 200')));

r.patch('/demo-requests/:id', async (req, res) => {
  const d = await one('SELECT id FROM demo_requests WHERE id = ?', [req.params.id]);
  if (!d) throw notFound();
  await update('demo_requests', d.id, pick(req.body, ['status']));
  res.json({ ok: true });
});

r.get('/messages', async (req, res) => {
  res.json(await q(
    `SELECT m.*, s.name AS salon_name FROM message_log m LEFT JOIN salons s ON s.id = m.salon_id
     ${req.query.channel ? 'WHERE m.channel = ?' : ''} ORDER BY m.id DESC LIMIT 200`,
    req.query.channel ? [req.query.channel] : [],
  ));
});

r.post('/automations/run', async (_req, res) => res.json(await runAll()));

export default r;

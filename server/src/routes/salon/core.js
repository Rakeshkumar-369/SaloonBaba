import { Router } from 'express';
import { q, one, insert, update } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { integrationsStatus } from '../../config.js';
import { salonKpis, revenueSeries, staffLeaderboard, nudges } from '../../services/kpi.js';
import { bad, need, pick, today, ymd, addDays, daysBetween, range } from '../../util.js';

const r = Router({ mergeParams: true });

/** KPI home screen for owner/manager. */
r.get('/dashboard', async (req, res) => {
  const id = req.salon.id;
  const { from, to } = range(req.query, 30);
  const span = daysBetween(from, to) + 1;
  const prevTo = ymd(addDays(from, -1));
  const prevFrom = ymd(addDays(prevTo, -(span - 1)));
  const t = today();
  const [kpi, prev, todayKpi, series, leaders, tips] = await Promise.all([
    salonKpis(id, from, to), salonKpis(id, prevFrom, prevTo), salonKpis(id, t, t), revenueSeries(id, from, to),
    staffLeaderboard(id, from, to), nudges(id),
  ]);
  const counts = await one(
    `SELECT
      (SELECT COUNT(*) FROM appointments WHERE salon_id = ? AND DATE(start_at) = CURDATE() AND status NOT IN ('cancelled')) AS appts_today,
      (SELECT COUNT(*) FROM appointments WHERE salon_id = ? AND DATE(start_at) = CURDATE() AND status IN ('booked','confirmed')) AS upcoming_today,
      (SELECT COUNT(*) FROM queue_tokens WHERE salon_id = ? AND DATE(joined_at) = CURDATE() AND status = 'waiting') AS queue_waiting,
      (SELECT COUNT(*) FROM approval_requests WHERE salon_id = ? AND status = 'pending') AS approvals,
      (SELECT COUNT(*) FROM products WHERE salon_id = ? AND is_active = 1 AND stock_qty <= reorder_level) AS low_stock,
      (SELECT COUNT(*) FROM leave_requests WHERE salon_id = ? AND status = 'pending') AS leave_pending,
      (SELECT COUNT(*) FROM reviews WHERE salon_id = ? AND stage = 'private') AS private_feedback,
      (SELECT COUNT(*) FROM attendance WHERE salon_id = ? AND date = CURDATE() AND status IN ('present','late')) AS staff_present,
      (SELECT COUNT(*) FROM salon_staff WHERE salon_id = ? AND is_active = 1) AS staff_total`,
    Array(9).fill(id),
  );
  res.json({ salon: req.salon, access: req.access, from, to, kpi, prev, today: todayKpi, series, leaders: leaders.slice(0, 5), nudges: tips, counts });
});

// ------------------------------------------------------------ Settings
r.get('/settings', async (req, res) => {
  const brand = req.salon.brand_id ? await one('SELECT id, name, royalty_pct, marketing_fee_pct FROM brands WHERE id = ?', [req.salon.brand_id]) : null;
  const chairs = await q('SELECT * FROM chairs WHERE salon_id = ? ORDER BY id', [req.salon.id]);
  res.json({ salon: req.salon, brand, chairs, access: req.access, integrations: integrationsStatus() });
});

r.patch('/settings', allow(), async (req, res) => {
  const data = pick(req.body, [
    'name', 'tagline', 'description', 'address', 'area', 'phone', 'whatsapp', 'gender_type', 'price_level', 'open_time', 'close_time',
    'women_staff', 'home_service', 'private_rooms', 'gst_number', 'upi_id', 'deposit_pct', 'deposit_min_duration', 'discount_limit_pct', 'gold_partner',
  ]);
  if (data.deposit_pct !== undefined && (data.deposit_pct < 0 || data.deposit_pct > 100)) throw bad('Deposit % must be 0–100');
  await update('salons', req.salon.id, data);
  res.json(await one('SELECT * FROM salons WHERE id = ?', [req.salon.id]));
});

r.post('/chairs', allow('manager'), async (req, res) => {
  const { name } = need(req.body, 'name');
  res.status(201).json({ id: await insert('chairs', { salon_id: req.salon.id, name, type: req.body.type || 'chair' }) });
});
r.delete('/chairs/:id', allow('manager'), async (req, res) => {
  await q('DELETE FROM chairs WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Service menu
r.get('/services', async (req, res) => {
  const rows = await q(
    `SELECT s.*, bs.allow_override, bs.price AS brand_price,
       (SELECT COUNT(*) FROM service_recipes sr WHERE sr.service_id = s.id) AS recipe_items,
       (SELECT COUNT(*) FROM staff_services st WHERE st.service_id = s.id) AS skilled_staff
     FROM services s LEFT JOIN brand_services bs ON bs.id = s.brand_service_id
     WHERE s.salon_id = ? ${req.query.all ? '' : 'AND s.is_active = 1'} ORDER BY s.category, s.price`,
    [req.salon.id],
  );
  res.json(rows);
});

r.post('/services', allow('manager'), async (req, res) => {
  const b = need(req.body, 'name', 'category', 'price', 'duration_min');
  const id = await insert('services', {
    salon_id: req.salon.id, ...pick(b, ['name', 'category', 'price', 'duration_min', 'cycle_days', 'gender', 'tags', 'description']),
  });
  res.status(201).json({ id });
});

r.patch('/services/:id', allow('manager'), async (req, res) => {
  const s = await one(
    'SELECT s.*, bs.allow_override FROM services s LEFT JOIN brand_services bs ON bs.id = s.brand_service_id WHERE s.id = ? AND s.salon_id = ?',
    [req.params.id, req.salon.id],
  );
  if (!s) throw bad('Service not found');
  const data = pick(req.body, ['name', 'category', 'price', 'duration_min', 'cycle_days', 'gender', 'tags', 'description', 'is_active']);
  if (s.brand_service_id && s.allow_override === 0 && (data.price !== undefined || data.name !== undefined))
    throw bad('Price and name are set by brand HQ for this service');
  await update('services', s.id, data);
  res.json({ ok: true });
});

export default r;

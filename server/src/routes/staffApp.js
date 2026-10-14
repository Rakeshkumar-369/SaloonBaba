import { Router } from 'express';
import { q, one, insert, update } from '../db.js';
import { upload, filePath } from '../upload.js';
import { computeEarnings, CAREER_LADDER } from '../services/payroll.js';
import { sendMessage, notifySalonAdmins, notifyUser } from '../services/notify.js';
import {
  bad, need, notFound, forbidden, now, today, ym, ymd, addDays, maskPhone, haversineKm, minutesOf, hm, pct, round2, parseJson,
} from '../util.js';
import { config } from '../config.js';

const r = Router();

/** Resolve the staff membership for the logged-in stylist/manager. */
r.use(async (req, _res, next) => {
  const rows = await q(
    `SELECT ss.*, s.name AS salon_name, s.lat, s.lng, s.brand_id, s.open_time, s.close_time, s.whatsapp FROM salon_staff ss JOIN salons s ON s.id = ss.salon_id
     WHERE ss.user_id = ? AND ss.is_active = 1 ORDER BY ss.id`,
    [req.user.id],
  );
  if (!rows.length) throw forbidden('No active salon membership for this account');
  req.me = rows.find((x) => x.id === Number(req.query.staff_id || req.headers['x-staff-id'])) || rows[0];
  next();
});

r.get('/home', async (req, res) => {
  const me = req.me;
  const appts = await q(
    `SELECT a.id, a.start_at, a.end_at, a.status, a.notes, a.source, c.id AS client_id, c.name AS client_name, c.visits, c.allergies,
       c.colour_formula, c.notes AS client_notes, c.no_show_count,
       (SELECT GROUP_CONCAT(sv.name SEPARATOR ', ') FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
       (SELECT GROUP_CONCAT(ii.name SEPARATOR ', ') FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id
          WHERE i.client_id = c.id AND i.status = 'paid' AND i.id = (SELECT MAX(id) FROM invoices WHERE client_id = c.id AND status = 'paid')) AS last_services
     FROM appointments a JOIN clients c ON c.id = a.client_id
     WHERE a.staff_id = ? AND DATE(a.start_at) = CURDATE() AND a.status NOT IN ('cancelled') ORDER BY a.start_at`,
    [me.id],
  );
  const queue = await q(
    `SELECT id, token_no, name, status, joined_at FROM queue_tokens WHERE salon_id = ? AND staff_id = ? AND status IN ('waiting','serving') AND DATE(joined_at) = CURDATE()`,
    [me.salon_id, me.id],
  );
  const shift = await one('SELECT * FROM roster WHERE staff_id = ? AND date = CURDATE()', [me.id]);
  const att = await one('SELECT * FROM attendance WHERE staff_id = ? AND date = CURDATE()', [me.id]);
  const todayEarn = await one(
    `SELECT COALESCE(SUM(ii.commission_amount),0) AS comm, COALESCE(SUM(CASE WHEN ii.item_type='service' THEN ii.amount END),0) AS service_rev, COUNT(DISTINCT i.id) AS bills
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.staff_id = ? AND i.status = 'paid' AND DATE(i.created_at) = CURDATE()`,
    [me.id],
  );
  const tipsToday = await one(`SELECT COALESCE(SUM(tip_amount),0) AS t FROM invoices WHERE tip_staff_id = ? AND status = 'paid' AND DATE(created_at) = CURDATE()`, [me.id]);
  const month = await computeEarnings(me, ym(), { live: true });
  const unread = await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({
    me: { id: me.id, name: req.user.name, salon_id: me.salon_id, salon_name: me.salon_name, level: me.level, title: me.title, hue: me.hue, rating: me.rating, role: me.role },
    appointments: appts, queue, shift, attendance: att,
    today: { commission: round2(todayEarn.comm), service_revenue: round2(todayEarn.service_rev), bills: todayEarn.bills, tips: round2(tipsToday.t) },
    month: { net: month.net, gross: month.gross, target_progress: month.target_progress, to_next_slab: month.to_next_slab, next_slab: month.next_slab },
    unread: unread.n,
  });
});

// ------------------------------------------------------------ Attendance (selfie + location)
r.post('/attendance/check-in', upload.single('selfie'), async (req, res) => {
  const me = req.me;
  const existing = await one('SELECT * FROM attendance WHERE staff_id = ? AND date = CURDATE()', [me.id]);
  if (existing?.check_in) throw bad('Already checked in today');
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  const distance = Number.isFinite(lat) && lat !== 0 && me.lat ? Math.round(haversineKm(lat, lng, me.lat, me.lng) * 1000) : null;
  if (distance !== null && distance > 500 && !req.body.force) throw bad(`You seem to be ${distance} m from the salon. Check in when you reach.`, { distance });
  const shift = await one('SELECT shift_start FROM roster WHERE staff_id = ? AND date = CURDATE()', [me.id]);
  const start = shift?.shift_start || me.open_time;
  const late = minutesOf(hm(new Date())) > minutesOf(start) + 10;
  const data = {
    check_in: now(), lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, distance_m: distance,
    selfie_path: filePath(req.file), status: late ? 'late' : 'present',
  };
  if (existing) await update('attendance', existing.id, data);
  else await insert('attendance', { staff_id: me.id, salon_id: me.salon_id, date: today(), ...data });
  res.json({ ok: true, status: data.status, distance_m: distance });
});

r.post('/attendance/check-out', async (req, res) => {
  const a = await one('SELECT * FROM attendance WHERE staff_id = ? AND date = CURDATE()', [req.me.id]);
  if (!a?.check_in) throw bad('Check in first');
  await update('attendance', a.id, { check_out: now() });
  res.json({ ok: true });
});

r.get('/attendance', async (req, res) => {
  const month = req.query.month || ym();
  const rows = await q(`SELECT * FROM attendance WHERE staff_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date DESC`, [req.me.id, month]);
  const sum = (s) => rows.filter((r) => r.status === s).length;
  res.json({ month, rows, summary: { present: sum('present'), late: sum('late'), absent: sum('absent'), leave: sum('leave') } });
});

// ------------------------------------------------------------ Roster, leave, swaps
r.get('/roster', async (req, res) => {
  const start = req.query.week_start || ymd(addDays(today(), -((new Date().getDay() + 6) % 7)));
  const end = ymd(addDays(start, 13));
  const mine = await q('SELECT * FROM roster WHERE staff_id = ? AND date BETWEEN ? AND ? ORDER BY date', [req.me.id, start, end]);
  const team = await q(
    `SELECT ss.id, u.name, ss.level FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? AND ss.is_active = 1 AND ss.id <> ? ORDER BY u.name`,
    [req.me.salon_id, req.me.id],
  );
  const requests = await q(
    `SELECT l.*, u.name AS swap_with FROM leave_requests l LEFT JOIN salon_staff s2 ON s2.id = l.swap_with_staff_id LEFT JOIN users u ON u.id = s2.user_id
     WHERE l.staff_id = ? ORDER BY l.id DESC LIMIT 20`,
    [req.me.id],
  );
  res.json({ week_start: start, shifts: mine, team, requests, open_time: req.me.open_time, close_time: req.me.close_time });
});

r.post('/leave', async (req, res) => {
  const b = need(req.body, 'type', 'from_date');
  if (!['leave', 'swap', 'shift_change'].includes(b.type)) throw bad('Invalid request type');
  if (b.type === 'swap' && !b.swap_with_staff_id) throw bad('Pick a colleague to swap with');
  const id = await insert('leave_requests', {
    staff_id: req.me.id, salon_id: req.me.salon_id, type: b.type, from_date: b.from_date, to_date: b.to_date || b.from_date,
    swap_with_staff_id: b.swap_with_staff_id || null, reason: b.reason || null,
  });
  await notifySalonAdmins(req.me.salon_id, `${b.type === 'swap' ? 'Shift swap' : 'Leave'} request`, `${req.user.name}: ${b.from_date}${b.to_date && b.to_date !== b.from_date ? ` – ${b.to_date}` : ''}`, 'staff?tab=leave');
  res.status(201).json({ id });
});

// ------------------------------------------------------------ Live earnings wallet
r.get('/earnings', async (req, res) => {
  const month = req.query.month || ym();
  const e = await computeEarnings(req.me, month, { live: month === ym() });
  const daily = await q(
    `SELECT DATE(i.created_at) AS d, SUM(ii.commission_amount) AS commission, SUM(CASE WHEN ii.item_type='service' THEN ii.amount ELSE 0 END) AS service_rev,
       SUM(CASE WHEN ii.item_type='product' THEN ii.amount ELSE 0 END) AS retail
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.staff_id = ? AND i.status = 'paid' AND DATE_FORMAT(i.created_at, '%Y-%m') = ?
     GROUP BY DATE(i.created_at) ORDER BY d DESC`,
    [req.me.id, month],
  );
  const lines = await q(
    `SELECT i.created_at, i.invoice_no, ii.name, ii.item_type, ii.amount, ii.commission_amount FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE ii.staff_id = ? AND i.status = 'paid' AND DATE_FORMAT(i.created_at, '%Y-%m') = ? ORDER BY i.created_at DESC LIMIT 60`,
    [req.me.id, month],
  );
  const payslips = await q('SELECT * FROM payslips WHERE staff_id = ? ORDER BY month DESC LIMIT 6', [req.me.id]);
  const advances = await q('SELECT * FROM advances WHERE staff_id = ? ORDER BY given_on DESC LIMIT 10', [req.me.id]);
  res.json({ ...e, daily, lines, payslips, advances_list: advances });
});

// ------------------------------------------------------------ Client book (masked)
r.get('/clients', async (req, res) => {
  const s = req.query.q ? `%${req.query.q}%` : '%';
  const rows = await q(
    `SELECT c.id, c.name, c.phone, c.visits, c.last_visit, c.allergies, c.colour_formula,
       (SELECT MAX(i.created_at) FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id WHERE i.client_id = c.id AND ii.staff_id = ?) AS my_last
     FROM clients c WHERE c.salon_id = ? AND c.name LIKE ? AND (c.preferred_staff_id = ? OR EXISTS
       (SELECT 1 FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.client_id = c.id AND ii.staff_id = ?))
     ORDER BY my_last DESC LIMIT 100`,
    [req.me.id, req.me.salon_id, s, req.me.id, req.me.id],
  );
  res.json(rows.map((c) => ({ ...c, phone: maskPhone(c.phone) })));
});

r.post('/clients/:id/message', async (req, res) => {
  const { body } = need(req.body, 'body');
  const c = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [req.params.id, req.me.salon_id]);
  if (!c) throw notFound();
  const out = await sendMessage({ salonId: req.me.salon_id, to: c.phone, name: c.name, template: 'stylist_message', refType: 'client', refId: c.id, body: `${String(body).slice(0, 800)} — ${req.user.name.split(' ')[0]}, ${req.me.salon_name}` });
  res.json(out);
});

r.patch('/clients/:id/notes', async (req, res) => {
  const c = await one('SELECT id FROM clients WHERE id = ? AND salon_id = ?', [req.params.id, req.me.salon_id]);
  if (!c) throw notFound();
  const data = {};
  for (const k of ['colour_formula', 'allergies', 'notes']) if (req.body[k] !== undefined) data[k] = String(req.body[k]).slice(0, 255);
  await update('clients', c.id, data);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Prescribe home-care products
r.get('/products', async (req, res) => {
  res.json(await q(
    `SELECT id, name, brand, category, mrp, stock_qty FROM products WHERE salon_id = ? AND kind IN ('retail','both') AND is_active = 1 ORDER BY category, name`,
    [req.me.salon_id],
  ));
});

r.post('/prescriptions', async (req, res) => {
  const b = need(req.body, 'client_id', 'product_ids');
  const c = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [b.client_id, req.me.salon_id]);
  if (!c) throw notFound('Client not found');
  const products = await q(`SELECT * FROM products WHERE salon_id = ? AND id IN (?) AND kind IN ('retail','both')`, [req.me.salon_id, b.product_ids]);
  if (!products.length) throw bad('Pick at least one product');
  for (const p of products)
    await insert('prescriptions', { salon_id: req.me.salon_id, client_id: c.id, staff_id: req.me.id, product_id: p.id, note: b.note || null, created_at: now() });
  await sendMessage({
    salonId: req.me.salon_id, to: c.phone, name: c.name, template: 'homecare_card', refType: 'client', refId: c.id,
    body: `Your home-care card from ${req.user.name.split(' ')[0]} at ${req.me.salon_name}:\n${products.map((p) => `• ${p.name} — ₹${p.mrp}`).join('\n')}${b.note ? `\nTip: ${b.note}` : ''}\nAdd to your bill at the counter or order in the app: ${config.appUrl}/app/shop`,
  });
  res.status(201).json({ ok: true, count: products.length, products: products.map((p) => ({ id: p.id, name: p.name, mrp: p.mrp })) });
});

// ------------------------------------------------------------ Portfolio & reviews
r.get('/portfolio', async (req, res) => {
  const items = await q('SELECT * FROM portfolio WHERE staff_id = ? ORDER BY created_at DESC', [req.me.id]);
  const reviews = await q(
    `SELECT r.overall, r.r_result, r.r_behaviour, r.comment, r.stage, r.created_at, c.name AS client_name FROM reviews r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.staff_id = ? ORDER BY r.created_at DESC LIMIT 30`,
    [req.me.id],
  );
  res.json({ items, reviews, rating: req.me.rating, rating_count: req.me.rating_count });
});

r.post('/portfolio', upload.single('image'), async (req, res) => {
  const { title } = need(req.body, 'title');
  const id = await insert('portfolio', {
    staff_id: req.me.id, title: String(title).slice(0, 120), category: req.body.category || null, image_path: filePath(req.file),
    before_hue: Math.floor(Math.random() * 360), after_hue: Math.floor(Math.random() * 360), created_at: now(),
  });
  res.status(201).json({ id });
});

r.delete('/portfolio/:id', async (req, res) => {
  await q('DELETE FROM portfolio WHERE id = ? AND staff_id = ?', [req.params.id, req.me.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Learn: lessons, badges, career ladder
r.get('/learn', async (req, res) => {
  const courses = await q(
    `SELECT c.*, v.name AS vendor_name, b.name AS brand_name, e.progress, e.completed_at, e.done_lessons, e.assigned_by IS NOT NULL AS assigned
     FROM courses c LEFT JOIN vendors v ON v.id = c.vendor_id LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN course_enrollments e ON e.course_id = c.id AND e.user_id = ?
     WHERE c.is_published = 1 AND (c.brand_id IS NULL OR c.brand_id = ?) ORDER BY e.completed_at IS NOT NULL, assigned DESC, c.id`,
    [req.user.id, req.me.brand_id || 0],
  );
  const badges = await q('SELECT name, source, awarded_at FROM user_badges WHERE user_id = ? ORDER BY awarded_at DESC', [req.user.id]);
  // Career ladder progress
  const from = ymd(addDays(today(), -90));
  const stats = await one(
    `SELECT COUNT(DISTINCT i.id) AS bills, COUNT(DISTINCT a.rebooked_from_invoice_id) AS rebooked FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     LEFT JOIN appointments a ON a.rebooked_from_invoice_id = i.id
     WHERE ii.staff_id = ? AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at >= ?`,
    [req.me.id, from],
  );
  const step = CAREER_LADDER.find((s) => s.from === req.me.level);
  const months = req.me.joined_on ? Math.floor((Date.now() - new Date(req.me.joined_on).getTime()) / (30 * 86400000)) : 0;
  const rebookPct = pct(stats.rebooked, stats.bills);
  const ladder = step
    ? {
        current: req.me.level, next: step.to,
        checks: [
          { label: `Rebooking ≥ ${step.rules.rebook_pct}%`, value: `${rebookPct}%`, done: rebookPct >= step.rules.rebook_pct, progress: Math.min(100, pct(rebookPct, step.rules.rebook_pct)) },
          { label: `Rating ≥ ${step.rules.rating}`, value: String(req.me.rating), done: req.me.rating >= step.rules.rating, progress: Math.min(100, pct(req.me.rating, step.rules.rating)) },
          { label: `${step.rules.badges} skill badges`, value: String(badges.length), done: badges.length >= step.rules.badges, progress: Math.min(100, pct(badges.length, step.rules.badges)) },
          { label: `${step.rules.months} months tenure`, value: `${months} mo`, done: months >= step.rules.months, progress: Math.min(100, pct(months, step.rules.months)) },
        ],
      }
    : { current: req.me.level, next: null, checks: [] };
  res.json({ courses: courses.map((c) => ({ ...c, lessons: parseJson(c.lessons, []), done_lessons: parseJson(c.done_lessons, []) })), badges, ladder });
});

r.post('/learn/:courseId/lessons/:idx/complete', async (req, res) => {
  const c = await one('SELECT * FROM courses WHERE id = ? AND is_published = 1', [req.params.courseId]);
  if (!c) throw notFound();
  const lessons = parseJson(c.lessons, []);
  const idx = Number(req.params.idx);
  if (!(idx >= 0 && idx < lessons.length)) throw bad('Lesson not found');
  const lesson = lessons[idx];
  if (lesson.quiz && Number(req.body.answer) !== Number(lesson.quiz.answer)) throw bad('Not quite — read the lesson again and retry');
  let e = await one('SELECT * FROM course_enrollments WHERE course_id = ? AND user_id = ?', [c.id, req.user.id]);
  if (!e) {
    await insert('course_enrollments', { course_id: c.id, user_id: req.user.id, done_lessons: '[]' });
    e = await one('SELECT * FROM course_enrollments WHERE course_id = ? AND user_id = ?', [c.id, req.user.id]);
  }
  const done = new Set(parseJson(e.done_lessons, []));
  done.add(idx);
  const progress = Math.round((done.size / lessons.length) * 100);
  const completed = progress >= 100;
  await update('course_enrollments', e.id, { done_lessons: JSON.stringify([...done]), progress, completed_at: completed ? e.completed_at || now() : null });
  let badge = null;
  if (completed && c.badge_name) {
    await q('INSERT IGNORE INTO user_badges (user_id, name, source, awarded_at) VALUES (?,?,?,?)', [req.user.id, c.badge_name, 'course', now()]);
    badge = c.badge_name;
  }
  res.json({ progress, completed, badge });
});

// ------------------------------------------------------------ Recognition: weekly leaderboard
r.get('/recognition', async (req, res) => {
  const from = ymd(addDays(today(), -((new Date().getDay() + 6) % 7)));
  const fromDt = `${from} 00:00:00`;
  const board = await q(
    `SELECT ss.id, u.name, ss.level, ss.hue, ss.rating,
       COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at >= ?),0) AS service_revenue,
       COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'product' AND i.status = 'paid' AND i.created_at >= ?),0) AS retail,
       (SELECT COUNT(DISTINCT i.id) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at >= ?) AS clients
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id
     WHERE ss.salon_id = ? AND ss.is_active = 1 AND ss.role = 'stylist' ORDER BY service_revenue DESC`,
    [fromDt, fromDt, fromDt, req.me.salon_id],
  );
  const badges = await q('SELECT name, source, awarded_at FROM user_badges WHERE user_id = ? ORDER BY awarded_at DESC', [req.user.id]);
  res.json({
    week_start: from, board, me: req.me.id, badges,
    awards: [
      { title: 'Top earner', staff: board[0]?.name || '-' },
      { title: 'Retail star', staff: [...board].sort((a, b) => b.retail - a.retail)[0]?.name || '-' },
      { title: 'Most clients', staff: [...board].sort((a, b) => b.clients - a.clients)[0]?.name || '-' },
    ],
  });
});

// ------------------------------------------------------------ Voice (anonymous feedback to owner)
r.post('/voice', async (req, res) => {
  const { message } = need(req.body, 'message');
  const id = await insert('staff_voice', {
    salon_id: req.me.salon_id, user_id: req.body.anonymous ? null : req.user.id, category: req.body.category || 'other', message: String(message).slice(0, 1000),
  });
  const salon = await one('SELECT owner_user_id FROM salons WHERE id = ?', [req.me.salon_id]);
  await notifyUser(salon.owner_user_id, 'New staff feedback', req.body.anonymous ? 'Anonymous' : req.user.name, 'staff?tab=voice');
  res.status(201).json({ id });
});

r.get('/voice', async (req, res) => {
  res.json(await q('SELECT * FROM staff_voice WHERE user_id = ? ORDER BY id DESC LIMIT 20', [req.user.id]));
});

export default r;

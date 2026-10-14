import { Router } from 'express';
import { q, one, insert, update, tx } from '../db.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { bad, need, notFound, now, today, round2, haversineKm, minutesOf, hm, token, parseLocal } from '../util.js';
import { getSlots, pickStylist, queueStatus, appointmentEnd, isFree } from '../services/availability.js';
import { startPayment } from '../services/payments.js';
import { sendMessage, notifySalonAdmins } from '../services/notify.js';
import { recordReview, salonReviews } from '../services/reviews.js';

const r = Router();

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const isOpenNow = (s) => nowMin() >= minutesOf(s.open_time) && nowMin() < minutesOf(s.close_time);

/** Live happy-hour offers active right now for a salon. */
async function liveOffers(salon) {
  const offers = await q(
    `SELECT * FROM offers WHERE is_active = 1 AND (salon_id = ? OR (brand_id IS NOT NULL AND brand_id = ?))
     AND (valid_from IS NULL OR valid_from <= CURDATE()) AND (valid_to IS NULL OR valid_to >= CURDATE())`,
    [salon.id, salon.brand_id || 0],
  );
  const d = new Date();
  return offers.map((o) => {
    let live = true;
    if (o.happy_hour) {
      const days = String(o.days || '').split(',').filter(Boolean).map(Number);
      const m = minutesOf(hm(d));
      live = (!days.length || days.includes(d.getDay())) && (!o.start_time || (m >= minutesOf(o.start_time) && m < minutesOf(o.end_time)));
    }
    return { ...o, live_now: live };
  });
}

// ---------------------------------------------------------------- Discover
r.get('/salons', optionalAuth, async (req, res) => {
  const { city, gender, q: search, service, open_now, women_staff, home_service, hygiene, offers, price, min_rating, sort, lat, lng } = req.query;
  const where = ['s.is_active = 1'];
  const params = [];
  if (city) { where.push('s.city = ?'); params.push(city); }
  if (gender && gender !== 'any') { where.push("(s.gender_type = ? OR s.gender_type = 'unisex')"); params.push(gender); }
  if (women_staff === '1') where.push('s.women_staff = 1');
  if (home_service === '1') where.push('s.home_service = 1');
  if (hygiene === '1') where.push('s.hygiene_score >= 85');
  if (price) { where.push('s.price_level <= ?'); params.push(Number(price)); }
  if (min_rating) { where.push('s.rating >= ?'); params.push(Number(min_rating)); }
  const need = (search || service || '').trim();
  if (need) {
    where.push(`(s.name LIKE ? OR s.area LIKE ? OR s.tagline LIKE ? OR EXISTS (SELECT 1 FROM services sv WHERE sv.salon_id = s.id AND sv.is_active = 1
      AND (sv.name LIKE ? OR sv.tags LIKE ? OR sv.category LIKE ?)) OR EXISTS (SELECT 1 FROM salon_staff st WHERE st.salon_id = s.id AND st.specialities LIKE ?))`);
    const like = `%${need}%`;
    params.push(like, like, like, like, like, like, like);
  }
  if (offers === '1') where.push('EXISTS (SELECT 1 FROM offers o WHERE (o.salon_id = s.id OR o.brand_id = s.brand_id) AND o.is_active = 1)');
  let rows = await q(
    `SELECT s.id, s.name, s.slug, s.tagline, s.area, s.city, s.lat, s.lng, s.gender_type, s.price_level, s.open_time, s.close_time,
       s.women_staff, s.home_service, s.private_rooms, s.hygiene_score, s.rating, s.rating_count, s.hue, s.gold_partner, b.name AS brand_name,
       (SELECT MIN(price) FROM services sv WHERE sv.salon_id = s.id AND sv.is_active = 1) AS min_price,
       (SELECT COUNT(*) FROM offers o WHERE (o.salon_id = s.id OR (o.brand_id IS NOT NULL AND o.brand_id = s.brand_id)) AND o.is_active = 1) AS offer_count
     FROM salons s LEFT JOIN brands b ON b.id = s.brand_id WHERE ${where.join(' AND ')}`,
    params,
  );
  rows = rows.map((s) => ({
    ...s, open_now: isOpenNow(s),
    distance_km: lat && lng ? round2(haversineKm(Number(lat), Number(lng), s.lat, s.lng)) : null,
  }));
  if (open_now === '1') rows = rows.filter((s) => s.open_now);
  // Live wait ("seat in X min") for each salon
  for (const s of rows) {
    if (!s.open_now) { s.wait_min = null; continue; }
    const qs = await queueStatus(s.id);
    s.wait_min = qs.wait_min;
    s.queue = qs.waiting;
  }
  const sorters = {
    distance: (a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999),
    rating: (a, b) => b.rating - a.rating,
    wait: (a, b) => (a.wait_min ?? 999) - (b.wait_min ?? 999),
    price: (a, b) => a.price_level - b.price_level,
  };
  rows.sort(sorters[sort] || ((a, b) => b.open_now - a.open_now || b.rating - a.rating));
  let favs = new Set();
  if (req.user) favs = new Set((await q('SELECT salon_id FROM favourites WHERE user_id = ?', [req.user.id])).map((f) => f.salon_id));
  res.json(rows.map((s) => ({ ...s, favourite: favs.has(s.id) })));
});

r.get('/cities', async (_req, res) => {
  res.json((await q('SELECT city, COUNT(*) AS n FROM salons WHERE is_active = 1 GROUP BY city ORDER BY n DESC')).map((c) => c.city));
});

r.get('/salons/:slug', optionalAuth, async (req, res) => {
  const s = await one(
    `SELECT s.*, b.name AS brand_name FROM salons s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.slug = ? OR s.id = ?`,
    [req.params.slug, Number(req.params.slug) || 0],
  );
  if (!s) throw notFound('Salon not found');
  const services = await q('SELECT id, name, category, price, duration_min, gender, description, tags FROM services WHERE salon_id = ? AND is_active = 1 ORDER BY category, price', [s.id]);
  const staff = await q(
    `SELECT ss.id, u.name, u.gender, ss.level, ss.title, ss.specialities, ss.bio, ss.rating, ss.rating_count, ss.hue,
       (SELECT COUNT(*) FROM portfolio p WHERE p.staff_id = ss.id) AS portfolio_count
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? AND ss.is_active = 1 AND ss.role IN ('stylist','manager')
     ORDER BY ss.rating DESC`,
    [s.id],
  );
  const portfolio = await q(
    `SELECT p.*, u.name AS staff_name FROM portfolio p JOIN salon_staff ss ON ss.id = p.staff_id JOIN users u ON u.id = ss.user_id
     WHERE ss.salon_id = ? ORDER BY p.likes DESC LIMIT 12`,
    [s.id],
  );
  const reviews = await salonReviews(s.id, { limit: 15 });
  const breakdown = await one(
    `SELECT AVG(r_result) AS result, AVG(r_hygiene) AS hygiene, AVG(r_wait) AS wait, AVG(r_value) AS value, AVG(r_behaviour) AS behaviour
     FROM reviews WHERE salon_id = ? AND stage = 'public'`,
    [s.id],
  );
  const packages = await q('SELECT id, name, type, price, sessions, value_amount, discount_pct, validity_days, description FROM packages WHERE salon_id = ? AND is_active = 1', [s.id]);
  const queue = await queueStatus(s.id);
  const lastChecklist = await one(`SELECT run_date, score FROM checklist_runs WHERE salon_id = ? ORDER BY run_date DESC LIMIT 1`, [s.id]);
  let favourite = false;
  let lastVisit = null;
  if (req.user) {
    favourite = Boolean(await one('SELECT 1 AS x FROM favourites WHERE user_id = ? AND salon_id = ?', [req.user.id, s.id]));
    lastVisit = await one(
      `SELECT i.id, i.created_at, GROUP_CONCAT(ii.ref_id) AS service_ids, GROUP_CONCAT(ii.name SEPARATOR ', ') AS services, MAX(ii.staff_id) AS staff_id
       FROM invoices i JOIN clients c ON c.id = i.client_id JOIN invoice_items ii ON ii.invoice_id = i.id AND ii.item_type = 'service'
       WHERE c.user_id = ? AND i.salon_id = ? AND i.status = 'paid' GROUP BY i.id ORDER BY i.created_at DESC LIMIT 1`,
      [req.user.id, s.id],
    );
  }
  res.json({
    salon: {
      id: s.id, name: s.name, slug: s.slug, tagline: s.tagline, description: s.description, address: s.address, area: s.area, city: s.city,
      lat: s.lat, lng: s.lng, phone: s.phone, whatsapp: s.whatsapp, gender_type: s.gender_type, price_level: s.price_level,
      open_time: s.open_time, close_time: s.close_time, women_staff: s.women_staff, home_service: s.home_service,
      private_rooms: s.private_rooms, hygiene_score: s.hygiene_score, rating: s.rating, rating_count: s.rating_count, hue: s.hue,
      brand_name: s.brand_name, gold_partner: s.gold_partner, deposit_pct: s.deposit_pct, deposit_min_duration: s.deposit_min_duration,
      open_now: isOpenNow(s), last_checklist: lastChecklist,
    },
    services, staff, portfolio, reviews, breakdown, packages, queue, offers: await liveOffers(s), favourite, last_visit: lastVisit,
  });
});

r.get('/salons/:id/slots', async (req, res) => {
  const serviceIds = String(req.query.services || '').split(',').filter(Boolean).map(Number);
  const date = req.query.date || today();
  res.json(await getSlots({ salonId: Number(req.params.id), date, serviceIds, staffId: req.query.staff_id || null }));
});

r.get('/salons/:id/queue', async (req, res) => {
  const qs = await queueStatus(Number(req.params.id));
  res.json({ ...qs, tokens: qs.tokens.map((t) => ({ token_no: t.token_no, status: t.status, eta_min: t.eta_min, position: t.position })) });
});

r.get('/staff/:id/portfolio', async (req, res) => {
  const staff = await one(
    `SELECT ss.id, u.name, ss.level, ss.title, ss.specialities, ss.bio, ss.rating, ss.rating_count, ss.hue, s.name AS salon_name, s.slug
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id JOIN salons s ON s.id = ss.salon_id WHERE ss.id = ?`,
    [req.params.id],
  );
  if (!staff) throw notFound();
  const items = await q('SELECT * FROM portfolio WHERE staff_id = ? ORDER BY created_at DESC', [staff.id]);
  const reviews = await q(
    `SELECT r.overall, r.comment, r.created_at, c.name AS client_name FROM reviews r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.staff_id = ? AND r.stage = 'public' ORDER BY r.created_at DESC LIMIT 10`,
    [staff.id],
  );
  const badges = await q('SELECT ub.name FROM user_badges ub JOIN salon_staff ss ON ss.user_id = ub.user_id WHERE ss.id = ?', [staff.id]);
  res.json({ staff, items, reviews, badges });
});

// Everything below needs a logged-in customer
r.use(authenticate);

/** Find or create the salon-owned client card for this customer. */
async function clientFor(user, salonId, conn) {
  let c = await one('SELECT * FROM clients WHERE salon_id = ? AND (user_id = ? OR phone = ?) LIMIT 1', [salonId, user.id, user.phone], conn);
  if (!c) {
    const id = await insert('clients', { salon_id: salonId, user_id: user.id, name: user.name, phone: user.phone, gender: user.gender, source: 'app', referral_code: `R${token(3).toUpperCase()}` }, conn);
    c = await one('SELECT * FROM clients WHERE id = ?', [id], conn);
  } else if (!c.user_id) {
    await update('clients', c.id, { user_id: user.id }, conn);
  }
  return c;
}

// ---------------------------------------------------------------- Bookings
r.post('/bookings', async (req, res) => {
  const b = need(req.body, 'salon_id', 'service_ids', 'date', 'time');
  const salon = await one('SELECT * FROM salons WHERE id = ? AND is_active = 1', [b.salon_id]);
  if (!salon) throw notFound('Salon not found');
  const serviceIds = b.service_ids.map(Number);
  const services = await q('SELECT * FROM services WHERE salon_id = ? AND id IN (?) AND is_active = 1', [salon.id, serviceIds]);
  if (services.length !== serviceIds.length) throw bad('Some services are not available');
  const duration = services.reduce((t, s) => t + s.duration_min, 0);
  const price = services.reduce((t, s) => t + Number(s.price), 0);
  const startAt = `${b.date} ${b.time}:00`;
  if (parseLocal(startAt) < new Date()) throw bad('Please pick a future time');
  const guests = Math.max(1, Math.min(8, Number(b.guests || 1)));
  const groupRef = guests > 1 ? `G${token(4).toUpperCase()}` : null;

  const out = await tx(async (conn) => {
    const client = await clientFor(req.user, salon.id, conn);
    const created = [];
    const taken = [];
    for (let g = 0; g < guests; g++) {
      let staffId = g === 0 && b.staff_id ? Number(b.staff_id) : null;
      if (staffId && !(await isFree({ salonId: salon.id, staffId, startAt, duration }))) throw bad('That stylist is no longer free at this time');
      if (!staffId) {
        staffId = await pickStylist({ salonId: salon.id, startAt, duration, serviceIds, preferredId: g === 0 ? client.preferred_staff_id : null });
        if (taken.includes(staffId)) staffId = null;
      }
      if (!staffId) throw bad(guests > 1 ? `Only ${g} stylists are free at this time for your group` : 'No stylist is free at this time');
      taken.push(staffId);
      // Deposit for new clients, long services, or clients with past no-shows
      const needsDeposit = client.visits === 0 || duration >= salon.deposit_min_duration || client.no_show_count >= 2;
      const deposit = needsDeposit && g === 0 ? round2((price * guests * salon.deposit_pct) / 100) : 0;
      const id = await insert('appointments', {
        salon_id: salon.id, client_id: client.id, staff_id: staffId, group_ref: groupRef, start_at: startAt,
        end_at: appointmentEnd(startAt, duration), status: deposit ? 'booked' : 'confirmed', source: 'app',
        deposit_amount: deposit, deposit_status: deposit ? 'pending' : 'none',
        notes: [g > 0 ? `Guest ${g + 1} of ${client.name}'s group` : null, b.notes || null].filter(Boolean).join(' · ') || null,
        created_by: req.user.id, created_at: now(),
      }, conn);
      for (const s of services) await insert('appointment_services', { appointment_id: id, service_id: s.id, price: s.price, duration_min: s.duration_min }, conn);
      created.push({ id, staff_id: staffId, deposit });
    }
    return { client, created };
  });
  const main = out.created[0];
  await notifySalonAdmins(salon.id, 'New app booking', `${req.user.name} · ${services.map((s) => s.name).join(', ')} · ${b.date} ${b.time}`, `calendar?date=${b.date}`);
  await sendMessage({
    salonId: salon.id, to: req.user.phone, name: req.user.name, template: 'booking_confirm', refType: 'appointment', refId: main.id,
    body: `Booked: ${services.map((s) => s.name).join(', ')} at ${salon.name} on ${b.date} ${b.time}.${main.deposit ? ` Pay ₹${main.deposit} deposit to confirm.` : ''}`,
  });
  let payment = null;
  if (main.deposit) payment = await startPayment({ userId: req.user.id, purpose: 'deposit', refId: main.id, amount: main.deposit, description: `Deposit for ${salon.name}` });
  res.status(201).json({ appointment_id: main.id, group_ref: out.created.length > 1 ? out.created : null, deposit: main.deposit, payment });
});

const bookingSelect = `SELECT a.*, s.name AS salon_name, s.slug, s.area, s.hue, u.name AS staff_name,
   (SELECT GROUP_CONCAT(sv.name SEPARATOR ', ') FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
   (SELECT GROUP_CONCAT(aps.service_id) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS service_ids,
   (SELECT SUM(aps.price) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS price,
   (SELECT public_token FROM invoices WHERE id = a.invoice_id) AS bill_token,
   (SELECT id FROM reviews WHERE invoice_id = a.invoice_id) AS review_id
 FROM appointments a JOIN clients c ON c.id = a.client_id JOIN salons s ON s.id = a.salon_id
 LEFT JOIN salon_staff ss ON ss.id = a.staff_id LEFT JOIN users u ON u.id = ss.user_id`;

r.get('/bookings', async (req, res) => {
  const rows = await q(`${bookingSelect} WHERE c.user_id = ? ORDER BY a.start_at DESC LIMIT 60`, [req.user.id]);
  const t = now();
  res.json({
    upcoming: rows.filter((a) => a.start_at >= t.slice(0, 10) && ['booked', 'confirmed', 'checked_in', 'in_service'].includes(a.status)).reverse(),
    past: rows.filter((a) => !['booked', 'confirmed', 'checked_in', 'in_service'].includes(a.status) || a.start_at < t.slice(0, 10)),
  });
});

async function myAppointment(user, id) {
  const a = await one('SELECT a.* FROM appointments a JOIN clients c ON c.id = a.client_id WHERE a.id = ? AND c.user_id = ?', [id, user.id]);
  if (!a) throw notFound('Booking not found');
  return a;
}

r.patch('/bookings/:id', async (req, res) => {
  const a = await myAppointment(req.user, req.params.id);
  if (!['booked', 'confirmed'].includes(a.status)) throw bad('This booking can no longer be changed');
  if (req.body.action === 'cancel') {
    const hoursLeft = (parseLocal(a.start_at) - new Date()) / 3600000;
    const depositStatus = a.deposit_status === 'paid' ? (hoursLeft >= 4 ? 'refunded' : 'forfeited') : a.deposit_status;
    await update('appointments', a.id, { status: 'cancelled', deposit_status: depositStatus });
    await notifySalonAdmins(a.salon_id, 'Booking cancelled by client', `#${a.id} on ${a.start_at.slice(0, 16)}`, `calendar?date=${a.start_at.slice(0, 10)}`);
    return res.json({ ok: true, deposit_status: depositStatus });
  }
  if (req.body.action === 'reschedule') {
    const { date, time } = need(req.body, 'date', 'time');
    const startAt = `${date} ${time}:00`;
    const duration = Math.round((parseLocal(a.end_at) - parseLocal(a.start_at)) / 60000);
    const svc = (await q('SELECT service_id FROM appointment_services WHERE appointment_id = ?', [a.id])).map((x) => x.service_id);
    let staffId = a.staff_id;
    if (!(await isFree({ salonId: a.salon_id, staffId, startAt, duration, ignoreAppointmentId: a.id })))
      staffId = await pickStylist({ salonId: a.salon_id, startAt, duration, serviceIds: svc });
    if (!staffId) throw bad('No stylist free at that time');
    await update('appointments', a.id, { start_at: startAt, end_at: appointmentEnd(startAt, duration), staff_id: staffId, reminder_sent: 0 });
    await notifySalonAdmins(a.salon_id, 'Booking rescheduled', `#${a.id} moved to ${date} ${time}`, `calendar?date=${date}`);
    return res.json({ ok: true });
  }
  throw bad('Unknown action');
});

r.post('/bookings/:id/pay-deposit', async (req, res) => {
  const a = await myAppointment(req.user, req.params.id);
  if (a.deposit_status !== 'pending') throw bad('No deposit due');
  res.json(await startPayment({ userId: req.user.id, purpose: 'deposit', refId: a.id, amount: a.deposit_amount, description: 'Booking deposit' }));
});

// ---------------------------------------------------------------- Walk-in queue (remote join)
r.post('/queue', async (req, res) => {
  const { salon_id } = need(req.body, 'salon_id');
  const salon = await one('SELECT * FROM salons WHERE id = ?', [salon_id]);
  if (!salon) throw notFound();
  if (!isOpenNow(salon)) throw bad('Salon is closed right now');
  const existing = await one(`SELECT id FROM queue_tokens WHERE salon_id = ? AND user_id = ? AND status IN ('waiting','serving') AND DATE(joined_at) = CURDATE()`, [salon.id, req.user.id]);
  if (existing) throw bad('You are already in this queue');
  const client = await clientFor(req.user, salon.id);
  const n = await one('SELECT COALESCE(MAX(token_no),0) + 1 AS n FROM queue_tokens WHERE salon_id = ? AND DATE(joined_at) = CURDATE()', [salon.id]);
  const id = await insert('queue_tokens', {
    salon_id: salon.id, client_id: client.id, user_id: req.user.id, name: req.user.name, phone: req.user.phone, token_no: n.n,
    service_id: req.body.service_id || null, staff_id: req.body.staff_id || null, source: 'app', joined_at: now(),
  });
  await notifySalonAdmins(salon.id, `Token ${n.n} joined from app`, req.user.name, 'calendar?tab=queue');
  res.status(201).json({ id, token_no: n.n });
});

r.get('/queue/mine', async (req, res) => {
  const mine = await q(
    `SELECT qt.*, s.name AS salon_name, s.slug FROM queue_tokens qt JOIN salons s ON s.id = qt.salon_id
     WHERE qt.user_id = ? AND qt.status IN ('waiting','serving') AND DATE(qt.joined_at) = CURDATE()`,
    [req.user.id],
  );
  const out = [];
  for (const t of mine) {
    const qs = await queueStatus(t.salon_id);
    const me = qs.tokens.find((x) => x.id === t.id);
    out.push({ ...t, position: me?.position ?? 0, eta_min: me?.eta_min ?? null, likely_staff: me?.likely_staff || null, ready: t.status === 'serving' || me?.eta_min === 0 });
  }
  res.json(out);
});

r.delete('/queue/:id', async (req, res) => {
  await q(`UPDATE queue_tokens SET status = 'left' WHERE id = ? AND user_id = ? AND status = 'waiting'`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Beauty profile
r.get('/profile', async (req, res) => {
  const cards = await q(
    `SELECT c.*, s.name AS salon_name, s.slug, s.hue, u.name AS preferred_staff FROM clients c JOIN salons s ON s.id = c.salon_id
     LEFT JOIN salon_staff ss ON ss.id = c.preferred_staff_id LEFT JOIN users u ON u.id = ss.user_id WHERE c.user_id = ?`,
    [req.user.id],
  );
  const history = await q(
    `SELECT i.id, i.invoice_no, i.total, i.created_at, i.public_token, s.name AS salon_name, s.slug,
       GROUP_CONCAT(ii.name SEPARATOR ', ') AS items, MAX(u.name) AS staff_name,
       (SELECT id FROM reviews r WHERE r.invoice_id = i.id) AS review_id
     FROM invoices i JOIN clients c ON c.id = i.client_id JOIN salons s ON s.id = i.salon_id
     JOIN invoice_items ii ON ii.invoice_id = i.id LEFT JOIN salon_staff ss ON ss.id = ii.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE c.user_id = ? AND i.status = 'paid' GROUP BY i.id ORDER BY i.created_at DESC LIMIT 30`,
    [req.user.id],
  );
  const due = await q(
    `SELECT s.name AS service_name, s.id AS service_id, sl.name AS salon_name, sl.slug, sl.id AS salon_id, MAX(i.created_at) AS last_done,
       DATE_ADD(DATE(MAX(i.created_at)), INTERVAL s.cycle_days DAY) AS due_on
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'paid' JOIN clients c ON c.id = i.client_id
     JOIN services s ON s.id = ii.ref_id AND ii.item_type = 'service' JOIN salons sl ON sl.id = i.salon_id
     WHERE c.user_id = ? AND s.cycle_days IS NOT NULL GROUP BY s.id, s.name, sl.id, sl.name, sl.slug, s.cycle_days
     HAVING due_on >= CURDATE() - INTERVAL 30 DAY ORDER BY due_on LIMIT 8`,
    [req.user.id],
  );
  const favourites = await q(
    'SELECT s.id, s.name, s.slug, s.area, s.hue, s.rating FROM favourites f JOIN salons s ON s.id = f.salon_id WHERE f.user_id = ?',
    [req.user.id],
  );
  const prescriptions = await q(
    `SELECT pr.id, pr.note, pr.status, pr.created_at, p.id AS product_id, p.name, p.brand, p.mrp, p.stock_qty, s.name AS salon_name, s.id AS salon_id, u.name AS staff_name
     FROM prescriptions pr JOIN clients c ON c.id = pr.client_id JOIN products p ON p.id = pr.product_id JOIN salons s ON s.id = pr.salon_id
     LEFT JOIN salon_staff ss ON ss.id = pr.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE c.user_id = ? ORDER BY pr.created_at DESC LIMIT 20`,
    [req.user.id],
  );
  res.json({ user: req.user, cards, history, due, favourites, prescriptions });
});

/** Customer can record their own allergies and preferences on every salon card. */
r.patch('/profile', async (req, res) => {
  const data = {};
  if (req.body.allergies !== undefined) data.allergies = String(req.body.allergies).slice(0, 255);
  if (req.body.notes !== undefined) data.notes = String(req.body.notes).slice(0, 500);
  if (Object.keys(data).length) await q('UPDATE clients SET ? WHERE user_id = ?', [data, req.user.id]);
  res.json({ ok: true });
});

r.post('/favourites/:salonId', async (req, res) => {
  const exists = await one('SELECT 1 AS x FROM favourites WHERE user_id = ? AND salon_id = ?', [req.user.id, req.params.salonId]);
  if (exists) await q('DELETE FROM favourites WHERE user_id = ? AND salon_id = ?', [req.user.id, req.params.salonId]);
  else await insert('favourites', { user_id: req.user.id, salon_id: Number(req.params.salonId) });
  res.json({ favourite: !exists });
});

// ---------------------------------------------------------------- Wallet, packages, memberships
r.get('/wallet', async (req, res) => {
  const cards = await q(
    `SELECT c.id AS client_id, c.wallet_balance, c.referral_code, s.id AS salon_id, s.name AS salon_name, s.slug, s.hue
     FROM clients c JOIN salons s ON s.id = c.salon_id WHERE c.user_id = ?`,
    [req.user.id],
  );
  const packages = await q(
    `SELECT cp.*, p.name, p.type, s.name AS salon_name, sv.name AS service_name FROM client_packages cp JOIN packages p ON p.id = cp.package_id
     JOIN clients c ON c.id = cp.client_id JOIN salons s ON s.id = cp.salon_id LEFT JOIN services sv ON sv.id = p.service_id
     WHERE c.user_id = ? ORDER BY cp.status, cp.expires_at`,
    [req.user.id],
  );
  const txns = await q(
    `SELECT w.*, s.name AS salon_name FROM wallet_txns w JOIN clients c ON c.id = w.client_id JOIN salons s ON s.id = w.salon_id
     WHERE c.user_id = ? ORDER BY w.created_at DESC LIMIT 30`,
    [req.user.id],
  );
  res.json({ cards, packages, txns, gold_until: req.user.gold_until, referral_code: req.user.referral_code });
});

r.post('/gold', async (req, res) => {
  res.json(await startPayment({ userId: req.user.id, purpose: 'gold', refId: req.user.id, amount: 299, description: 'SaloonBaba Gold — 90 days' }));
});

// ---------------------------------------------------------------- Offers
r.get('/offers', async (req, res) => {
  const city = req.query.city || req.user.city;
  const salons = await q(`SELECT * FROM salons WHERE is_active = 1 ${city ? 'AND city = ?' : ''}`, city ? [city] : []);
  const out = [];
  for (const s of salons) for (const o of await liveOffers(s)) out.push({ ...o, salon_name: s.name, slug: s.slug, area: s.area, hue: s.hue });
  out.sort((a, b) => b.live_now - a.live_now || b.happy_hour - a.happy_hour);
  res.json(out);
});

// ---------------------------------------------------------------- Reviews
r.post('/reviews', async (req, res) => {
  const { invoice_id } = need(req.body, 'invoice_id');
  const inv = await one('SELECT i.* FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ? AND c.user_id = ?', [invoice_id, req.user.id]);
  if (!inv) throw notFound('Visit not found');
  res.status(201).json(await recordReview({ invoice: inv, body: req.body, userId: req.user.id }));
});

// ---------------------------------------------------------------- Shop (prescribed home-care)
r.get('/shop', async (req, res) => {
  const salonIds = (await q('SELECT salon_id FROM clients WHERE user_id = ?', [req.user.id])).map((c) => c.salon_id);
  if (!salonIds.length) return res.json({ products: [] });
  const products = await q(
    `SELECT p.id, p.name, p.brand, p.category, p.mrp, p.stock_qty, p.salon_id, s.name AS salon_name,
       EXISTS (SELECT 1 FROM prescriptions pr JOIN clients c ON c.id = pr.client_id WHERE pr.product_id = p.id AND c.user_id = ?) AS prescribed
     FROM products p JOIN salons s ON s.id = p.salon_id WHERE p.salon_id IN (?) AND p.kind IN ('retail','both') AND p.is_active = 1 AND p.stock_qty > 0
     ORDER BY prescribed DESC, p.name`,
    [req.user.id, salonIds],
  );
  res.json({ products });
});

r.post('/shop/orders', async (req, res) => {
  const { salon_id, items } = need(req.body, 'salon_id', 'items');
  const fulfilment = req.body.fulfilment === 'delivery' ? 'delivery' : 'pickup';
  if (fulfilment === 'delivery' && !req.body.address) throw bad('Delivery address is required');
  const products = await q(`SELECT * FROM products WHERE salon_id = ? AND id IN (?) AND kind IN ('retail','both')`, [salon_id, items.map((i) => i.product_id)]);
  let total = 0;
  const lines = items.map((i) => {
    const p = products.find((x) => x.id === Number(i.product_id));
    if (!p) throw bad('Product unavailable');
    const qty = Math.max(1, Number(i.qty || 1));
    if (p.stock_qty < qty) throw bad(`Only ${p.stock_qty} of ${p.name} left`);
    total += p.mrp * qty;
    return { product_id: p.id, name: p.name, qty, price: p.mrp };
  });
  const client = await clientFor(req.user, Number(salon_id));
  const id = await insert('shop_orders', { user_id: req.user.id, salon_id, client_id: client.id, total: round2(total), fulfilment, address: req.body.address || null, created_at: now() });
  for (const l of lines) await insert('shop_order_items', { order_id: id, ...l });
  const payment = await startPayment({ userId: req.user.id, purpose: 'shop', refId: id, amount: total, description: 'Home-care products' });
  res.status(201).json({ id, total: round2(total), payment });
});

r.get('/shop/orders', async (req, res) => {
  const orders = await q(
    `SELECT o.*, s.name AS salon_name, (SELECT GROUP_CONCAT(CONCAT(qty,' × ',name) SEPARATOR ', ') FROM shop_order_items WHERE order_id = o.id) AS items
     FROM shop_orders o JOIN salons s ON s.id = o.salon_id WHERE o.user_id = ? ORDER BY o.id DESC`,
    [req.user.id],
  );
  res.json(orders);
});

export default r;
export { clientFor };

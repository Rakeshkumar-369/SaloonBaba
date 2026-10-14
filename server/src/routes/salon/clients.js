import { Router } from 'express';
import { q, one, insert, update, tx } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { SEGMENT_SQL, SEGMENT_LABELS, segmentWhere, dueClients, clientTag } from '../../services/segments.js';
import { sendMessage } from '../../services/notify.js';
import { bad, need, notFound, pick, maskPhone, now } from '../../util.js';
import { upsertClient } from './calendar.js';

const r = Router({ mergeParams: true });

const mask = (req, c) => (req.access === 'stylist' ? { ...c, phone: maskPhone(c.phone) } : c);

r.get('/clients', async (req, res) => {
  const segment = req.query.segment || 'all';
  if (segment === 'due') {
    const rows = await dueClients(req.salon.id, 200);
    return res.json(rows.map((r) => mask(req, { ...r, id: r.client_id, tag: 'due' })));
  }
  const { sql, params } = segmentWhere(segment, req.salon.id);
  const search = req.query.q ? `%${req.query.q}%` : null;
  const where = [`c.salon_id = ?`, sql];
  const p = [req.salon.id, ...params];
  if (search) { where.push('(c.name LIKE ? OR c.phone LIKE ?)'); p.push(search, search); }
  if (req.access === 'stylist') { where.push('c.preferred_staff_id = ?'); p.push(req.staff.id); }
  const rows = await q(
    `SELECT c.id, c.name, c.phone, c.gender, c.visits, c.total_spend, c.last_visit, c.first_visit, c.wallet_balance, c.no_show_count,
       c.preferred_staff_id, u.name AS preferred_staff
     FROM clients c LEFT JOIN salon_staff ss ON ss.id = c.preferred_staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE ${where.join(' AND ')} ORDER BY c.last_visit IS NULL, c.last_visit DESC LIMIT ?`,
    [...p, Math.min(500, Number(req.query.limit || 200))],
  );
  res.json(rows.map((c) => mask(req, { ...c, tag: clientTag(c) })));
});

r.get('/clients/segments', async (req, res) => {
  const out = [];
  for (const key of Object.keys(SEGMENT_SQL)) {
    const { sql, params } = segmentWhere(key, req.salon.id);
    const row = await one(`SELECT COUNT(*) AS n FROM clients c WHERE c.salon_id = ? AND ${sql}`, [req.salon.id, ...params]);
    out.push({ key, label: SEGMENT_LABELS[key], count: row.n });
  }
  res.json(out);
});

r.get('/clients/lookup', async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  const rows = await q(
    `SELECT id, name, phone, visits, wallet_balance, no_show_count, allergies FROM clients WHERE salon_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY last_visit DESC LIMIT 10`,
    [req.salon.id, s, s],
  );
  res.json(rows.map((c) => mask(req, c)));
});

r.post('/clients', allow('manager'), async (req, res) => {
  const c = await upsertClient(req.salon.id, { client: req.body }, req.body.source || 'walkin');
  const data = pick(req.body, ['dob', 'allergies', 'notes', 'colour_formula']);
  if (Object.keys(data).length) await update('clients', c.id, data);
  res.status(201).json({ id: c.id });
});

/** Client card: history, formula, allergies, packages, wallet, notes. */
r.get('/clients/:id', async (req, res) => {
  const c = await one(
    `SELECT c.*, u.name AS preferred_staff, rc.name AS referred_by FROM clients c LEFT JOIN salon_staff ss ON ss.id = c.preferred_staff_id
     LEFT JOIN users u ON u.id = ss.user_id LEFT JOIN clients rc ON rc.id = c.referred_by_client_id WHERE c.id = ? AND c.salon_id = ?`,
    [req.params.id, req.salon.id],
  );
  if (!c) throw notFound('Client not found');
  const visits = await q(
    `SELECT i.id, i.invoice_no, i.total, i.created_at, i.status, i.public_token,
       GROUP_CONCAT(CONCAT(ii.name, IF(u.name IS NULL, '', CONCAT(' · ', u.name))) SEPARATOR ', ') AS items
     FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id LEFT JOIN salon_staff ss ON ss.id = ii.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE i.client_id = ? GROUP BY i.id ORDER BY i.created_at DESC LIMIT 30`,
    [c.id],
  );
  const upcoming = await q(
    `SELECT a.id, a.start_at, a.status, u.name AS staff_name,
       (SELECT GROUP_CONCAT(sv.name SEPARATOR ', ') FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services
     FROM appointments a LEFT JOIN salon_staff ss ON ss.id = a.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE a.client_id = ? AND a.start_at >= CURDATE() AND a.status IN ('booked','confirmed','checked_in') ORDER BY a.start_at`,
    [c.id],
  );
  const packages = await q(
    `SELECT cp.*, p.name, p.type FROM client_packages cp JOIN packages p ON p.id = cp.package_id WHERE cp.client_id = ? ORDER BY cp.status, cp.expires_at`,
    [c.id],
  );
  const wallet = await q('SELECT * FROM wallet_txns WHERE client_id = ? ORDER BY created_at DESC LIMIT 20', [c.id]);
  const prescriptions = await q(
    `SELECT pr.*, p.name AS product, u.name AS staff_name FROM prescriptions pr JOIN products p ON p.id = pr.product_id
     LEFT JOIN salon_staff ss ON ss.id = pr.staff_id LEFT JOIN users u ON u.id = ss.user_id WHERE pr.client_id = ? ORDER BY pr.created_at DESC LIMIT 20`,
    [c.id],
  );
  const reviews = await q('SELECT overall, comment, stage, created_at FROM reviews WHERE client_id = ? ORDER BY created_at DESC', [c.id]);
  const messages = req.access === 'stylist' ? [] : await q(
    `SELECT template, body, status, created_at FROM message_log WHERE salon_id = ? AND to_phone = ? ORDER BY id DESC LIMIT 15`,
    [req.salon.id, c.phone],
  );
  const referrals = await one('SELECT COUNT(*) AS n FROM clients WHERE referred_by_client_id = ?', [c.id]);
  res.json({ client: mask(req, { ...c, tag: clientTag(c), referrals: referrals.n }), visits, upcoming, packages, wallet, prescriptions, reviews, messages });
});

r.patch('/clients/:id', async (req, res) => {
  const c = await one('SELECT id, preferred_staff_id FROM clients WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!c) throw notFound();
  // Stylists may update service notes (formula, allergies) for their clients
  const fields = req.access === 'stylist'
    ? ['colour_formula', 'allergies', 'notes']
    : ['name', 'gender', 'dob', 'allergies', 'colour_formula', 'notes', 'preferred_staff_id', 'marketing_opt_in'];
  await update('clients', c.id, pick(req.body, fields));
  res.json({ ok: true });
});

/** Wallet top-up receipt (prepaid balance; revenue is recognised when it is spent on a bill). */
r.post('/clients/:id/wallet-topup', allow('manager'), async (req, res) => {
  const { amount } = need(req.body, 'amount');
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0 && amt <= 100000)) throw bad('Enter a valid amount');
  const mode = ['cash', 'upi', 'card'].includes(req.body.mode) ? req.body.mode : 'upi';
  const bonus = Math.round(Number(req.body.bonus || 0) * 100) / 100;
  const c = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!c) throw notFound();
  await tx(async (conn) => {
    await q('UPDATE clients SET wallet_balance = wallet_balance + ? WHERE id = ?', [amt + bonus, c.id], conn);
    await insert('wallet_txns', { client_id: c.id, salon_id: req.salon.id, amount: amt, type: 'credit', note: `Top-up (${mode})`, created_at: now() }, conn);
    if (bonus > 0) await insert('wallet_txns', { client_id: c.id, salon_id: req.salon.id, amount: bonus, type: 'credit', note: 'Top-up bonus', created_at: now() }, conn);
    await insert('payments', { invoice_id: null, client_id: c.id, salon_id: req.salon.id, mode, amount: amt, purpose: 'wallet_topup', ref: req.body.ref || null, created_at: now() }, conn);
  });
  await sendMessage({ salonId: req.salon.id, to: c.phone, name: c.name, template: 'wallet_topup', refType: 'client', refId: c.id, body: `₹${amt}${bonus ? ` + ₹${bonus} bonus` : ''} added to your ${req.salon.name} wallet. Balance: ₹${Math.round(Number(c.wallet_balance) + amt + bonus)}.` });
  res.status(201).json({ ok: true, balance: Number(c.wallet_balance) + amt + bonus });
});

/** Message a client from the salon's WhatsApp number (stylists never see the number). */
r.post('/clients/:id/message', async (req, res) => {
  const { body } = need(req.body, 'body');
  const c = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!c) throw notFound();
  if (String(body).length > 1000) throw bad('Message too long');
  const sender = req.access === 'stylist' ? ` — ${req.user.name.split(' ')[0]}, ${req.salon.name}` : ` — ${req.salon.name}`;
  const out = await sendMessage({ salonId: req.salon.id, channel: req.body.channel || 'whatsapp', to: c.phone, name: c.name, template: 'direct', refType: 'client', refId: c.id, body: `${body}${sender}` });
  res.json(out);
});

export default r;

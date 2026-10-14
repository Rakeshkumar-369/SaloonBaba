import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, update } from '../db.js';
import { consoleSalons } from '../middleware/auth.js';
import { publicUser } from './auth.js';
import { bad, need, pick } from '../util.js';
import { confirmPayment } from '../services/payments.js';

const r = Router();

/** Current user plus everything the UI needs to route them. */
r.get('/', async (req, res) => {
  const u = req.user;
  const ctx = { user: publicUser(u) };
  if (['owner', 'manager', 'admin'].includes(u.role)) ctx.salons = await consoleSalons(u);
  if (['stylist', 'manager'].includes(u.role))
    ctx.staff = await q(
      `SELECT ss.id, ss.salon_id, ss.role, ss.level, s.name AS salon_name FROM salon_staff ss JOIN salons s ON s.id = ss.salon_id
       WHERE ss.user_id = ? AND ss.is_active = 1`,
      [u.id],
    );
  if (u.role === 'franchisor') ctx.brands = await q('SELECT id, name, slug, hue FROM brands WHERE owner_user_id = ?', [u.id]);
  if (u.role === 'area_manager')
    ctx.brands = await q('SELECT b.id, b.name, b.slug, b.hue FROM brands b JOIN brand_members m ON m.brand_id = b.id WHERE m.user_id = ?', [u.id]);
  if (u.role === 'vendor') ctx.vendor = await one('SELECT * FROM vendors WHERE user_id = ?', [u.id]);
  ctx.unread = (await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [u.id])).n;
  res.json(ctx);
});

r.patch('/', async (req, res) => {
  const data = pick(req.body, ['name', 'lang', 'city', 'gender']);
  if (data.lang && !['en', 'hi', 'ta', 'te', 'kn', 'bn'].includes(data.lang)) throw bad('Unsupported language');
  await update('users', req.user.id, data);
  res.json(publicUser({ ...req.user, ...data }));
});

r.post('/password', async (req, res) => {
  const { current, next } = need(req.body, 'current', 'next');
  const row = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(String(current), row.password_hash))) throw bad('Current password is wrong');
  if (String(next).length < 6) throw bad('New password must be at least 6 characters');
  await update('users', req.user.id, { password_hash: await bcrypt.hash(String(next), 10) });
  res.json({ ok: true });
});

r.get('/notifications', async (req, res) => {
  res.json(await q('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]));
});
r.post('/notifications/read', async (req, res) => {
  await q('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

/** Confirm an online payment (Razorpay handler result or demo checkout). */
r.post('/payments/:id/confirm', async (req, res) => {
  const po = await one('SELECT user_id FROM payment_orders WHERE id = ?', [req.params.id]);
  if (!po || (po.user_id && po.user_id !== req.user.id)) throw bad('Payment not found');
  res.json(await confirmPayment(Number(req.params.id), req.body));
});

export default r;

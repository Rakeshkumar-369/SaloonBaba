import { Router } from 'express';
import QRCode from 'qrcode';
import { q, one, insert, update } from '../db.js';
import { bad, need, notFound, now, round2 } from '../util.js';
import { invoiceDetail } from '../services/billing.js';
import { upiIntent } from '../integrations/razorpay.js';
import { notifyUser } from '../services/notify.js';
import { recordReview } from '../services/reviews.js';

const r = Router();

export const PLANS = [
  { id: 'starter', name: 'Starter', price: 0, period: 'forever', tagline: 'For a 1–3 chair salon going digital',
    features: ['Smart calendar & walk-in queue', 'GST billing on WhatsApp', 'Client cards & reminders', 'Listing on the SaloonBaba app'] },
  { id: 'growth', name: 'Growth', price: 1499, period: 'per outlet / month', tagline: 'Fill chairs and keep clients coming back', popular: true,
    features: ['Everything in Starter', 'Retention engine & win-back automations', 'Payroll & live incentive engine', 'Inventory with recipes & reorders', 'Daily P&L, cash closing, Tally export', 'Employee app for every stylist'] },
  { id: 'pro', name: 'Pro', price: 2999, period: 'per outlet / month', tagline: 'Multi-outlet owners who want control',
    features: ['Everything in Growth', 'Multi-outlet rollup', 'Loss-prevention flags & audit trail', 'Campaign attribution', 'Hygiene & SOP checklists', 'Priority support'] },
  { id: 'franchise', name: 'Franchise', price: null, period: 'custom', tagline: 'Brand HQ with 10 to 1,000 outlets',
    features: ['Network dashboard & outlet benchmarks', 'Royalty engine', 'Central catalogue & pricing', 'Digital audits & action items', 'Lead routing & training'] },
];

r.get('/plans', (_req, res) => res.json(PLANS));

r.get('/stats', async (_req, res) => {
  const s = await one(
    `SELECT (SELECT COUNT(*) FROM salons WHERE is_active = 1) AS salons, (SELECT COUNT(*) FROM salon_staff) AS staff,
            (SELECT COUNT(*) FROM appointments) AS bookings, (SELECT COUNT(DISTINCT city) FROM salons) AS cities`,
  );
  res.json(s);
});

r.post('/demo-requests', async (req, res) => {
  const b = need(req.body, 'name', 'phone');
  const phone = String(b.phone).replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) throw bad('Enter a 10-digit mobile number');
  const id = await insert('demo_requests', {
    name: String(b.name).slice(0, 120), phone, email: b.email || null, business_name: b.business_name || null,
    city: b.city || null, outlets: Number(b.outlets) || null, role: b.role || null, message: (b.message || '').slice(0, 600),
  });
  const admins = await q(`SELECT id FROM users WHERE role = 'admin'`);
  for (const a of admins) await notifyUser(a.id, 'New demo request', `${b.name} (${b.business_name || 'salon'}, ${b.city || ''})`, '/admin?tab=leads');
  res.status(201).json({ id, ok: true });
});

/** Public GST bill (shared on WhatsApp). */
r.get('/bill/:token', async (req, res) => {
  const inv = await invoiceDetail('i.public_token = ?', req.params.token);
  if (!inv) throw notFound('Bill not found');
  const review = await one('SELECT id, stage, overall FROM reviews WHERE invoice_id = ?', [inv.id]);
  const { client_phone, ...rest } = inv;
  res.json({ ...rest, client_phone: client_phone ? `XXXXXX${client_phone.slice(-4)}` : '', review });
});

/** Private-first feedback from the bill link. Low scores stay private so the salon can recover. */
r.post('/bill/:token/feedback', async (req, res) => {
  const inv = await one('SELECT * FROM invoices WHERE public_token = ?', [req.params.token]);
  if (!inv) throw notFound('Bill not found');
  const out = await recordReview({ invoice: inv, body: req.body });
  res.status(201).json(out);
});

/** UPI QR (SVG) for an amount at a salon counter. */
r.get('/upi-qr', async (req, res) => {
  const salon = await one('SELECT name, upi_id FROM salons WHERE id = ?', [req.query.salon_id]);
  if (!salon?.upi_id) throw notFound('Salon has no UPI ID');
  const intent = upiIntent({ vpa: salon.upi_id, name: salon.name, amount: round2(req.query.amount || 0), note: req.query.note || 'Salon bill' });
  const svg = await QRCode.toString(intent, { type: 'svg', margin: 1, width: 220 });
  res.json({ intent, svg });
});

/** Product authenticity check (QR on pack). */
r.get('/verify/:code', async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const row = await one(
    `SELECT ac.*, vp.name AS product, vp.brand, v.name AS vendor FROM authenticity_codes ac
     JOIN vendor_products vp ON vp.id = ac.vendor_product_id JOIN vendors v ON v.id = ac.vendor_id WHERE ac.code = ?`,
    [code],
  );
  if (!row) return res.json({ genuine: false, message: 'Code not found. This pack may not be genuine — report it to the brand.' });
  await update('authenticity_codes', row.id, { verified_count: row.verified_count + 1, last_verified_at: now() });
  res.json({
    genuine: true, suspicious: row.verified_count >= 3,
    message: row.verified_count >= 3 ? 'Genuine code, but it has been scanned many times. It may be a copied label.' : 'Genuine product',
    product: row.product, brand: row.brand, vendor: row.vendor, batch_no: row.batch_no, mfg_date: row.mfg_date,
    expiry_date: row.expiry_date, scans: row.verified_count + 1,
  });
});

export default r;

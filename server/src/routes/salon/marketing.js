import { Router } from 'express';
import { q, one, insert, update } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { segmentWhere, SEGMENT_LABELS } from '../../services/segments.js';
import { sendMessage } from '../../services/notify.js';
import { bad, need, notFound, now, pick, round2, pct } from '../../util.js';

const r = Router({ mergeParams: true });

const COST = { whatsapp: 0.8, sms: 0.25, push: 0 }; // ₹ per message (approx. India rates)

// ------------------------------------------------------------ Offers & happy hours
r.get('/offers', async (req, res) => {
  res.json(await q(
    `SELECT o.*, (o.brand_id IS NOT NULL AND o.salon_id IS NULL) AS is_brand,
       (SELECT COUNT(*) FROM invoices i WHERE i.offer_id = o.id AND i.salon_id = ? AND i.status = 'paid') AS redemptions,
       (SELECT COALESCE(SUM(i.total),0) FROM invoices i WHERE i.offer_id = o.id AND i.salon_id = ? AND i.status = 'paid') AS revenue
     FROM offers o WHERE o.salon_id = ? OR (o.brand_id IS NOT NULL AND o.brand_id = ?) ORDER BY o.is_active DESC, o.id DESC`,
    [req.salon.id, req.salon.id, req.salon.id, req.salon.brand_id || 0],
  ));
});

r.post('/offers', allow('manager'), async (req, res) => {
  const b = need(req.body, 'title', 'type', 'value');
  if (b.type === 'percent' && (b.value <= 0 || b.value > 80)) throw bad('Percent offers must be 1–80%');
  const code = (b.code || b.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) + Math.round(b.value)).toUpperCase();
  const id = await insert('offers', {
    salon_id: req.salon.id, code,
    ...pick(b, ['title', 'description', 'type', 'value', 'min_bill', 'first_visit_only', 'happy_hour', 'days', 'start_time', 'end_time', 'valid_from', 'valid_to']),
  });
  res.status(201).json({ id, code });
});

r.patch('/offers/:id', allow('manager'), async (req, res) => {
  const o = await one('SELECT * FROM offers WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!o) throw bad('Brand offers are managed by HQ');
  await update('offers', o.id, pick(req.body, ['is_active', 'title', 'description', 'value', 'valid_to']));
  res.json({ ok: true });
});

// ------------------------------------------------------------ Campaigns with attribution
r.get('/audience', async (req, res) => {
  const { sql, params } = segmentWhere(req.query.segment || 'all', req.salon.id);
  const row = await one(`SELECT COUNT(*) AS n FROM clients c WHERE c.salon_id = ? AND c.marketing_opt_in = 1 AND ${sql}`, [req.salon.id, ...params]);
  res.json({ count: row.n, cost_per_message: COST });
});

r.get('/campaigns', async (req, res) => {
  const rows = await q(
    `SELECT c.*, o.code AS offer_code, o.title AS offer_title FROM campaigns c LEFT JOIN offers o ON o.id = c.offer_id
     WHERE c.salon_id = ? OR (c.brand_id IS NOT NULL AND c.brand_id = ? AND c.salon_id IS NULL) ORDER BY c.id DESC`,
    [req.salon.id, req.salon.brand_id || 0],
  );
  for (const c of rows) Object.assign(c, await attribution(c, req.salon.id));
  res.json({ campaigns: rows, segments: SEGMENT_LABELS });
});

/** Offer → visit → repeat attribution (visit within 30 days of message). */
async function attribution(c, salonId) {
  if (c.status !== 'sent') return { visited: 0, repeat: 0, revenue: 0, conversion: 0, cost_per_visit: 0 };
  const row = await one(
    `SELECT COUNT(DISTINCT x.client_id) AS visited, COALESCE(SUM(x.rev),0) AS revenue, SUM(x.n >= 2) AS repeat_clients FROM (
       SELECT cr.client_id, COUNT(i.id) AS n, SUM(i.total) AS rev FROM campaign_recipients cr
       JOIN invoices i ON i.client_id = cr.client_id AND i.status = 'paid' AND i.salon_id = ?
         AND i.created_at BETWEEN cr.sent_at AND cr.sent_at + INTERVAL 30 DAY
       WHERE cr.campaign_id = ? GROUP BY cr.client_id) x`,
    [salonId, c.id],
  );
  return {
    visited: row.visited, repeat: Number(row.repeat_clients || 0), revenue: round2(row.revenue), conversion: pct(row.visited, c.sent_count),
    cost_per_visit: row.visited ? round2(c.cost / row.visited) : 0, roi: c.cost ? round2(row.revenue / c.cost) : 0,
  };
}

r.post('/campaigns', allow('manager'), async (req, res) => {
  const b = need(req.body, 'name', 'message');
  const channel = ['whatsapp', 'sms', 'push'].includes(b.channel) ? b.channel : 'whatsapp';
  const segment = b.segment || 'all';
  const id = await insert('campaigns', { salon_id: req.salon.id, name: b.name, channel, segment, offer_id: b.offer_id || null, message: b.message });
  let sent = 0;
  if (b.send_now) sent = await sendCampaign(id, req.salon);
  res.status(201).json({ id, sent });
});

r.post('/campaigns/:id/send', allow('manager'), async (req, res) => {
  const c = await one(`SELECT * FROM campaigns WHERE id = ? AND salon_id = ? AND status = 'draft'`, [req.params.id, req.salon.id]);
  if (!c) throw notFound('Draft campaign not found');
  res.json({ sent: await sendCampaign(c.id, req.salon) });
});

async function sendCampaign(id, salon) {
  const c = await one('SELECT c.*, o.code FROM campaigns c LEFT JOIN offers o ON o.id = c.offer_id WHERE c.id = ?', [id]);
  const { sql, params } = segmentWhere(c.segment, salon.id);
  const clients = await q(`SELECT c.id, c.name, c.phone FROM clients c WHERE c.salon_id = ? AND c.marketing_opt_in = 1 AND ${sql} LIMIT 2000`, [salon.id, ...params]);
  const at = now();
  for (const cl of clients) {
    const body = c.message.replace(/\{name\}/g, cl.name.split(' ')[0]).replace(/\{salon\}/g, salon.name).replace(/\{code\}/g, c.code || '') + '\nReply STOP to opt out.';
    await sendMessage({ salonId: salon.id, channel: c.channel, to: c.channel === 'push' ? '' : cl.phone, name: cl.name, template: `campaign_${c.id}`, refType: 'campaign', refId: c.id, body, at });
    await insert('campaign_recipients', { campaign_id: c.id, client_id: cl.id, sent_at: at });
  }
  await update('campaigns', c.id, { status: 'sent', sent_count: clients.length, sent_at: at, cost: round2(clients.length * COST[c.channel]) });
  return clients.length;
}

// ------------------------------------------------------------ Referrals
r.get('/referrals', async (req, res) => {
  const top = await q(
    `SELECT r.id, r.name, r.referral_code, COUNT(c.id) AS referred, COALESCE(SUM(c.total_spend),0) AS referred_spend
     FROM clients c JOIN clients r ON r.id = c.referred_by_client_id WHERE c.salon_id = ? GROUP BY r.id ORDER BY referred DESC LIMIT 20`,
    [req.salon.id],
  );
  const total = await one('SELECT COUNT(*) AS n FROM clients WHERE salon_id = ? AND referred_by_client_id IS NOT NULL', [req.salon.id]);
  res.json({ top, total: total.n, reward: 'Referrer gets ₹200 wallet credit, friend gets 15% off first visit' });
});

// ------------------------------------------------------------ Festival & wedding-season planner
r.get('/calendar', (_req, res) => {
  res.json([
    { date: '2026-10-29', name: 'Karwa Chauth', idea: 'Mehendi + party makeup combos for the evening' },
    { date: '2026-11-08', name: 'Diwali', idea: 'Festive glow packages, pre-book family slots 2 weeks ahead' },
    { date: '2026-11-15', name: 'Wedding season peaks (Nov–Feb)', idea: 'Bridal party group bookings, pre-bridal packages with deposits' },
    { date: '2026-12-25', name: 'Christmas & New Year', idea: 'Party-ready blowouts, late-evening slots' },
    { date: '2027-01-14', name: 'Pongal / Sankranti', idea: 'Family grooming offers, traditional looks' },
    { date: '2027-02-14', name: "Valentine's Day", idea: 'Couple spa and grooming packages' },
    { date: '2027-03-22', name: 'Holi', idea: 'Post-Holi hair & skin repair treatments' },
    { date: '2027-04-14', name: 'Tamil New Year / Vishu / Baisakhi', idea: 'Regional festive looks' },
    { date: '2027-05-01', name: 'Summer (May–June)', idea: 'Off-peak weekday happy hours, cooling scalp treatments' },
  ]);
});

// ------------------------------------------------------------ Brand leads routed to this outlet
r.get('/leads', async (req, res) => {
  res.json(await q(`SELECT * FROM leads WHERE salon_id = ? ORDER BY FIELD(status,'assigned','new','contacted','booked','lost'), created_at DESC LIMIT 100`, [req.salon.id]));
});

r.patch('/leads/:id', allow('manager'), async (req, res) => {
  const l = await one('SELECT * FROM leads WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!l) throw notFound();
  const status = req.body.status;
  if (!['contacted', 'booked', 'lost'].includes(status)) throw bad('Invalid status');
  await update('leads', l.id, { status, notes: req.body.notes ?? l.notes, contacted_at: l.contacted_at || now() });
  res.json({ ok: true });
});

export default r;

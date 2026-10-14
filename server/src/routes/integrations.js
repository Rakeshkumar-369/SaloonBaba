import { Router } from 'express';
import { q, one, insert } from '../db.js';
import { config } from '../config.js';
import { verifyWebhook } from '../integrations/razorpay.js';
import { markPaidByProviderOrder } from '../services/payments.js';
import { sendMessage } from '../services/notify.js';
import { queueStatus } from '../services/availability.js';
import { now, minutesOf, hm } from '../util.js';

const r = Router();

// ------------------------------------------------------------ WhatsApp Cloud API webhook (booking bot)
r.get('/whatsapp/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.whatsapp.verifyToken)
    return res.status(200).send(req.query['hub.challenge']);
  res.sendStatus(403);
});

/**
 * Minimal WhatsApp bot: "MENU <salon>", "QUEUE <salon>", "BOOK <salon>", "STOP".
 * Each salon's number can map to its slug; for a shared number the salon is named in the text.
 */
export async function botReply(from, text) {
  const t = String(text || '').trim();
  const [cmd, ...rest] = t.split(/\s+/);
  const key = rest.join(' ').toLowerCase();
  const salon = key ? await one('SELECT * FROM salons WHERE slug = ? OR LOWER(name) LIKE ? LIMIT 1', [key, `%${key}%`]) : null;
  switch ((cmd || '').toUpperCase()) {
    case 'MENU': {
      if (!salon) return 'Send MENU followed by the salon name, e.g. MENU mane room';
      const s = await q('SELECT name, price, duration_min FROM services WHERE salon_id = ? AND is_active = 1 ORDER BY category, price LIMIT 15', [salon.id]);
      return `${salon.name} — prices incl. GST\n${s.map((x) => `• ${x.name}: ₹${Math.round(x.price)} (${x.duration_min} min)`).join('\n')}\nBook: ${config.appUrl}/s/${salon.slug}`;
    }
    case 'QUEUE':
    case 'WAIT': {
      if (!salon) return 'Send QUEUE followed by the salon name';
      const qs = await queueStatus(salon.id);
      if (!qs.is_open) return `${salon.name} is closed now. Opens at ${qs.open_time}.`;
      return `${salon.name}: ${qs.waiting} waiting. You can be seated in about ${qs.wait_min ?? '?'} min. Reply JOIN ${salon.slug} to take a token.`;
    }
    case 'JOIN': {
      if (!salon) return 'Send JOIN followed by the salon name';
      const m = minutesOf(hm(new Date()));
      if (m < minutesOf(salon.open_time) || m >= minutesOf(salon.close_time)) return `${salon.name} is closed now.`;
      const phone = String(from).slice(-10);
      const client = await one('SELECT id, name FROM clients WHERE salon_id = ? AND phone = ?', [salon.id, phone]);
      const n = await one('SELECT COALESCE(MAX(token_no),0) + 1 AS n FROM queue_tokens WHERE salon_id = ? AND DATE(joined_at) = CURDATE()', [salon.id]);
      await insert('queue_tokens', { salon_id: salon.id, client_id: client?.id || null, name: client?.name || `WhatsApp ${phone.slice(-4)}`, phone, token_no: n.n, source: 'whatsapp', joined_at: now() });
      return `You are token ${n.n} at ${salon.name}. We will message you when your stylist is ready.`;
    }
    case 'BOOK':
      return salon ? `Pick a slot and stylist here (works without the app): ${config.appUrl}/s/${salon.slug}?book=1` : 'Send BOOK followed by the salon name';
    case 'STOP':
      await q('UPDATE clients SET marketing_opt_in = 0 WHERE phone = ?', [String(from).slice(-10)]);
      return 'You will not receive offers anymore. Booking reminders will continue.';
    default:
      return 'Hi! I am the SaloonBaba assistant. Send:\nMENU <salon> — prices\nQUEUE <salon> — live wait\nJOIN <salon> — take a token\nBOOK <salon> — booking link';
  }
}

r.post('/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200); // acknowledge fast, then process
  const msgs = req.body?.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages || []) || []) || [];
  for (const m of msgs) {
    if (m.type !== 'text') continue;
    const reply = await botReply(m.from, m.text?.body);
    await sendMessage({ to: m.from, template: 'bot_reply', body: reply });
  }
});

/** Bot simulator (used by the demo UI and for testing without Meta). */
r.post('/whatsapp/simulate', async (req, res) => {
  res.json({ reply: await botReply(req.body.from || '9000000101', req.body.text) });
});

// ------------------------------------------------------------ Razorpay webhook
r.post('/razorpay/webhook', async (req, res) => {
  if (!verifyWebhook(req.rawBody || Buffer.from(''), req.headers['x-razorpay-signature'])) return res.sendStatus(400);
  const ev = req.body;
  if (ev.event === 'payment.captured' || ev.event === 'order.paid') {
    const p = ev.payload?.payment?.entity;
    if (p?.order_id) await markPaidByProviderOrder(p.order_id, p.id);
  }
  res.json({ ok: true });
});

export default r;

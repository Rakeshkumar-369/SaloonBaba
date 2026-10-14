import { q, one, update } from '../db.js';
import { config } from '../config.js';
import { sendMessage, alreadySent, notifySalonAdmins } from './notify.js';
import { dueClients } from './segments.js';
import { today } from '../util.js';

const first = (name) => String(name || '').split(' ')[0];
const fmtTime = (s) => {
  const [h, m] = s.slice(11, 16).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/**
 * Retention and operations automations. Each job is idempotent (checks
 * message_log), so it is safe to run every few minutes or on demand.
 */
export const JOBS = {
  /** Appointment reminder ~24h before. */
  async appointmentReminders() {
    const rows = await q(
      `SELECT a.id, a.salon_id, a.start_at, c.name, c.phone, s.name AS salon_name, s.slug FROM appointments a
       JOIN clients c ON c.id = a.client_id JOIN salons s ON s.id = a.salon_id
       WHERE a.status IN ('booked','confirmed') AND a.reminder_sent = 0 AND a.start_at BETWEEN NOW() AND NOW() + INTERVAL 24 HOUR`,
    );
    for (const r of rows) {
      await sendMessage({
        salonId: r.salon_id, to: r.phone, name: r.name, template: 'appt_reminder', refType: 'appointment', refId: r.id,
        body: `Hi ${first(r.name)}, reminder: your appointment at ${r.salon_name} is on ${r.start_at.slice(0, 10)} at ${fmtTime(r.start_at)}. Reply 1 to confirm, 2 to reschedule.`,
      });
      await update('appointments', r.id, { reminder_sent: 1 });
    }
    return rows.length;
  },

  /** 48-hour thank-you with private feedback link. */
  async thankYou() {
    const rows = await q(
      `SELECT i.id, i.salon_id, i.public_token, c.name, c.phone, s.name AS salon_name FROM invoices i
       JOIN clients c ON c.id = i.client_id JOIN salons s ON s.id = i.salon_id
       WHERE i.status = 'paid' AND i.created_at BETWEEN NOW() - INTERVAL 72 HOUR AND NOW() - INTERVAL 48 HOUR
       AND NOT EXISTS (SELECT 1 FROM message_log m WHERE m.template = 'thank_you' AND m.ref_type = 'invoice' AND m.ref_id = i.id)`,
    );
    for (const r of rows) {
      await sendMessage({
        salonId: r.salon_id, to: r.phone, name: r.name, template: 'thank_you', refType: 'invoice', refId: r.id,
        body: `Hi ${first(r.name)}, thank you for choosing ${r.salon_name}! How was your visit? Tell us privately in 20 seconds: ${config.appUrl}/bill/${r.public_token}?feedback=1`,
      });
    }
    return rows.length;
  },

  /** Service-cycle due reminders ("root touch-up due next week"). */
  async dueReminders() {
    const salons = await q('SELECT id, name FROM salons WHERE is_active = 1');
    let n = 0;
    for (const s of salons) {
      const due = await dueClients(s.id, 200);
      for (const d of due) {
        const refId = d.client_id * 10000 + d.service_id;
        if (await alreadySent(`due_${d.due_on}`, 'client_service', refId)) continue;
        await sendMessage({
          salonId: s.id, to: d.phone, name: d.name, template: `due_${d.due_on}`, refType: 'client_service', refId,
          body: `Hi ${first(d.name)}, your ${d.service_name} at ${s.name} is due around ${d.due_on}. Book your usual slot in one tap: ${config.appUrl}/app`,
        });
        n++;
      }
    }
    return n;
  },

  /** Win-back message for lapsed clients, once every 60 days. */
  async winBack() {
    const rows = await q(
      `SELECT c.id, c.salon_id, c.name, c.phone, s.name AS salon_name FROM clients c JOIN salons s ON s.id = c.salon_id
       WHERE c.marketing_opt_in = 1 AND c.last_visit BETWEEN CURDATE() - INTERVAL 150 DAY AND CURDATE() - INTERVAL 90 DAY
       AND NOT EXISTS (SELECT 1 FROM message_log m WHERE m.template = 'win_back' AND m.ref_type = 'client' AND m.ref_id = c.id
                       AND m.created_at > NOW() - INTERVAL 60 DAY)
       LIMIT 300`,
    );
    for (const r of rows) {
      await sendMessage({
        salonId: r.salon_id, to: r.phone, name: r.name, template: 'win_back', refType: 'client', refId: r.id,
        body: `We miss you at ${r.salon_name}, ${first(r.name)}! Here is 15% off your next visit — use code COMEBACK15 within 14 days.`,
      });
    }
    return rows.length;
  },

  /** Daily low-stock alert to owner/managers. */
  async lowStock() {
    const rows = await q(
      `SELECT salon_id, COUNT(*) AS n, GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') AS names FROM products
       WHERE is_active = 1 AND stock_qty <= reorder_level GROUP BY salon_id`,
    );
    let n = 0;
    for (const r of rows) {
      const key = Number(today().replace(/-/g, ''));
      if (await alreadySent('low_stock', `salon_${r.salon_id}`, key)) continue;
      await notifySalonAdmins(r.salon_id, `${r.n} products low on stock`, r.names.slice(0, 300), 'inventory?tab=low');
      await sendMessage({ salonId: r.salon_id, channel: 'push', to: '', name: 'Managers', template: 'low_stock', refType: `salon_${r.salon_id}`, refId: key, body: `Low stock: ${r.names.slice(0, 200)}` });
      n++;
    }
    return n;
  },

  /** Refill reminder for home-care products bought ~refill_days ago. */
  async refillReminders() {
    const rows = await q(
      `SELECT pr.id, pr.salon_id, c.name, c.phone, p.name AS product, s.name AS salon_name FROM prescriptions pr
       JOIN products p ON p.id = pr.product_id JOIN clients c ON c.id = pr.client_id JOIN salons s ON s.id = pr.salon_id
       WHERE pr.status = 'bought' AND p.refill_days IS NOT NULL
       AND pr.created_at BETWEEN NOW() - INTERVAL (p.refill_days + 7) DAY AND NOW() - INTERVAL p.refill_days DAY
       AND NOT EXISTS (SELECT 1 FROM message_log m WHERE m.template = 'refill' AND m.ref_type = 'prescription' AND m.ref_id = pr.id)`,
    );
    for (const r of rows) {
      await sendMessage({
        salonId: r.salon_id, to: r.phone, name: r.name, template: 'refill', refType: 'prescription', refId: r.id,
        body: `Hi ${first(r.name)}, your ${r.product} may be running low. Reorder from ${r.salon_name} in the SaloonBaba app and pick it up on your next visit.`,
      });
    }
    return rows.length;
  },

  /** Overdue distributor invoices: reminder to the salon. */
  async vendorOverdue() {
    const rows = await q(
      `SELECT po.id, po.po_no, po.salon_id, po.total - po.paid_amount AS due, v.name AS vendor, s.phone, s.name AS salon_name
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id JOIN salons s ON s.id = po.salon_id
       WHERE po.status = 'delivered' AND po.paid_amount < po.total AND po.due_date < CURDATE()
       AND NOT EXISTS (SELECT 1 FROM message_log m WHERE m.template = 'vendor_overdue' AND m.ref_type = 'po' AND m.ref_id = po.id
                       AND m.created_at > NOW() - INTERVAL 7 DAY)`,
    );
    for (const r of rows) {
      await sendMessage({
        salonId: r.salon_id, to: r.phone, name: r.salon_name, template: 'vendor_overdue', refType: 'po', refId: r.id,
        body: `${r.vendor}: payment of ₹${Math.round(r.due)} for order ${r.po_no} is overdue. Pay by UPI from the SaloonBaba app to keep your credit line active.`,
      });
    }
    return rows.length;
  },

  /** Hygiene score from the last 14 days of checklist runs (feeds the customer-app badge). */
  async hygieneScores() {
    const rows = await q(
      `SELECT s.id, COALESCE(ROUND(AVG(cr.score)), s.hygiene_score) AS score FROM salons s
       LEFT JOIN checklist_runs cr ON cr.salon_id = s.id AND cr.run_date >= CURDATE() - INTERVAL 14 DAY GROUP BY s.id`,
    );
    for (const r of rows) await update('salons', r.id, { hygiene_score: r.score });
    return rows.length;
  },
};

export async function runAll() {
  const out = {};
  for (const [name, fn] of Object.entries(JOBS)) {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = `error: ${e.message}`;
    }
  }
  return out;
}

let timer = null;
export function startScheduler() {
  if (!config.scheduler.enabled || timer) return;
  const every = Math.max(1, config.scheduler.intervalMin) * 60000;
  timer = setInterval(() => runAll().catch((e) => console.error('[automations]', e.message)), every);
  timer.unref();
  setTimeout(() => runAll().catch(() => {}), 20000).unref();
}

export async function checkDb() {
  return one('SELECT 1 AS ok');
}

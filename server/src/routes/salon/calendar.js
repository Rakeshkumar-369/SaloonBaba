import { Router } from 'express';
import { q, one, insert, update, tx } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { getSlots, pickStylist, isFree, queueStatus, dayPlan, appointmentEnd } from '../../services/availability.js';
import { sendMessage, audit } from '../../services/notify.js';
import { bad, need, notFound, now, today, maskPhone, round2, token, timeOf } from '../../util.js';
import { config } from '../../config.js';

const r = Router({ mergeParams: true });

/** Find or create a client card by phone. */
export async function upsertClient(salonId, { client_id, client }, source = 'walkin', conn) {
  if (client_id) {
    const c = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [client_id, salonId], conn);
    if (!c) throw bad('Client not found');
    return c;
  }
  if (!client?.phone || !client?.name) throw bad('Client name and phone are required');
  const phone = String(client.phone).replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) throw bad('Enter a 10-digit mobile number');
  let c = await one('SELECT * FROM clients WHERE salon_id = ? AND phone = ?', [salonId, phone], conn);
  if (!c) {
    const user = await one(`SELECT id FROM users WHERE phone = ? AND role = 'customer'`, [phone], conn);
    const id = await insert('clients', {
      salon_id: salonId, user_id: user?.id || null, name: String(client.name).trim(), phone, gender: client.gender || null,
      source, referral_code: `R${token(3).toUpperCase()}`,
    }, conn);
    c = await one('SELECT * FROM clients WHERE id = ?', [id], conn);
  }
  return c;
}

const masked = (req, rows) =>
  req.access === 'stylist' ? rows.map((r) => ({ ...r, client_phone: maskPhone(r.client_phone) })) : rows;

r.get('/appointments', async (req, res) => {
  const date = req.query.date || today();
  const rows = await q(
    `SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.no_show_count, c.visits, c.allergies, c.colour_formula,
       u.name AS staff_name, ss.hue AS staff_hue, ch.name AS chair_name,
       (SELECT GROUP_CONCAT(sv.name SEPARATOR ', ') FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
       (SELECT GROUP_CONCAT(aps.service_id) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS service_ids,
       (SELECT SUM(aps.price) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS price
     FROM appointments a JOIN clients c ON c.id = a.client_id LEFT JOIN salon_staff ss ON ss.id = a.staff_id
     LEFT JOIN users u ON u.id = ss.user_id LEFT JOIN chairs ch ON ch.id = a.chair_id
     WHERE a.salon_id = ? AND DATE(a.start_at) = ? ${req.access === 'stylist' ? 'AND a.staff_id = ?' : ''}
     ORDER BY a.start_at`,
    [req.salon.id, date, ...(req.access === 'stylist' ? [req.staff.id] : [])],
  );
  const plan = await dayPlan(req.salon.id, date);
  res.json({
    date, open: timeOf(plan.open), close: timeOf(plan.close),
    staff: plan.staff.map(({ id, name, level, hue, off, start, end, bookedMin }) => ({ id, name, level, hue, off, start: timeOf(start), end: timeOf(end), booked_min: bookedMin })),
    appointments: masked(req, rows),
    chairs: await q('SELECT id, name, type FROM chairs WHERE salon_id = ?', [req.salon.id]),
  });
});

r.get('/slots', async (req, res) => {
  const serviceIds = String(req.query.services || '').split(',').filter(Boolean).map(Number);
  res.json(await getSlots({ salonId: req.salon.id, date: req.query.date || today(), serviceIds, staffId: req.query.staff_id || null }));
});

/** Front-desk booking from any channel (phone, WhatsApp, Instagram, Google, walk-in). */
r.post('/appointments', allow('manager'), async (req, res) => {
  const b = need(req.body, 'service_ids', 'date', 'time');
  const services = await q('SELECT * FROM services WHERE salon_id = ? AND id IN (?)', [req.salon.id, b.service_ids]);
  if (!services.length) throw bad('Pick at least one service');
  const duration = services.reduce((t, s) => t + s.duration_min, 0);
  const price = services.reduce((t, s) => t + Number(s.price), 0);
  const startAt = `${b.date} ${b.time}:00`;
  const out = await tx(async (conn) => {
    const client = await upsertClient(req.salon.id, b, b.source || 'phone', conn);
    let staffId = b.staff_id ? Number(b.staff_id) : null;
    if (staffId && !(await isFree({ salonId: req.salon.id, staffId, startAt, duration }))) throw bad('Stylist is busy at that time (double booking blocked)');
    if (!staffId) staffId = await pickStylist({ salonId: req.salon.id, startAt, duration, serviceIds: services.map((s) => s.id), preferredId: client.preferred_staff_id });
    if (!staffId) throw bad('No skilled stylist is free at that time');
    const deposit = b.request_deposit ? round2((price * req.salon.deposit_pct) / 100) : 0;
    const id = await insert('appointments', {
      salon_id: req.salon.id, client_id: client.id, staff_id: staffId, chair_id: b.chair_id || null, start_at: startAt,
      end_at: appointmentEnd(startAt, duration), status: b.source === 'walkin' ? 'checked_in' : 'confirmed',
      source: b.source || 'phone', deposit_amount: deposit, deposit_status: deposit ? 'pending' : 'none',
      notes: b.notes || null, rebooked_from_invoice_id: b.rebooked_from_invoice_id || null, created_by: req.user.id, created_at: now(),
    }, conn);
    for (const s of services) await insert('appointment_services', { appointment_id: id, service_id: s.id, price: s.price, duration_min: s.duration_min }, conn);
    return { id, client, staffId, deposit };
  });
  await sendMessage({
    salonId: req.salon.id, to: out.client.phone, name: out.client.name, template: 'booking_confirm', refType: 'appointment', refId: out.id,
    body: `Hi ${out.client.name.split(' ')[0]}, your ${services.map((s) => s.name).join(', ')} at ${req.salon.name} is booked for ${b.date} ${b.time}.` +
      (out.deposit ? ` Please pay ₹${out.deposit} deposit to confirm: ${config.appUrl}/app/bookings` : ''),
  });
  res.status(201).json({ id: out.id, staff_id: out.staffId, deposit: out.deposit });
});

const TRANSITIONS = {
  booked: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_service', 'cancelled'],
  in_service: ['checked_in'],
  completed: [],
  cancelled: ['booked'],
  no_show: ['booked'],
};

r.patch('/appointments/:id', async (req, res) => {
  const a = await one('SELECT * FROM appointments WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!a) throw notFound('Appointment not found');
  if (req.access === 'stylist' && a.staff_id !== req.staff.id) throw bad('Not your appointment');
  const data = {};
  if (req.body.status && req.body.status !== a.status) {
    if (!TRANSITIONS[a.status]?.includes(req.body.status)) throw bad(`Cannot move from ${a.status} to ${req.body.status}`);
    if (req.access === 'stylist' && !['in_service', 'checked_in'].includes(req.body.status)) throw bad('Ask the front desk to change this');
    data.status = req.body.status;
    if (data.status === 'no_show') {
      await q('UPDATE clients SET no_show_count = no_show_count + 1 WHERE id = ?', [a.client_id]);
      if (a.deposit_status === 'paid') data.deposit_status = 'forfeited';
    }
    if (['cancelled', 'no_show'].includes(data.status))
      await audit(req.salon.id, req.user.id, data.status === 'cancelled' ? 'cancel' : 'no_show', 'appointment', a.id, { reason: req.body.reason || null });
  }
  if (req.access !== 'stylist') {
    if (req.body.date && req.body.time) {
      const duration = Math.round((new Date(a.end_at.replace(' ', 'T')) - new Date(a.start_at.replace(' ', 'T'))) / 60000);
      const startAt = `${req.body.date} ${req.body.time}:00`;
      const staffId = Number(req.body.staff_id || a.staff_id);
      if (!(await isFree({ salonId: req.salon.id, staffId, startAt, duration, ignoreAppointmentId: a.id }))) throw bad('Stylist is busy at that time');
      Object.assign(data, { start_at: startAt, end_at: appointmentEnd(startAt, duration), staff_id: staffId, reminder_sent: 0 });
    } else if (req.body.staff_id && Number(req.body.staff_id) !== a.staff_id) {
      const duration = Math.round((new Date(a.end_at.replace(' ', 'T')) - new Date(a.start_at.replace(' ', 'T'))) / 60000);
      if (!(await isFree({ salonId: req.salon.id, staffId: Number(req.body.staff_id), startAt: a.start_at, duration, ignoreAppointmentId: a.id })))
        throw bad('That stylist is busy at this time');
      data.staff_id = Number(req.body.staff_id);
    }
    if (req.body.chair_id !== undefined) data.chair_id = req.body.chair_id || null;
    if (req.body.notes !== undefined) data.notes = req.body.notes;
  }
  await update('appointments', a.id, data);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Walk-in token queue
r.get('/queue', async (req, res) => res.json(await queueStatus(req.salon.id)));

r.post('/queue', allow('manager'), async (req, res) => {
  const b = req.body;
  const client = b.phone ? await upsertClient(req.salon.id, { client: { name: b.name, phone: b.phone } }, 'walkin') : null;
  if (!client && !b.name) throw bad('Name is required');
  const n = await one('SELECT COALESCE(MAX(token_no),0) + 1 AS n FROM queue_tokens WHERE salon_id = ? AND DATE(joined_at) = CURDATE()', [req.salon.id]);
  const id = await insert('queue_tokens', {
    salon_id: req.salon.id, client_id: client?.id || null, name: client?.name || b.name, phone: client?.phone || null, token_no: n.n,
    service_id: b.service_id || null, staff_id: b.staff_id || null, source: 'walkin', joined_at: now(),
  });
  const qs = await queueStatus(req.salon.id);
  const me = qs.tokens.find((t) => t.id === id);
  if (client)
    await sendMessage({
      salonId: req.salon.id, to: client.phone, name: client.name, template: 'queue_token', refType: 'queue', refId: id,
      body: `Your token at ${req.salon.name} is ${n.n}. Estimated wait ~${me?.eta_min ?? 15} min. We will WhatsApp you when your stylist is ready.`,
    });
  res.status(201).json({ id, token_no: n.n, eta_min: me?.eta_min ?? null });
});

r.patch('/queue/:id', async (req, res) => {
  const t = await one('SELECT * FROM queue_tokens WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!t) throw notFound();
  const { action } = req.body;
  if (action === 'start') {
    const staffId = Number(req.body.staff_id || t.staff_id || (req.staff?.id ?? 0));
    if (!staffId) throw bad('Pick a stylist');
    await update('queue_tokens', t.id, { status: 'serving', staff_id: staffId, started_at: now() });
    if (t.phone)
      await sendMessage({ salonId: req.salon.id, to: t.phone, name: t.name, template: 'queue_ready', refType: 'queue', refId: t.id, body: `${t.name.split(' ')[0]}, your stylist is ready at ${req.salon.name}. Please come to the front desk.` });
  } else if (action === 'done') await update('queue_tokens', t.id, { status: 'done', done_at: now() });
  else if (action === 'left') {
    await update('queue_tokens', t.id, { status: 'left', done_at: now() });
    await audit(req.salon.id, req.user.id, 'queue_left', 'queue', t.id, null);
  } else throw bad('Unknown action');
  res.json({ ok: true });
});

export default r;

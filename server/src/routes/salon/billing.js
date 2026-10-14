import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, insert, update, tx } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { priceCart, createInvoice, invoiceDetail } from '../../services/billing.js';
import { sendMessage, notifyUser, audit } from '../../services/notify.js';
import { whatsappLive } from '../../integrations/whatsapp.js';
import { bad, need, notFound, now, otp, round2, ymd, addDays, range } from '../../util.js';
import { appointmentEnd, pickStylist } from '../../services/availability.js';
import { config } from '../../config.js';

const r = Router({ mergeParams: true });

r.post('/billing/preview', allow('manager'), async (req, res) => {
  const client = req.body.client_id ? await one('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [req.body.client_id, req.salon.id]) : null;
  const cart = await priceCart({
    salon: req.salon, client, items: req.body.items || [], discountAmount: req.body.discount_amount,
    offerCode: req.body.offer_code, tipAmount: req.body.tip_amount,
  });
  const packages = client
    ? await q(
        `SELECT cp.id, cp.sessions_left, cp.expires_at, p.name, p.service_id, p.type FROM client_packages cp JOIN packages p ON p.id = cp.package_id
         WHERE cp.client_id = ? AND cp.status = 'active' AND cp.expires_at >= CURDATE()`,
        [client.id],
      )
    : [];
  const deposit = req.body.appointment_id
    ? await one(`SELECT deposit_amount FROM appointments WHERE id = ? AND deposit_status = 'paid'`, [req.body.appointment_id])
    : null;
  res.json({
    ...cart,
    needs_approval: cart.manual_discount_pct > req.salon.discount_limit_pct && !['owner', 'admin'].includes(req.access),
    discount_limit_pct: req.salon.discount_limit_pct,
    wallet_balance: client?.wallet_balance || 0, packages, deposit_paid: deposit?.deposit_amount || 0,
  });
});

/** Checkout: GST bill, payments split, stock deduction, commissions, WhatsApp bill. */
r.post('/billing/checkout', allow('manager'), async (req, res) => {
  const b = need(req.body, 'client_id', 'items', 'payments');
  const result = await createInvoice({
    salon: req.salon, user: req.user, access: req.access, clientId: b.client_id, appointmentId: b.appointment_id || null,
    items: b.items, discountAmount: b.discount_amount, discountReason: b.discount_reason, approvalId: b.approval_id,
    offerCode: b.offer_code, tipAmount: b.tip_amount, tipStaffId: b.tip_staff_id, payments: b.payments,
  });
  if (b.queue_token_id) await q(`UPDATE queue_tokens SET status = 'done', done_at = ? WHERE id = ? AND salon_id = ?`, [now(), b.queue_token_id, req.salon.id]);
  // Rebook-before-leaving suggestion: earliest service cycle among billed services
  const cycles = await q(
    `SELECT s.id, s.name, s.cycle_days FROM invoice_items ii JOIN services s ON s.id = ii.ref_id
     WHERE ii.invoice_id = ? AND ii.item_type = 'service' AND s.cycle_days IS NOT NULL ORDER BY s.cycle_days`,
    [result.invoiceId],
  );
  const staffId = result.cart.lines.find((l) => l.staff_id)?.staff_id || null;
  const rebook = cycles.length
    ? { date: ymd(addDays(new Date(), cycles[0].cycle_days)), service_ids: [cycles[0].id], service_name: cycles[0].name, staff_id: staffId, cycle_days: cycles[0].cycle_days }
    : null;
  res.status(201).json({ invoice_id: result.invoiceId, invoice_no: result.invoiceNo, total: result.cart.total, rebook });
});

/** Book the next visit from the bill (counts towards rebooking %). */
r.post('/billing/rebook', allow('manager'), async (req, res) => {
  const b = need(req.body, 'invoice_id', 'date', 'time', 'service_ids');
  const inv = await one('SELECT * FROM invoices WHERE id = ? AND salon_id = ?', [b.invoice_id, req.salon.id]);
  if (!inv) throw notFound('Bill not found');
  const services = await q('SELECT * FROM services WHERE salon_id = ? AND id IN (?)', [req.salon.id, b.service_ids]);
  const duration = services.reduce((t, s) => t + s.duration_min, 0);
  const startAt = `${b.date} ${b.time}:00`;
  const staffId = await pickStylist({ salonId: req.salon.id, startAt, duration, serviceIds: services.map((s) => s.id), preferredId: b.staff_id });
  if (!staffId) throw bad('No stylist free at that time. Try another slot.');
  const id = await tx(async (conn) => {
    const aid = await insert('appointments', {
      salon_id: req.salon.id, client_id: inv.client_id, staff_id: staffId, start_at: startAt, end_at: appointmentEnd(startAt, duration),
      status: 'confirmed', source: 'rebook', rebooked_from_invoice_id: inv.id, created_by: req.user.id, created_at: now(),
    }, conn);
    for (const s of services) await insert('appointment_services', { appointment_id: aid, service_id: s.id, price: s.price, duration_min: s.duration_min }, conn);
    return aid;
  });
  const c = await one('SELECT name, phone FROM clients WHERE id = ?', [inv.client_id]);
  await sendMessage({ salonId: req.salon.id, to: c.phone, name: c.name, template: 'rebook', refType: 'appointment', refId: id, body: `See you again on ${b.date} at ${b.time}, ${c.name.split(' ')[0]}! Your next ${services.map((s) => s.name).join(', ')} is booked at ${req.salon.name}.` });
  res.status(201).json({ id, staff_id: staffId });
});

// ------------------------------------------------------------ Discount / void approvals (owner OTP)
r.post('/approvals', allow('manager'), async (req, res) => {
  const b = need(req.body, 'type');
  const code = otp();
  const id = await insert('approval_requests', {
    salon_id: req.salon.id, type: b.type, requested_by: req.user.id,
    payload: JSON.stringify({ amount: round2(b.amount || 0), pct: b.pct || null, reason: b.reason || '', client: b.client_name || '', invoice_id: b.invoice_id || null }),
    otp_hash: await bcrypt.hash(code, 8),
  });
  const owner = await one('SELECT u.id, u.name, u.phone FROM users u WHERE u.id = ?', [req.salon.owner_user_id]);
  const what = b.type === 'void' ? `void bill #${b.invoice_id}` : `₹${b.amount} discount (${b.pct || ''}%) for ${b.client_name || 'a client'}`;
  await sendMessage({ salonId: req.salon.id, to: owner.phone, name: owner.name, template: 'approval_otp', refType: 'approval', refId: id, body: `${req.user.name} requests ${what}. Reason: ${b.reason || '-'}. Share OTP ${code} to approve, or approve in the app.` });
  await notifyUser(owner.id, 'Approval needed', `${req.user.name} requests ${what}`, 'approvals');
  res.status(201).json({ id, ...(whatsappLive() ? {} : { demo_otp: code }) });
});

r.post('/approvals/:id/verify', allow('manager'), async (req, res) => {
  const a = await one(`SELECT * FROM approval_requests WHERE id = ? AND salon_id = ? AND status = 'pending'`, [req.params.id, req.salon.id]);
  if (!a) throw notFound('Request not found or already used');
  if (!(await bcrypt.compare(String(req.body.otp || ''), a.otp_hash))) throw bad('Wrong OTP');
  await update('approval_requests', a.id, { status: 'approved', decided_by: req.salon.owner_user_id, decided_at: now() });
  if (a.type === 'void') await doVoid(req, a.payload.invoice_id, a.payload.reason);
  res.json({ ok: true, status: 'approved' });
});

r.get('/approvals', allow('manager'), async (req, res) => {
  res.json(await q(
    `SELECT a.*, u.name AS requested_by_name FROM approval_requests a JOIN users u ON u.id = a.requested_by
     WHERE a.salon_id = ? ORDER BY a.status = 'pending' DESC, a.id DESC LIMIT 50`,
    [req.salon.id],
  ));
});

r.post('/approvals/:id/decide', allow(), async (req, res) => {
  const a = await one(`SELECT * FROM approval_requests WHERE id = ? AND salon_id = ? AND status = 'pending'`, [req.params.id, req.salon.id]);
  if (!a) throw notFound('Request not found');
  const approved = Boolean(req.body.approve);
  await update('approval_requests', a.id, { status: approved ? 'approved' : 'rejected', decided_by: req.user.id, decided_at: now() });
  if (approved && a.type === 'void') await doVoid(req, a.payload.invoice_id, a.payload.reason);
  await notifyUser(a.requested_by, `Request ${approved ? 'approved' : 'rejected'}`, `${a.type} request #${a.id}`, 'billing');
  res.json({ ok: true });
});

// ------------------------------------------------------------ Invoices
r.get('/invoices', allow('manager'), async (req, res) => {
  const { fromDt, toDt } = range(req.query, 7);
  const search = req.query.q ? `%${req.query.q}%` : null;
  res.json(await q(
    `SELECT i.id, i.invoice_no, i.total, i.discount_amount, i.tip_amount, i.status, i.created_at, i.public_token, c.name AS client_name, c.id AS client_id,
       (SELECT GROUP_CONCAT(DISTINCT mode) FROM payments p WHERE p.invoice_id = i.id) AS modes,
       (SELECT GROUP_CONCAT(name SEPARATOR ', ') FROM invoice_items ii WHERE ii.invoice_id = i.id) AS items
     FROM invoices i JOIN clients c ON c.id = i.client_id
     WHERE i.salon_id = ? AND i.created_at BETWEEN ? AND ? ${search ? 'AND (c.name LIKE ? OR c.phone LIKE ? OR i.invoice_no LIKE ?)' : ''}
     ORDER BY i.created_at DESC LIMIT 200`,
    [req.salon.id, fromDt, toDt, ...(search ? [search, search, search] : [])],
  ));
});

r.get('/invoices/:id', allow('manager'), async (req, res) => {
  const inv = await invoiceDetail('i.id = ? AND i.salon_id = ' + Number(req.salon.id), req.params.id);
  if (!inv) throw notFound();
  res.json(inv);
});

r.post('/invoices/:id/send', allow('manager'), async (req, res) => {
  const inv = await invoiceDetail('i.id = ? AND i.salon_id = ' + Number(req.salon.id), req.params.id);
  if (!inv) throw notFound();
  await sendMessage({ salonId: req.salon.id, to: inv.client_phone, name: inv.client_name, template: 'invoice', refType: 'invoice', refId: inv.id, body: `Your bill ${inv.invoice_no} from ${inv.salon_name} for ₹${inv.total}: ${config.appUrl}/bill/${inv.public_token}` });
  res.json({ ok: true });
});

async function doVoid(req, invoiceId, reason) {
  await tx(async (conn) => {
    const inv = await one(`SELECT * FROM invoices WHERE id = ? AND salon_id = ? AND status = 'paid' FOR UPDATE`, [invoiceId, req.salon.id], conn);
    if (!inv) throw bad('Bill not found or already void');
    await update('invoices', inv.id, { status: 'void', void_reason: reason || 'Voided', voided_by: req.user.id }, conn);
    const moves = await q(`SELECT * FROM stock_movements WHERE ref_type = 'invoice' AND ref_id = ?`, [inv.id], conn);
    for (const m of moves) {
      await q('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [m.qty, m.product_id], conn);
      await insert('stock_movements', { product_id: m.product_id, salon_id: m.salon_id, type: 'return', qty: -m.qty, ref_type: 'void', ref_id: inv.id, created_by: req.user.id, created_at: now() }, conn);
    }
    const pays = await q('SELECT * FROM payments WHERE invoice_id = ?', [inv.id], conn);
    for (const p of pays) {
      if (p.mode === 'wallet') {
        await q('UPDATE clients SET wallet_balance = wallet_balance + ? WHERE id = ?', [p.amount, inv.client_id], conn);
        await insert('wallet_txns', { client_id: inv.client_id, salon_id: inv.salon_id, amount: p.amount, type: 'credit', note: `Refund for void ${inv.invoice_no}`, invoice_id: inv.id, created_at: now() }, conn);
      }
    }
    const redeemed = await q('SELECT client_package_id FROM invoice_items WHERE invoice_id = ? AND client_package_id IS NOT NULL', [inv.id], conn);
    for (const x of redeemed) await q(`UPDATE client_packages SET sessions_left = sessions_left + 1, status = 'active' WHERE id = ?`, [x.client_package_id], conn);
    await q('UPDATE clients SET visits = GREATEST(visits - 1, 0), total_spend = GREATEST(total_spend - ?, 0) WHERE id = ?', [inv.total, inv.client_id], conn);
    if (inv.appointment_id) await q(`UPDATE appointments SET status = 'checked_in', invoice_id = NULL WHERE id = ?`, [inv.appointment_id], conn);
  });
  await audit(req.salon.id, req.user.id, 'void', 'invoice', Number(invoiceId), { reason });
}

r.post('/invoices/:id/void', allow('manager'), async (req, res) => {
  const reason = need(req.body, 'reason').reason;
  if (!['owner', 'admin'].includes(req.access)) throw bad('Voiding a bill needs owner approval', { needsApproval: true });
  await doVoid(req, Number(req.params.id), reason);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Packages & memberships
r.get('/packages', async (req, res) => {
  res.json(await q(
    `SELECT p.*, s.name AS service_name, (SELECT COUNT(*) FROM client_packages cp WHERE cp.package_id = p.id) AS sold
     FROM packages p LEFT JOIN services s ON s.id = p.service_id WHERE p.salon_id = ? ORDER BY p.is_active DESC, p.type, p.price`,
    [req.salon.id],
  ));
});

r.post('/packages', allow(), async (req, res) => {
  const b = need(req.body, 'name', 'type', 'price');
  if (b.type === 'package' && (!b.sessions || !b.service_id)) throw bad('A package needs a service and number of sessions');
  const id = await insert('packages', {
    salon_id: req.salon.id, name: b.name, type: b.type, price: b.price, sessions: b.sessions || null, service_id: b.service_id || null,
    value_amount: b.value_amount || null, discount_pct: b.discount_pct || null, validity_days: b.validity_days || 365, description: b.description || null,
  });
  res.status(201).json({ id });
});

r.patch('/packages/:id', allow(), async (req, res) => {
  await q('UPDATE packages SET is_active = ? WHERE id = ? AND salon_id = ?', [req.body.is_active ? 1 : 0, req.params.id, req.salon.id]);
  res.json({ ok: true });
});

/** Prepaid liability: unredeemed package sessions + wallet balances. */
r.get('/packages/ledger', allow(), async (req, res) => {
  const rows = await q(
    `SELECT cp.*, p.name, p.type, c.name AS client_name, c.phone AS client_phone,
       CASE WHEN cp.sessions_total > 0 THEN ROUND(cp.price_paid * cp.sessions_left / cp.sessions_total, 2) ELSE 0 END AS liability
     FROM client_packages cp JOIN packages p ON p.id = cp.package_id JOIN clients c ON c.id = cp.client_id
     WHERE cp.salon_id = ? ORDER BY cp.status, cp.expires_at LIMIT 300`,
    [req.salon.id],
  );
  const wallet = await one('SELECT COALESCE(SUM(wallet_balance),0) AS w, COUNT(*) AS n FROM clients WHERE salon_id = ? AND wallet_balance > 0', [req.salon.id]);
  const active = rows.filter((r) => r.status === 'active');
  res.json({
    rows,
    summary: {
      sold_value: round2(rows.reduce((t, r) => t + Number(r.price_paid), 0)),
      package_liability: round2(active.reduce((t, r) => t + Number(r.liability), 0)),
      sessions_outstanding: active.reduce((t, r) => t + Number(r.sessions_left || 0), 0),
      wallet_liability: round2(wallet.w), wallet_clients: wallet.n,
      expiring_30d: active.filter((r) => r.expires_at <= ymd(addDays(new Date(), 30))).length,
    },
  });
});

export default r;

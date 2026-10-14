import { q, one, insert, update, tx } from '../db.js';
import { bad, round2, now, today, addDays, ymd, token, minutesOf, hm } from '../util.js';
import { sendMessage, audit } from './notify.js';
import { config } from '../config.js';

export const GST_RATE = 0.18; // salon services: 18% (9% CGST + 9% SGST); menu prices are GST-inclusive

/** Split a GST-inclusive amount into taxable + CGST + SGST. */
export function splitGst(total) {
  const taxable = round2(total / (1 + GST_RATE));
  const tax = round2(total - taxable);
  const cgst = round2(tax / 2);
  return { taxable, cgst, sgst: round2(tax - cgst) };
}

/** Find a usable offer for a salon by code, checking dates, happy hours and first-visit rules. */
export async function findOffer(salon, code, client, at = new Date()) {
  if (!code) return null;
  const offer = await one(
    `SELECT * FROM offers WHERE code = ? AND is_active = 1 AND (salon_id = ? OR (brand_id IS NOT NULL AND brand_id = ?))
     ORDER BY salon_id DESC LIMIT 1`,
    [String(code).toUpperCase(), salon.id, salon.brand_id || 0],
  );
  if (!offer) throw bad('Offer code not valid for this salon');
  const d = ymd(at);
  if (offer.valid_from && d < offer.valid_from) throw bad('Offer has not started yet');
  if (offer.valid_to && d > offer.valid_to) throw bad('Offer has expired');
  if (offer.happy_hour) {
    const days = String(offer.days || '').split(',').filter(Boolean).map(Number);
    if (days.length && !days.includes(at.getDay())) throw bad('Happy-hour offer is not valid today');
    const m = minutesOf(hm(at));
    if (offer.start_time && (m < minutesOf(offer.start_time) || m >= minutesOf(offer.end_time)))
      throw bad(`Happy-hour offer valid ${offer.start_time.slice(0, 5)}–${offer.end_time.slice(0, 5)} only`);
  }
  if (offer.first_visit_only && client && client.visits > 0) throw bad('Offer is for first visits only');
  return offer;
}

/**
 * Price a cart without saving it. Used for live preview and by createInvoice.
 * items: [{ type:'service'|'product'|'package'|'membership', ref_id, qty, staff_id, client_package_id }]
 */
export async function priceCart({ salon, client, items = [], discountAmount = 0, offerCode = null, tipAmount = 0 }, conn) {
  const lines = [];
  const staffRows = await q('SELECT * FROM salon_staff WHERE salon_id = ?', [salon.id], conn);
  const staffMap = new Map(staffRows.map((s) => [s.id, s]));
  for (const it of items) {
    const qty = Math.max(1, Number(it.qty || 1));
    const staff = it.staff_id ? staffMap.get(Number(it.staff_id)) : null;
    if (it.type === 'service') {
      const s = await one('SELECT * FROM services WHERE id = ? AND salon_id = ?', [it.ref_id, salon.id], conn);
      if (!s) throw bad('Unknown service');
      const value = round2(s.price * qty);
      const commission = staff ? round2((value * staff.service_commission_pct) / 100) : 0;
      if (it.client_package_id) {
        // Prepaid package session: ₹0 on this bill (revenue was booked when the package was sold)
        const cp = await one(
          `SELECT cp.*, p.service_id, p.name FROM client_packages cp JOIN packages p ON p.id = cp.package_id
           WHERE cp.id = ? AND cp.client_id = ? AND cp.status = 'active' AND cp.expires_at >= CURDATE()`,
          [it.client_package_id, client?.id || 0], conn,
        );
        if (!cp || !cp.sessions_left) throw bad('Package has no sessions left');
        if (cp.service_id !== s.id) throw bad(`${cp.name} cannot be used for ${s.name}`);
        lines.push({
          item_type: 'service', ref_id: s.id, name: `${s.name} (package session)`, qty: 1, unit_price: 0, amount: 0,
          duration_min: s.duration_min, staff_id: staff?.id || null, commission_amount: commission, category: s.category,
          client_package_id: cp.id,
        });
        continue;
      }
      lines.push({
        item_type: 'service', ref_id: s.id, name: s.name, qty, unit_price: s.price, amount: value,
        duration_min: s.duration_min * qty, staff_id: staff?.id || null, commission_amount: commission, category: s.category,
      });
    } else if (it.type === 'product') {
      const p = await one('SELECT * FROM products WHERE id = ? AND salon_id = ?', [it.ref_id, salon.id], conn);
      if (!p) throw bad('Unknown product');
      if (p.kind === 'backbar') throw bad(`${p.name} is back-bar stock and cannot be sold`);
      const amount = round2(p.mrp * qty);
      lines.push({
        item_type: 'product', ref_id: p.id, name: p.name, qty, unit_price: p.mrp, amount,
        staff_id: staff?.id || null,
        commission_amount: staff ? round2((amount * staff.retail_incentive_pct) / 100) : 0,
        cost: p.cost_price * qty,
      });
    } else if (it.type === 'package' || it.type === 'membership') {
      const p = await one('SELECT * FROM packages WHERE id = ? AND salon_id = ? AND is_active = 1', [it.ref_id, salon.id], conn);
      if (!p) throw bad('Unknown package');
      lines.push({
        item_type: p.type, ref_id: p.id, name: p.name, qty: 1, unit_price: p.price, amount: p.price,
        staff_id: staff?.id || null, commission_amount: staff ? round2((p.price * 2) / 100) : 0,
      });
    }
  }
  if (!lines.length) throw bad('Add at least one item');
  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const serviceTotal = round2(lines.filter((l) => l.item_type === 'service').reduce((t, l) => t + l.amount, 0));

  // Membership discount on services (auto, no approval needed)
  let memberDiscount = 0;
  let membership = null;
  if (client) {
    membership = await one(
      `SELECT cp.*, p.name FROM client_packages cp JOIN packages p ON p.id = cp.package_id
       WHERE cp.client_id = ? AND cp.status = 'active' AND p.type = 'membership' AND cp.expires_at >= CURDATE()
       ORDER BY cp.discount_pct DESC LIMIT 1`,
      [client.id],
      conn,
    );
    if (membership?.discount_pct) memberDiscount = round2((serviceTotal * membership.discount_pct) / 100);
  }
  let offer = null;
  let offerDiscount = 0;
  if (offerCode) {
    offer = await findOffer(salon, offerCode, client);
    if (subtotal < offer.min_bill) throw bad(`Offer needs a minimum bill of ₹${offer.min_bill}`);
    offerDiscount = offer.type === 'percent' ? round2((serviceTotal * offer.value) / 100) : Math.min(offer.value, subtotal);
  }
  const manual = round2(Math.max(0, Number(discountAmount || 0)));
  const discount = round2(Math.min(subtotal, memberDiscount + offerDiscount + manual));
  const total = round2(subtotal - discount);
  const gst = splitGst(total);
  return {
    lines, subtotal, service_total: serviceTotal, member_discount: memberDiscount, membership_name: membership?.name || null,
    offer, offer_discount: offerDiscount, manual_discount: manual,
    manual_discount_pct: subtotal ? round2((manual / subtotal) * 100) : 0,
    discount, total, ...gst, tip: round2(Number(tipAmount || 0)), payable: round2(total + Number(tipAmount || 0)),
  };
}

async function nextInvoiceNo(conn, salonId, at) {
  const prefix = `${at.slice(2, 4)}${at.slice(5, 7)}`;
  const row = await one(
    `SELECT invoice_no FROM invoices WHERE salon_id = ? AND invoice_no LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [salonId, `${prefix}-%`],
    conn,
  );
  const n = row ? Number(row.invoice_no.split('-')[1]) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/**
 * Create a paid invoice (POS checkout).
 * payments: [{ mode:'cash'|'upi'|'card'|'wallet'|'deposit', amount, ref }]
 * A service item may carry client_package_id to redeem a prepaid package session.
 */
export async function createInvoice({
  salon, user, access = 'owner', clientId, appointmentId = null, items, discountAmount = 0, discountReason = null,
  approvalId = null, offerCode = null, tipAmount = 0, tipStaffId = null, payments = [], at = null, silent = false,
}) {
  const result = await tx(async (conn) => {
    const client = await one('SELECT * FROM clients WHERE id = ? AND salon_id = ? FOR UPDATE', [clientId, salon.id], conn);
    if (!client) throw bad('Client not found');
    if (appointmentId) {
      const appt = await one('SELECT status, invoice_id FROM appointments WHERE id = ? AND salon_id = ? FOR UPDATE', [appointmentId, salon.id], conn);
      if (!appt) throw bad('Appointment not found');
      if (appt.invoice_id || ['completed', 'cancelled', 'no_show'].includes(appt.status)) throw bad('This appointment is already billed or closed');
    }
    const cart = await priceCart({ salon, client, items, discountAmount, offerCode, tipAmount }, conn);
    const createdAt = at || now();

    // Discount approval rule: above the limit, non-owners need an approved OTP request.
    let approval = null;
    if (cart.manual_discount > 0 && cart.manual_discount_pct > salon.discount_limit_pct && !['owner', 'admin'].includes(access) && !at) {
      if (!approvalId) throw bad(`Discount above ${salon.discount_limit_pct}% needs owner approval`, { needsApproval: true });
      approval = await one(`SELECT * FROM approval_requests WHERE id = ? AND salon_id = ? AND type = 'discount'`, [approvalId, salon.id], conn);
      const approvedAmt = approval?.payload?.amount ?? JSON.parse(approval?.payload || '{}').amount;
      if (!approval || approval.status !== 'approved' || Number(approvedAmt) < cart.manual_discount)
        throw bad('Discount approval is missing or not approved', { needsApproval: true });
    }

    // Validate payments
    const paid = round2(payments.reduce((t, p) => t + Number(p.amount || 0), 0));
    if (Math.abs(paid - cart.payable) > 1) throw bad(`Payments (₹${paid}) must equal amount payable (₹${cart.payable})`);

    const invoiceNo = await nextInvoiceNo(conn, salon.id, createdAt);
    const invoiceId = await insert('invoices', {
      salon_id: salon.id, client_id: client.id, appointment_id: appointmentId, invoice_no: invoiceNo,
      subtotal: cart.subtotal, discount_amount: cart.discount,
      discount_reason: [cart.membership_name && cart.member_discount ? `Member: ${cart.membership_name}` : null, cart.offer ? `Offer ${cart.offer.code}` : null, cart.manual_discount ? discountReason || 'Manual discount' : null].filter(Boolean).join('; ') || null,
      approval_id: approval?.id || null, taxable: cart.taxable, cgst: cart.cgst, sgst: cart.sgst, total: cart.total,
      tip_amount: cart.tip, tip_staff_id: cart.tip ? tipStaffId || cart.lines.find((l) => l.staff_id)?.staff_id || null : null,
      status: 'paid', offer_id: cart.offer?.id || null, public_token: token(10), created_by: user?.id || null, created_at: createdAt,
    }, conn);
    if (approval) await update('approval_requests', approval.id, { status: 'used' }, conn);

    for (const l of cart.lines) {
      await insert('invoice_items', {
        invoice_id: invoiceId, item_type: l.item_type, ref_id: l.ref_id, name: l.name, qty: l.qty,
        unit_price: l.unit_price, amount: l.amount, duration_min: l.duration_min || null,
        staff_id: l.staff_id, commission_amount: l.commission_amount, client_package_id: l.client_package_id || null,
      }, conn);
      if (l.client_package_id) {
        const cp = await one('SELECT sessions_left FROM client_packages WHERE id = ? FOR UPDATE', [l.client_package_id], conn);
        const left = cp.sessions_left - 1;
        await update('client_packages', l.client_package_id, { sessions_left: left, status: left <= 0 ? 'exhausted' : 'active' }, conn);
      }
      if (l.item_type === 'service') {
        // Back-bar recipe: auto-deduct expected product usage
        const recipe = await q('SELECT product_id, qty FROM service_recipes WHERE service_id = ?', [l.ref_id], conn);
        for (const r of recipe) {
          const used = r.qty * l.qty;
          await q('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [used, r.product_id], conn);
          await insert('stock_movements', {
            product_id: r.product_id, salon_id: salon.id, type: 'backbar', qty: -used, staff_id: l.staff_id,
            ref_type: 'invoice', ref_id: invoiceId, created_by: user?.id || null, created_at: createdAt,
          }, conn);
        }
      } else if (l.item_type === 'product') {
        await q('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [l.qty, l.ref_id], conn);
        await insert('stock_movements', {
          product_id: l.ref_id, salon_id: salon.id, type: 'sale', qty: -l.qty, staff_id: l.staff_id,
          ref_type: 'invoice', ref_id: invoiceId, created_by: user?.id || null, created_at: createdAt,
        }, conn);
        await q(
          `UPDATE prescriptions SET status = 'bought', invoice_id = ? WHERE client_id = ? AND product_id = ? AND status = 'suggested'`,
          [invoiceId, client.id, l.ref_id], conn,
        );
      } else if (l.item_type === 'package' || l.item_type === 'membership') {
        const p = await one('SELECT * FROM packages WHERE id = ?', [l.ref_id], conn);
        await insert('client_packages', {
          client_id: client.id, package_id: p.id, salon_id: salon.id, sessions_total: p.sessions, sessions_left: p.sessions,
          price_paid: p.price, discount_pct: p.discount_pct, purchased_at: createdAt,
          expires_at: ymd(addDays(createdAt, p.validity_days)), invoice_id: invoiceId, status: 'active',
        }, conn);
        if (p.value_amount) {
          await q('UPDATE clients SET wallet_balance = wallet_balance + ? WHERE id = ?', [p.value_amount, client.id], conn);
          await insert('wallet_txns', { client_id: client.id, salon_id: salon.id, amount: p.value_amount, type: 'credit', note: `${p.name} credit`, invoice_id: invoiceId, created_at: createdAt }, conn);
        }
      }
    }

    for (const p of payments) {
      const amount = round2(Number(p.amount || 0));
      if (amount <= 0) continue;
      if (p.mode === 'wallet') {
        const fresh = await one('SELECT wallet_balance FROM clients WHERE id = ?', [client.id], conn);
        if (fresh.wallet_balance + 0.01 < amount) throw bad('Not enough wallet balance');
        await q('UPDATE clients SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount, client.id], conn);
        await insert('wallet_txns', { client_id: client.id, salon_id: salon.id, amount, type: 'debit', note: `Bill ${invoiceNo}`, invoice_id: invoiceId, created_at: createdAt }, conn);
      }
      if (p.mode === 'deposit' && appointmentId) {
        await q(`UPDATE appointments SET deposit_status = 'adjusted' WHERE id = ?`, [appointmentId], conn);
      }
      if (!['cash', 'upi', 'card', 'wallet', 'deposit'].includes(p.mode)) throw bad('Unknown payment mode');
      await insert('payments', { invoice_id: invoiceId, client_id: client.id, salon_id: salon.id, mode: p.mode, amount, ref: p.ref || null, created_at: createdAt }, conn);
    }

    const visitDate = createdAt.slice(0, 10);
    await q(
      `UPDATE clients SET visits = visits + 1, total_spend = total_spend + ?, first_visit = COALESCE(first_visit, ?),
       last_visit = GREATEST(COALESCE(last_visit, ?), ?),
       preferred_staff_id = COALESCE(preferred_staff_id, ?) WHERE id = ?`,
      [cart.total, visitDate, visitDate, visitDate, cart.lines.find((l) => l.staff_id)?.staff_id || null, client.id],
      conn,
    );
    if (appointmentId) await q(`UPDATE appointments SET status = 'completed', invoice_id = ? WHERE id = ?`, [invoiceId, appointmentId], conn);

    if (cart.manual_discount > 0)
      await audit(salon.id, user?.id, 'discount', 'invoice', invoiceId, { amount: cart.manual_discount, pct: cart.manual_discount_pct, reason: discountReason, approval: approval?.id || null });

    return { invoiceId, invoiceNo, cart, client };
  });

  if (!silent) {
    const inv = await one('SELECT public_token FROM invoices WHERE id = ?', [result.invoiceId]);
    await sendMessage({
      salonId: salon.id, to: result.client.phone, name: result.client.name, template: 'invoice',
      body: `Hi ${result.client.name.split(' ')[0]}, thank you for visiting ${salon.name}! Your GST bill ${result.invoiceNo} for ₹${result.cart.total} is here: ${config.appUrl}/bill/${inv.public_token}`,
      refType: 'invoice', refId: result.invoiceId,
    });
  }
  return result;
}

/** Full invoice with lines, payments and salon header (for print / WhatsApp link). */
export async function invoiceDetail(where, param) {
  const inv = await one(
    `SELECT i.*, c.name AS client_name, c.phone AS client_phone, s.name AS salon_name, s.address, s.city, s.gst_number, s.phone AS salon_phone, s.upi_id
     FROM invoices i JOIN clients c ON c.id = i.client_id JOIN salons s ON s.id = i.salon_id WHERE ${where}`,
    [param],
  );
  if (!inv) return null;
  inv.items = await q(
    `SELECT ii.*, u.name AS staff_name FROM invoice_items ii LEFT JOIN salon_staff ss ON ss.id = ii.staff_id
     LEFT JOIN users u ON u.id = ss.user_id WHERE ii.invoice_id = ?`,
    [inv.id],
  );
  inv.payments = await q('SELECT mode, amount, ref FROM payments WHERE invoice_id = ?', [inv.id]);
  return inv;
}

export const isToday = (d) => String(d).slice(0, 10) === today();

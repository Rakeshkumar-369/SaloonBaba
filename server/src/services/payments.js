import { insert, one, q, update } from '../db.js';
import { config } from '../config.js';
import { bad, notFound, now, ymd, addDays, today, round2 } from '../util.js';
import { razorpayLive, createOrder, verifySignature } from '../integrations/razorpay.js';
import { notifySalonAdmins, notifyUser } from './notify.js';

/**
 * Start an online payment. With Razorpay keys this creates a real order that the
 * client opens in Razorpay Checkout (UPI, cards, netbanking). Without keys the
 * order is simulated and can be completed from the demo checkout sheet.
 */
export async function startPayment({ userId, purpose, refId, amount, description }) {
  amount = round2(amount);
  if (amount <= 0) throw bad('Nothing to pay');
  if (razorpayLive()) {
    const id = await insert('payment_orders', { user_id: userId, purpose, ref_id: refId, amount, provider: 'razorpay' });
    const order = await createOrder(amount, `po_${id}`, { purpose, ref_id: String(refId) });
    await update('payment_orders', id, { provider_order_id: order.id });
    return { mode: 'live', payment_order_id: id, key_id: config.razorpay.keyId, order_id: order.id, amount, description };
  }
  const id = await insert('payment_orders', { user_id: userId, purpose, ref_id: refId, amount, provider: 'simulator', provider_order_id: `sim_${Date.now()}` });
  return { mode: 'simulated', payment_order_id: id, amount, description };
}

/** Confirm a payment (from checkout handler, webhook, or demo simulator). */
export async function confirmPayment(paymentOrderId, { razorpay_payment_id, razorpay_signature, simulated } = {}) {
  const po = await one('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
  if (!po) throw notFound('Payment not found');
  if (po.status === 'paid') return po;
  if (po.provider === 'razorpay') {
    if (!verifySignature(po.provider_order_id, razorpay_payment_id, razorpay_signature)) throw bad('Payment signature mismatch');
  } else if (!simulated) {
    throw bad('Simulated payment must be confirmed from the demo checkout');
  }
  await update('payment_orders', po.id, { status: 'paid', provider_payment_id: razorpay_payment_id || `simpay_${Date.now()}` });
  await applyPaymentEffects(po);
  return { ...po, status: 'paid' };
}

export async function markPaidByProviderOrder(providerOrderId, paymentId) {
  const po = await one('SELECT * FROM payment_orders WHERE provider_order_id = ?', [providerOrderId]);
  if (!po || po.status === 'paid') return;
  await update('payment_orders', po.id, { status: 'paid', provider_payment_id: paymentId });
  await applyPaymentEffects(po);
}

async function applyPaymentEffects(po) {
  if (po.purpose === 'deposit') {
    const a = await one('SELECT * FROM appointments WHERE id = ?', [po.ref_id]);
    await update('appointments', po.ref_id, { deposit_status: 'paid', status: 'confirmed' });
    if (a) await notifySalonAdmins(a.salon_id, 'Deposit received', `₹${po.amount} deposit paid for booking #${a.id}`, `calendar?date=${a.start_at.slice(0, 10)}`);
  } else if (po.purpose === 'shop') {
    await update('shop_orders', po.ref_id, { status: 'paid', payment_ref: `pay_${po.id}` });
    const o = await one('SELECT salon_id FROM shop_orders WHERE id = ?', [po.ref_id]);
    if (o) await notifySalonAdmins(o.salon_id, 'New paid shop order', `Order #${po.ref_id} for ₹${po.amount}`, 'inventory?tab=orders');
  } else if (po.purpose === 'gold') {
    const u = await one('SELECT gold_until FROM users WHERE id = ?', [po.ref_id]);
    const start = u?.gold_until && u.gold_until > today() ? u.gold_until : today();
    await update('users', po.ref_id, { gold_until: ymd(addDays(start, 90)) });
    await notifyUser(po.ref_id, 'Welcome to SaloonBaba Gold', 'Priority slots and member prices are now active for 90 days.');
  } else if (po.purpose === 'po') {
    const p = await one('SELECT * FROM purchase_orders WHERE id = ?', [po.ref_id]);
    await q('UPDATE purchase_orders SET paid_amount = paid_amount + ? WHERE id = ?', [po.amount, po.ref_id]);
    await insert('vendor_payments', { vendor_id: p.vendor_id, salon_id: p.salon_id, po_id: p.id, amount: po.amount, mode: 'upi', ref: `pay_${po.id}`, paid_at: now() });
  } else if (po.purpose === 'royalty') {
    await update('royalty_invoices', po.ref_id, { status: 'paid', paid_at: now() });
  }
}

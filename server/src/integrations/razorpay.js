import crypto from 'node:crypto';
import { config } from '../config.js';

export const razorpayLive = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

/** Create a Razorpay order (amount in rupees). */
export async function createOrder(amount, receipt, notes = {}) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'INR', receipt, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
  return data;
}

/** Verify the checkout handler signature: HMAC_SHA256(order_id|payment_id, secret). */
export function verifySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

/** Verify webhook body signature with the webhook secret. */
export function verifyWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** UPI intent string for a static/dynamic QR at the counter. */
export const upiIntent = ({ vpa, name, amount, note }) =>
  `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || '')}`;

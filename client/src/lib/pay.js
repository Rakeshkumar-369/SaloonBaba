// Online payments: Razorpay Checkout when the server has keys, otherwise a demo checkout sheet.
import { post } from './api.js';

let rzpLoading = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  rzpLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.head.appendChild(s);
  });
  return rzpLoading;
}

/**
 * Complete a payment order returned by the API.
 * For simulated mode, `askDemo` shows the demo sheet and resolves when the user taps Pay.
 */
export async function completePayment(order, { askDemo, user } = {}) {
  if (!order) return null;
  if (order.mode === 'live') {
    await loadRazorpay();
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.key_id, order_id: order.order_id, amount: Math.round(order.amount * 100), currency: 'INR', name: 'SaloonBaba',
        description: order.description, prefill: { name: user?.name, contact: user?.phone, email: user?.email || '' }, theme: { color: '#6d28d9' },
        handler: async (r) => {
          try {
            resolve(await post(`/me/payments/${order.payment_order_id}/confirm`, r));
          } catch (e) {
            reject(e);
          }
        },
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      });
      rzp.open();
    });
  }
  await askDemo(order);
  return post(`/me/payments/${order.payment_order_id}/confirm`, { simulated: true });
}

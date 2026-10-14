import { createContext, useContext, useState } from 'react';
import { Sheet, Button, Notice } from './kit.jsx';
import Icon from './Icon.jsx';
import { inr } from '../lib/format.js';
import { completePayment } from '../lib/pay.js';
import { useAuth } from '../lib/auth.jsx';

const PayCtx = createContext(null);

/** Provides pay(order): Razorpay when live, otherwise a demo UPI/card sheet. */
export function PayProvider({ children }) {
  const [pending, setPending] = useState(null);
  const [method, setMethod] = useState('upi');
  const { user } = useAuth() || {};
  const askDemo = (order) => new Promise((resolve, reject) => setPending({ order, resolve, reject }));
  const pay = (order) => completePayment(order, { askDemo, user });
  const close = (ok) => {
    if (ok) pending.resolve();
    else pending.reject(new Error('Payment cancelled'));
    setPending(null);
  };
  return (
    <PayCtx.Provider value={pay}>
      {children}
      <Sheet open={Boolean(pending)} onClose={() => close(false)} title="Checkout">
        {pending && (
          <div className="col">
            <div className="card flat center">
              <div className="muted small">{pending.order.description}</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{inr(pending.order.amount, { decimals: 2 })}</div>
            </div>
            <div className="col gap-s">
              {[['upi', 'UPI (GPay, PhonePe, Paytm)', 'qr'], ['card', 'Credit / debit card', 'card'], ['netbanking', 'Netbanking', 'building']].map(([k, l, ic]) => (
                <button key={k} type="button" className={`list-item card flat ${method === k ? 'active' : ''}`} style={{ borderColor: method === k ? 'var(--primary)' : undefined }} onClick={() => setMethod(k)}>
                  <Icon name={ic} /><span className="grow">{l}</span>{method === k && <Icon name="checkCircle" />}
                </button>
              ))}
            </div>
            <Notice tone="info" icon="lock">Demo mode — no money moves. Add Razorpay keys in <code>.env</code> to take real UPI and card payments.</Notice>
            <Button className="block lg" onClick={() => close(true)}>Pay {inr(pending.order.amount, { decimals: 2 })}</Button>
          </div>
        )}
      </Sheet>
    </PayCtx.Provider>
  );
}

export const usePay = () => useContext(PayCtx);

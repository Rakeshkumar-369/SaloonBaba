import { useState } from 'react';
import { useApi, post } from '../../lib/api.js';
import { Async, Card, Button, Badge, Empty, Sheet, Toggle, Textarea, useAction, StatusBadge, Tabs } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import { inr, dateShort } from '../../lib/format.js';

export default function Shop() {
  const q = useApi('/customer/shop');
  const orders = useApi('/customer/shop/orders');
  const [tab, setTab] = useState('shop');
  const [cart, setCart] = useState({});
  const [checkout, setCheckout] = useState(false);
  const [fulfil, setFulfil] = useState('pickup');
  const [address, setAddress] = useState('');
  const [run, busy] = useAction();
  const pay = usePay();
  const products = q.data?.products || [];
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ ...products.find((p) => p.id === Number(id)), qty }));
  const salonId = lines[0]?.salon_id;
  const total = lines.reduce((t, l) => t + l.mrp * l.qty, 0);
  const add = (p, d) => {
    if (salonId && p.salon_id !== salonId && d > 0) return alert('Your cart has products from another salon. Check out first.');
    setCart((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] || 0) + d) }));
  };
  const placeOrder = () => run(async () => {
    const r = await post('/customer/shop/orders', { salon_id: salonId, items: lines.map((l) => ({ product_id: l.id, qty: l.qty })), fulfilment: fulfil, address });
    try { await pay(r.payment); } catch { /* order stays unpaid */ }
    setCart({});
    setCheckout(false);
    orders.reload();
    setTab('orders');
  }, 'Order placed').catch(() => {});

  return (
    <div className="page" style={{ paddingBottom: lines.length ? 170 : undefined }}>
      <h1>Shop home-care</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['shop', 'Products'], ['orders', 'My orders']]} />
      {tab === 'shop' ? (
        <Async q={q}>
          {(d) => !d.products.length ? <Empty icon="bag" title="Visit a salon to unlock its shop" /> : (
            <div className="grid-auto">
              {d.products.map((p) => (
                <Card key={p.id}>
                  <div className="row between top">
                    <div><div className="bold">{p.name}</div><div className="small muted">{p.brand} · {p.salon_name}</div></div>
                    {p.prescribed ? <Badge tone="primary">Your stylist recommends</Badge> : null}
                  </div>
                  <div className="row between mt">
                    <b style={{ fontSize: 18 }}>{inr(p.mrp)}</b>
                    {cart[p.id] ? (
                      <div className="row gap-s"><button className="btn xs ghost" onClick={() => add(p, -1)}><Icon name="minus" size={14} /></button><b>{cart[p.id]}</b><button className="btn xs ghost" onClick={() => add(p, 1)}><Icon name="plus" size={14} /></button></div>
                    ) : <Button size="sm" variant="soft" onClick={() => add(p, 1)}>Add</Button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Async>
      ) : (
        <Async q={orders}>
          {(rows) => !rows.length ? <Empty icon="bag" title="No orders yet" /> : (
            <div className="col">{rows.map((o) => (
              <Card key={o.id}><div className="row between"><div><div className="bold">Order #{o.id} · {o.salon_name}</div><div className="small muted">{o.items}</div><div className="tiny muted">{dateShort(o.created_at)} · {o.fulfilment}</div></div><div className="right"><b>{inr(o.total)}</b><div><StatusBadge status={o.status} /></div></div></div></Card>
            ))}</div>
          )}
        </Async>
      )}
      {lines.length > 0 && tab === 'shop' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))', padding: 12, zIndex: 25 }}>
          <div className="card row" style={{ maxWidth: 640, margin: '0 auto' }}>
            <div className="grow"><b>{lines.reduce((t, l) => t + l.qty, 0)} items · {inr(total)}</b></div>
            <Button onClick={() => setCheckout(true)}>Checkout</Button>
          </div>
        </div>
      )}
      <Sheet open={checkout} onClose={() => setCheckout(false)} title="Checkout">
        <div className="col">
          {lines.map((l) => <div key={l.id} className="row between small"><span>{l.qty} × {l.name}</span><b>{inr(l.mrp * l.qty)}</b></div>)}
          <div className="divider" />
          <Toggle value={fulfil} onChange={setFulfil} options={[['pickup', 'Pick up at salon'], ['delivery', 'Home delivery']]} />
          {fulfil === 'delivery' && <Textarea placeholder="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} />}
          <Button className="block lg" busy={busy} onClick={placeOrder}>Pay {inr(total)}</Button>
        </div>
      </Sheet>
    </div>
  );
}

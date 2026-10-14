import { useEffect, useState } from 'react';
import { useApi, api, post, del } from '../../lib/api.js';
import { navigate } from '../../lib/router.jsx';
import { Async, Button, Card, Empty, StatusBadge, Tabs, Confirm, useAction, Notice, Badge } from '../../ui/kit.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import { BookingSheet } from './SalonPage.jsx';
import { relDay, time12, inr, dateDay } from '../../lib/format.js';

export default function Bookings() {
  const q = useApi('/customer/bookings');
  const queue = useApi('/customer/queue/mine');
  const [tab, setTab] = useState('upcoming');
  const [cancel, setCancel] = useState(null);
  const [move, setMove] = useState(null);
  const [run] = useAction();
  const pay = usePay();

  useEffect(() => {
    const id = setInterval(() => queue.reload(), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payDeposit = (a) => run(async () => {
    const order = await post(`/customer/bookings/${a.id}/pay-deposit`);
    await pay(order);
    q.reload();
  }, 'Deposit paid — booking confirmed').catch(() => {});
  const doCancel = () => run(async () => {
    const r = await api(`/customer/bookings/${cancel.id}`, { method: 'PATCH', body: { action: 'cancel' } });
    setCancel(null);
    q.reload();
    return r;
  }, (r) => (r.deposit_status === 'refunded' ? 'Cancelled — deposit will be refunded' : 'Booking cancelled')).catch(() => {});
  const openMove = async (a) => {
    const d = await api(`/customer/salons/${a.slug}`);
    setMove({ a, d });
  };

  return (
    <div className="page">
      <h1>My bookings</h1>
      {queue.data?.map((t) => (
        <Card key={t.id} className="mb" style={{ borderColor: t.ready ? 'var(--good)' : undefined }}>
          <div className="row between">
            <div><div className="small muted">Walk-in token · {t.salon_name}</div><div style={{ fontSize: 30, fontWeight: 800 }}>T{t.token_no}</div></div>
            <div className="right">
              {t.ready ? <Badge tone="good">Your stylist is ready</Badge> : <><div className="bold">{t.eta_min ?? '—'} min</div><div className="small muted">#{t.position} in line</div></>}
              {t.likely_staff && <div className="tiny muted">likely with {t.likely_staff}</div>}
            </div>
          </div>
          {!t.ready && <Button size="sm" variant="ghost" className="mt" onClick={() => run(() => del(`/customer/queue/${t.id}`).then(queue.reload), 'You left the queue')}>Leave queue</Button>}
        </Card>
      ))}
      <Tabs value={tab} onChange={setTab} tabs={[['upcoming', 'Upcoming'], ['past', 'Past visits']]} />
      <Async q={q}>
        {(d) => {
          const rows = d[tab];
          if (!rows.length) return <Empty icon="calendar" title={tab === 'upcoming' ? 'No upcoming bookings' : 'No visits yet'}><Button className="mt" onClick={() => navigate('/app')}>Find a salon</Button></Empty>;
          return (
            <div className="col">
              {rows.map((a) => (
                <Card key={a.id}>
                  <div className="row between top">
                    <div className="grow">
                      <div className="bold">{a.salon_name}</div>
                      <div className="small">{a.services}</div>
                      <div className="small muted">{relDay(a.start_at)} · {time12(a.start_at)}{a.staff_name ? ` · with ${a.staff_name}` : ''}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.deposit_status === 'pending' && (
                    <Notice tone="warn" icon="lock">Pay {inr(a.deposit_amount)} deposit to confirm. Adjusted in your bill.</Notice>
                  )}
                  <div className="row wrap mt">
                    {a.deposit_status === 'pending' && <Button size="sm" icon="qr" onClick={() => payDeposit(a)}>Pay deposit by UPI</Button>}
                    {tab === 'upcoming' && ['booked', 'confirmed'].includes(a.status) && <>
                      <Button size="sm" variant="ghost" onClick={() => openMove(a)}>Reschedule</Button>
                      <Button size="sm" variant="ghost" onClick={() => setCancel(a)}>Cancel</Button>
                    </>}
                    {a.bill_token && <Button size="sm" variant="ghost" icon="receipt" onClick={() => navigate(`/bill/${a.bill_token}`)}>GST bill</Button>}
                    {a.bill_token && !a.review_id && <Button size="sm" variant="soft" icon="star" onClick={() => navigate(`/bill/${a.bill_token}?feedback=1`)}>Rate visit</Button>}
                    {tab === 'past' && <Button size="sm" variant="ghost" icon="refresh" onClick={() => navigate(`/app/s/${a.slug}?rebook=1`)}>Book again</Button>}
                  </div>
                </Card>
              ))}
            </div>
          );
        }}
      </Async>
      <Confirm open={Boolean(cancel)} onClose={() => setCancel(null)} onYes={doCancel} danger yes="Cancel booking" title="Cancel this booking?"
        body={cancel ? `${cancel.services} on ${dateDay(cancel.start_at)}. Deposits are refunded if you cancel at least 4 hours before.` : ''} />
      {move && <BookingSheet salon={move.d.salon} services={move.d.services} staff={move.d.staff} reschedule={move.a.id}
        init={{ serviceIds: String(move.a.service_ids).split(',').map(Number), date: move.a.start_at.slice(0, 10) }} onClose={() => setMove(null)} onDone={() => { setMove(null); q.reload(); }} />}
    </div>
  );
}


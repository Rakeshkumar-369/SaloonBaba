import { useApi, post } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { Async, Card, Button, Empty, Progress, useAction, StatusBadge, Notice } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import { inr, dateShort, today } from '../../lib/format.js';

export default function Wallet() {
  const q = useApi('/customer/wallet');
  const { refresh } = useAuth();
  const pay = usePay();
  const [run, busy] = useAction();
  const buyGold = () => run(async () => {
    await pay(await post('/customer/gold'));
    await refresh();
    q.reload();
  }, 'Welcome to SaloonBaba Gold!').catch(() => {});

  return (
    <div className="page">
      <h1>Wallet & memberships</h1>
      <Async q={q}>
        {(d) => {
          const gold = d.gold_until && d.gold_until >= today();
          return (
            <div className="col">
              <div className="card" style={{ background: 'linear-gradient(135deg,#1c1530,#4c1d95 60%,#b45309)', color: '#fff' }}>
                <div className="row between"><b style={{ fontSize: 18 }}>SaloonBaba Gold</b><Icon name="award" /></div>
                {gold ? <p className="small mt">Active till {dateShort(d.gold_until)} · priority slots and member prices at Gold partner salons.</p>
                  : <p className="small mt">Priority slots on weekends, 10% member price at partner salons, free rescheduling. ₹299 for 90 days.</p>}
                {!gold && <Button variant="soft" busy={busy} onClick={buyGold}>Join Gold — ₹299</Button>}
              </div>

              <div className="section-title">Salon wallets</div>
              {d.cards.length ? (
                <div className="grid-auto">
                  {d.cards.map((c) => (
                    <div key={c.client_id} className="card row" style={{ borderLeft: `5px solid hsl(${c.hue} 60% 50%)` }}>
                      <div className="grow"><div className="bold">{c.salon_name}</div><div className="tiny muted">Referral code {c.referral_code}</div></div>
                      <b style={{ fontSize: 20 }}>{inr(c.wallet_balance)}</b>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="wallet" title="No salon wallets yet" />}

              <div className="section-title">Packages & memberships</div>
              {d.packages.length ? d.packages.map((p) => (
                <Card key={p.id}>
                  <div className="row between"><div><div className="bold">{p.name}</div><div className="small muted">{p.salon_name}</div></div><StatusBadge status={p.status} /></div>
                  {p.sessions_total ? (
                    <div className="mt"><div className="row between small"><span>{p.service_name}</span><b>{p.sessions_left} of {p.sessions_total} left</b></div><Progress value={p.sessions_left} max={p.sessions_total} /></div>
                  ) : <div className="small mt">{Number(p.discount_pct)}% off services at this salon</div>}
                  <div className="tiny muted mt">Valid till {dateShort(p.expires_at)} · paid {inr(p.price_paid)}</div>
                </Card>
              )) : <Empty icon="gift" title="No packages" />}

              <div className="section-title">Refer a friend</div>
              <Card>
                <div className="row between"><div><div className="bold">Your code: {d.referral_code}</div><div className="small muted">Friend gets 15% off the first visit, you get ₹200 wallet credit.</div></div>
                  <Button size="sm" variant="ghost" icon="send" onClick={() => navigator.share ? navigator.share({ text: `Book salons with live wait times on SaloonBaba. Use my code ${d.referral_code} for 15% off: ${location.origin}/app` }) : navigator.clipboard?.writeText(d.referral_code)}>Share</Button>
                </div>
              </Card>

              <div className="section-title">Wallet history</div>
              {d.txns.length ? (
                <div className="card pad-0 list">
                  {d.txns.map((t) => (
                    <div key={t.id} className="list-item">
                      <div className="grow"><div className="small bold">{t.note}</div><div className="tiny muted">{t.salon_name} · {dateShort(t.created_at)}</div></div>
                      <b className={t.type === 'credit' ? 'good' : ''}>{t.type === 'credit' ? '+' : '−'}{inr(t.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : <Notice>Wallet credits from memberships and top-ups appear here.</Notice>}
            </div>
          );
        }}
      </Async>
    </div>
  );
}

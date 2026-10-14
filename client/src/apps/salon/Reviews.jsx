import { useState } from 'react';
import { useApi, post } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Button, Badge, Chips, Sheet, Input, Textarea, useAction, Empty, StatusBadge, Stars, Progress, Notice } from '../../ui/kit.jsx';
import { ago } from '../../lib/format.js';

export default function Reviews() {
  const { id } = useSalon();
  const [stage, setStage] = useQueryState('stage', '');
  const q = useApi(`/salons/${id}/reviews${stage ? `?stage=${stage}` : ''}`);
  const [recover, setRecover] = useState(null);
  const [f, setF] = useState({ note: '', message: '', wallet_credit: '' });
  const [run, busy] = useAction();
  const open = (r) => {
    setRecover(r);
    setF({ note: '', message: `Hi ${r.client_name?.split(' ')[0]}, I am sorry your visit was not perfect. I have added a credit to your wallet and would love to fix it personally — when can you come in?`, wallet_credit: 300 });
  };
  return (
    <div className="page">
      <h1>Reviews & feedback</h1>
      <p className="muted small">Low ratings come to you privately first. Recover the client before a 1-star review goes public.</p>
      <Async q={q}>
        {(d) => (
          <div className="col">
            <Card>
              <div className="row between"><Stars value={d.summary.overall} count={d.summary.n} />{d.summary.private_n > 0 && <Badge tone="bad">{d.summary.private_n} need recovery</Badge>}</div>
              <div className="grid-2 mt">
                {[['Result', d.summary.result], ['Hygiene', d.summary.hygiene], ['Wait', d.summary.wait], ['Value', d.summary.value], ['Behaviour', d.summary.behaviour]].map(([l, v]) => <div key={l}><div className="row between small"><span>{l}</span><b>{Number(v || 0).toFixed(1)}</b></div><Progress value={Number(v || 0)} max={5} /></div>)}
              </div>
            </Card>
            <Chips value={stage} onChange={setStage} items={[['', 'All'], ['private', 'Private (unhappy)'], ['recovered', 'Recovered'], ['public', 'Public']]} />
            {d.rows.length ? d.rows.map((r) => (
              <Card key={r.id}>
                <div className="row between"><div><b>{r.client_name}</b> <span className="small muted">· {r.staff_name || 'team'}</span></div><Stars value={r.overall} /></div>
                <div className="tiny muted">Result {r.r_result} · Hygiene {r.r_hygiene} · Wait {r.r_wait} · Value {r.r_value} · Behaviour {r.r_behaviour} · {ago(r.created_at)}</div>
                {r.comment && <p className="mt">{r.comment}</p>}
                {r.recovery_note && <div className="small good">Recovered: {r.recovery_note}</div>}
                <div className="row mt"><StatusBadge status={r.stage} />{r.stage === 'private' && <Button size="sm" onClick={() => open(r)}>Recover client</Button>}</div>
              </Card>
            )) : <Empty icon="star" title="No reviews here" />}
          </div>
        )}
      </Async>
      <Sheet open={Boolean(recover)} onClose={() => setRecover(null)} title={`Recover ${recover?.client_name}`}>
        <div className="col">
          <Notice tone="bad">“{recover?.comment || 'No comment'}” — {recover?.overall}★</Notice>
          <Textarea label="WhatsApp to client" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <Input label="Wallet credit ₹ (optional)" type="number" value={f.wallet_credit} onChange={(e) => setF({ ...f, wallet_credit: e.target.value })} />
          <Input label="Internal note (what happened, what you did)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Button busy={busy} onClick={() => run(() => post(`/salons/${id}/reviews/${recover.id}/recover`, f), 'Client recovered').then(() => { setRecover(null); q.reload(); })}>Send & mark recovered</Button>
        </div>
      </Sheet>
    </div>
  );
}

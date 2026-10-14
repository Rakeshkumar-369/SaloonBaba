import { useApi, post } from '../../lib/api.js';
import { useSalon } from './SalonApp.jsx';
import { Async, Card, Button, Empty, StatusBadge, Notice } from '../../ui/kit.jsx';
import { inr, ago, cap } from '../../lib/format.js';

export default function Approvals() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/approvals`);
  const decide = (a, approve) => post(`/salons/${id}/approvals/${a.id}/decide`, { approve }).then(q.reload);
  return (
    <div className="page">
      <h1>Approvals</h1>
      <Notice icon="lock">Discounts above the limit and bill voids need you. Managers can also enter the OTP you receive on WhatsApp.</Notice>
      <Async q={q}>
        {(rows) => !rows.length ? <Empty icon="checkCircle" title="Nothing to approve" /> : (
          <div className="col mt">
            {rows.map((a) => {
              const p = typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload;
              return (
                <Card key={a.id}>
                  <div className="row between top">
                    <div><b>{cap(a.type)} {a.type === 'discount' ? `${inr(p.amount)}${p.pct ? ` (${p.pct}%)` : ''}` : `bill #${p.invoice_id}`}</b>
                      <div className="small muted">{a.requested_by_name} · {p.client || ''} · {ago(a.created_at)}</div>
                      {p.reason && <div className="small">“{p.reason}”</div>}</div>
                    <StatusBadge status={a.status} />
                  </div>
                  {a.status === 'pending' && <div className="row mt"><Button size="sm" onClick={() => decide(a, true)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide(a, false)}>Reject</Button></div>}
                </Card>
              );
            })}
          </div>
        )}
      </Async>
    </div>
  );
}

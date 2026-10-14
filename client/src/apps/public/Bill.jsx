import { useState } from 'react';
import { Button, Async, Textarea, Notice, useAction, StatusBadge } from '../../ui/kit.jsx';
import Rate, { RATING_KEYS } from '../../ui/Rate.jsx';
import { useApi, post } from '../../lib/api.js';
import { useLocation } from '../../lib/router.jsx';
import { inr, dateTime, cap } from '../../lib/format.js';

export default function Bill({ token }) {
  const q = useApi(`/public/bill/${token}`);
  const { query } = useLocation();
  return (
    <div className="page" style={{ maxWidth: 560, paddingBottom: 40 }}>
      <Async q={q}>{(inv) => <BillView inv={inv} token={token} openFeedback={query.feedback === '1'} reload={q.reload} />}</Async>
    </div>
  );
}

function BillView({ inv, token, openFeedback, reload }) {
  const [r, setR] = useState({ result: 0, hygiene: 0, wait: 0, value: 0, behaviour: 0, comment: '' });
  const [done, setDone] = useState(null);
  const [run, busy] = useAction();
  const submit = () => run(async () => {
    const out = await post(`/public/bill/${token}/feedback`, r);
    setDone(out);
    reload();
  }).catch(() => {});
  const ready = RATING_KEYS.every(([k]) => r[k] > 0);
  return (
    <div className="col">
      <div className="card">
        <div className="row between top">
          <div>
            <h2 style={{ margin: 0 }}>{inv.salon_name}</h2>
            <div className="small muted">{inv.address}</div>
            {inv.gst_number && <div className="tiny muted">GSTIN {inv.gst_number}</div>}
          </div>
          <StatusBadge status={inv.status} />
        </div>
        <div className="divider" />
        <div className="row between small"><span>Tax invoice <b>{inv.invoice_no}</b></span><span>{dateTime(inv.created_at)}</span></div>
        <div className="small muted">Billed to {inv.client_name} · {inv.client_phone}</div>
        <div className="divider" />
        {inv.items.map((it) => (
          <div key={it.id} className="row between small" style={{ padding: '4px 0' }}>
            <div><div>{it.name}{Number(it.qty) > 1 ? ` × ${Number(it.qty)}` : ''}</div>{it.staff_name && <div className="tiny muted">{cap(it.item_type)} · {it.staff_name}</div>}</div>
            <b className="num">{inr(it.amount, { decimals: 2 })}</b>
          </div>
        ))}
        <div className="divider" />
        <dl className="kv">
          <dt>Subtotal</dt><dd>{inr(inv.subtotal, { decimals: 2 })}</dd>
          {Number(inv.discount_amount) > 0 && <><dt>Discount {inv.discount_reason ? `(${inv.discount_reason})` : ''}</dt><dd>−{inr(inv.discount_amount, { decimals: 2 })}</dd></>}
          <dt>Taxable value</dt><dd>{inr(inv.taxable, { decimals: 2 })}</dd>
          <dt>CGST 9%</dt><dd>{inr(inv.cgst, { decimals: 2 })}</dd>
          <dt>SGST 9%</dt><dd>{inr(inv.sgst, { decimals: 2 })}</dd>
          <dt className="bold">Total (incl. GST)</dt><dd className="bold">{inr(inv.total, { decimals: 2 })}</dd>
          {Number(inv.tip_amount) > 0 && <><dt>Tip</dt><dd>{inr(inv.tip_amount)}</dd></>}
        </dl>
        <div className="divider" />
        <div className="small muted">Paid by {inv.payments.map((p) => `${cap(p.mode)} ${inr(p.amount)}`).join(' + ')}</div>
        <div className="tiny muted mt">SAC 999721 · Prices include GST · Thank you for visiting!</div>
        <Button variant="ghost" size="sm" icon="download" className="mt no-print" onClick={() => window.print()}>Save as PDF</Button>
      </div>

      <div className="card no-print" id="feedback">
        {inv.review || done ? (
          <Notice tone={(done?.stage || inv.review?.stage) === 'public' ? 'good' : 'info'} icon="smile">
            {done?.message || 'Thanks — your feedback is recorded.'}
          </Notice>
        ) : (
          <div className="col">
            <h3 style={{ margin: 0 }}>{openFeedback ? 'How was your visit?' : 'Rate your visit'}</h3>
            <div className="small muted">Only billed visits can be reviewed. If something was not right, the manager sees it first and will fix it.</div>
            {RATING_KEYS.map(([k, l]) => <Rate key={k} label={l} value={r[k]} onChange={(v) => setR({ ...r, [k]: v })} />)}
            <Textarea placeholder="Anything we should know? (optional)" value={r.comment} onChange={(e) => setR({ ...r, comment: e.target.value })} />
            <Button busy={busy} disabled={!ready} onClick={submit}>Submit feedback</Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, api, post } from '../../lib/api.js';
import { useQueryState, useLocation, setQuery } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Sheet, Select, Input, Tabs, useAction, Empty, Notice, Avatar, KV, Card, SearchBox, StatusBadge, Table, useToast } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import RangeChips, { rangeQs } from '../../ui/Range.jsx';
import { inr, time12, dateTime, cap, addDays, today, dateDay } from '../../lib/format.js';

export default function Billing() {
  const [tab, setTab] = useQueryState('tab', 'new');
  return (
    <div className="page">
      <h1>Billing & POS</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['new', 'New bill'], ['bills', 'Bills']]} />
      {tab === 'new' ? <NewBill /> : <Bills />}
    </div>
  );
}

let lineKey = 0;

function NewBill() {
  const { id, salon } = useSalon();
  const { query } = useLocation();
  const toast = useToast();
  const services = useApi(`/salons/${id}/services`);
  const staffQ = useApi(`/salons/${id}/staff`);
  const products = useApi(`/salons/${id}/products?kind=retail`);
  const packagesQ = useApi(`/salons/${id}/packages`);
  const stylists = (staffQ.data || []).filter((s) => s.role !== 'receptionist');

  const [client, setClient] = useState(null);
  const [appointmentId, setAppointmentId] = useState(null);
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState({ amount: '', reason: '', code: '' });
  const [tip, setTip] = useState({ amount: '', staff_id: '' });
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsTouched, setPaymentsTouched] = useState(false);
  const [approval, setApproval] = useState(null);
  const [addOpen, setAddOpen] = useState(null);
  const [done, setDone] = useState(null);
  const [qr, setQr] = useState(null);
  const [run, busy] = useAction();
  const loadedFor = useRef(null);

  // Prefill from appointment or queue token
  useEffect(() => {
    const key = `${query.appointment}-${query.token}`;
    if (loadedFor.current === key || !services.data) return;
    loadedFor.current = key;
    if (query.appointment) {
      api(`/salons/${id}/appointments/${query.appointment}`).then((a) => {
        setAppointmentId(a.id);
        setClient({ id: a.client_id, name: a.client_name, phone: a.client_phone, visits: a.visits, wallet_balance: a.wallet_balance, allergies: a.allergies });
        setItems(a.services.map((s) => ({ key: ++lineKey, type: 'service', ref_id: s.service_id, name: s.name, price: s.price, staff_id: a.staff_id })));
      }).catch(() => toast('Could not load appointment', 'error'));
    } else if (query.client) {
      api(`/salons/${id}/clients/${query.client}`).then((c) => setClient(c.client));
      if (query.service) {
        const s = services.data.find((x) => x.id === Number(query.service));
        if (s) setItems([{ key: ++lineKey, type: 'service', ref_id: s.id, name: s.name, price: s.price, staff_id: Number(query.staff) || '' }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.appointment, query.token, services.data]);

  // Live pricing (GST, membership, offer, approvals)
  useEffect(() => {
    if (!items.length) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      post(`/salons/${id}/billing/preview`, {
        client_id: client?.id, appointment_id: appointmentId, items: items.map(toApiItem),
        discount_amount: Number(discount.amount || 0), offer_code: discount.code || undefined, tip_amount: Number(tip.amount || 0),
      }).then((p) => { setPreview(p); setPreviewErr(null); }).catch((e) => { setPreviewErr(e.message); });
    }, 250);
    return () => clearTimeout(t);
  }, [items, client, discount, tip, id, appointmentId]);

  // Default payment split
  useEffect(() => {
    if (!preview || paymentsTouched) return;
    const rows = [];
    let left = preview.payable;
    if (preview.deposit_paid) { rows.push({ mode: 'deposit', amount: Math.min(left, preview.deposit_paid) }); left -= Math.min(left, preview.deposit_paid); }
    if (left > 0) rows.push({ mode: 'upi', amount: Math.round(left * 100) / 100 });
    setPayments(rows);
  }, [preview, paymentsTouched]);

  const paid = payments.reduce((t, p) => t + Number(p.amount || 0), 0);
  const remaining = preview ? Math.round((preview.payable - paid) * 100) / 100 : 0;
  const needsApproval = preview?.needs_approval && !(approval?.approved);

  const reset = () => {
    setClient(null); setItems([]); setDiscount({ amount: '', reason: '', code: '' }); setTip({ amount: '', staff_id: '' });
    setPayments([]); setPaymentsTouched(false); setApproval(null); setAppointmentId(null); setPreview(null);
    setQuery({ appointment: null, token: null, client: null, service: null, staff: null });
  };

  const requestApproval = () => run(async () => {
    const r = await post(`/salons/${id}/approvals`, { type: 'discount', amount: preview.manual_discount, pct: preview.manual_discount_pct, reason: discount.reason, client_name: client?.name });
    setApproval({ id: r.id, demo_otp: r.demo_otp, otp: '' });
  }, 'OTP sent to the owner on WhatsApp').catch(() => {});
  const verifyApproval = () => run(async () => {
    await post(`/salons/${id}/approvals/${approval.id}/verify`, { otp: approval.otp });
    setApproval({ ...approval, approved: true });
  }, 'Discount approved').catch(() => {});

  const checkout = () => run(async () => {
    const r = await post(`/salons/${id}/billing/checkout`, {
      client_id: client.id, appointment_id: appointmentId, items: items.map(toApiItem), discount_amount: Number(discount.amount || 0),
      discount_reason: discount.reason, approval_id: approval?.approved ? approval.id : undefined, offer_code: discount.code || undefined,
      tip_amount: Number(tip.amount || 0), tip_staff_id: tip.staff_id || undefined, queue_token_id: query.token || undefined,
      payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: Number(p.amount) })),
    });
    setDone({ ...r, client });
    reset();
  }, 'Bill saved and sent on WhatsApp').catch(() => {});

  const showQr = async () => {
    const upi = payments.find((p) => p.mode === 'upi');
    const r = await api(`/public/upi-qr?salon_id=${id}&amount=${upi?.amount || remaining}&note=${encodeURIComponent(`${salon.name} bill`)}`);
    setQr(r);
  };

  return (
    <div className="grid grid-md-2" style={{ alignItems: 'start' }}>
      <div className="col">
        <ClientPicker client={client} setClient={setClient} />
        {client?.allergies && <Notice tone="bad" icon="alert">Allergy: {client.allergies}</Notice>}
        <Card title="Items" action={<div className="row gap-s"><Button size="sm" variant="soft" icon="scissors" onClick={() => setAddOpen('service')}>Service</Button><Button size="sm" variant="ghost" icon="bag" onClick={() => setAddOpen('product')}>Product</Button><Button size="sm" variant="ghost" icon="gift" onClick={() => setAddOpen('package')}>Package</Button></div>}>
          {items.length ? (
            <div className="col gap-s">
              {items.map((it) => {
                const pkgs = (preview?.packages || []).filter((p) => p.type === 'package' && p.service_id === it.ref_id && p.sessions_left > 0);
                return (
                  <div key={it.key} className="card flat" style={{ padding: 10 }}>
                    <div className="row between">
                      <div className="grow"><b className="small">{it.name}</b><div className="tiny muted">{cap(it.type)}{it.qty > 1 ? ` × ${it.qty}` : ''}</div></div>
                      <b className="num">{it.client_package_id ? 'Package' : inr(it.price * (it.qty || 1))}</b>
                      <button className="icon-btn" aria-label="Remove" onClick={() => setItems(items.filter((x) => x.key !== it.key))}><Icon name="trash" size={16} /></button>
                    </div>
                    {it.type !== 'package' && (
                      <div className="row mt" style={{ marginTop: 6 }}>
                        <select className="input sm" value={it.staff_id || ''} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, staff_id: Number(e.target.value) || '' } : x)))} aria-label="Stylist">
                          <option value="">{it.type === 'product' ? 'Sold by (retail incentive)' : 'Done by'}</option>
                          {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {it.type === 'service' && pkgs.length > 0 && (
                          <select className="input sm" value={it.client_package_id || ''} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, client_package_id: Number(e.target.value) || null } : x)))} aria-label="Use package">
                            <option value="">Pay normally</option>
                            {pkgs.map((p) => <option key={p.id} value={p.id}>Use {p.name} ({p.sessions_left} left)</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="receipt" title="Add services or products">Open a booking from the calendar and tap “Bill now” to prefill.</Empty>}
        </Card>
        <Card title="Discount & tip">
          <div className="grid-2">
            <Input label="Offer code" value={discount.code} onChange={(e) => setDiscount({ ...discount, code: e.target.value.toUpperCase() })} placeholder="HAPPY20" />
            <Input label="Manual discount ₹" type="number" inputMode="decimal" value={discount.amount} onChange={(e) => { setDiscount({ ...discount, amount: e.target.value }); setApproval(null); }} />
          </div>
          {Number(discount.amount) > 0 && <Input label="Reason" value={discount.reason} onChange={(e) => setDiscount({ ...discount, reason: e.target.value })} placeholder="e.g. service delay" />}
          <div className="grid-2 mt">
            <Input label="Tip ₹" type="number" inputMode="decimal" value={tip.amount} onChange={(e) => setTip({ ...tip, amount: e.target.value })} />
            <Select label="Tip for" value={tip.staff_id} onChange={(e) => setTip({ ...tip, staff_id: e.target.value })} options={[['', 'Main stylist'], ...stylists.map((s) => [s.id, s.name])]} />
          </div>
        </Card>
      </div>

      <div className="col" style={{ position: 'sticky', top: 70 }}>
        <Card title="Bill summary">
          {previewErr && <Notice tone="bad">{previewErr}</Notice>}
          {preview ? (
            <>
              <dl className="kv">
                <dt>Subtotal</dt><dd>{inr(preview.subtotal, { decimals: 2 })}</dd>
                {preview.member_discount > 0 && <><dt>{preview.membership_name}</dt><dd className="good">−{inr(preview.member_discount, { decimals: 2 })}</dd></>}
                {preview.offer_discount > 0 && <><dt>Offer {preview.offer?.code}</dt><dd className="good">−{inr(preview.offer_discount, { decimals: 2 })}</dd></>}
                {preview.manual_discount > 0 && <><dt>Manual discount ({preview.manual_discount_pct}%)</dt><dd className="good">−{inr(preview.manual_discount, { decimals: 2 })}</dd></>}
                <dt>Taxable value</dt><dd>{inr(preview.taxable, { decimals: 2 })}</dd>
                <dt>CGST 9% + SGST 9%</dt><dd>{inr(preview.cgst + preview.sgst, { decimals: 2 })}</dd>
                <dt className="bold">Total (incl. GST)</dt><dd className="bold" style={{ fontSize: 18 }}>{inr(preview.total, { decimals: 2 })}</dd>
                {preview.tip > 0 && <><dt>Tip</dt><dd>{inr(preview.tip)}</dd></>}
              </dl>
              {needsApproval && (
                <Notice tone="warn" icon="lock">
                  Discount above {preview.discount_limit_pct}% needs the owner’s OTP.
                  {!approval ? <div className="mt"><Button size="sm" busy={busy} onClick={requestApproval}>Request owner OTP</Button></div> : (
                    <div className="row mt">
                      <Input placeholder="6-digit OTP" value={approval.otp} onChange={(e) => setApproval({ ...approval, otp: e.target.value })} />
                      <Button size="sm" busy={busy} onClick={verifyApproval}>Verify</Button>
                    </div>
                  )}
                  {approval?.demo_otp && <div className="tiny mt">Demo mode: owner OTP is <b>{approval.demo_otp}</b> (also visible in the owner’s Approvals screen)</div>}
                </Notice>
              )}
              {approval?.approved && <Badge tone="good">Discount approved</Badge>}
              <div className="divider" />
              <div className="row between"><b>Payment</b><span className={`small ${Math.abs(remaining) > 1 ? 'bad' : 'good'}`}>{Math.abs(remaining) > 1 ? `${inr(remaining)} unallocated` : 'Fully allocated'}</span></div>
              <div className="col gap-s mt">
                {payments.map((p, i) => (
                  <div key={i} className="row">
                    <select className="input sm" style={{ width: 120 }} value={p.mode} onChange={(e) => { setPaymentsTouched(true); setPayments(payments.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x))); }}>
                      {['upi', 'cash', 'card', 'wallet', 'deposit'].map((m) => <option key={m} value={m}>{m === 'upi' ? 'UPI' : cap(m)}</option>)}
                    </select>
                    <input className="input sm" type="number" inputMode="decimal" value={p.amount} onChange={(e) => { setPaymentsTouched(true); setPayments(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))); }} />
                    <button className="icon-btn" aria-label="Remove payment" onClick={() => { setPaymentsTouched(true); setPayments(payments.filter((_, j) => j !== i)); }}><Icon name="x" size={16} /></button>
                  </div>
                ))}
                <div className="row wrap gap-s">
                  <Button size="xs" variant="ghost" icon="plus" onClick={() => { setPaymentsTouched(true); setPayments([...payments, { mode: 'cash', amount: Math.max(0, remaining) }]); }}>Split</Button>
                  {preview.wallet_balance > 0 && <Button size="xs" variant="ghost" icon="wallet" onClick={() => { setPaymentsTouched(true); const w = Math.min(preview.wallet_balance, preview.payable); setPayments([{ mode: 'wallet', amount: w }, ...(preview.payable - w > 0 ? [{ mode: 'upi', amount: Math.round((preview.payable - w) * 100) / 100 }] : [])]); }}>Use wallet {inr(preview.wallet_balance)}</Button>}
                  <Button size="xs" variant="ghost" icon="qr" onClick={showQr}>Show UPI QR</Button>
                </div>
              </div>
              <Button className="block lg mt" busy={busy} disabled={!client || needsApproval || Math.abs(remaining) > 1} onClick={checkout}>
                {!client ? 'Pick a client' : `Collect ${inr(preview.payable)} & send bill`}
              </Button>
            </>
          ) : <div className="muted small">Add items to see GST and total. Prices include 18% GST.</div>}
        </Card>
      </div>

      <AddItemSheet type={addOpen} onClose={() => setAddOpen(null)} services={services.data || []} products={products.data || []} packages={(packagesQ.data || []).filter((p) => p.is_active)}
        onAdd={(it) => { setItems([...items, { key: ++lineKey, staff_id: items.find((x) => x.staff_id)?.staff_id || '', ...it }]); setAddOpen(null); }} />
      <Sheet open={Boolean(qr)} onClose={() => setQr(null)} title="Scan to pay by UPI">
        {qr && <div className="center col"><div className="qr" dangerouslySetInnerHTML={{ __html: qr.svg }} /><div className="small muted">{salon.upi_id}</div><a className="btn ghost sm" href={qr.intent}>Open UPI app</a></div>}
      </Sheet>
      {done && <DoneSheet done={done} onClose={() => setDone(null)} />}
    </div>
  );
}

const toApiItem = (it) => ({ type: it.type, ref_id: it.ref_id, qty: it.qty || 1, staff_id: it.staff_id || undefined, client_package_id: it.client_package_id || undefined });

function ClientPicker({ client, setClient }) {
  const { id } = useSalon();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);
  const [nc, setNc] = useState({ name: '', phone: '' });
  const [run, busy] = useAction();
  useEffect(() => {
    if (search.length < 2) return setFound([]);
    const t = setTimeout(() => api(`/salons/${id}/clients/lookup?q=${encodeURIComponent(search)}`).then(setFound), 250);
    return () => clearTimeout(t);
  }, [search, id]);
  if (client)
    return (
      <Card>
        <div className="row"><Avatar name={client.name} hue={client.id * 37} /><div className="grow"><b>{client.name}</b><div className="small muted">{client.phone} · {client.visits ?? 0} visits{Number(client.wallet_balance) > 0 ? ` · wallet ${inr(client.wallet_balance)}` : ''}</div></div><Button size="sm" variant="ghost" onClick={() => setClient(null)}>Change</Button></div>
      </Card>
    );
  const create = () => run(async () => {
    const r = await post(`/salons/${id}/clients`, { ...nc, source: 'walkin' });
    setClient({ id: r.id, ...nc, visits: 0 });
    setNc({ name: '', phone: '' });
    setSearch('');
  }, 'Client added').catch(() => {});
  return (
    <Card title="Client">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by name or mobile" />
      {found.length > 0 && <div className="list mt">{found.map((c) => <button key={c.id} className="list-item" onClick={() => setClient(c)}><div className="grow"><b className="small">{c.name}</b><div className="tiny muted">{c.phone} · {c.visits} visits</div></div><Icon name="right" size={16} /></button>)}</div>}
      <div className="section-title">Or new walk-in client</div>
      <div className="grid-2"><Input placeholder="Name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /><Input placeholder="Mobile" inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></div>
      <Button size="sm" variant="soft" className="mt" busy={busy} disabled={!nc.name || nc.phone.replace(/\D/g, '').length < 10} onClick={create}>Add client</Button>
    </Card>
  );
}

function AddItemSheet({ type, onClose, services, products, packages, onAdd }) {
  const { id } = useSalon();
  const [s, setS] = useState('');
  const [barcode, setBarcode] = useState('');
  const toast = useToast();
  useEffect(() => setS(''), [type]);
  const list = useMemo(() => {
    const t = s.toLowerCase();
    if (type === 'service') return services.filter((x) => x.name.toLowerCase().includes(t) || x.category.toLowerCase().includes(t));
    if (type === 'product') return products.filter((x) => x.name.toLowerCase().includes(t) || (x.brand || '').toLowerCase().includes(t));
    return packages;
  }, [type, s, services, products, packages]);
  const scan = async (e) => {
    e.preventDefault();
    try {
      const p = await api(`/salons/${id}/products/barcode/${encodeURIComponent(barcode)}`);
      onAdd({ type: 'product', ref_id: p.id, name: p.name, price: p.mrp });
      setBarcode('');
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Sheet open={Boolean(type)} onClose={onClose} title={type === 'service' ? 'Add service' : type === 'product' ? 'Add product' : 'Sell package / membership'}>
      <div className="col">
        {type !== 'package' && <SearchBox value={s} onChange={setS} placeholder="Search" />}
        {type === 'product' && <form className="row" onSubmit={scan}><Input placeholder="Scan / type barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} /><Button type="submit" variant="ghost" icon="qr">Add</Button></form>}
        <div className="card flat pad-0 list" style={{ maxHeight: '55vh', overflow: 'auto' }}>
          {list.map((x) => (
            <button key={x.id} className="list-item" onClick={() => onAdd(type === 'service' ? { type, ref_id: x.id, name: x.name, price: x.price } : type === 'product' ? { type, ref_id: x.id, name: x.name, price: x.mrp } : { type: x.type, ref_id: x.id, name: x.name, price: x.price })}>
              <div className="grow"><b className="small">{x.name}</b><div className="tiny muted">{type === 'service' ? `${x.category} · ${x.duration_min} min` : type === 'product' ? `${x.brand || ''} · stock ${Number(x.stock_qty)}` : x.description}</div></div>
              <b className="num small">{inr(type === 'product' ? x.mrp : x.price)}</b>
            </button>
          ))}
          {!list.length && <Empty title="Nothing found" />}
        </div>
      </div>
    </Sheet>
  );
}

/** After checkout: rebook-before-leaving prompt (the #1 retention lever). */
function DoneSheet({ done, onClose }) {
  const { id } = useSalon();
  const [date, setDate] = useState(done.rebook?.date || addDays(today(), 28));
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const [run, busy] = useAction();
  useEffect(() => {
    if (!done.rebook) return;
    api(`/salons/${id}/slots?date=${date}&services=${done.rebook.service_ids.join(',')}${done.rebook.staff_id ? `&staff_id=${done.rebook.staff_id}` : ''}`).then(setSlots);
  }, [date, done.rebook, id]);
  const book = () => run(() => post(`/salons/${id}/billing/rebook`, { invoice_id: done.invoice_id, date, time, service_ids: done.rebook.service_ids, staff_id: done.rebook.staff_id }), 'Next visit booked').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`Bill ${done.invoice_no} · ${inr(done.total)}`}>
      <div className="col">
        <Notice tone="good" icon="whatsapp">GST bill sent to {done.client?.name} on WhatsApp.</Notice>
        {done.rebook ? (
          <>
            <h3 style={{ margin: 0 }}>Book the next visit before they leave</h3>
            <div className="small muted">{done.rebook.service_name} is usually due every {done.rebook.cycle_days} days. Clients rebooked at the chair return far more often.</div>
            <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(''); }} hint={dateDay(date)} />
            {slots && (slots.slots.length ? <div className="slot-grid">{slots.slots.slice(0, 24).map((s) => <button key={s.time} className={`slot ${time === s.time ? 'active' : ''}`} onClick={() => setTime(s.time)}>{time12(s.time)}</button>)}</div> : <Notice tone="warn">No free slots that day</Notice>)}
            <Button className="block lg" busy={busy} disabled={!time} onClick={book}>Book {dateDay(date)} {time && time12(time)}</Button>
          </>
        ) : null}
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </Sheet>
  );
}

function Bills() {
  const { id, isOwner } = useSalon();
  const [range, setRange] = useState('today');
  const [s, setS] = useState('');
  const q = useApi(`/salons/${id}/invoices?${rangeQs(range)}${s ? `&q=${encodeURIComponent(s)}` : ''}`);
  const [open, setOpen] = useState(null);
  return (
    <div className="col">
      <RangeChips value={range} onChange={setRange} />
      <SearchBox value={s} onChange={setS} placeholder="Search bill no, client or phone" />
      <Async q={q}>
        {(rows) => (
          <>
            <div className="small muted">{rows.filter((r) => r.status === 'paid').length} bills · {inr(rows.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.total), 0))}</div>
            <div className="card pad-0">
              <Table rows={rows} onRow={(r) => setOpen(r.id)} empty="No bills in this period" columns={[
                { label: 'Client', render: (r) => <span>{r.client_name}<div className="tiny muted">{r.invoice_no}</div></span> },
                { label: 'Items', render: (r) => <span className="small ellipsis" style={{ maxWidth: 260, display: 'inline-block' }}>{r.items}</span> },
                { label: 'Time', render: (r) => dateTime(r.created_at) },
                { label: 'Paid by', render: (r) => (r.modes || '').toUpperCase() },
                { label: 'Total', align: 'right', render: (r) => <b>{inr(r.total)}</b> },
                { label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]} />
            </div>
          </>
        )}
      </Async>
      {open && <BillSheet invoiceId={open} isOwner={isOwner} onClose={() => { setOpen(null); q.reload(); }} />}
    </div>
  );
}

function BillSheet({ invoiceId, isOwner, onClose }) {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/invoices/${invoiceId}`);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const voidBill = () => run(async () => {
    if (isOwner) await post(`/salons/${id}/invoices/${invoiceId}/void`, { reason });
    else await post(`/salons/${id}/approvals`, { type: 'void', invoice_id: invoiceId, reason, amount: q.data.total });
  }, isOwner ? 'Bill voided' : 'Void request sent to owner').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Bill">
      <Async q={q}>
        {(inv) => (
          <div className="col">
            <div className="row between"><b>{inv.invoice_no}</b><StatusBadge status={inv.status} /></div>
            <div className="small muted">{inv.client_name} · {dateTime(inv.created_at)}</div>
            {inv.items.map((it) => <div key={it.id} className="row between small"><span>{it.name}{it.staff_name ? ` · ${it.staff_name}` : ''}</span><b>{inr(it.amount)}</b></div>)}
            <KV items={[['Discount', inr(inv.discount_amount)], ['GST', inr(Number(inv.cgst) + Number(inv.sgst), { decimals: 2 })], ['Total', inr(inv.total)], ['Paid', inv.payments.map((p) => `${cap(p.mode)} ${inr(p.amount)}`).join(' + ')], inv.void_reason && ['Void reason', inv.void_reason]]} />
            <div className="row wrap">
              <Button size="sm" variant="ghost" icon="receipt" onClick={() => window.open(`/bill/${inv.public_token}`, '_blank')}>Open GST bill</Button>
              <Button size="sm" variant="ghost" icon="whatsapp" onClick={() => run(() => post(`/salons/${id}/invoices/${invoiceId}/send`), 'Sent on WhatsApp')}>Resend</Button>
            </div>
            {inv.status === 'paid' && (
              <Card className="flat">
                <div className="small bold">{isOwner ? 'Void this bill' : 'Request void (owner approval)'}</div>
                <div className="row mt"><Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} /><Button variant="danger" size="sm" busy={busy} disabled={!reason} onClick={voidBill}>Void</Button></div>
                <div className="tiny muted mt">Every void is recorded in the loss-prevention trail.</div>
              </Card>
            )}
          </div>
        )}
      </Async>
    </Sheet>
  );
}

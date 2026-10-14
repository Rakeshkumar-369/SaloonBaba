import { useEffect, useState } from 'react';
import { useApi, post, patch, put } from '../../lib/api.js';
import { useQueryState } from '../../lib/router.jsx';
import { useSalon } from './SalonApp.jsx';
import { Async, Button, Badge, Tabs, Card, Sheet, Input, useAction, Empty, StatusBadge, Table, Notice, SearchBox, KV, Toggle } from '../../ui/kit.jsx';
import { FormSheet } from '../../ui/Form.jsx';
import { usePay } from '../../ui/DemoPay.jsx';
import Icon from '../../ui/Icon.jsx';
import { inr, dateShort, ago, cap, num } from '../../lib/format.js';

export default function Inventory() {
  const [tab, setTab] = useQueryState('tab', 'products');
  return (
    <div className="page">
      <h1>Retail & inventory</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['products', 'Products'], ['low', 'Low stock'], ['orders', 'Purchase orders'], ['shop', 'Customer orders'], ['recipes', 'Recipes'], ['variance', 'Usage variance'], ['equipment', 'Equipment'], ['promotions', 'Brand offers']]} />
      {tab === 'products' && <Products />}
      {tab === 'low' && <Products lowOnly />}
      {tab === 'orders' && <PurchaseOrders />}
      {tab === 'shop' && <ShopOrders />}
      {tab === 'recipes' && <Recipes />}
      {tab === 'variance' && <Variance />}
      {tab === 'equipment' && <Equipment />}
      {tab === 'promotions' && <Promotions />}
    </div>
  );
}

function Products({ lowOnly }) {
  const { id } = useSalon();
  const [kind, setKind] = useState('');
  const [s, setS] = useState('');
  const q = useApi(`/salons/${id}/products?${lowOnly ? 'low=1' : ''}${kind ? `&kind=${kind}` : ''}${s ? `&q=${encodeURIComponent(s)}` : ''}`);
  const vendors = useApi(`/salons/${id}/vendors`);
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(false);
  const [run, busy] = useAction();
  const reorder = () => run(() => post(`/salons/${id}/reorder`), (r) => `${r.created.length} draft order(s) created — review in Purchase orders`).then(q.reload).catch(() => {});
  return (
    <div className="col">
      {lowOnly ? (
        <Notice tone="warn" icon="box">Products at or below their reorder level. One tap turns them into draft orders to your distributor.</Notice>
      ) : (
        <div className="row wrap between">
          <Toggle value={kind} onChange={setKind} options={[['', 'All'], ['retail', 'Retail'], ['backbar', 'Back-bar']]} />
          <Button size="sm" icon="plus" onClick={() => setAdd(true)}>Add product</Button>
        </div>
      )}
      {!lowOnly && <SearchBox value={s} onChange={setS} placeholder="Search name, brand or barcode" />}
      {lowOnly && <Button icon="truck" busy={busy} onClick={reorder}>One-tap reorder</Button>}
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0">
            <Table rows={rows} onRow={setOpen} empty={lowOnly ? 'Nothing is low — great!' : 'No products'} columns={[
              { label: 'Product', render: (p) => <span>{p.name}<div className="tiny muted">{p.brand} · {cap(p.kind)}</div></span> },
              { label: 'Stock', align: 'right', render: (p) => <b className={p.is_low ? 'bad' : ''}>{num(Number(p.stock_qty))} {p.unit}</b> },
              { label: 'Reorder at', align: 'right', render: (p) => num(Number(p.reorder_level)) },
              { label: 'MRP', align: 'right', render: (p) => (p.kind === 'backbar' ? '—' : inr(p.mrp)) },
              { label: 'Cost', align: 'right', render: (p) => inr(p.cost_price) },
              { label: 'Flags', render: (p) => <span className="row gap-s">{p.is_low ? <Badge tone="bad">Low</Badge> : null}{p.expiring ? <Badge tone="warn">Expiring {dateShort(p.expiry_date)}</Badge> : null}</span> },
            ]} />
          </div>
        )}
      </Async>
      {open && <ProductSheet p={open} onClose={() => { setOpen(null); q.reload(); }} />}
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add product" initial={{ kind: 'retail', unit: 'pc', reorder_level: 4, reorder_qty: 12 }}
        onSubmit={(v) => post(`/salons/${id}/products`, v).then(q.reload)}
        fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'brand', label: 'Brand', half: true }, { name: 'category', label: 'Category', half: true },
          { name: 'kind', label: 'Type', type: 'select', required: true, half: true, options: [['retail', 'Retail'], ['backbar', 'Back-bar'], ['both', 'Both']] }, { name: 'barcode', label: 'Barcode', half: true },
          { name: 'mrp', label: 'MRP ₹', type: 'number', half: true }, { name: 'cost_price', label: 'Cost ₹', type: 'number', half: true },
          { name: 'stock_qty', label: 'Opening stock', type: 'number', half: true }, { name: 'reorder_level', label: 'Reorder at', type: 'number', half: true },
          { name: 'preferred_vendor_id', label: 'Distributor', type: 'select', options: (vendors.data || []).map((v) => [v.id, v.name]) },
          { name: 'expiry_date', label: 'Expiry', type: 'date', half: true }, { name: 'refill_days', label: 'Refill reminder (days)', type: 'number', half: true },
        ]} />
    </div>
  );
}

function ProductSheet({ p, onClose }) {
  const { id } = useSalon();
  const moves = useApi(`/salons/${id}/products/${p.id}/movements`);
  const staff = useApi(`/salons/${id}/staff`);
  const [count, setCount] = useState('');
  const [issue, setIssue] = useState({ staff_id: '', qty: '' });
  const [run, busy] = useAction();
  return (
    <Sheet open onClose={onClose} title={p.name} wide>
      <div className="col">
        <KV items={[['Stock', `${num(Number(p.stock_qty))} ${p.unit}`], ['Type', cap(p.kind)], ['MRP / cost', `${inr(p.mrp)} / ${inr(p.cost_price)}`], ['Barcode', p.barcode || '—'], ['Distributor', p.vendor_name || '—'], ['Expiry', p.expiry_date ? dateShort(p.expiry_date) : '—']]} />
        <div className="grid grid-md-2">
          <Card title="Stock count" className="flat">
            <div className="small muted mb">Enter what is physically on the shelf. The difference is recorded as leakage or excess.</div>
            <div className="row"><Input type="number" placeholder="Counted qty" value={count} onChange={(e) => setCount(e.target.value)} /><Button busy={busy} disabled={count === ''} onClick={() => run(() => post(`/salons/${id}/products/${p.id}/count`, { counted: Number(count) }), (r) => (r.diff === 0 ? 'Matches system stock' : `Recorded difference ${r.diff}`)).then(onClose)}>Save</Button></div>
          </Card>
          {p.kind !== 'retail' && (
            <Card title="Issue to stylist" className="flat">
              <div className="small muted mb">Log back-bar product handed out — compared with recipe usage.</div>
              <div className="row">
                <select className="input" value={issue.staff_id} onChange={(e) => setIssue({ ...issue, staff_id: e.target.value })}><option value="">Stylist</option>{(staff.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <Input type="number" placeholder="Qty" value={issue.qty} onChange={(e) => setIssue({ ...issue, qty: e.target.value })} />
                <Button busy={busy} disabled={!issue.staff_id || !issue.qty} onClick={() => run(() => post(`/salons/${id}/products/${p.id}/issue`, issue), 'Issued').then(moves.reload)}>Log</Button>
              </div>
            </Card>
          )}
        </div>
        <div className="section-title">Movements</div>
        <Async q={moves}>
          {(rows) => <div className="card pad-0"><Table rows={rows.slice(0, 40)} columns={[{ label: 'Type', render: (m) => <Badge tone={m.qty > 0 ? 'good' : ''}>{cap(m.type)}</Badge> }, { label: 'Qty', align: 'right', render: (m) => (m.qty > 0 ? `+${Number(m.qty)}` : Number(m.qty)) }, { label: 'By', render: (m) => m.staff_name || '—' }, { label: 'When', render: (m) => ago(m.created_at) }, { label: 'Note', key: 'note' }]} /></div>}
        </Async>
      </div>
    </Sheet>
  );
}

function PurchaseOrders() {
  const { id, isOwner } = useSalon();
  const q = useApi(`/salons/${id}/purchase-orders`);
  const vendors = useApi(`/salons/${id}/vendors`);
  const [open, setOpen] = useState(null);
  const [newPo, setNewPo] = useState(null);
  return (
    <div className="col">
      <Async q={vendors}>
        {(vs) => (
          <div className="grid-auto">
            {vs.map((v) => (
              <Card key={v.id}>
                <div className="row between"><div><b>{v.name}</b><div className="tiny muted">{cap(v.type)} · {v.city} · {v.product_count} products</div></div><Button size="sm" variant="soft" onClick={() => setNewPo(v)}>Order</Button></div>
                {v.credit_limit ? <div className="small mt">Credit {inr(v.credit_limit)} · {v.credit_days} days · outstanding <b className={v.outstanding > 0 ? 'warn' : ''}>{inr(v.outstanding)}</b></div> : <div className="tiny muted mt">No credit account yet</div>}
              </Card>
            ))}
          </div>
        )}
      </Async>
      <Async q={q}>
        {(rows) => (
          <div className="card pad-0">
            <Table rows={rows} onRow={setOpen} empty="No orders yet" columns={[
              { label: 'Order', render: (r) => <span>{r.po_no}<div className="tiny muted">{r.vendor_name}</div></span> },
              { label: 'Items', align: 'right', key: 'item_count' },
              { label: 'Total', align: 'right', render: (r) => inr(r.total) },
              { label: 'Paid', align: 'right', render: (r) => inr(r.paid_amount) },
              { label: 'Placed', render: (r) => dateShort(r.created_at) },
              { label: 'Status', render: (r) => <span className="row gap-s"><StatusBadge status={r.status} />{r.status === 'delivered' && Number(r.paid_amount) < Number(r.total) && r.due_date < new Date().toISOString().slice(0, 10) && <Badge tone="bad">Overdue</Badge>}</span> },
            ]} />
          </div>
        )}
      </Async>
      {open && <PoSheet poId={open.id} isOwner={isOwner} onClose={() => { setOpen(null); q.reload(); }} />}
      {newPo && <NewPo vendor={newPo} onClose={() => { setNewPo(null); q.reload(); }} />}
    </div>
  );
}

function NewPo({ vendor, onClose }) {
  const { id, brand } = useSalon();
  const cat = useApi(`/salons/${id}/vendors/${vendor.id}/catalogue`);
  const [qty, setQty] = useState({});
  const [run, busy] = useAction();
  const lines = (cat.data || []).filter((p) => qty[p.id] > 0);
  const total = lines.reduce((t, p) => t + p.your_price * qty[p.id], 0);
  const place = () => run(() => post(`/salons/${id}/purchase-orders`, { vendor_id: vendor.id, items: lines.map((p) => ({ vendor_product_id: p.id, qty: qty[p.id] })) }), 'Order placed — distributor notified on WhatsApp').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`Order from ${vendor.name}`} wide>
      <Async q={cat}>
        {(rows) => (
          <div className="col">
            {brand && <Notice tone="good" icon="building">{brand.name} negotiated prices apply automatically.</Notice>}
            <div className="card pad-0 list">
              {rows.map((p) => (
                <div key={p.id} className="list-item">
                  <div className="grow"><b className="small">{p.name}</b><div className="tiny muted">{p.brand} · MOQ {p.moq} · MRP {inr(p.mrp)}{p.scheme ? ` · ${p.scheme}` : ''}</div></div>
                  <div className="right"><b className="small">{inr(p.your_price)}</b>{p.negotiated_price && <div className="tiny good">brand price</div>}</div>
                  <input className="input sm" style={{ width: 70 }} type="number" min="0" placeholder="0" value={qty[p.id] || ''} onChange={(e) => setQty({ ...qty, [p.id]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <Button className="block lg" busy={busy} disabled={!lines.length} onClick={place}>Place order · {inr(total)}</Button>
          </div>
        )}
      </Async>
    </Sheet>
  );
}

function PoSheet({ poId, isOwner, onClose }) {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/purchase-orders/${poId}`);
  const [run, busy] = useAction();
  const pay = usePay();
  const act = (action, msg) => run(() => patch(`/salons/${id}/purchase-orders/${poId}`, { action }), msg).then(onClose).catch(() => {});
  const payNow = () => run(async () => { await pay(await post(`/salons/${id}/purchase-orders/${poId}/pay`, {})); }, 'Payment sent to distributor').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Purchase order">
      <Async q={q}>
        {(po) => (
          <div className="col">
            <div className="row between"><b>{po.po_no} · {po.vendor_name}</b><StatusBadge status={po.status} /></div>
            {po.notes && <div className="small muted">{po.notes}</div>}
            {po.items.map((it) => <div key={it.id} className="row between small"><span>{Number(it.qty)} × {it.name}</span><b>{inr(it.amount)}</b></div>)}
            <KV items={[['Total', inr(po.total)], ['Paid', inr(po.paid_amount)], po.due_date && ['Due', dateShort(po.due_date)]]} />
            <div className="row wrap">
              {po.status === 'draft' && <Button busy={busy} onClick={() => act('place', 'Order placed')}>Place order</Button>}
              {['placed', 'accepted', 'dispatched'].includes(po.status) && <Button busy={busy} icon="box" onClick={() => act('receive', 'Stock received and added')}>Mark received</Button>}
              {['draft', 'placed'].includes(po.status) && <Button variant="ghost" busy={busy} onClick={() => act('cancel', 'Cancelled')}>Cancel</Button>}
              {isOwner && po.status === 'delivered' && Number(po.paid_amount) < Number(po.total) && <Button variant="soft" icon="qr" busy={busy} onClick={payNow}>Pay {inr(po.total - po.paid_amount)} by UPI</Button>}
            </div>
          </div>
        )}
      </Async>
    </Sheet>
  );
}

function ShopOrders() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/shop-orders`);
  const [run] = useAction();
  const set = (o, status) => run(() => patch(`/salons/${id}/shop-orders/${o.id}`, { status }).then(q.reload), status === 'delivered' ? 'Handed over — retail bill created' : 'Updated');
  return (
    <Async q={q}>
      {(rows) => !rows.length ? <Empty icon="bag" title="No customer orders">Products your stylists prescribe can be bought from the customer app.</Empty> : (
        <div className="col">
          {rows.map((o) => (
            <Card key={o.id}>
              <div className="row between top"><div><b>#{o.id} · {o.customer_name}</b><div className="small muted">{o.items}</div><div className="tiny muted">{cap(o.fulfilment)}{o.address ? ` · ${o.address}` : ''} · {ago(o.created_at)}</div></div><div className="right"><b>{inr(o.total)}</b><div><StatusBadge status={o.status} /></div></div></div>
              <div className="row mt">
                {o.status === 'paid' && <Button size="sm" variant="soft" onClick={() => set(o, 'ready')}>Mark ready</Button>}
                {['paid', 'ready'].includes(o.status) && <Button size="sm" onClick={() => set(o, 'delivered')}>Handed over</Button>}
                {['placed', 'paid', 'ready'].includes(o.status) && <Button size="sm" variant="ghost" onClick={() => set(o, 'cancelled')}>Cancel</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}

function Recipes() {
  const { id } = useSalon();
  const services = useApi(`/salons/${id}/services`);
  const products = useApi(`/salons/${id}/products?kind=backbar`);
  const recipes = useApi(`/salons/${id}/recipes`);
  const [edit, setEdit] = useState(null);
  const [rows, setRows] = useState([]);
  const [run, busy] = useAction();
  useEffect(() => {
    if (edit) setRows((recipes.data || []).filter((r) => r.service_id === edit.id).map((r) => ({ product_id: r.product_id, qty: Number(r.qty) })));
  }, [edit, recipes.data]);
  const byService = {};
  for (const r of recipes.data || []) (byService[r.service_id] ||= []).push(r);
  return (
    <div className="col">
      <Notice icon="layers">A recipe is the product used per service. Every bill deducts it from back-bar stock automatically, so you see leakage without counting tubes daily.</Notice>
      <Async q={services}>
        {(list) => (
          <div className="card pad-0 list">
            {list.map((s) => (
              <button key={s.id} className="list-item" onClick={() => setEdit(s)}>
                <div className="grow"><b className="small">{s.name}</b><div className="tiny muted">{(byService[s.id] || []).map((r) => `${Number(r.qty)} ${r.unit} ${r.product}`).join(' + ') || 'No recipe'}</div></div>
                {byService[s.id] ? <Badge tone="good">{inr((byService[s.id] || []).reduce((t, r) => t + r.qty * r.cost_price, 0))}/service</Badge> : <Badge>Add</Badge>}
              </button>
            ))}
          </div>
        )}
      </Async>
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={`Recipe · ${edit?.name}`}>
        <div className="col">
          {rows.map((r, i) => (
            <div key={i} className="row">
              <select className="input" value={r.product_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, product_id: Number(e.target.value) } : x)))}>{(products.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className="input" style={{ width: 90 }} type="number" step="0.01" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
              <button className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
            </div>
          ))}
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setRows([...rows, { product_id: products.data?.[0]?.id, qty: 0.1 }])}>Add product</Button>
          <Button busy={busy} onClick={() => run(() => put(`/salons/${id}/services/${edit.id}/recipe`, { items: rows }), 'Recipe saved').then(() => { setEdit(null); recipes.reload(); })}>Save recipe</Button>
        </div>
      </Sheet>
    </div>
  );
}

function Variance() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/variance`);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <Notice icon="shield">Expected = recipe × services billed. Issued = what stylists actually took. A stylist far above 100% is over-mixing or moving stock.</Notice>
          <div className="section-title">By stylist (last 30 days, ₹ at cost)</div>
          <div className="card pad-0"><Table rows={d.staff} columns={[
            { label: 'Stylist', key: 'name' },
            { label: 'Expected', align: 'right', render: (s) => inr(s.expected_value) },
            { label: 'Issued', align: 'right', render: (s) => inr(s.issued_value) },
            { label: 'Variance', align: 'right', render: (s) => <b className={s.variance_pct > 15 ? 'bad' : s.variance_pct > 5 ? 'warn' : 'good'}>{s.variance_pct > 0 ? '+' : ''}{s.variance_pct}% ({inr(s.variance_value)})</b> },
          ]} /></div>
          <div className="section-title">By product</div>
          <div className="card pad-0"><Table rows={d.products} columns={[
            { label: 'Product', key: 'name' },
            { label: 'Expected', align: 'right', render: (p) => `${Number(p.expected).toFixed(2)} ${p.unit}` },
            { label: 'Issued', align: 'right', render: (p) => `${Number(p.issued).toFixed(2)} ${p.unit}` },
            { label: 'Count shortage', align: 'right', render: (p) => Number(p.count_shortage).toFixed(2) },
            { label: 'Variance', align: 'right', render: (p) => <b className={p.variance_pct > 15 ? 'bad' : ''}>{p.variance_pct}%</b> },
          ]} /></div>
        </div>
      )}
    </Async>
  );
}

function Equipment() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/equipment`);
  const [ticket, setTicket] = useState(null);
  return (
    <Async q={q}>
      {(d) => (
        <div className="col">
          <div className="grid-auto">
            {d.items.map((e) => (
              <Card key={e.id}>
                <div className="row between top"><div><b>{e.name}</b><div className="tiny muted">{e.serial_no} · {e.vendor_name}</div></div>{e.open_tickets > 0 && <Badge tone="warn">{e.open_tickets} open</Badge>}</div>
                <div className="row wrap gap-s mt"><Badge tone={e.warranty_expired ? '' : 'good'}>Warranty {e.warranty_expired ? 'expired' : `till ${dateShort(e.warranty_until)}`}</Badge>{e.amc_until && <Badge tone={e.amc_due ? 'warn' : 'good'}>AMC till {dateShort(e.amc_until)}</Badge>}</div>
                <Button size="sm" variant="ghost" className="mt" icon="settings" onClick={() => setTicket(e)}>Raise service ticket</Button>
              </Card>
            ))}
          </div>
          <div className="section-title">Service tickets</div>
          <div className="card pad-0"><Table rows={d.tickets} columns={[{ label: 'Equipment', key: 'equipment' }, { label: 'Issue', key: 'issue' }, { label: 'Visit', render: (t) => (t.visit_on ? dateShort(t.visit_on) : '—') }, { label: 'Status', render: (t) => <StatusBadge status={t.status} /> }]} empty="No tickets" /></div>
          <FormSheet open={Boolean(ticket)} onClose={() => setTicket(null)} title={`Service: ${ticket?.name}`} submitLabel="Send to supplier" success="Ticket raised — supplier notified"
            fields={[{ name: 'issue', label: 'What is wrong?', type: 'textarea', required: true }]} onSubmit={(v) => post(`/salons/${id}/equipment/${ticket.id}/tickets`, v).then(q.reload)} />
        </div>
      )}
    </Async>
  );
}

function Promotions() {
  const { id } = useSalon();
  const q = useApi(`/salons/${id}/promotions`);
  const [run] = useAction();
  return (
    <Async q={q}>
      {(rows) => !rows.length ? <Empty icon="gift" title="No brand offers right now" /> : (
        <div className="grid-auto">
          {rows.map((p) => (
            <Card key={p.id}>
              <Badge tone="primary">{p.vendor_name}</Badge>
              <h3 className="mt">{p.title}</h3>
              <div className="small muted">{p.description}</div>
              <div className="row between mt"><Badge tone="warn">{p.scheme}</Badge><span className="tiny muted">till {dateShort(p.ends_on)}</span></div>
              {p.claimed ? <Badge tone="good">Claimed</Badge> : <Button size="sm" className="mt" onClick={() => run(() => post(`/salons/${id}/promotions/${p.id}/claim`).then(q.reload), 'Claimed — the brand will contact you')}>Claim offer</Button>}
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}


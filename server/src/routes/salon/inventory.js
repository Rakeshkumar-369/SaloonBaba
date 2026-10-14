import { Router } from 'express';
import { q, one, insert, update, tx } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { bad, need, notFound, now, pick, round2, range, ymd, addDays, today } from '../../util.js';
import { startPayment } from '../../services/payments.js';
import { createInvoice } from '../../services/billing.js';
import { sendMessage, notifyUser, audit } from '../../services/notify.js';

const r = Router({ mergeParams: true });

r.get('/products', async (req, res) => {
  const where = ['p.salon_id = ?'];
  const params = [req.salon.id];
  if (req.query.kind === 'retail') where.push("p.kind IN ('retail','both')");
  if (req.query.kind === 'backbar') where.push("p.kind IN ('backbar','both')");
  if (req.query.low === '1') where.push('p.stock_qty <= p.reorder_level');
  if (req.query.q) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.barcode = ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, req.query.q); }
  if (!req.query.all) where.push('p.is_active = 1');
  res.json(await q(
    `SELECT p.*, v.name AS vendor_name, (p.stock_qty <= p.reorder_level) AS is_low,
       (p.expiry_date IS NOT NULL AND p.expiry_date <= CURDATE() + INTERVAL 60 DAY) AS expiring
     FROM products p LEFT JOIN vendors v ON v.id = p.preferred_vendor_id WHERE ${where.join(' AND ')} ORDER BY is_low DESC, p.name`,
    params,
  ));
});

r.get('/products/barcode/:code', async (req, res) => {
  const p = await one('SELECT * FROM products WHERE salon_id = ? AND barcode = ?', [req.salon.id, req.params.code]);
  if (!p) throw notFound('No product with this barcode');
  res.json(p);
});

const PRODUCT_FIELDS = ['name', 'brand', 'category', 'barcode', 'kind', 'unit', 'mrp', 'cost_price', 'reorder_level', 'reorder_qty', 'expiry_date', 'refill_days', 'preferred_vendor_id', 'vendor_product_id', 'is_active'];

r.post('/products', allow('manager'), async (req, res) => {
  const b = need(req.body, 'name', 'kind');
  const id = await insert('products', { salon_id: req.salon.id, stock_qty: Number(b.stock_qty || 0), ...pick(b, PRODUCT_FIELDS) });
  if (b.stock_qty) await insert('stock_movements', { product_id: id, salon_id: req.salon.id, type: 'adjustment', qty: b.stock_qty, note: 'Opening stock', created_by: req.user.id, created_at: now() });
  res.status(201).json({ id });
});

r.patch('/products/:id', allow('manager'), async (req, res) => {
  const p = await one('SELECT id FROM products WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!p) throw notFound();
  await update('products', p.id, pick(req.body, PRODUCT_FIELDS));
  res.json({ ok: true });
});

/** Physical stock count: records the difference as an adjustment (leakage shows up here). */
r.post('/products/:id/count', allow('manager'), async (req, res) => {
  const counted = Number(need(req.body, 'counted').counted);
  const p = await one('SELECT * FROM products WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!p) throw notFound();
  const diff = round2(counted - p.stock_qty);
  await update('products', p.id, { stock_qty: counted });
  await insert('stock_movements', { product_id: p.id, salon_id: req.salon.id, type: 'adjustment', qty: diff, note: req.body.note || 'Stock count', created_by: req.user.id, created_at: now() });
  if (diff < 0) await audit(req.salon.id, req.user.id, 'stock_shortage', 'product', p.id, { diff, value: round2(-diff * p.cost_price) });
  res.json({ ok: true, diff });
});

/** Log product physically issued to a stylist (compared with recipe usage in the variance report). */
r.post('/products/:id/issue', allow('manager'), async (req, res) => {
  const b = need(req.body, 'staff_id', 'qty');
  const p = await one('SELECT id FROM products WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!p) throw notFound();
  await insert('stock_movements', { product_id: p.id, salon_id: req.salon.id, type: 'issue', qty: Number(b.qty), staff_id: b.staff_id, note: b.note || null, created_by: req.user.id, created_at: now() });
  res.status(201).json({ ok: true });
});

r.get('/products/:id/movements', allow('manager'), async (req, res) => {
  res.json(await q(
    `SELECT m.*, u.name AS staff_name FROM stock_movements m LEFT JOIN salon_staff ss ON ss.id = m.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE m.product_id = ? AND m.salon_id = ? ORDER BY m.created_at DESC LIMIT 100`,
    [req.params.id, req.salon.id],
  ));
});

// ------------------------------------------------------------ Recipes (product per service)
r.get('/recipes', async (req, res) => {
  res.json(await q(
    `SELECT sr.*, p.name AS product, p.unit, p.cost_price, s.name AS service FROM service_recipes sr JOIN products p ON p.id = sr.product_id
     JOIN services s ON s.id = sr.service_id WHERE s.salon_id = ? ORDER BY s.name`,
    [req.salon.id],
  ));
});

r.put('/services/:id/recipe', allow('manager'), async (req, res) => {
  const s = await one('SELECT id FROM services WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!s) throw notFound();
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  await tx(async (conn) => {
    await q('DELETE FROM service_recipes WHERE service_id = ?', [s.id], conn);
    for (const it of items) if (Number(it.qty) > 0) await insert('service_recipes', { service_id: s.id, product_id: it.product_id, qty: it.qty }, conn);
  });
  res.json({ ok: true });
});

/** Usage variance: expected (recipes × services) vs issued, per product and per stylist. */
r.get('/variance', allow('manager'), async (req, res) => {
  const { fromDt, toDt, from, to } = range(req.query, 30);
  const byProduct = await q(
    `SELECT p.id, p.name, p.unit, p.cost_price,
       -COALESCE(SUM(CASE WHEN m.type = 'backbar' THEN m.qty END),0) AS expected,
       COALESCE(SUM(CASE WHEN m.type = 'issue' THEN m.qty END),0) AS issued,
       COALESCE(SUM(CASE WHEN m.type = 'adjustment' AND m.qty < 0 THEN m.qty END),0) AS count_shortage
     FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id AND m.created_at BETWEEN ? AND ?
     WHERE p.salon_id = ? AND p.kind IN ('backbar','both') GROUP BY p.id ORDER BY p.name`,
    [fromDt, toDt, req.salon.id],
  );
  const byStaff = await q(
    `SELECT ss.id, u.name,
       -COALESCE(SUM(CASE WHEN m.type = 'backbar' THEN m.qty * p.cost_price END),0) AS expected_value,
       COALESCE(SUM(CASE WHEN m.type = 'issue' THEN m.qty * p.cost_price END),0) AS issued_value
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id
     LEFT JOIN stock_movements m ON m.staff_id = ss.id AND m.created_at BETWEEN ? AND ? AND m.type IN ('backbar','issue')
     LEFT JOIN products p ON p.id = m.product_id
     WHERE ss.salon_id = ? AND ss.role = 'stylist' GROUP BY ss.id ORDER BY u.name`,
    [fromDt, toDt, req.salon.id],
  );
  res.json({
    from, to,
    products: byProduct.map((p) => ({ ...p, variance: round2(p.issued - p.expected), variance_pct: p.expected ? round2(((p.issued - p.expected) / p.expected) * 100) : 0 })),
    staff: byStaff.map((s) => ({ ...s, variance_value: round2(s.issued_value - s.expected_value), variance_pct: s.expected_value ? round2(((s.issued_value - s.expected_value) / s.expected_value) * 100) : 0 })),
  });
});

// ------------------------------------------------------------ Vendors & purchase orders
r.get('/vendors', async (req, res) => {
  const vendors = await q(
    `SELECT v.*, va.credit_limit, va.credit_days,
       (SELECT COALESCE(SUM(total - paid_amount),0) FROM purchase_orders po WHERE po.vendor_id = v.id AND po.salon_id = ? AND po.status = 'delivered') AS outstanding,
       (SELECT COUNT(*) FROM vendor_products vp WHERE vp.vendor_id = v.id AND vp.is_active = 1) AS product_count
     FROM vendors v LEFT JOIN vendor_accounts va ON va.vendor_id = v.id AND va.salon_id = ?
     WHERE v.type IN ('distributor','brand') ORDER BY va.id IS NULL, v.name`,
    [req.salon.id, req.salon.id],
  );
  res.json(vendors);
});

r.get('/vendors/:id/catalogue', async (req, res) => {
  res.json(await q(
    `SELECT vp.*, bvp.negotiated_price, COALESCE(bvp.negotiated_price, vp.trade_price) AS your_price,
       (SELECT id FROM products p WHERE p.salon_id = ? AND p.vendor_product_id = vp.id LIMIT 1) AS product_id
     FROM vendor_products vp LEFT JOIN brand_vendor_prices bvp ON bvp.vendor_product_id = vp.id AND bvp.brand_id = ?
     WHERE vp.vendor_id = ? AND vp.is_active = 1 ORDER BY vp.category, vp.name`,
    [req.salon.id, req.salon.brand_id || 0, req.params.id],
  ));
});

r.get('/purchase-orders', allow('manager'), async (req, res) => {
  res.json(await q(
    `SELECT po.*, v.name AS vendor_name, (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) AS item_count
     FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id WHERE po.salon_id = ? ORDER BY po.id DESC LIMIT 100`,
    [req.salon.id],
  ));
});

r.get('/purchase-orders/:id', allow('manager'), async (req, res) => {
  const po = await one('SELECT po.*, v.name AS vendor_name FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id WHERE po.id = ? AND po.salon_id = ?', [req.params.id, req.salon.id]);
  if (!po) throw notFound();
  po.items = await q('SELECT * FROM po_items WHERE po_id = ?', [po.id]);
  res.json(po);
});

async function createPo(conn, { salon, vendorId, items, userId, status = 'placed', notes = null }) {
  const lines = [];
  for (const it of items) {
    const vp = await one(
      `SELECT vp.*, COALESCE(bvp.negotiated_price, vp.trade_price) AS price FROM vendor_products vp
       LEFT JOIN brand_vendor_prices bvp ON bvp.vendor_product_id = vp.id AND bvp.brand_id = ? WHERE vp.id = ? AND vp.vendor_id = ?`,
      [salon.brand_id || 0, it.vendor_product_id, vendorId], conn,
    );
    if (!vp) throw bad('Product not in this vendor catalogue');
    const qty = Math.max(vp.moq, Number(it.qty || vp.moq));
    const product = await one('SELECT id FROM products WHERE salon_id = ? AND vendor_product_id = ?', [salon.id, vp.id], conn);
    lines.push({ vendor_product_id: vp.id, product_id: product?.id || null, name: vp.name, qty, price: vp.price, amount: round2(qty * vp.price) });
  }
  if (!lines.length) throw bad('Add at least one item');
  const total = round2(lines.reduce((t, l) => t + l.amount, 0));
  const n = await one('SELECT COUNT(*) + 1 AS n FROM purchase_orders WHERE salon_id = ?', [salon.id], conn);
  const id = await insert('purchase_orders', {
    salon_id: salon.id, vendor_id: vendorId, po_no: `PO-${salon.id}-${String(n.n).padStart(4, '0')}`, status, total, notes,
    created_by: userId, created_at: now(), placed_at: status === 'placed' ? now() : null,
  }, conn);
  for (const l of lines) await insert('po_items', { po_id: id, ...l }, conn);
  return { id, total };
}

r.post('/purchase-orders', allow('manager'), async (req, res) => {
  const b = need(req.body, 'vendor_id', 'items');
  const out = await tx((conn) => createPo(conn, { salon: req.salon, vendorId: b.vendor_id, items: b.items, userId: req.user.id, status: b.draft ? 'draft' : 'placed', notes: b.notes }));
  if (!b.draft) await notifyVendor(b.vendor_id, req.salon, out);
  res.status(201).json(out);
});

async function notifyVendor(vendorId, salon, po) {
  const v = await one('SELECT user_id, phone, name FROM vendors WHERE id = ?', [vendorId]);
  await notifyUser(v.user_id, 'New order', `${salon.name} placed an order of ₹${po.total}`, 'orders');
  await sendMessage({ salonId: salon.id, to: v.phone, name: v.name, template: 'po_placed', refType: 'po', refId: po.id, body: `New order from ${salon.name} (${salon.area}) for ₹${po.total}. Open SaloonBaba Vendor to accept.` });
}

/** One-tap reorder: low-stock products become draft orders to their preferred distributors. */
r.post('/reorder', allow('manager'), async (req, res) => {
  const low = await q(
    `SELECT * FROM products WHERE salon_id = ? AND is_active = 1 AND stock_qty <= reorder_level AND preferred_vendor_id IS NOT NULL AND vendor_product_id IS NOT NULL`,
    [req.salon.id],
  );
  if (!low.length) throw bad('No low-stock products linked to a distributor');
  const byVendor = {};
  for (const p of low) (byVendor[p.preferred_vendor_id] ||= []).push({ vendor_product_id: p.vendor_product_id, qty: p.reorder_qty });
  const created = [];
  for (const [vendorId, items] of Object.entries(byVendor)) {
    const po = await tx((conn) => createPo(conn, { salon: req.salon, vendorId: Number(vendorId), items, userId: req.user.id, status: 'draft', notes: 'One-tap reorder from low-stock alert' }));
    created.push({ vendor_id: Number(vendorId), ...po });
  }
  res.status(201).json({ created });
});

r.patch('/purchase-orders/:id', allow('manager'), async (req, res) => {
  const po = await one('SELECT * FROM purchase_orders WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!po) throw notFound();
  const { action } = req.body;
  if (action === 'place' && po.status === 'draft') {
    await update('purchase_orders', po.id, { status: 'placed', placed_at: now() });
    await notifyVendor(po.vendor_id, req.salon, po);
  } else if (action === 'cancel' && ['draft', 'placed'].includes(po.status)) {
    await update('purchase_orders', po.id, { status: 'cancelled' });
  } else if (action === 'receive' && ['accepted', 'dispatched', 'placed'].includes(po.status)) {
    const acct = await one('SELECT credit_days FROM vendor_accounts WHERE vendor_id = ? AND salon_id = ?', [po.vendor_id, req.salon.id]);
    await tx(async (conn) => {
      const items = await q('SELECT * FROM po_items WHERE po_id = ?', [po.id], conn);
      for (const it of items) {
        let pid = it.product_id;
        if (!pid) {
          const vp = await one('SELECT * FROM vendor_products WHERE id = ?', [it.vendor_product_id], conn);
          pid = await insert('products', {
            salon_id: req.salon.id, vendor_product_id: vp.id, preferred_vendor_id: po.vendor_id, name: vp.name, brand: vp.brand,
            category: vp.category, unit: vp.unit, kind: 'retail', mrp: vp.mrp, cost_price: it.price, stock_qty: 0,
          }, conn);
          await update('po_items', it.id, { product_id: pid }, conn);
        }
        await q('UPDATE products SET stock_qty = stock_qty + ?, cost_price = ? WHERE id = ?', [it.qty, it.price, pid], conn);
        await insert('stock_movements', { product_id: pid, salon_id: req.salon.id, type: 'purchase', qty: it.qty, ref_type: 'po', ref_id: po.id, created_by: req.user.id, created_at: now() }, conn);
      }
      await update('purchase_orders', po.id, { status: 'delivered', delivered_at: now(), due_date: ymd(addDays(today(), acct?.credit_days || 30)) }, conn);
    });
  } else throw bad(`Cannot ${action} an order that is ${po.status}`);
  res.json({ ok: true });
});

r.post('/purchase-orders/:id/pay', allow(), async (req, res) => {
  const po = await one('SELECT * FROM purchase_orders WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!po) throw notFound();
  const due = round2(po.total - po.paid_amount);
  if (due <= 0) throw bad('Already paid');
  res.json(await startPayment({ userId: req.user.id, purpose: 'po', refId: po.id, amount: Number(req.body.amount || due), description: `Pay ${po.po_no}` }));
});

// ------------------------------------------------------------ Customer shop orders
r.get('/shop-orders', allow('manager'), async (req, res) => {
  res.json(await q(
    `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone,
       (SELECT GROUP_CONCAT(CONCAT(qty,' × ',name) SEPARATOR ', ') FROM shop_order_items WHERE order_id = o.id) AS items
     FROM shop_orders o JOIN users u ON u.id = o.user_id WHERE o.salon_id = ? ORDER BY FIELD(o.status,'paid','ready','placed','delivered','cancelled'), o.id DESC LIMIT 100`,
    [req.salon.id],
  ));
});

r.patch('/shop-orders/:id', allow('manager'), async (req, res) => {
  const o = await one('SELECT * FROM shop_orders WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!o) throw notFound();
  const status = req.body.status;
  if (status === 'ready' && o.status === 'paid') await update('shop_orders', o.id, { status });
  else if (status === 'delivered' && ['paid', 'ready'].includes(o.status)) {
    // Book the sale as a retail bill so it counts in retail %, stock and GST
    const items = await q('SELECT * FROM shop_order_items WHERE order_id = ?', [o.id]);
    await createInvoice({
      salon: req.salon, user: req.user, access: 'owner', clientId: o.client_id,
      items: items.map((i) => ({ type: 'product', ref_id: i.product_id, qty: i.qty })),
      payments: [{ mode: 'upi', amount: o.total, ref: o.payment_ref || `shop_${o.id}` }],
    });
    await update('shop_orders', o.id, { status });
  } else if (status === 'cancelled' && o.status !== 'delivered') await update('shop_orders', o.id, { status });
  else throw bad('Invalid status change');
  res.json({ ok: true });
});

// ------------------------------------------------------------ Equipment, AMC & service tickets
r.get('/equipment', async (req, res) => {
  const items = await q(
    `SELECT e.*, v.name AS vendor_name, (e.warranty_until < CURDATE()) AS warranty_expired,
       (e.amc_until IS NOT NULL AND e.amc_until <= CURDATE() + INTERVAL 30 DAY) AS amc_due,
       (SELECT COUNT(*) FROM service_tickets t WHERE t.equipment_id = e.id AND t.status <> 'closed') AS open_tickets
     FROM equipment e LEFT JOIN vendors v ON v.id = e.vendor_id WHERE e.salon_id = ? ORDER BY e.name`,
    [req.salon.id],
  );
  const tickets = await q(
    `SELECT t.*, e.name AS equipment FROM service_tickets t JOIN equipment e ON e.id = t.equipment_id WHERE t.salon_id = ? ORDER BY t.id DESC LIMIT 30`,
    [req.salon.id],
  );
  res.json({ items, tickets });
});

r.post('/equipment/:id/tickets', allow('manager'), async (req, res) => {
  const { issue } = need(req.body, 'issue');
  const e = await one('SELECT * FROM equipment WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!e) throw notFound();
  const id = await insert('service_tickets', { equipment_id: e.id, salon_id: req.salon.id, vendor_id: e.vendor_id, issue });
  if (e.vendor_id) {
    const v = await one('SELECT user_id FROM vendors WHERE id = ?', [e.vendor_id]);
    await notifyUser(v.user_id, 'New service ticket', `${req.salon.name}: ${e.name} — ${issue}`, 'service');
  }
  res.status(201).json({ id });
});

// ------------------------------------------------------------ Brand promotions & sampling offered to this salon
r.get('/promotions', async (req, res) => {
  const rows = await q(
    `SELECT p.*, v.name AS vendor_name, v.type AS vendor_type, EXISTS (SELECT 1 FROM promotion_claims c WHERE c.promotion_id = p.id AND c.salon_id = ?) AS claimed
     FROM vendor_promotions p JOIN vendors v ON v.id = p.vendor_id
     WHERE p.is_active = 1 AND (p.ends_on IS NULL OR p.ends_on >= CURDATE()) AND (p.target_city IS NULL OR p.target_city = ?)
       AND (p.target_plan IS NULL OR p.target_plan = ?) ORDER BY p.id DESC`,
    [req.salon.id, req.salon.city, req.salon.plan],
  );
  res.json(rows);
});

r.post('/promotions/:id/claim', allow('manager'), async (req, res) => {
  const p = await one('SELECT * FROM vendor_promotions WHERE id = ? AND is_active = 1', [req.params.id]);
  if (!p) throw notFound();
  await insert('promotion_claims', { promotion_id: p.id, salon_id: req.salon.id });
  await q('UPDATE vendor_promotions SET claims = claims + 1 WHERE id = ?', [p.id]);
  const v = await one('SELECT user_id FROM vendors WHERE id = ?', [p.vendor_id]);
  await notifyUser(v.user_id, 'Promotion claimed', `${req.salon.name}, ${req.salon.city} claimed "${p.title}"`, 'promotions');
  res.json({ ok: true });
});

export default r;

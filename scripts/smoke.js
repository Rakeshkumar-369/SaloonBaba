// API smoke test: logs in as every demo role and calls the main screens' endpoints.
// Usage: start the API (npm run dev or npm start), then: npm run smoke
const BASE = process.env.API_URL || 'http://localhost:4000/api';
let failures = 0;

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  const ok = res.ok;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${res.status} ${method} ${path}${ok ? '' : `  → ${data.error}`}`);
  return data;
}
const login = async (login) => (await call(null, 'POST', '/auth/login', { login, password: 'demo123' })).token;

const today = new Date().toISOString().slice(0, 10);

// Customer
let t = await login('customer@saloonbaba.in');
const salons = await call(t, 'GET', '/customer/salons?city=Chennai');
const salon = await call(t, 'GET', `/customer/salons/${salons[0]?.slug}`);
await call(t, 'GET', `/customer/salons/${salon.salon.id}/slots?date=${today}&services=${salon.services[0].id}`);
for (const p of ['/customer/bookings', '/customer/profile', '/customer/wallet', '/customer/offers', '/customer/shop', '/customer/shop/orders', '/customer/queue/mine', '/me'])
  await call(t, 'GET', p);

// Owner (independent) + manager
for (const who of ['owner@maneroom.in', 'franchisee@glowcraft.in', 'manager@glowcraft.in']) {
  t = await login(who);
  const list = await call(t, 'GET', '/salons');
  const sid = list[0].id;
  if (who.startsWith('franchisee')) await call(t, 'GET', '/salons/rollup');
  const paths = ['dashboard', `appointments?date=${today}`, 'queue', 'clients?segment=at_risk', 'clients/segments', 'clients?segment=due', 'services', 'packages',
    'offers', 'campaigns', 'referrals', 'leads', 'products', 'variance', 'vendors', 'purchase-orders', 'shop-orders', 'equipment', 'promotions', 'staff', 'roster', 'attendance',
    'leaves', 'expenses', 'cash-closing', 'insights', 'checklists', 'reviews', 'audit-actions', 'messages', 'approvals', 'invoices', 'training', 'recipes'];
  const ownerOnly = ['payroll', 'pnl', 'break-even', 'gst', 'loss', 'voice', 'advances', 'packages/ledger', 'royalty', 'recurring'];
  for (const p of [...paths, ...(who.startsWith('manager') ? [] : ownerOnly)]) await call(t, 'GET', `/salons/${sid}/${p}`);
  const clients = await call(t, 'GET', `/salons/${sid}/clients?limit=1`);
  if (clients[0]) await call(t, 'GET', `/salons/${sid}/clients/${clients[0].id}`);
}

// Stylist
t = await login('stylist@glowcraft.in');
for (const p of ['/staff-app/home', '/staff-app/earnings', '/staff-app/roster', '/staff-app/attendance', '/staff-app/clients', '/staff-app/products', '/staff-app/portfolio', '/staff-app/learn', '/staff-app/recognition', '/staff-app/voice'])
  await call(t, 'GET', p);

// Franchise HQ and area manager
for (const who of ['hq@glowcraft.in', 'area@glowcraft.in']) {
  t = await login(who);
  const ov = await call(t, 'GET', '/franchise/overview');
  await call(t, 'GET', `/franchise/outlets/${ov.outlets[0].id}`);
  for (const p of ['catalogue', 'offers', 'sop', 'audits', 'audit-template', 'procurement', 'leads', 'training', ...(who.startsWith('hq') ? ['royalty'] : [])])
    await call(t, 'GET', `/franchise/${p}`);
}

// Vendors
for (const who of ['distributor@saloonbaba.in', 'brand@saloonbaba.in', 'academy@saloonbaba.in', 'equipment@saloonbaba.in']) {
  t = await login(who);
  for (const p of ['overview', 'products', 'orders', 'credit', 'insights', 'promotions', 'courses', 'service', 'codes']) await call(t, 'GET', `/vendor/${p}`);
}

// Admin
t = await login('admin@saloonbaba.in');
for (const p of ['overview', 'salons', 'users', 'demo-requests', 'messages']) await call(t, 'GET', `/admin/${p}`);

// Public
for (const p of ['/public/plans', '/public/stats', '/public/verify/SB-VEDA2026', '/auth/demo-accounts']) await call(null, 'GET', p);
await call(null, 'POST', '/integrations/whatsapp/simulate', { text: 'QUEUE barber bros' });

// ---------------------------------------------------------------- write flows
if (!process.argv.includes('--read-only')) {
  console.log('\n— write flows —');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // Customer books, pays deposit (simulated), joins queue, leaves
  t = await login('customer2@saloonbaba.in');
  const list = await call(t, 'GET', '/customer/salons?city=Bengaluru');
  const kor = await call(t, 'GET', `/customer/salons/${list.find((x) => x.name.includes('Koramangala')).slug}`);
  const svcId = kor.services.find((x) => x.name.startsWith('Keratin')).id;
  const slots = await call(t, 'GET', `/customer/salons/${kor.salon.id}/slots?date=${tomorrow}&services=${svcId}`);
  const bk = await call(t, 'POST', '/customer/bookings', { salon_id: kor.salon.id, service_ids: [svcId], date: tomorrow, time: slots.slots[2].time });
  if (bk.payment) await call(t, 'POST', `/me/payments/${bk.payment.payment_order_id}/confirm`, { simulated: true });
  await call(t, 'PATCH', `/customer/bookings/${bk.appointment_id}`, { action: 'reschedule', date: tomorrow, time: slots.slots[6].time });
  await call(t, 'POST', `/customer/favourites/${kor.salon.id}`);
  const g = await call(t, 'POST', '/customer/gold');
  await call(t, 'POST', `/me/payments/${g.payment_order_id}/confirm`, { simulated: true });

  // Manager: phone booking → check-in → discount approval via OTP → checkout → rebook
  t = await login('manager@glowcraft.in');
  const sid = (await call(t, 'GET', '/salons'))[0].id;
  const services = await call(t, 'GET', `/salons/${sid}/services`);
  const cut = services.find((x) => x.name === 'Haircut — Women');
  const sl = await call(t, 'GET', `/salons/${sid}/slots?date=${tomorrow}&services=${cut.id}`);
  const ap = await call(t, 'POST', `/salons/${sid}/appointments`, { client: { name: 'Smoke Test', phone: '9123456780' }, service_ids: [cut.id], date: tomorrow, time: sl.slots[0].time, source: 'whatsapp' });
  await call(t, 'PATCH', `/salons/${sid}/appointments/${ap.id}`, { status: 'checked_in' });
  const cl = (await call(t, 'GET', `/salons/${sid}/clients/lookup?q=9123456780`))[0];
  const items = [{ type: 'service', ref_id: cut.id, staff_id: ap.staff_id }];
  const prev = await call(t, 'POST', `/salons/${sid}/billing/preview`, { client_id: cl.id, items, discount_amount: 150 });
  const appr = await call(t, 'POST', `/salons/${sid}/approvals`, { type: 'discount', amount: 150, pct: prev.manual_discount_pct, reason: 'Smoke', client_name: 'Smoke Test' });
  await call(t, 'POST', `/salons/${sid}/approvals/${appr.id}/verify`, { otp: appr.demo_otp });
  const co = await call(t, 'POST', `/salons/${sid}/billing/checkout`, { client_id: cl.id, appointment_id: ap.id, items, discount_amount: 150, approval_id: appr.id, payments: [{ mode: 'upi', amount: prev.total }] });
  if (co.rebook) await call(t, 'POST', `/salons/${sid}/billing/rebook`, { invoice_id: co.invoice_id, date: co.rebook.date, time: '11:00', service_ids: co.rebook.service_ids });
  await call(t, 'POST', `/salons/${sid}/invoices/${co.invoice_id}/send`);
  const tk = await call(t, 'POST', `/salons/${sid}/queue`, { name: 'Walk In', phone: '9123456781' });
  const staff = await call(t, 'GET', `/salons/${sid}/staff`);
  await call(t, 'PATCH', `/salons/${sid}/queue/${tk.id}`, { action: 'start', staff_id: staff.find((x) => x.role === 'stylist').id });
  await call(t, 'PATCH', `/salons/${sid}/queue/${tk.id}`, { action: 'done' });
  const off = await call(t, 'POST', `/salons/${sid}/offers`, { title: 'Smoke Tuesday', type: 'percent', value: 10, happy_hour: 1, days: '2', start_time: '14:00', end_time: '17:00' });
  await call(t, 'POST', `/salons/${sid}/campaigns`, { name: 'Smoke campaign', segment: 'lapsed', channel: 'sms', message: 'Hi {name}, come back to {salon}! Code {code}', offer_id: off.id, send_now: true });
  const prods = await call(t, 'GET', `/salons/${sid}/products?kind=retail`);
  await call(t, 'POST', `/salons/${sid}/products/${prods[0].id}/count`, { counted: Math.max(0, prods[0].stock_qty - 1) });
  await call(t, 'POST', `/salons/${sid}/reorder`);
  await call(t, 'POST', `/salons/${sid}/clients/${cl.id}/wallet-topup`, { amount: 500, mode: 'cash', bonus: 50 });
  await call(t, 'POST', `/salons/${sid}/cash-closing`, { counted_cash: 1000, cash_expenses: 0 });
  const lv = (await call(t, 'GET', `/salons/${sid}/leaves`)).find((x) => x.status === 'pending');
  if (lv) await call(t, 'POST', `/salons/${sid}/leaves/${lv.id}/decide`, { approve: true });

  // Owner: approvals, payroll, void
  t = await login('franchisee@glowcraft.in');
  const pend = (await call(t, 'GET', `/salons/${sid}/approvals`)).find((x) => x.status === 'pending');
  if (pend) await call(t, 'POST', `/salons/${sid}/approvals/${pend.id}/decide`, { approve: true });
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).toISOString().slice(0, 7);
  await call(t, 'POST', `/salons/${sid}/payroll/finalise`, { month: lastMonth });
  await call(t, 'POST', `/salons/${sid}/payroll/send`, { month: lastMonth });
  await call(t, 'POST', `/salons/${sid}/invoices/${co.invoice_id}/void`, { reason: 'Smoke test void' });
  await call(t, 'POST', `/salons/${sid}/recurring/apply`, {});

  // Stylist: check-in with selfie, prescribe, lesson, voice
  t = await login('junior@glowcraft.in');
  const fd = new FormData();
  fd.append('lat', '13.0851'); fd.append('lng', '80.2102');
  fd.append('selfie', new Blob([new Uint8Array([255, 216, 255, 224])], { type: 'image/jpeg' }), 'selfie.jpg');
  const ci = await fetch(`${BASE}/staff-app/attendance/check-in`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd });
  console.log(`${ci.ok || ci.status === 400 ? '✓' : '✗'} ${ci.status} POST /staff-app/attendance/check-in (multipart)`);
  if (!(ci.ok || ci.status === 400)) failures++;
  const myClients = await call(t, 'GET', '/staff-app/clients');
  const myProducts = await call(t, 'GET', '/staff-app/products');
  if (myClients[0]) await call(t, 'POST', '/staff-app/prescriptions', { client_id: myClients[0].id, product_ids: [myProducts[0].id], note: 'Twice a week' });
  const learn = await call(t, 'GET', '/staff-app/learn');
  const course = learn.courses.find((c) => c.lessons.length);
  await call(t, 'POST', `/staff-app/learn/${course.id}/lessons/0/complete`, { answer: course.lessons[0].quiz?.answer });
  await call(t, 'POST', '/staff-app/voice', { message: 'Smoke feedback', anonymous: true, category: 'idea' });
  await call(t, 'POST', '/staff-app/leave', { type: 'leave', from_date: tomorrow, reason: 'Smoke' });

  // HQ: royalty, catalogue push, lead routing, audit
  t = await login('hq@glowcraft.in');
  await call(t, 'POST', '/franchise/royalty/generate', { month: lastMonth });
  await call(t, 'POST', '/franchise/catalogue/push');
  await call(t, 'POST', '/franchise/leads', { name: 'Smoke Lead', phone: '9123456782', area: 'Velachery', service_interest: 'Bridal' });
  t = await login('area@glowcraft.in');
  const tpl = await call(t, 'GET', '/franchise/audit-template');
  const ov = await call(t, 'GET', '/franchise/overview');
  await call(t, 'POST', '/franchise/audits', { salon_id: ov.outlets[0].id, items: tpl.flatMap((sec) => sec.items.map((label, i) => ({ section: sec.section, label, result: i % 3 ? 'pass' : 'fail' }))), summary: 'Smoke audit' });

  // Vendor accepts and dispatches a placed order
  t = await login('distributor@saloonbaba.in');
  const placed = (await call(t, 'GET', '/vendor/orders?status=placed'))[0];
  if (placed) {
    await call(t, 'PATCH', `/vendor/orders/${placed.id}`, { action: 'accept', override: true });
    await call(t, 'PATCH', `/vendor/orders/${placed.id}`, { action: 'dispatch' });
  }
  t = await login('brand@saloonbaba.in');
  const vps = await call(t, 'GET', '/vendor/products');
  await call(t, 'POST', '/vendor/codes', { vendor_product_id: vps[0].id, count: 3 });

  // Public bill + private-first feedback
  t = await login('owner@maneroom.in');
  const msid = (await call(t, 'GET', '/salons'))[0].id;
  const inv = (await call(t, 'GET', `/salons/${msid}/invoices`)).find((x) => x.status === 'paid');
  const bill = await call(null, 'GET', `/public/bill/${inv.public_token}`);
  if (!bill.review) await call(null, 'POST', `/public/bill/${inv.public_token}/feedback`, { result: 3, hygiene: 4, wait: 2, value: 3, behaviour: 4, comment: 'Smoke: waited long' });
  await call(null, 'POST', '/public/demo-requests', { name: 'Smoke', phone: '9123456783', business_name: 'Smoke Salon', city: 'Chennai' });
}

console.log(failures ? `\n${failures} request(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);

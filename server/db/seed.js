// Demo data generator. Simulates ~4 months of salon operations (walk-ins, bookings,
// returns, no-shows, bills, retail, packages, payroll, stock, reviews...) so every
// screen and KPI has realistic numbers. Deterministic: same output every run
// (relative to today's date).
import bcrypt from 'bcryptjs';
import { pool, q, one, insert } from '../src/db.js';
import { ymd, addDays, minutesOf, timeOf, round2, ym, monthRange, token, slugify } from '../src/util.js';
import { DEMO_PASSWORD } from './demoAccounts.js';
import { FEMALE, MALE, LAST, MENU, WEIGHTS, BRAND, SALONS, OWNERS, PRODUCTS, VENDORS, VENDOR_PRODUCTS, COURSES } from './seedData.js';

// ---------------------------------------------------------------- deterministic random
let state = 20261014;
const rand = () => {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (p) => rand() < p;
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (obj) => {
  const entries = Object.entries(obj);
  const total = entries.reduce((t, [, w]) => t + w, 0);
  let x = rand() * total;
  for (const [k, w] of entries) if ((x -= w) <= 0) return k;
  return entries[0][0];
};
const pad = (n) => String(n).padStart(2, '0');
const dts = (date, mins) => `${date} ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;

async function bulk(table, rows, chunk = 800) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk).map((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    await pool.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES ?`, [part]);
  }
}

const usedPhones = new Set();
function phone() {
  for (;;) {
    const p = `${pickOne(['6', '7', '8', '9', '9', '9'])}${String(int(0, 999999999)).padStart(9, '0')}`;
    if (!usedPhones.has(p) && !p.startsWith('90000')) {
      usedPhones.add(p);
      return p;
    }
  }
}
const personName = (g) => `${pickOne(g === 'M' ? MALE : FEMALE)} ${pickOne(LAST)}`;

// ---------------------------------------------------------------- main
export async function seed() {
  const t0 = Date.now();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const NOW = new Date();
  const TODAY = ymd(NOW);
  const NOW_MIN = NOW.getHours() * 60 + NOW.getMinutes();
  const HISTORY = 120;
  const AHEAD = 14;
  const START = ymd(addDays(TODAY, -HISTORY));
  const dateOf = (d) => ymd(addDays(START, d));
  const TODAY_IDX = HISTORY;

  const U = {};
  const addUser = async (key, data) => {
    U[key] = await insert('users', { password_hash: hash, referral_code: `SB${token(3).toUpperCase()}`, ...data });
    return U[key];
  };

  console.log('Seeding users, brand and vendors ...');
  await addUser('admin', { name: 'Arjun Mehta', email: 'admin@saloonbaba.in', phone: '9000000001', role: 'admin', gender: 'M', city: 'Chennai' });
  await addUser('hq', { name: 'Kavitha Raman', email: 'hq@glowcraft.in', phone: '9000000501', role: 'franchisor', gender: 'F', city: 'Chennai' });
  await addUser('area', { name: 'Suresh Babu', email: 'area@glowcraft.in', phone: '9000000502', role: 'area_manager', gender: 'M', city: 'Chennai' });
  for (const [k, o] of Object.entries(OWNERS)) await addUser(k, { name: o.name, email: o.email, phone: o.phone, role: 'owner', gender: o.gender, city: o.city });
  await addUser('priya', { name: 'Priya Sharma', email: 'customer@saloonbaba.in', phone: '9000000101', role: 'customer', gender: 'F', city: 'Chennai', gold_until: ymd(addDays(TODAY, 52)), referral_code: 'PRIYA200' });
  await addUser('rahul', { name: 'Rahul Verma', email: 'customer2@saloonbaba.in', phone: '9000000102', role: 'customer', gender: 'M', city: 'Bengaluru', referral_code: 'RAHUL200' });

  const brandId = await insert('brands', { ...BRAND, owner_user_id: U.hq });
  await insert('brand_members', { brand_id: brandId, user_id: U.area, role: 'area_manager' });

  const V = {};
  const VP = {}; // vendorKey -> name -> {id, trade}
  for (const v of VENDORS) {
    await addUser(`v_${v.key}`, { name: v.user, email: v.email, phone: v.phone, role: 'vendor', city: v.city });
    V[v.key] = await insert('vendors', { user_id: U[`v_${v.key}`], name: v.name, type: v.type, city: v.city, phone: v.phone, gstin: v.gstin, about: v.about, hue: v.hue });
  }
  for (const [vk, list] of Object.entries(VENDOR_PRODUCTS)) {
    VP[vk] = {};
    for (const [name, brand, category, unit, trade, mrp, moq, scheme] of list) {
      const id = await insert('vendor_products', { vendor_id: V[vk], name, brand, category, unit, trade_price: trade, mrp, moq, scheme, stock: int(80, 600) });
      VP[vk][name] = { id, trade, mrp };
    }
  }
  // Central procurement: GlowCraft negotiated prices with the distributor
  for (const name of ['Hair Colour Tube 60g', 'Developer 1L', 'Keratin Smooth Kit 1L', 'Repair Shampoo 300ml', 'Facial Kit (pack of 5)', 'Liposoluble Wax 800ml']) {
    const vp = VP.dist[name];
    await insert('brand_vendor_prices', { brand_id: brandId, vendor_product_id: vp.id, negotiated_price: round2(vp.trade * 0.9) });
  }

  // Brand central catalogue (from the unisex menu)
  const brandSvc = {};
  for (const m of MENU.unisex) {
    brandSvc[m.name] = await insert('brand_services', {
      brand_id: brandId, name: m.name, category: m.category, price: m.price, duration_min: m.dur, cycle_days: m.cycle, gender: m.gender, tags: m.tags,
      allow_override: ['Bridal Makeup', 'Keratin Treatment', 'Balayage / Highlights'].includes(m.name) ? 1 : 0,
    });
  }

  // Brand SOP checklists
  const brandTemplates = [
    { name: 'Opening checklist', kind: 'opening', items: ['Lights, AC and music on', 'UV steriliser cycle run and logged', 'Fresh towels stocked at every station', 'Price menu and national offer displayed', 'Floor and mirrors cleaned'] },
    { name: 'Hygiene round (2 pm)', kind: 'hygiene', items: ['Combs and brushes in disinfectant', 'Used towels in closed bin', 'Washroom cleaned', 'Hand sanitiser at reception'] },
    { name: 'Closing checklist', kind: 'closing', items: ['Cash closing done in app', 'Back-bar products capped and stored', 'Tools washed and sterilised', 'Linen count recorded', 'Power switched off'] },
  ];
  const brandTplIds = [];
  for (const t of brandTemplates) brandTplIds.push(await insert('checklist_templates', { brand_id: brandId, name: t.name, kind: t.kind, items: JSON.stringify(t.items) }));

  // Courses
  const courseIds = {};
  for (const c of COURSES) {
    const owner = c.owner === 'brand_glowcraft' ? { brand_id: brandId } : c.owner === 'vendor_academy' ? { vendor_id: V.academy } : { vendor_id: V.brand };
    courseIds[c.title] = await insert('courses', {
      ...owner, title: c.title, category: c.category, level: c.level, duration_min: c.duration,
      lessons: JSON.stringify(c.lessons),
      badge_name: c.badge, price: c.price || 0,
    });
  }

  // Demo requests from the marketing site
  await bulk('demo_requests', [
    { name: 'Sathish Kumar', phone: '9840012345', email: 'sathish@trendz.in', business_name: 'Trendz Unisex Salon', city: 'Coimbatore', outlets: 2, role: 'owner', message: 'Need billing + staff incentive. Using Excel now.', status: 'new', created_at: `${ymd(addDays(TODAY, -1))} 11:20:00` },
    { name: 'Neha Kapoor', phone: '9811122233', email: 'neha@bloomstudio.in', business_name: 'Bloom Studio', city: 'Bengaluru', outlets: 1, role: 'owner', message: 'Interested in WhatsApp reminders and online booking.', status: 'contacted', created_at: `${ymd(addDays(TODAY, -3))} 16:05:00` },
    { name: 'Rajesh Menon', phone: '9895544332', email: 'rajesh@kairali.in', business_name: 'Kairali Spa & Salon', city: 'Kochi', outlets: 4, role: 'owner', message: 'Multi-outlet rollup and P&L.', status: 'demo_done', created_at: `${ymd(addDays(TODAY, -8))} 10:00:00` },
    { name: 'Farida Sheikh', phone: '9833344455', email: 'farida@glamup.co', business_name: 'GlamUp Franchise', city: 'Pune', outlets: 18, role: 'franchisor', message: 'Royalty engine + audits for 18 outlets.', status: 'new', created_at: `${ymd(addDays(TODAY, -2))} 14:40:00` },
    { name: 'Vinod Reddy', phone: '9849988776', email: null, business_name: 'Vinod Hair Studio', city: 'Hyderabad', outlets: 1, role: 'owner', message: '', status: 'won', created_at: `${ymd(addDays(TODAY, -20))} 12:30:00` },
  ]);

  // ---------------------------------------------------------------- per-salon setup + simulation
  const ids = { client: 0, appt: 0, invoice: 0, cpkg: 0 };
  const R = {
    clients: [], appointments: [], appointment_services: [], invoices: [], invoice_items: [], payments: [], stock_movements: [],
    roster: [], attendance: [], reviews: [], client_packages: [], wallet_txns: [], audit_log: [], queue_tokens: [], message_log: [], prescriptions: [],
  };
  const salonsOut = [];

  for (const S of SALONS) {
    console.log(`Simulating ${S.name} ...`);
    const salonId = await insert('salons', {
      brand_id: S.brand ? brandId : null, owner_user_id: U[S.owner], name: S.name, slug: slugify(S.name), tagline: S.tagline,
      description: `${S.name} in ${S.area}, ${S.city}. ${S.tagline}. Prices on the menu include GST. Book a slot or join the live queue from the SaloonBaba app.`,
      address: S.address, area: S.area, city: S.city, lat: S.lat, lng: S.lng, phone: OWNERS[S.owner].phone, whatsapp: OWNERS[S.owner].phone,
      gender_type: S.gender_type, price_level: S.price_level, open_time: `${S.open}:00`, close_time: `${S.close}:00`, women_staff: S.women_staff,
      home_service: S.home_service, private_rooms: S.private_rooms, gold_partner: S.gold_partner, hygiene_score: 85, gst_number: S.gst, upi_id: S.upi,
      hue: S.hue, plan: S.plan, deposit_pct: 20, deposit_min_duration: 90, discount_limit_pct: 10,
    });
    const open = minutesOf(S.open);
    const close = minutesOf(S.close);

    // chairs
    for (let i = 1; i <= S.staff.length + 1; i++) await insert('chairs', { salon_id: salonId, name: `Chair ${i}`, type: 'chair' });
    if (S.private_rooms) await insert('chairs', { salon_id: salonId, name: 'Private room', type: 'room' });

    // staff
    const staff = [];
    const members = [...(S.manager ? [{ ...S.manager, role: 'manager', level: 'manager', title: 'Salon Manager', skills: [], base: 30000, comm: 0, months: 36 }] : []), ...S.staff];
    for (const m of members) {
      if (!U[m.key]) await addUser(m.key, { name: m.name, email: m.email || `${m.key}.${S.key.replace('_', '')}@staff.saloonbaba.in`, phone: m.phone || phone(), role: m.role === 'manager' ? 'manager' : 'stylist', gender: m.gender, city: S.city });
      const sid = await insert('salon_staff', {
        salon_id: salonId, user_id: U[m.key], role: m.role || 'stylist', level: m.level, title: m.title, specialities: m.spec || null,
        bio: m.spec ? `${m.title} with ${Math.round(m.months / 12) || 1}+ years' experience. Loves ${m.spec.toLowerCase()}.` : null,
        base_salary: m.base, service_commission_pct: m.comm, retail_incentive_pct: m.role === 'manager' ? 2 : 6, target_amount: m.level === 'junior' ? 60000 : 110000,
        slabs: JSON.stringify(m.level === 'junior' ? [{ min: 40000, bonus: 1000 }, { min: 60000, bonus: 2500 }, { min: 85000, bonus: 4500 }] : [{ min: 80000, bonus: 2500 }, { min: 110000, bonus: 5000 }, { min: 150000, bonus: 9000 }]),
        hue: int(0, 359), joined_on: ymd(addDays(TODAY, -m.months * 30)),
      });
      staff.push({
        id: sid, key: m.key, userId: U[m.key], name: m.name, role: m.role || 'stylist', level: m.level, skills: new Set(m.skills), comm: m.comm, retailPct: m.role === 'manager' ? 2 : 6,
        off: (staff.length % 4) + 1, // weekly off Mon..Thu
        shiftStart: staff.length % 2 === 0 ? open : Math.max(open, close - 540),
        shiftEnd: staff.length % 2 === 0 ? Math.min(open + 540, close) : close,
      });
    }
    const stylists = staff.filter((s) => s.role !== 'manager');

    // services menu
    const menu = S.menu === 'men' ? MENU.men : S.menu === 'women' ? MENU.unisex.filter((m) => m.gender !== 'men' && m.category !== 'Men') : MENU.unisex;
    const svc = {};
    for (const m of menu) {
      const price = Math.round((m.price * S.priceX) / 10) * 10;
      const id = await insert('services', {
        salon_id: salonId, brand_service_id: S.brand ? brandSvc[m.name] || null : null, name: m.name, category: m.category, price, duration_min: m.dur,
        cycle_days: m.cycle, gender: m.gender, tags: m.tags,
      });
      svc[m.name] = { id, name: m.name, price, dur: m.dur, cycle: m.cycle, category: m.category, recipe: m.recipe, gender: m.gender };
    }
    // skills
    for (const st of stylists) {
      for (const s of Object.values(svc)) if (st.skills.has(s.category)) await insert('staff_services', { staff_id: st.id, service_id: s.id });
    }

    // products
    const prod = {};
    const productRows = PRODUCTS.filter(([name]) => {
      if (S.menu === 'men') return ['Hair Colour Tube 60g', 'Developer 1L', 'Hair Spa Cream 500g', 'Facial Kit (pack of 5)', 'Beard Oil 30ml', 'Matte Hair Wax 75g', 'Anti-Dandruff Serum 50ml', 'Sunscreen SPF 50 50ml', 'Repair Shampoo 300ml'].includes(name);
      if (S.menu === 'women') return !['Beard Oil 30ml', 'Matte Hair Wax 75g'].includes(name);
      return true;
    });
    for (const [name, kind, unit, mrp, cost, category, brand, refill] of productRows) {
      const vp = VP.dist[name];
      const id = await insert('products', {
        salon_id: salonId, vendor_product_id: vp?.id || null, preferred_vendor_id: vp ? V.dist : null, name, brand, category,
        barcode: `890${int(1000000000, 9999999999)}`, kind, unit, mrp, cost_price: cost, stock_qty: 0,
        reorder_level: kind === 'backbar' ? 3 : 4, reorder_qty: kind === 'backbar' ? 6 : 12, refill_days: refill || null,
        expiry_date: ymd(addDays(TODAY, int(20, 540))),
      });
      prod[name] = { id, name, kind, mrp, cost, category };
    }
    const recipeOf = {};
    for (const s of Object.values(svc)) {
      recipeOf[s.id] = [];
      for (const [pname, qty] of s.recipe || []) {
        if (!prod[pname]) continue;
        await insert('service_recipes', { service_id: s.id, product_id: prod[pname].id, qty });
        recipeOf[s.id].push({ pid: prod[pname].id, qty, cost: prod[pname].cost });
      }
    }
    const retailProducts = Object.values(prod).filter((p) => p.kind === 'retail');

    // packages & memberships
    const pk = {};
    const addPkg = async (key, data) => { pk[key] = { ...data, id: await insert('packages', { salon_id: salonId, ...data }) }; };
    if (S.menu === 'men') {
      await addPkg('beard', { name: 'Beard Club — 8 trims', type: 'package', price: 999, sessions: 8, service_id: svc['Beard Trim & Shape'].id, validity_days: 120, description: '8 beard trims for the price of 6' });
      await addPkg('cut', { name: 'Haircut Pass — 6 cuts', type: 'package', price: 1299, sessions: 6, service_id: svc['Haircut — Men'].id, validity_days: 180, description: '6 haircuts, save ₹200' });
      await addPkg('member', { name: 'Bros Membership', type: 'membership', price: 1999, value_amount: 300, discount_pct: 10, validity_days: 365, description: '10% off every visit + ₹300 wallet credit' });
    } else {
      await addPkg('spa', { name: 'Hair Spa × 6', type: 'package', price: Math.round(svc['Hair Spa'].price * 5), sessions: 6, service_id: svc['Hair Spa'].id, validity_days: 180, description: 'Pay for 5, get 6 hair spas' });
      if (svc['Eyebrow Threading']) await addPkg('thread', { name: 'Threading × 10', type: 'package', price: Math.round(svc['Eyebrow Threading'].price * 8), sessions: 10, service_id: svc['Eyebrow Threading'].id, validity_days: 180, description: '10 threading sessions for the price of 8' });
      await addPkg('member', { name: `${S.brand ? 'GlowCraft' : S.name.split(' ')[0]} Gold Membership`, type: 'membership', price: 4999, value_amount: 1000, discount_pct: 10, validity_days: 365, description: '10% off all services for a year + ₹1,000 wallet credit' });
    }

    // offers
    const offers = {};
    offers.happy = await insert('offers', { salon_id: salonId, code: 'HAPPY20', title: 'Weekday happy hour — 20% off', description: 'Tue–Thu, 2 pm to 5 pm on all services', type: 'percent', value: 20, happy_hour: 1, days: '2,3,4', start_time: '14:00:00', end_time: '17:00:00' });
    offers.welcome = await insert('offers', { salon_id: salonId, code: 'WELCOME15', title: 'First visit 15% off', description: 'For first-time clients booking on the app', type: 'percent', value: 15, first_visit_only: 1 });
    await insert('offers', { salon_id: salonId, code: 'COMEBACK15', title: 'We miss you — 15% off', description: 'Win-back offer for clients away 90+ days', type: 'percent', value: 15, valid_to: ymd(addDays(TODAY, 60)) });

    // salon-specific checklist templates for independents
    let tplIds = brandTplIds;
    if (!S.brand) {
      tplIds = [];
      for (const t of brandTemplates) tplIds.push(await insert('checklist_templates', { salon_id: salonId, name: t.name, kind: t.kind, items: JSON.stringify(t.items.map((x) => x.replace('national offer', 'offers'))) }));
    }

    // recurring costs
    const rent = { gc_an: 95000, gc_vel: 65000, gc_tn: 90000, gc_kor: 110000, mane: 120000, barber: 40000, lotus: 50000 }[S.key];
    const recurring = [
      ['rent', rent, 5, 'Shop rent'], ['electricity', Math.round(rent * 0.18), 10, 'EB bill (estimate)'], ['amc', 3500, 15, 'Equipment AMC'],
      ['laundry', Math.round(rent * 0.06), 28, 'Towel laundry'], ['other', 1800, 3, 'Internet & software'],
    ];
    for (const [category, amount, day, note] of recurring) await insert('recurring_expenses', { salon_id: salonId, category, amount, day_of_month: day, note });

    // equipment
    const eq = [
      ['Hydraulic styling chair (×4)', 'HC-', -700, 365, 200], ['Hair spa steamer', 'ST-', -500, 365, 60], ['UV steriliser cabinet', 'UV-', -300, 365, 20], ['Facial machine 7-in-1', 'FM-', -900, 365, -10],
    ];
    const eqIds = [];
    for (const [name, sn, bought, warranty, amc] of eq) {
      eqIds.push(await insert('equipment', {
        salon_id: salonId, vendor_id: V.equip, name, serial_no: `${sn}${int(10000, 99999)}`, purchased_on: ymd(addDays(TODAY, bought)),
        warranty_until: ymd(addDays(TODAY, bought + warranty)), amc_until: ymd(addDays(TODAY, amc)),
      }));
    }
    if (S.key === 'gc_an' || S.key === 'mane' || S.key === 'gc_tn')
      await insert('service_tickets', { equipment_id: eqIds[1], salon_id: salonId, vendor_id: V.equip, issue: 'Steamer not heating evenly, takes 15 min to warm up', status: S.key === 'mane' ? 'scheduled' : 'open', visit_on: S.key === 'mane' ? ymd(addDays(TODAY, 2)) : null });
    await insert('service_tickets', { equipment_id: eqIds[0], salon_id: salonId, vendor_id: V.equip, issue: 'Chair 2 hydraulic pump leaking', status: 'closed', resolution: 'Seal replaced on site', resolved_at: `${ymd(addDays(TODAY, -40))} 15:00:00` });

    // vendor credit account
    await insert('vendor_accounts', { vendor_id: V.dist, salon_id: salonId, credit_limit: S.daily * 4000, credit_days: 30 });
    if (S.key === 'mane' || S.key === 'gc_kor') await insert('vendor_accounts', { vendor_id: V.brand, salon_id: salonId, credit_limit: 60000, credit_days: 21 });

    // ---------------------------------------------------------- roster & attendance
    const dayInfo = {}; // dayIdx -> staffId -> {on, start, end}
    const leaveDays = new Set();
    for (let d = 0; d <= HISTORY + AHEAD; d++) {
      const date = dateOf(d);
      const dow = addDays(date, 0).getDay();
      dayInfo[d] = {};
      for (const st of staff) {
        const off = dow === st.off;
        const leave = !off && d < TODAY_IDX && chance(0.015);
        if (leave) leaveDays.add(`${st.id}_${d}`);
        dayInfo[d][st.id] = { on: !off && !leave, start: st.shiftStart, end: st.shiftEnd };
        R.roster.push({ staff_id: st.id, salon_id: salonId, date, shift_start: off ? null : `${timeOf(st.shiftStart)}:00`, shift_end: off ? null : `${timeOf(st.shiftEnd)}:00`, is_off: off ? 1 : 0 });
        if (d < TODAY_IDX || (d === TODAY_IDX && NOW_MIN > st.shiftStart)) {
          let status = off ? 'off' : leave ? 'leave' : 'present';
          let checkIn = null;
          if (status === 'present') {
            const late = chance(S.key === 'gc_tn' ? 0.16 : 0.07);
            const absent = chance(0.02);
            if (absent) { status = 'absent'; dayInfo[d][st.id].on = false; } else {
              const m = st.shiftStart - int(0, 12) + (late ? int(15, 40) : 0);
              status = late ? 'late' : 'present';
              checkIn = dts(date, m);
            }
          }
          R.attendance.push({
            staff_id: st.id, salon_id: salonId, date, check_in: checkIn,
            check_out: checkIn && d < TODAY_IDX ? dts(date, st.shiftEnd + int(-10, 25)) : null,
            lat: checkIn ? Number((S.lat + (rand() - 0.5) * 0.0006).toFixed(6)) : null, lng: checkIn ? Number((S.lng + (rand() - 0.5) * 0.0006).toFixed(6)) : null,
            distance_m: checkIn ? int(5, 60) : null, selfie_path: null, status,
          });
        }
      }
    }

    // ---------------------------------------------------------- clients & visit simulation
    const clients = [];
    const newClient = (gender, d, opts = {}) => {
      ids.client += 1;
      const c = {
        id: ids.client, salon_id: salonId, user_id: opts.user_id || null, name: opts.name || personName(gender), phone: opts.phone || phone(), gender,
        dob: chance(0.6) ? ymd(new Date(int(1970, 2004), int(0, 11), int(1, 28))) : null, source: opts.source || 'walkin',
        allergies: chance(0.06) ? pickOne(['PPD (hair dye) sensitivity', 'Allergic to wax', 'Sensitive scalp', 'Nut oil allergy']) : null,
        colour_formula: null, notes: null, preferred_staff_id: null, wallet_balance: 0, no_show_count: 0, visits: 0, total_spend: 0,
        first_visit: null, last_visit: null, referral_code: `R${token(3).toUpperCase()}`, referred_by_client_id: null, marketing_opt_in: chance(0.94) ? 1 : 0,
        created_at: dts(dateOf(d), open), _main: null, _lastInvoice: null, _pkg: null, _member: false, _fixed: opts.fixed || null, _staffCount: {},
      };
      if (!opts.fixed && clients.length > 20 && chance(0.12)) c.referred_by_client_id = pickOne(clients).id;
      const pool0 = gender === 'M' ? WEIGHTS.men : WEIGHTS.women;
      const avail = Object.fromEntries(Object.entries(pool0).filter(([n]) => svc[n]));
      c._main = weighted(Object.keys(avail).length ? avail : Object.fromEntries(Object.keys(svc).map((n) => [n, 1])));
      clients.push(c);
      return c;
    };

    // Demo customers with fixed histories
    const fixedPlans = [];
    if (S.key === 'gc_an') {
      const priya = newClient('F', 10, {
        user_id: U.priya, name: 'Priya Sharma', phone: '9000000101', source: 'app',
        fixed: [
          { d: 10, s: ['Root Touch-up', 'Eyebrow Threading'], st: 'ravi', member: true },
          { d: 38, s: ['Hair Spa', 'Eyebrow Threading'], st: 'ravi' },
          { d: 49, s: ['Classic Facial'], st: 'divya' },
          { d: 72, s: ['Root Touch-up', 'Eyebrow Threading'], st: 'ravi', rebook: true },
          { d: 95, s: ['Pedicure', 'Eyebrow Threading'], st: 'divya' },
          { d: 108, s: ['Root Touch-up', 'Hair Spa'], st: 'ravi', rebook: true, product: 'Colour Protect Shampoo 300ml' },
          { d: TODAY_IDX + 3, s: ['Eyebrow Threading', 'Clean-up'], st: 'divya', future: true },
        ],
      });
      priya.colour_formula = 'Root: 5.0 + 6.3 (1:1), 20 vol, 35 min. Ends: gloss 7.32';
      priya.allergies = 'Sensitive scalp — use barrier cream';
      priya.dob = '1993-11-02';
      priya.notes = 'Prefers Saturday mornings. Likes low-ammonia colour.';
      fixedPlans.push(priya);
    }
    if (S.key === 'lotus') {
      const p2 = newClient('F', 60, { user_id: U.priya, name: 'Priya Sharma', phone: '9000000101', source: 'google', fixed: [{ d: 60, s: ['Eyebrow Threading', 'Full Arms Waxing'], st: 'banu' }, { d: 101, s: ['Pedicure', 'Eyebrow Threading'], st: 'selvi' }] });
      fixedPlans.push(p2);
    }
    if (S.key === 'mane') {
      const rahul = newClient('M', 15, {
        user_id: U.rahul, name: 'Rahul Verma', phone: '9000000102', source: 'instagram',
        fixed: [
          { d: 15, s: ['Haircut — Men', 'Beard Trim & Shape'], st: 'vikram' },
          { d: 37, s: ['Haircut — Men', 'Beard Trim & Shape'], st: 'vikram', rebook: true },
          { d: 60, s: ['Haircut — Men', 'Head Massage'], st: 'vikram', rebook: true },
          { d: 84, s: ['Haircut — Men', 'Beard Trim & Shape'], st: 'rakesh' },
          { d: 106, s: ['Haircut — Men', "Men's Hair Colour"], st: 'vikram', rebook: true, product: 'Matte Hair Wax 75g' },
          { d: TODAY_IDX + 5, s: ['Haircut — Men', 'Beard Trim & Shape'], st: 'vikram', future: true },
        ],
      });
      rahul.allergies = null;
      fixedPlans.push(rahul);
    }
    if (S.key === 'gc_kor') fixedPlans.push(newClient('M', 70, { user_id: U.rahul, name: 'Rahul Verma', phone: '9000000102', source: 'app', fixed: [{ d: 70, s: ['Hair Spa'], st: 'naveen' }] }));

    const pending = new Map(); // day -> [{client, rebookFrom, fixedVisit}]
    const pushPending = (d, v) => {
      if (!pending.has(d)) pending.set(d, []);
      pending.get(d).push(v);
    };
    for (const c of fixedPlans) for (const fv of c._fixed) pushPending(fv.d, { client: c, fixed: fv });

    const DOW_FACTOR = [1.35, 0.75, 0.62, 0.8, 0.9, 1.1, 1.5];
    let invoiceSeq = {};
    const stylistByKey = Object.fromEntries(stylists.map((s) => [s.key, s]));
    const staffDayBooked = {}; // `${staffId}_${d}` -> intervals

    const book = (staffId, d, start, end) => {
      const k = `${staffId}_${d}`;
      (staffDayBooked[k] ||= []).push([start, end]);
    };
    const freeAt = (staffId, d, from, dur, endLimit) => {
      const list = (staffDayBooked[`${staffId}_${d}`] || []).slice().sort((a, b) => a[0] - b[0]);
      let t = from;
      for (const [a, b] of list) {
        if (t + dur <= a) break;
        if (t < b) t = b;
      }
      return t + dur <= endLimit ? t : null;
    };

    for (let d = 0; d <= HISTORY + AHEAD; d++) {
      const date = dateOf(d);
      const dow = addDays(date, 0).getDay();
      const isFuture = d > TODAY_IDX;
      const isToday = d === TODAY_IDX;
      const visits = [];
      for (const p of pending.get(d) || []) visits.push(p);
      if (!isFuture) {
        const nNew = Math.max(1, Math.round(S.daily * 0.62 * DOW_FACTOR[dow] * (0.8 + rand() * 0.4)));
        for (let i = 0; i < nNew; i++) {
          const gender = S.gender_type === 'men' ? 'M' : S.gender_type === 'women' ? 'F' : chance(0.56) ? 'F' : 'M';
          const src = weighted({ walkin: 45, phone: 14, app: 15, whatsapp: 10, instagram: 9, google: 7 });
          visits.push({ client: newClient(gender, d, { source: src === 'app' ? 'app' : src }), isNew: true, source: src });
        }
      } else if (d <= TODAY_IDX + 6) {
        // a few fresh app/phone bookings in the coming week
        const n = Math.round(S.daily * 0.12 * DOW_FACTOR[dow]);
        for (let i = 0; i < n; i++) {
          const gender = S.gender_type === 'men' ? 'M' : S.gender_type === 'women' ? 'F' : chance(0.56) ? 'F' : 'M';
          const src = weighted({ app: 45, phone: 25, whatsapp: 20, instagram: 10 });
          visits.push({ client: newClient(gender, TODAY_IDX, { source: src }), isNew: true, source: src });
        }
      }

      // Preferred time of day
      for (const v of visits) {
        if (v.fixed) { v.pref = dow === 6 || dow === 0 ? open + 90 : open + 180; continue; }
        const weekend = dow === 0 || dow === 6;
        const slot = weekend ? weighted({ m: 35, a: 35, e: 30 }) : weighted({ m: 22, a: 18, e: 60 });
        const span = close - open;
        const base = slot === 'm' ? open : slot === 'a' ? open + Math.round(span * 0.38) : open + Math.round(span * 0.62);
        v.pref = Math.min(close - 30, base + int(0, Math.round(span * 0.3)));
      }
      visits.sort((a, b) => a.pref - b.pref);

      for (const v of visits) {
        const c = v.client;
        // services
        let names;
        if (v.fixed) names = v.fixed.s.filter((n) => svc[n]);
        else {
          const main = c.visits > 0 && chance(0.3) ? weighted(Object.fromEntries(Object.entries(c.gender === 'M' ? WEIGHTS.men : WEIGHTS.women).filter(([n]) => svc[n]))) : c._main;
          names = [main];
          if (chance(0.28)) {
            const addon = c.gender === 'M' ? (svc['Beard Trim & Shape'] ? 'Beard Trim & Shape' : null) : svc['Eyebrow Threading'] ? 'Eyebrow Threading' : null;
            if (addon && addon !== main) names.push(addon);
          }
        }
        if (!names.length) continue;
        const services = names.map((n) => svc[n]);
        const dur = services.reduce((t, s) => t + s.dur, 0);
        const cats = new Set(services.map((s) => s.category));

        // staff allocation
        let cands = stylists.filter((st) => dayInfo[d][st.id]?.on && [...cats].every((cat) => st.skills.has(cat)));
        if (!cands.length) cands = stylists.filter((st) => dayInfo[d][st.id]?.on && st.skills.has(services[0].category));
        if (!cands.length) continue;
        let chosen = null;
        const prefStaff = v.fixed ? stylistByKey[v.fixed.st] : stylists.find((s) => s.id === c.preferred_staff_id);
        const tryStaff = (st) => {
          const info = dayInfo[d][st.id];
          const t = freeAt(st.id, d, Math.max(v.pref, info.start), dur, info.end);
          return t === null ? null : { st, t };
        };
        if (prefStaff && dayInfo[d][prefStaff.id]?.on && (v.fixed || chance(0.75))) {
          const r0 = tryStaff(prefStaff);
          if (r0 && r0.t - v.pref <= (v.fixed ? 600 : 45)) chosen = r0;
        }
        if (!chosen) {
          let best = null;
          for (const st of cands) {
            const r0 = tryStaff(st);
            if (r0 && (!best || r0.t < best.t)) best = r0;
          }
          chosen = best;
        }
        if (!chosen) continue; // capacity full — lost demand
        const start = Math.ceil(chosen.t / 5) * 5;
        if (start + dur > dayInfo[d][chosen.st.id].end) continue;
        const end = start + dur;
        book(chosen.st.id, d, start, end + (chance(0.5) ? 5 : 0));

        // source & status
        let source = v.fixed ? (c.source === 'app' ? 'app' : 'phone') : v.rebookFrom ? 'rebook' : v.source || weighted({ walkin: 32, phone: 20, app: 22, whatsapp: 16, instagram: 5, google: 5 });
        if (v.fixed?.rebook) source = 'rebook';
        const startAt = dts(date, start);
        const endAt = dts(date, end);
        let status;
        if (isFuture || (isToday && start > NOW_MIN)) status = source === 'walkin' ? 'booked' : chance(0.8) ? 'confirmed' : 'booked';
        else if (isToday && start <= NOW_MIN && end > NOW_MIN) status = 'in_service';
        else status = 'completed';
        if (isFuture && source === 'walkin') source = 'phone';
        if (status === 'completed' && source !== 'walkin' && !v.fixed && chance(S.noShow)) status = 'no_show';
        else if (status === 'completed' && source !== 'walkin' && !v.fixed && chance(0.03)) status = 'cancelled';

        ids.appt += 1;
        const apptId = ids.appt;
        const price = services.reduce((t, s) => t + s.price, 0);
        const depositAmt = source === 'app' && c.visits === 0 ? round2(price * 0.2) : 0;
        const createdAt = source === 'walkin' ? startAt : v.rebookFrom ? v.rebookFrom.at : dts(ymd(addDays(date, -int(1, 6))), int(open, close - 60));
        const appt = {
          id: apptId, salon_id: salonId, client_id: c.id, staff_id: chosen.st.id, chair_id: null, group_ref: null, start_at: startAt, end_at: endAt, status, source,
          deposit_amount: depositAmt, deposit_status: depositAmt ? (status === 'completed' ? 'adjusted' : status === 'no_show' ? 'forfeited' : 'paid') : 'none',
          offer_id: null, campaign_id: null, notes: null, rebooked_from_invoice_id: v.rebookFrom?.invoiceId || null, invoice_id: null,
          reminder_sent: status === 'completed' || status === 'no_show' ? 1 : 0, created_by: null, created_at: createdAt < `${START} 00:00:00` ? `${START} 09:00:00` : createdAt,
        };
        R.appointments.push(appt);
        for (const s of services) R.appointment_services.push({ appointment_id: apptId, service_id: s.id, price: s.price, duration_min: s.dur });

        if (status === 'no_show') {
          c.no_show_count += 1;
          R.audit_log.push({ salon_id: salonId, user_id: null, action: 'no_show', entity: 'appointment', entity_id: apptId, details: null, created_at: endAt });
          if (chance(0.5)) pushPending(d + int(5, 20), { client: c });
          continue;
        }
        if (status === 'cancelled') {
          R.audit_log.push({ salon_id: salonId, user_id: null, action: 'cancel', entity: 'appointment', entity_id: apptId, details: JSON.stringify({ reason: 'Client called to cancel' }), created_at: dts(date, Math.max(open, start - 120)) });
          continue;
        }
        if (status !== 'completed') continue;

        // ---------------- invoice
        ids.invoice += 1;
        const invId = ids.invoice;
        appt.invoice_id = invId;
        const billAt = dts(date, Math.min(end + int(2, 8), 24 * 60 - 1));
        const mkey = billAt.slice(2, 4) + billAt.slice(5, 7);
        invoiceSeq[mkey] = (invoiceSeq[mkey] || 0) + 1;
        const lines = [];
        let pkgRedeemed = false;
        for (const s of services) {
          const usePkg = c._pkg && c._pkg.service_id === s.id && c._pkg.left > 0 && new Date(c._pkg.expires) >= new Date(date);
          if (usePkg && !pkgRedeemed) {
            c._pkg.left -= 1;
            pkgRedeemed = true;
            lines.push({ item_type: 'service', ref_id: s.id, name: `${s.name} (package session)`, qty: 1, unit_price: 0, amount: 0, duration_min: s.dur, staff_id: chosen.st.id, commission_amount: round2((s.price * chosen.st.comm) / 100), client_package_id: c._pkg.id });
          } else {
            lines.push({ item_type: 'service', ref_id: s.id, name: s.name, qty: 1, unit_price: s.price, amount: s.price, duration_min: s.dur, staff_id: chosen.st.id, commission_amount: round2((s.price * chosen.st.comm) / 100), client_package_id: null });
          }
          for (const rc of recipeOf[s.id] || []) {
            R.stock_movements.push({ product_id: rc.pid, salon_id: salonId, type: 'backbar', qty: -rc.qty, staff_id: chosen.st.id, ref_type: 'invoice', ref_id: invId, note: null, created_by: null, created_at: billAt });
          }
        }
        // retail
        const wantProduct = v.fixed?.product || (chance(S.retail) && retailProducts.length ? null : undefined);
        if (wantProduct !== undefined) {
          const pool1 = retailProducts.filter((p) => (c.gender === 'M' ? ['Men', 'Care', 'Skin'].includes(p.category) : p.category !== 'Men'));
          const p = wantProduct ? prod[wantProduct] : pickOne(pool1.length ? pool1 : retailProducts);
          if (p) {
            lines.push({ item_type: 'product', ref_id: p.id, name: p.name, qty: 1, unit_price: p.mrp, amount: p.mrp, duration_min: null, staff_id: chosen.st.id, commission_amount: round2((p.mrp * chosen.st.retailPct) / 100), client_package_id: null });
            R.stock_movements.push({ product_id: p.id, salon_id: salonId, type: 'sale', qty: -1, staff_id: chosen.st.id, ref_type: 'invoice', ref_id: invId, note: null, created_by: null, created_at: billAt });
            if (chance(0.5)) R.prescriptions.push({ salon_id: salonId, client_id: c.id, staff_id: chosen.st.id, product_id: p.id, invoice_id: invId, note: 'Use twice a week', status: 'bought', created_at: billAt });
          }
        }
        // package / membership sale
        let soldPkg = null;
        if (v.fixed?.member || (!c._member && c.visits >= 2 && chance(0.02))) soldPkg = pk.member;
        else if (!c._pkg && c.visits >= 1 && chance(0.03)) {
          const cand = Object.values(pk).filter((x) => x.type === 'package' && services.some((s) => s.id === x.service_id));
          if (cand.length) soldPkg = cand[0];
        }
        if (soldPkg) {
          lines.push({ item_type: soldPkg.type, ref_id: soldPkg.id, name: soldPkg.name, qty: 1, unit_price: soldPkg.price, amount: soldPkg.price, duration_min: null, staff_id: chosen.st.id, commission_amount: round2(soldPkg.price * 0.02), client_package_id: null });
          ids.cpkg += 1;
          const expires = ymd(addDays(date, soldPkg.validity_days));
          const cp = { id: ids.cpkg, client_id: c.id, package_id: soldPkg.id, salon_id: salonId, sessions_total: soldPkg.sessions || null, sessions_left: soldPkg.sessions || null, price_paid: soldPkg.price, discount_pct: soldPkg.discount_pct || null, purchased_at: billAt, expires_at: expires, invoice_id: invId, status: 'active' };
          R.client_packages.push(cp);
          if (soldPkg.type === 'membership') {
            c._member = true;
            if (soldPkg.value_amount) {
              c.wallet_balance = round2(c.wallet_balance + soldPkg.value_amount);
              R.wallet_txns.push({ client_id: c.id, salon_id: salonId, amount: soldPkg.value_amount, type: 'credit', note: `${soldPkg.name} credit`, invoice_id: invId, created_at: billAt });
            }
          } else c._pkg = { id: cp.id, service_id: soldPkg.service_id, left: soldPkg.sessions, expires, row: cp };
        }

        const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
        const serviceTotal = round2(lines.filter((l) => l.item_type === 'service').reduce((t, l) => t + l.amount, 0));
        let discount = 0;
        const reasons = [];
        let offerId = null;
        if (c._member && !soldPkg) { discount += round2(serviceTotal * 0.1); reasons.push('Member: Gold Membership'); }
        const hh = [2, 3, 4].includes(dow) && start >= 840 && start < 1020;
        if (hh && chance(0.55)) { discount += round2(serviceTotal * 0.2); offerId = offers.happy; reasons.push('Offer HAPPY20'); }
        else if (c.visits === 0 && source === 'app' && chance(0.5)) { discount += round2(serviceTotal * 0.15); offerId = offers.welcome; reasons.push('Offer WELCOME15'); }
        let manualPct = 0;
        if (!v.fixed && chance(S.discount)) {
          manualPct = S.key === 'gc_tn' ? int(10, 22) : int(5, 10);
          const m = round2((subtotal * manualPct) / 100);
          discount += m;
          reasons.push(pickOne(['Regular client', 'Festival discount', 'Service delay', 'Friend of staff']));
        }
        discount = round2(Math.min(subtotal, discount));
        const total = round2(subtotal - discount);
        const taxable = round2(total / 1.18);
        const tax = round2(total - taxable);
        const cgst = round2(tax / 2);
        const tip = chance(0.17) ? pickOne([50, 50, 100, 100, 150, 200]) : 0;
        const creator = S.manager && chance(0.7) ? U[S.manager.key] : U[S.owner];
        if (manualPct > 10)
          R.audit_log.push({ salon_id: salonId, user_id: creator, action: 'discount', entity: 'invoice', entity_id: invId, details: JSON.stringify({ amount: round2((subtotal * manualPct) / 100), pct: manualPct, reason: reasons[reasons.length - 1] }), created_at: billAt });
        R.invoices.push({
          id: invId, salon_id: salonId, client_id: c.id, appointment_id: apptId, invoice_no: `${mkey}-${String(invoiceSeq[mkey]).padStart(4, '0')}`,
          subtotal, discount_amount: discount, discount_reason: reasons.join('; ') || null, approval_id: null, taxable, cgst, sgst: round2(tax - cgst), total,
          tip_amount: tip, tip_staff_id: tip ? chosen.st.id : null, status: 'paid', void_reason: null, voided_by: null, offer_id: offerId, campaign_id: null,
          public_token: token(10), created_by: creator, created_at: billAt,
        });
        for (const l of lines) R.invoice_items.push({ invoice_id: invId, ...l });
        // payments
        let due = round2(total + tip);
        const pays = [];
        if (depositAmt) { pays.push(['deposit', Math.min(due, depositAmt)]); due = round2(due - Math.min(due, depositAmt)); }
        if (c.wallet_balance > 0 && due > 0 && chance(0.6)) {
          const w = round2(Math.min(c.wallet_balance, due));
          c.wallet_balance = round2(c.wallet_balance - w);
          R.wallet_txns.push({ client_id: c.id, salon_id: salonId, amount: w, type: 'debit', note: `Bill ${mkey}-${String(invoiceSeq[mkey]).padStart(4, '0')}`, invoice_id: invId, created_at: billAt });
          pays.push(['wallet', w]);
          due = round2(due - w);
        }
        if (due > 0) pays.push([weighted({ upi: 56, cash: 31, card: 13 }), due]);
        for (const [mode, amount] of pays) R.payments.push({ invoice_id: invId, client_id: c.id, salon_id: salonId, mode, amount, purpose: 'bill', ref: mode === 'upi' ? `UPI${int(100000000, 999999999)}` : null, created_at: billAt });

        // client stats
        c.visits += 1;
        c.total_spend = round2(c.total_spend + total);
        c.first_visit ||= date;
        c.last_visit = date;
        c._staffCount[chosen.st.id] = (c._staffCount[chosen.st.id] || 0) + 1;
        c.preferred_staff_id = Number(Object.entries(c._staffCount).sort((a, b) => b[1] - a[1])[0][0]);
        if (services.some((s) => s.category === 'Colour') && !c.colour_formula) c.colour_formula = pickOne(['6.0 + 6.3 (1:1), 20 vol, 35 min', '5.0 root, 30 vol, 40 min', 'Base 4.0, toner 9.1, 15 min', 'Highlights 30 vol, gloss 8.32']);
        c._lastInvoice = { invoiceId: invId, at: billAt };

        // review (verified, after billed visit)
        if (chance(0.3)) {
          let lowPublic = false;
          const happy = chance(S.returnRate + 0.22);
          const r5 = () => (happy ? pickOne([4, 5, 5, 5]) : pickOne([2, 3, 3, 4]));
          const rr = { r_result: r5(), r_hygiene: r5(), r_wait: happy ? pickOne([4, 5]) : pickOne([1, 2, 3]), r_value: r5(), r_behaviour: r5() };
          const overall = Math.round(((rr.r_result + rr.r_hygiene + rr.r_wait + rr.r_value + rr.r_behaviour) / 5) * 10) / 10;
          R.reviews.push({
            salon_id: salonId, staff_id: chosen.st.id, client_id: c.id, user_id: c.user_id, invoice_id: invId, ...rr, overall,
            comment: overall >= 4 ? pickOne([`${chosen.st.name.split(' ')[0]} was brilliant, exactly what I asked for.`, 'Clean place, on time, fair prices.', 'Loved the result, will come back.', 'Very professional and hygienic.', 'Great consultation before the service.', '']) : pickOne(['Had to wait 30 minutes even with a booking.', 'Bill was higher than the menu price I saw.', 'Result was okay but not what I asked for.', 'Towels did not look fresh.']),
            stage: overall >= 4 ? 'public' : d > TODAY_IDX - 10 ? 'private' : (lowPublic = chance(0.45)) ? 'public' : 'recovered',
            recovery_note: overall >= 4 || d > TODAY_IDX - 10 || lowPublic ? null : 'Called the client, offered a free fix visit. Client happy.', created_at: dts(ymd(addDays(date, int(1, 2))), int(600, 1260)),
          });
        }

        // return decision
        if (v.fixed) continue;
        const pReturn = c.visits === 1 ? S.returnRate - 0.06 : Math.min(0.88, S.returnRate + 0.18);
        const rebooked = chance(S.rebook);
        if (rebooked || chance(pReturn)) {
          const cyc = svc[c._main]?.cycle || 30;
          const nd = d + Math.max(7, Math.round(cyc * (0.8 + rand() * 0.6)));
          if (nd <= HISTORY + AHEAD && (nd <= TODAY_IDX || rebooked || chance(0.35)))
            pushPending(nd, { client: c, rebookFrom: rebooked ? c._lastInvoice : null, source: rebooked ? 'rebook' : undefined });
          else if (rebooked && nd > HISTORY + AHEAD) {
            // Rebooked at checkout for a date beyond the simulated window: keep the future booking
            const svcRow = svc[c._main];
            const fstart = Math.min(close - svcRow.dur, open + 30 * int(1, Math.max(1, Math.floor((close - open - svcRow.dur) / 30))));
            ids.appt += 1;
            R.appointments.push({
              id: ids.appt, salon_id: salonId, client_id: c.id, staff_id: chosen.st.id, chair_id: null, group_ref: null,
              start_at: dts(dateOf(nd), fstart), end_at: dts(dateOf(nd), fstart + svcRow.dur), status: 'confirmed', source: 'rebook',
              deposit_amount: 0, deposit_status: 'none', offer_id: null, campaign_id: null, notes: null, rebooked_from_invoice_id: invId, invoice_id: null,
              reminder_sent: 0, created_by: null, created_at: billAt,
            });
            R.appointment_services.push({ appointment_id: ids.appt, service_id: svcRow.id, price: svcRow.price, duration_min: svcRow.dur });
          }
        }
      }
    }

    // finalize package rows' sessions_left
    for (const c of clients) if (c._pkg) { c._pkg.row.sessions_left = c._pkg.left; c._pkg.row.status = c._pkg.left <= 0 ? 'exhausted' : 'active'; }

    // queue tokens right now (only when the salon is open)
    if (NOW_MIN >= open + 30 && NOW_MIN < close - 60) {
      const waiting = S.key === 'barber' ? 4 : 2;
      for (let i = 0; i < waiting + 1; i++) {
        const g = S.gender_type === 'men' ? 'M' : chance(0.5) ? 'F' : 'M';
        const name = personName(g);
        const srv = g === 'M' ? svc['Haircut — Men'] || svc['Beard Trim & Shape'] : svc['Eyebrow Threading'] || svc['Haircut — Women'];
        R.queue_tokens.push({
          salon_id: salonId, client_id: null, user_id: null, name, phone: phone(), token_no: i + 1, service_id: srv?.id || null,
          staff_id: i === 0 ? stylists[0].id : null, status: i === 0 ? 'serving' : 'waiting', source: i === 2 ? 'app' : 'walkin',
          joined_at: dts(TODAY, NOW_MIN - (waiting + 1 - i) * 7), started_at: i === 0 ? dts(TODAY, NOW_MIN - 10) : null, done_at: null,
        });
      }
    }

    // purchase orders with the distributor
    const poRows = [];
    const poDefs = [
      [-95, 'delivered', 1], [-70, 'delivered', 1], [-45, 'delivered', 1], [-32, 'delivered', S.key === 'gc_tn' ? 0 : 0.4], [-12, 'delivered', 0], [-3, 'dispatched', 0], [-1, 'placed', 0],
    ];
    let poN = 0;
    for (const [off, status, paidRatio] of poDefs) {
      poN++;
      const items = Object.values(prod).filter(() => chance(0.4)).slice(0, 6);
      if (!items.length) continue;
      const lines = items.map((p) => {
        const vp = VP.dist[p.name];
        const price = S.brand && ['Hair Colour Tube 60g', 'Developer 1L', 'Keratin Smooth Kit 1L', 'Repair Shampoo 300ml', 'Facial Kit (pack of 5)', 'Liposoluble Wax 800ml'].includes(p.name) ? round2(vp.trade * 0.9) : vp.trade;
        const qty = p.kind === 'backbar' ? int(3, 8) : int(6, 12);
        return { vendor_product_id: vp.id, product_id: p.id, name: p.name, qty, price, amount: round2(qty * price) };
      });
      const total = round2(lines.reduce((t, l) => t + l.amount, 0));
      const created = dts(ymd(addDays(TODAY, off)), 11 * 60);
      const delivered = status === 'delivered' ? dts(ymd(addDays(TODAY, off + 2)), 16 * 60) : null;
      const poId = await insert('purchase_orders', {
        salon_id: salonId, vendor_id: V.dist, po_no: `PO-${salonId}-${String(poN).padStart(4, '0')}`, status, total, paid_amount: round2(total * paidRatio),
        due_date: delivered ? ymd(addDays(TODAY, off + 2 + 30)) : null, notes: off === -1 ? 'One-tap reorder from low-stock alert' : null,
        created_by: S.manager ? U[S.manager.key] : U[S.owner], created_at: created, placed_at: created, delivered_at: delivered,
      });
      for (const l of lines) poRows.push({ po_id: poId, ...l });
      if (paidRatio > 0) await insert('vendor_payments', { vendor_id: V.dist, salon_id: salonId, po_id: poId, amount: round2(total * paidRatio), mode: 'upi', ref: `UTR${int(100000, 999999)}`, paid_at: dts(ymd(addDays(TODAY, off + 20)), 12 * 60) });
      if (status === 'delivered') {
        for (const l of lines) R.stock_movements.push({ product_id: l.product_id, salon_id: salonId, type: 'purchase', qty: l.qty, staff_id: null, ref_type: 'po', ref_id: poId, note: null, created_by: null, created_at: delivered });
        R.expenses_po = R.expenses_po || [];
        R.expenses_po.push({ salon_id: salonId, category: 'product', amount: total, expense_date: delivered.slice(0, 10), note: `Distributor order PO-${salonId}-${String(poN).padStart(4, '0')}`, bill_path: null, recurring_id: null, created_by: U[S.owner] });
      }
    }
    await bulk('po_items', poRows);
    if (S.key === 'mane' || S.key === 'gc_kor') {
      const vp = VP.brand['Keratin Smooth Kit 1L'];
      const poId = await insert('purchase_orders', { salon_id: salonId, vendor_id: V.brand, po_no: `PO-${salonId}-B001`, status: 'delivered', total: vp.trade * 2, paid_amount: 0, due_date: ymd(addDays(TODAY, -4)), created_at: dts(ymd(addDays(TODAY, -27)), 690), placed_at: dts(ymd(addDays(TODAY, -27)), 690), delivered_at: dts(ymd(addDays(TODAY, -25)), 900), created_by: U[S.owner] });
      await insert('po_items', { po_id: poId, vendor_product_id: vp.id, product_id: prod['Keratin Smooth Kit 1L']?.id || null, name: 'Keratin Smooth Kit 1L', qty: 2, price: vp.trade, amount: vp.trade * 2 });
    }

    // stock levels: opening purchases then consumption; leave a few products low
    const consumed = {};
    const purchased = {};
    for (const m of R.stock_movements) if (m.salon_id === salonId && m.type === 'purchase') purchased[m.product_id] = (purchased[m.product_id] || 0) + m.qty;
    for (const m of R.stock_movements) if (m.salon_id === salonId && (m.type === 'sale' || m.type === 'backbar')) consumed[m.product_id] = (consumed[m.product_id] || 0) - m.qty;
    let lowCount = 0;
    for (const p of Object.values(prod)) {
      const used = consumed[p.id] || 0;
      let stock = p.kind === 'backbar' ? int(4, 14) : int(5, 24);
      if (lowCount < 3 && chance(0.25)) { stock = p.kind === 'backbar' ? int(1, 2) : int(1, 3); lowCount++; }
      const opening = round2(used + stock - (purchased[p.id] || 0));
      R.stock_movements.push({ product_id: p.id, salon_id: salonId, type: 'adjustment', qty: opening, staff_id: null, ref_type: null, ref_id: null, note: 'Opening stock', created_by: U[S.owner], created_at: `${START} 08:00:00` });
      await q('UPDATE products SET stock_qty = ? WHERE id = ?', [stock, p.id]);
      if (p.kind === 'backbar') {
        // weekly issue log to stylists (variance analysis); one stylist over-uses
        const leaky = stylists[stylists.length - 1].id;
        for (const st of stylists) {
          const expected = R.stock_movements.filter((m) => m.salon_id === salonId && m.product_id === p.id && m.type === 'backbar' && m.staff_id === st.id && m.created_at >= `${ymd(addDays(TODAY, -30))}`).reduce((t, m) => t - m.qty, 0);
          if (expected <= 0) continue;
          const factor = st.id === leaky ? 1.3 + rand() * 0.15 : 0.98 + rand() * 0.1;
          R.stock_movements.push({ product_id: p.id, salon_id: salonId, type: 'issue', qty: round2(expected * factor), staff_id: st.id, ref_type: null, ref_id: null, note: 'Weekly issue log (sum)', created_by: S.manager ? U[S.manager.key] : U[S.owner], created_at: `${ymd(addDays(TODAY, -2))} 20:00:00` });
        }
      }
    }

    // checklist runs (14 days), lower compliance at T Nagar
    const tplRows = [];
    for (let d = TODAY_IDX - 14; d <= TODAY_IDX; d++) {
      for (const [i, tid] of tplIds.entries()) {
        if (d === TODAY_IDX && i > 0) continue;
        const items = brandTemplates[i].items;
        const doneP = S.key === 'gc_tn' ? 0.7 : 0.94;
        if (S.key === 'gc_tn' && chance(0.25)) continue;
        const its = items.map((label) => ({ label, done: chance(doneP) }));
        tplRows.push({ template_id: tid, salon_id: salonId, run_date: dateOf(d), done_by: S.manager ? U[S.manager.key] : U[S.owner], items: JSON.stringify(its), score: Math.round((its.filter((x) => x.done).length / its.length) * 100), photo_path: null, created_at: dts(dateOf(d), i === 0 ? open + 5 : i === 1 ? 840 : close + 10) });
      }
    }
    await bulk('checklist_runs', tplRows);

    // cash closings (last 14 days)
    salonsOut.push({ S, salonId, staff, stylists, svc, prod, clients, open, close, pk, offers });
  }

  // ---------------------------------------------------------------- bulk insert simulated rows
  console.log(`Writing ${R.invoices.length} bills, ${R.appointments.length} appointments, ${ids.client} clients ...`);
  const clientRows = [];
  for (const so of salonsOut) {
    for (const c of so.clients) {
      clientRows.push(Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_'))));
    }
  }
  // referrals must point to an existing earlier client id in the same salon
  const bySalon = {};
  for (const c of clientRows) (bySalon[c.salon_id] ||= new Set()).add(c.id);
  for (const c of clientRows) if (c.referred_by_client_id && !bySalon[c.salon_id].has(c.referred_by_client_id)) c.referred_by_client_id = null;
  await bulk('clients', clientRows);
  await bulk('appointments', R.appointments);
  await bulk('appointment_services', R.appointment_services);
  await bulk('invoices', R.invoices);
  await bulk('invoice_items', R.invoice_items);
  await bulk('payments', R.payments);
  await bulk('client_packages', R.client_packages);
  await bulk('wallet_txns', R.wallet_txns);
  await bulk('stock_movements', R.stock_movements);
  await bulk('roster', R.roster);
  await bulk('attendance', R.attendance);
  await bulk('reviews', R.reviews);
  await bulk('audit_log', R.audit_log);
  await bulk('queue_tokens', R.queue_tokens);
  await bulk('prescriptions', R.prescriptions);
  await bulk('expenses', R.expenses_po || []);

  // ---------------------------------------------------------------- per-salon finishing touches
  console.log('Finishing: expenses, payroll, royalty, reviews, campaigns ...');
  const { computeEarnings } = await import('../src/services/payroll.js');
  const { recomputeRatings } = await import('../src/services/reviews.js');
  for (const so of salonsOut) {
    const { S, salonId, stylists } = so;
    // monthly expenses for past months + current month recurring
    const rec = await q('SELECT * FROM recurring_expenses WHERE salon_id = ?', [salonId]);
    const expRows = [];
    for (let m = 4; m >= 0; m--) {
      const month = ym(addDays(TODAY, -30 * m));
      const { from, to, days } = monthRange(month);
      if (from < START && m === 4) continue;
      for (const r0 of rec) {
        const date = `${month}-${pad(Math.min(r0.day_of_month, days))}`;
        if (date > TODAY) continue;
        const amount = r0.category === 'electricity' ? round2(r0.amount * (0.85 + rand() * 0.3)) : r0.amount;
        expRows.push({ salon_id: salonId, category: r0.category, amount, expense_date: date, note: r0.note, bill_path: null, recurring_id: r0.id, created_by: U[S.owner] });
      }
      if (to <= TODAY) {
        expRows.push({ salon_id: salonId, category: 'maintenance', amount: int(2500, 9000), expense_date: `${month}-${pad(int(8, 25))}`, note: pickOne(['AC service', 'Plumbing — wash basin', 'Chair repair', 'Painting touch-up']), bill_path: null, recurring_id: null, created_by: U[S.owner] });
        expRows.push({ salon_id: salonId, category: 'marketing', amount: int(3000, 12000), expense_date: `${month}-${pad(int(2, 20))}`, note: pickOne(['Instagram ads', 'Flyers & standees', 'Google Business ads']), bill_path: null, recurring_id: null, created_by: U[S.owner] });
      }
    }
    await bulk('expenses', expRows);

    // payroll for the last 3 completed months
    const staffRows = await q('SELECT * FROM salon_staff WHERE salon_id = ?', [salonId]);
    for (let m = 3; m >= 1; m--) {
      const month = ym(new Date(new Date(TODAY).getFullYear(), new Date(TODAY).getMonth() - m, 1));
      const { from, to } = monthRange(month);
      if (from < START) continue;
      let total = 0;
      for (const s of staffRows) {
        const e = await computeEarnings(s, month);
        total += e.gross - e.tips;
        await insert('payslips', {
          staff_id: s.id, salon_id: salonId, month, days_in_month: e.days_in_month, days_paid: e.days_paid, base: e.base, service_revenue: e.service_revenue,
          commission: e.commission, retail_sales: e.retail_sales, retail_incentive: e.retail_incentive, slab_bonus: e.slab_bonus, tips: e.tips, advances: e.advances,
          gross: e.gross, net: e.net, status: 'paid', sent_at: `${ymd(addDays(to, 1))} 10:00:00`,
        });
      }
      await insert('expenses', { salon_id: salonId, category: 'salary', amount: round2(total), expense_date: to, note: `Payroll ${month}`, created_by: U[S.owner] });
    }

    // advances
    const st0 = stylists[stylists.length - 1];
    await insert('advances', { staff_id: st0.id, salon_id: salonId, amount: 3000, given_on: ymd(addDays(TODAY, -6)), note: 'Festival advance' });

    // cash closings last 14 days
    for (let d = 14; d >= 1; d--) {
      const date = ymd(addDays(TODAY, -d));
      const p = await one(`SELECT COALESCE(SUM(CASE WHEN mode='cash' THEN amount END),0) AS cash, COALESCE(SUM(CASE WHEN mode='upi' THEN amount END),0) AS upi, COALESCE(SUM(CASE WHEN mode='card' THEN amount END),0) AS card FROM payments WHERE salon_id = ? AND DATE(created_at) = ?`, [salonId, date]);
      const cashExp = int(0, 3) * 100;
      const opening = 2000;
      const expected = round2(opening + p.cash - cashExp);
      const variance = S.key === 'gc_tn' && (d === 3 || d === 9) ? -int(600, 1800) : chance(0.2) ? pickOne([-100, -50, 50, 100]) : 0;
      await insert('cash_closings', { salon_id: salonId, date, opening_cash: opening, cash_sales: p.cash, cash_expenses: cashExp, expected_cash: expected, counted_cash: round2(expected + variance), upi_total: p.upi, card_total: p.card, variance, notes: variance < -200 ? 'Shortage — to be checked with front desk' : null, closed_by: S.manager ? U[S.manager.key] : U[S.owner], created_at: `${date} 21:20:00` });
      if (Math.abs(variance) >= 200) await insert('audit_log', { salon_id: salonId, user_id: S.manager ? U[S.manager.key] : U[S.owner], action: 'cash_variance', entity: 'cash_closing', details: JSON.stringify({ date, variance }), created_at: `${date} 21:20:00` });
    }

    // a voided bill for the loss-prevention trail
    const lastInv = await one(`SELECT id, invoice_no, total, client_id FROM invoices WHERE salon_id = ? AND created_at < CURDATE() - INTERVAL 5 DAY ORDER BY id DESC LIMIT 1`, [salonId]);
    if (lastInv && ['gc_tn', 'gc_an'].includes(S.key)) {
      await q(`UPDATE invoices SET status = 'void', void_reason = 'Duplicate bill', voided_by = ? WHERE id = ?`, [U[S.owner], lastInv.id]);
      await q('UPDATE clients SET visits = GREATEST(visits - 1, 0), total_spend = GREATEST(total_spend - ?, 0) WHERE id = ?', [lastInv.total, lastInv.client_id]);
      await insert('audit_log', { salon_id: salonId, user_id: S.manager ? U[S.manager.key] : U[S.owner], action: 'void', entity: 'invoice', entity_id: lastInv.id, details: JSON.stringify({ reason: 'Duplicate bill' }), created_at: `${ymd(addDays(TODAY, -5))} 19:40:00` });
    }

    // ratings
    for (const st of stylists) await recomputeRatings(salonId, st.id);
    await recomputeRatings(salonId, null);

    // campaigns with recipients (attribution)
    const segQ = {
      at_risk: `SELECT id FROM clients WHERE salon_id = ? AND marketing_opt_in = 1 AND last_visit BETWEEN DATE_SUB(?, INTERVAL 120 DAY) AND DATE_SUB(?, INTERVAL 60 DAY) LIMIT 200`,
      all: `SELECT id FROM clients WHERE salon_id = ? AND marketing_opt_in = 1 AND first_visit < ? AND ? <> '' LIMIT 400`,
    };
    const camps = [
      { name: 'Win-back: 15% off for clients we miss', seg: 'at_risk', off: -40, offer: 'COMEBACK15', msg: 'Hi {name}, we miss you at {salon}! Enjoy 15% off your next visit with code {code}. Book in one tap.' },
      { name: 'Weekday happy hour push', seg: 'all', off: -18, offer: 'HAPPY20', msg: 'Hi {name}, Tue–Thu 2–5 pm is happy hour at {salon}: 20% off all services. Code {code}.' },
    ];
    for (const cp of camps) {
      const sentDate = ymd(addDays(TODAY, cp.off));
      const rows = await q(segQ[cp.seg], [salonId, sentDate, sentDate]);
      const offerId = (await one('SELECT id FROM offers WHERE salon_id = ? AND code = ?', [salonId, cp.offer]))?.id || null;
      const channel = cp.seg === 'all' ? 'whatsapp' : 'sms';
      const cid = await insert('campaigns', { salon_id: salonId, name: cp.name, channel, segment: cp.seg, offer_id: offerId, message: cp.msg, status: 'sent', sent_count: rows.length, cost: round2(rows.length * (channel === 'whatsapp' ? 0.8 : 0.25)), sent_at: `${sentDate} 11:00:00`, created_at: `${sentDate} 10:30:00` });
      await bulk('campaign_recipients', rows.map((r0) => ({ campaign_id: cid, client_id: r0.id, sent_at: `${sentDate} 11:00:00` })));
    }
    await insert('campaigns', { salon_id: salonId, name: 'Diwali glow packages', channel: 'whatsapp', segment: 'regular', offer_id: null, message: 'Hi {name}! Diwali slots are filling fast at {salon}. Book your festive glow now — reply BOOK.', status: 'draft' });

    // staff voice, leave requests
    await insert('staff_voice', { salon_id: salonId, user_id: null, category: 'workload', message: 'Saturday evenings are too packed — we skip lunch. Can we add one more stylist on weekends?', status: 'new', created_at: `${ymd(addDays(TODAY, -2))} 22:10:00` });
    await insert('staff_voice', { salon_id: salonId, user_id: stylists[0].userId, category: 'idea', message: 'We could offer a "quick fix" fringe trim for ₹100 between bookings.', status: 'seen', reply: 'Good idea — let us try it from next week.', created_at: `${ymd(addDays(TODAY, -9))} 18:00:00` });
    const jr = stylists.find((s) => s.level === 'junior') || stylists[0];
    await insert('leave_requests', { staff_id: jr.id, salon_id: salonId, type: 'leave', from_date: ymd(addDays(TODAY, 4)), to_date: ymd(addDays(TODAY, 5)), reason: 'Family function in hometown', status: 'pending' });
    if (stylists.length > 2) await insert('leave_requests', { staff_id: stylists[1].id, salon_id: salonId, type: 'swap', from_date: ymd(addDays(TODAY, 2)), to_date: ymd(addDays(TODAY, 2)), swap_with_staff_id: stylists[2].id, reason: 'Doctor appointment in the morning', status: 'pending' });

    // portfolio
    const looks = { Hair: ['Textured bob', 'Layered cut with curtain bangs', 'Long layers'], Colour: ['Caramel balayage', 'Ash brown global', 'Copper money-piece'], Men: ['Skin fade + beard sculpt', 'Classic side part', 'Crew cut'], Makeup: ['South Indian bridal', 'Reception HD makeup', 'Engagement look'], Skin: ['Glow facial before/after', 'De-tan result'], Treatments: ['Keratin smoothening', 'Curl revival'], Nails: ['Gel nails — nude', 'French tips'], Waxing: ['Smooth arms'] };
    const pf = [];
    for (const st of stylists) {
      for (const cat of [...st.skills].slice(0, 3)) for (const title of (looks[cat] || []).slice(0, 2)) pf.push({ staff_id: st.id, title, category: cat, before_hue: int(0, 359), after_hue: int(0, 359), image_path: null, likes: int(3, 140), created_at: dts(ymd(addDays(TODAY, -int(1, 100))), 900) });
    }
    await bulk('portfolio', pf);

    // course enrollments & badges
    const enr = [];
    for (const [i, st] of stylists.entries()) {
      const titles = S.brand ? ['GlowCraft Hygiene Standard', 'Consultation & Rebooking'] : ['Selling Without Pushing'];
      if (st.skills.has('Colour')) titles.push('Advanced Balayage');
      if (st.skills.has('Treatments')) titles.push('Veda Pro Keratin Smooth Certification');
      for (const [j, t] of titles.entries()) {
        const c = COURSES.find((x) => x.title === t);
        const done = st.level !== 'junior' ? j < 2 || i % 2 === 0 : j === 0;
        const lessonsDone = done ? c.lessons.map((_, k) => k) : [0];
        enr.push({ course_id: courseIds[t], user_id: st.userId, assigned_by: S.brand ? U.hq : null, done_lessons: JSON.stringify(lessonsDone), progress: Math.round((lessonsDone.length / c.lessons.length) * 100), completed_at: done ? dts(ymd(addDays(TODAY, -int(5, 80))), 1200) : null });
        if (done && c.badge) await q('INSERT IGNORE INTO user_badges (user_id, name, source, awarded_at) VALUES (?,?,?,?)', [st.userId, c.badge, 'course', dts(ymd(addDays(TODAY, -int(5, 80))), 1200)]);
      }
    }
    await bulk('course_enrollments', enr);

    // pending discount approval at Anna Nagar
    if (S.key === 'gc_an') {
      await insert('approval_requests', { salon_id: salonId, type: 'discount', requested_by: U.lakshmi, payload: JSON.stringify({ amount: 900, pct: 18, reason: 'Bridal party of 4 — repeat client', client: 'Swathi Nair' }), otp_hash: await bcrypt.hash('482913', 8), status: 'pending' });
      await insert('shop_orders', { user_id: U.priya, salon_id: salonId, client_id: clientRows.find((c) => c.user_id === U.priya && c.salon_id === salonId).id, total: 1250, status: 'paid', fulfilment: 'pickup', payment_ref: 'pay_demo_001', created_at: `${ymd(addDays(TODAY, -1))} 20:15:00` }).then(async (oid) => {
        const p = await one(`SELECT id, name, mrp FROM products WHERE salon_id = ? AND name = 'Keratin Smooth Mask 200g'`, [salonId]);
        await insert('shop_order_items', { order_id: oid, product_id: p.id, name: p.name, qty: 1, price: p.mrp });
      });
      const pc = clientRows.find((c) => c.user_id === U.priya && c.salon_id === salonId);
      const ravi = stylists.find((s) => s.key === 'ravi');
      for (const pn of ['Keratin Smooth Mask 200g', 'Vitamin C Face Serum 30ml']) {
        const p = await one('SELECT id FROM products WHERE salon_id = ? AND name = ?', [salonId, pn]);
        await insert('prescriptions', { salon_id: salonId, client_id: pc.id, staff_id: ravi.id, product_id: p.id, note: 'Use the mask once a week after colour', status: 'suggested', created_at: `${ymd(addDays(TODAY, -12))} 13:00:00` });
      }
    }
  }

  // ---------------------------------------------------------------- franchise: royalty, audits, leads
  const brandSalons = salonsOut.filter((x) => x.S.brand);
  for (let m = 3; m >= 1; m--) {
    const month = ym(new Date(new Date(TODAY).getFullYear(), new Date(TODAY).getMonth() - m, 1));
    const { from, to } = monthRange(month);
    if (from < START) continue;
    for (const { salonId, S } of brandSalons) {
      const s = await one(`SELECT COALESCE(SUM(taxable),0) AS net FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ?`, [salonId, `${from} 00:00:00`, `${to} 23:59:59`]);
      const royalty = round2((s.net * BRAND.royalty_pct) / 100);
      const fee = round2((s.net * BRAND.marketing_fee_pct) / 100);
      const paid = m > 1 || (S.key !== 'gc_tn' && S.key !== 'gc_vel');
      await insert('royalty_invoices', { brand_id: brandId, salon_id: salonId, month, net_sales: round2(s.net), royalty_pct: BRAND.royalty_pct, royalty_amount: royalty, marketing_fee: fee, total: round2(royalty + fee), status: paid ? 'paid' : 'due', due_date: ymd(addDays(to, 10)), paid_at: paid ? `${ymd(addDays(to, 8))} 12:00:00` : null });
      if (paid) await insert('expenses', { salon_id: salonId, category: 'royalty', amount: round2(royalty + fee), expense_date: ymd(addDays(to, 8)), note: `Royalty & marketing fee ${month}`, created_by: U[S.owner] });
    }
  }
  const AUDIT_ITEMS = (await import('../src/routes/franchise.js')).AUDIT_TEMPLATE;
  for (const { salonId, S } of brandSalons) {
    for (const off of [-50, -12]) {
      const weak = S.key === 'gc_tn';
      const items = AUDIT_ITEMS.flatMap((sec) => sec.items.map((label) => ({ section: sec.section, label, result: chance(weak ? 0.6 : 0.88) ? 'pass' : chance(0.5) ? 'partial' : 'fail', note: '' })));
      const score = Math.round((items.reduce((t, i) => t + { pass: 2, partial: 1, fail: 0 }[i.result], 0) / (items.length * 2)) * 100);
      const aid = await insert('audits', { brand_id: brandId, salon_id: salonId, auditor_id: U.area, audit_date: ymd(addDays(TODAY, off)), score, items: JSON.stringify(items), summary: weak ? 'Hygiene logs incomplete; discounts not approved; staff late.' : 'Good standards overall. Minor follow-ups.' });
      for (const it of items.filter((x) => x.result === 'fail')) {
        await insert('audit_actions', { audit_id: aid, salon_id: salonId, title: `Fix: ${it.label}`, due_date: ymd(addDays(TODAY, off + 7)), status: off === -50 ? 'closed' : chance(0.4) ? 'in_progress' : 'open', outlet_note: off === -50 ? 'Done, photo shared on WhatsApp group' : null, closed_at: off === -50 ? `${ymd(addDays(TODAY, off + 5))} 12:00:00` : null });
      }
    }
  }
  const leadRows = [];
  const areas = [['Anna Nagar', 'Chennai'], ['Velachery', 'Chennai'], ['T Nagar', 'Chennai'], ['Koramangala', 'Bengaluru']];
  for (let i = 0; i < 36; i++) {
    const [area, city] = pickOne(areas);
    const outlet = brandSalons.find((b) => b.S.area === area);
    const created = dts(ymd(addDays(TODAY, -int(0, 25))), int(600, 1260));
    const status = weighted({ booked: 35, contacted: 25, assigned: 20, lost: 12, new: 8 });
    leadRows.push({
      brand_id: brandId, salon_id: status === 'new' ? null : outlet.salonId, name: personName(chance(0.7) ? 'F' : 'M'), phone: phone(), city, area, lat: null, lng: null,
      service_interest: pickOne(['Bridal makeup', 'Keratin', 'Balayage', 'Pre-bridal package', 'Hair spa', 'Party makeup']), source: weighted({ instagram: 45, google: 25, website: 15, facebook: 15 }),
      status, notes: null, assigned_at: status === 'new' ? null : created, contacted_at: ['contacted', 'booked', 'lost'].includes(status) ? dts(created.slice(0, 10), Math.min(1380, Number(created.slice(11, 13)) * 60 + int(10, S_LEAD_DELAY(outlet.S.key)))) : null, created_at: created,
    });
  }
  await bulk('leads', leadRows);

  // national offer
  await insert('offers', { brand_id: brandId, salon_id: null, code: 'GLOWDIWALI', title: 'Diwali Glow — 10% off at all GlowCraft salons', description: 'National offer on facials, colour and hair spa', type: 'percent', value: 10, valid_from: ymd(addDays(TODAY, -5)), valid_to: ymd(addDays(TODAY, 30)) });

  // ---------------------------------------------------------------- vendor portal extras
  await insert('vendor_promotions', { vendor_id: V.brand, title: 'Keratin Smooth trial: buy 2 kits, get certification free', description: 'Includes a 2-hour hands-on session for 2 stylists and 6 retail minis for clients.', target_city: 'Chennai', target_plan: null, scheme: '2 kits + free certification', starts_on: ymd(addDays(TODAY, -10)), ends_on: ymd(addDays(TODAY, 20)), views: 64, claims: 2 });
  await insert('vendor_promotions', { vendor_id: V.dist, title: 'Diwali scheme: 10% extra on colour range', description: 'Valid on ColorPro tubes and developers. Minimum order ₹8,000.', target_city: null, target_plan: null, scheme: '10% extra stock', starts_on: ymd(addDays(TODAY, -7)), ends_on: ymd(addDays(TODAY, 25)), views: 112, claims: 3 });
  await insert('vendor_promotions', { vendor_id: V.brand, title: 'Scalp Detox Tonic launch: 6 + 2 free', description: 'New retail SKU with strong margins. Sampling kit for your front desk.', target_city: 'Bengaluru', target_plan: null, scheme: '6 + 2 free', starts_on: ymd(addDays(TODAY, -3)), ends_on: ymd(addDays(TODAY, 40)), views: 21, claims: 1 });
  const promoIds = (await q('SELECT id, vendor_id FROM vendor_promotions')).map((x) => x.id);
  await insert('promotion_claims', { promotion_id: promoIds[0], salon_id: salonsOut[0].salonId });
  await insert('promotion_claims', { promotion_id: promoIds[1], salon_id: salonsOut[0].salonId });
  await insert('promotion_claims', { promotion_id: promoIds[1], salon_id: salonsOut[5].salonId });
  await insert('promotion_claims', { promotion_id: promoIds[2], salon_id: salonsOut[4].salonId });

  const codes = [];
  for (const name of ['Keratin Smooth Kit 1L', 'Keratin Smooth Shampoo 250ml', 'Scalp Detox Tonic 100ml']) {
    for (let i = 0; i < 20; i++) {
      const scans = i === 0 && name.startsWith('Keratin Smooth Kit') ? 7 : chance(0.3) ? int(1, 2) : 0;
      codes.push({ vendor_id: V.brand, vendor_product_id: VP.brand[name].id, code: i === 0 && name === 'Keratin Smooth Shampoo 250ml' ? 'SB-VEDA2026' : `SB-${token(4).toUpperCase()}`, batch_no: `VP${ym().replace('-', '')}${pickOne(['A', 'B'])}`, mfg_date: ymd(addDays(TODAY, -int(30, 120))), expiry_date: ymd(addDays(TODAY, int(500, 700))), verified_count: scans, last_verified_at: scans ? dts(ymd(addDays(TODAY, -int(0, 20))), 1100) : null });
    }
  }
  await bulk('authenticity_codes', codes);

  // notifications for demo users
  const notes = [
    [U.anand, 'Approval needed', 'Lakshmi Narayanan requests ₹900 discount (18%) for Swathi Nair', 'approvals'],
    [U.anand, 'Royalty invoice due', 'GlowCraft Velachery: royalty for last month is due', 'finance?tab=royalty'],
    [U.meera, '2 products low on stock', 'Create a one-tap reorder to ProBeauty Distributors', 'inventory?tab=low'],
    [U.ravi, 'New course assigned', 'Consultation & Rebooking — 10 min', 'learn'],
    [U.ravi, 'You are ₹6,200 away from your next bonus slab', 'Keep going — 4 days left this month', 'earnings'],
    [U.divya, 'Shift swap pending', 'Your request is waiting for the manager', 'roster'],
    [U.hq, '3 audit actions overdue', 'GlowCraft T Nagar has open hygiene actions', 'audits'],
    [U.priya, 'Root touch-up due soon', 'Your usual slot with Ravi is free on Saturday 11 am', 'bookings'],
    [U.v_dist, 'New order', 'GlowCraft Anna Nagar placed an order', 'orders'],
  ];
  for (const [uid, title, body, link] of notes) await insert('notifications', { user_id: uid, title, body, link, created_at: dts(ymd(addDays(TODAY, -int(0, 2))), int(540, 1200)) });

  // a few sample messages so the message log is not empty before automations run
  const sampleInv = await q(`SELECT i.id, i.salon_id, i.total, i.invoice_no, i.public_token, c.name, c.phone, s.name AS salon FROM invoices i JOIN clients c ON c.id = i.client_id JOIN salons s ON s.id = i.salon_id WHERE i.created_at >= CURDATE() - INTERVAL 2 DAY ORDER BY i.id DESC LIMIT 60`);
  await bulk('message_log', sampleInv.map((i) => ({ salon_id: i.salon_id, channel: 'whatsapp', to_phone: i.phone, to_name: i.name, template: 'invoice', body: `Hi ${i.name.split(' ')[0]}, thank you for visiting ${i.salon}! Your GST bill ${i.invoice_no} for ₹${i.total}: /bill/${i.public_token}`, status: 'simulated', provider: 'simulator', provider_ref: null, error: null, ref_type: 'invoice', ref_id: i.id, created_at: now0() })));

  // hygiene score from checklist runs
  await q(`UPDATE salons s SET hygiene_score = COALESCE((SELECT ROUND(AVG(score)) FROM checklist_runs cr WHERE cr.salon_id = s.id AND cr.run_date >= CURDATE() - INTERVAL 14 DAY), 85)`);

  const counts = await one(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM salons) AS salons, (SELECT COUNT(*) FROM clients) AS clients,
    (SELECT COUNT(*) FROM appointments) AS appointments, (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status='paid') AS revenue`);
  console.log(`Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, counts);
  console.log(`All demo logins use password: ${DEMO_PASSWORD}`);
}

function S_LEAD_DELAY(key) {
  return key === 'gc_tn' ? 400 : key === 'gc_vel' ? 180 : 60;
}
function now0() {
  const d = new Date();
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// Allow `node db/seed.js` to seed an existing (empty) schema directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

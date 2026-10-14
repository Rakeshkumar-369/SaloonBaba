import { q, one } from '../db.js';
import { pct, round2, daysBetween, today, ymd, addDays, minutesOf } from '../util.js';

const ids = (salonIds) => (Array.isArray(salonIds) ? salonIds : [salonIds]).map(Number);

/**
 * Core salon KPIs for one or many salons over a date range.
 * These are the numbers the blueprint says decide salon profit.
 */
export async function salonKpis(salonIds, from, to) {
  const S = ids(salonIds);
  if (!S.length) return emptyKpis();
  const fromDt = `${from} 00:00:00`;
  const toDt = `${to} 23:59:59`;
  const inv = await one(
    `SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(taxable),0) AS net_sales,
            COALESCE(SUM(discount_amount),0) AS discounts, COALESCE(SUM(subtotal),0) AS gross
     FROM invoices WHERE salon_id IN (?) AND status = 'paid' AND created_at BETWEEN ? AND ?`,
    [S, fromDt, toDt],
  );
  const mix = await q(
    `SELECT ii.item_type, COALESCE(SUM(ii.amount),0) AS amt, COALESCE(SUM(ii.duration_min),0) AS mins,
            COALESCE(SUM(ii.commission_amount),0) AS comm
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.salon_id IN (?) AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? GROUP BY ii.item_type`,
    [S, fromDt, toDt],
  );
  const by = Object.fromEntries(mix.map((m) => [m.item_type, m]));
  const serviceRev = by.service?.amt || 0;
  const retailRev = by.product?.amt || 0;
  const billedMin = by.service?.mins || 0;
  const commissions = mix.reduce((t, m) => t + Number(m.comm), 0);

  const cap = await one(
    `SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(r.shift_end, r.shift_start)))/60,0) AS mins
     FROM roster r JOIN salon_staff ss ON ss.id = r.staff_id
     WHERE r.salon_id IN (?) AND r.is_off = 0 AND ss.role = 'stylist' AND r.date BETWEEN ? AND LEAST(?, CURDATE())`,
    [S, from, to],
  );
  const appts = await one(
    `SELECT SUM(status = 'no_show') AS no_show, SUM(status = 'completed') AS completed, SUM(status = 'cancelled') AS cancelled,
            COUNT(*) AS total, SUM(source = 'app' OR source = 'website' OR source = 'whatsapp') AS online
     FROM appointments WHERE salon_id IN (?) AND start_at BETWEEN ? AND ?`,
    [S, fromDt, toDt],
  );
  const rebooked = await one(
    `SELECT COUNT(DISTINCT a.rebooked_from_invoice_id) AS n FROM appointments a JOIN invoices i ON i.id = a.rebooked_from_invoice_id
     WHERE i.salon_id IN (?) AND i.created_at BETWEEN ? AND ?`,
    [S, fromDt, toDt],
  );
  const serviceBills = await one(
    `SELECT COUNT(DISTINCT i.id) AS n FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id AND ii.item_type = 'service'
     WHERE i.salon_id IN (?) AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?`,
    [S, fromDt, toDt],
  );
  // 2nd-visit return: clients whose first visit was 30–120 days ago, how many came back
  const cohort = await one(
    `SELECT COUNT(*) AS n, SUM(visits >= 2) AS returned FROM clients
     WHERE salon_id IN (?) AND first_visit BETWEEN CURDATE() - INTERVAL 120 DAY AND CURDATE() - INTERVAL 30 DAY`,
    [S],
  );
  const newClients = await one(
    `SELECT COUNT(*) AS n FROM clients WHERE salon_id IN (?) AND first_visit BETWEEN ? AND ?`,
    [S, from, to],
  );
  const days = daysBetween(from, to) + 1;
  const staffBase = await one(
    `SELECT COALESCE(SUM(base_salary),0) AS base FROM salon_staff WHERE salon_id IN (?) AND is_active = 1`,
    [S],
  );
  const payroll = round2((staffBase.base * days) / 30 + commissions);
  const salonRow = await one(
    `SELECT AVG(rating) AS rating, AVG(hygiene_score) AS hygiene FROM salons WHERE id IN (?)`,
    [S],
  );
  return {
    from, to, days,
    revenue: round2(inv.revenue),
    net_sales: round2(inv.net_sales),
    bills: inv.bills,
    avg_bill: inv.bills ? round2(inv.revenue / inv.bills) : 0,
    service_revenue: round2(serviceRev),
    retail_revenue: round2(retailRev),
    retail_pct: pct(retailRev, serviceRev + retailRev),
    discount_pct: pct(inv.discounts, inv.gross),
    second_visit_rate: pct(Number(cohort.returned || 0), cohort.n),
    cohort_size: cohort.n,
    rebooking_rate: pct(rebooked.n, serviceBills.n),
    utilisation: pct(billedMin, Number(cap.mins)),
    no_show_rate: pct(Number(appts.no_show || 0), Number(appts.no_show || 0) + Number(appts.completed || 0)),
    online_share: pct(Number(appts.online || 0), appts.total),
    payroll_estimate: payroll,
    payroll_pct: pct(payroll, inv.net_sales),
    new_clients: newClients.n,
    rating: round2(salonRow.rating || 0),
    hygiene: Math.round(salonRow.hygiene || 0),
  };
}

function emptyKpis() {
  return { revenue: 0, bills: 0, avg_bill: 0, retail_pct: 0, second_visit_rate: 0, rebooking_rate: 0, utilisation: 0, no_show_rate: 0, payroll_pct: 0 };
}

/** Daily revenue series for charts. */
export async function revenueSeries(salonIds, from, to) {
  const rows = await q(
    `SELECT DATE(created_at) AS d, SUM(total) AS revenue, COUNT(*) AS bills FROM invoices
     WHERE salon_id IN (?) AND status = 'paid' AND created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY d`,
    [ids(salonIds), `${from} 00:00:00`, `${to} 23:59:59`],
  );
  const map = new Map(rows.map((r) => [r.d, r]));
  const out = [];
  for (let d = from; d <= to; d = ymd(addDays(d, 1))) {
    const r = map.get(d);
    out.push({ date: d, revenue: round2(r?.revenue || 0), bills: r?.bills || 0 });
  }
  return out;
}

/** Stylist leaderboard: service revenue, bills, rebook %, retail, rating. */
export async function staffLeaderboard(salonId, from, to) {
  const fromDt = `${from} 00:00:00`;
  const toDt = `${to} 23:59:59`;
  return q(
    `SELECT ss.id, u.name, ss.level, ss.hue, ss.rating, ss.rating_count,
       COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?),0) AS service_revenue,
       COALESCE((SELECT SUM(ii.amount) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'product' AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?),0) AS retail_revenue,
       (SELECT COUNT(DISTINCT i.id) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?) AS bills,
       (SELECT COUNT(DISTINCT a.rebooked_from_invoice_id) FROM appointments a JOIN invoice_items ii ON ii.invoice_id = a.rebooked_from_invoice_id
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND i.created_at BETWEEN ? AND ?) AS rebooked
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id
     WHERE ss.salon_id = ? AND ss.is_active = 1 AND ss.role = 'stylist'
     ORDER BY service_revenue DESC`,
    [fromDt, toDt, fromDt, toDt, fromDt, toDt, fromDt, toDt, salonId],
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      rebook_pct: pct(r.rebooked, r.bills),
      retail_pct: pct(r.retail_revenue, Number(r.retail_revenue) + Number(r.service_revenue)),
    })),
  );
}

/** Busy-ness by weekday × hour over the last 4 weeks, as % of stylist capacity. */
export async function utilisationHeatmap(salonId) {
  const salon = await one('SELECT open_time, close_time FROM salons WHERE id = ?', [salonId]);
  const from = ymd(addDays(today(), -28));
  const rows = await q(
    `SELECT DAYOFWEEK(start_at) - 1 AS dow, HOUR(start_at) AS h, SUM(TIMESTAMPDIFF(MINUTE, start_at, end_at)) AS mins
     FROM appointments WHERE salon_id = ? AND status = 'completed' AND start_at >= ? AND start_at < CURDATE()
     GROUP BY dow, h`,
    [salonId, from],
  );
  const stylists = await one(
    `SELECT COUNT(*) AS n FROM salon_staff WHERE salon_id = ? AND role = 'stylist' AND is_active = 1`,
    [salonId],
  );
  const capPerHour = Math.max(1, stylists.n * 0.85) * 60 * 4; // 4 weeks, ~85% on duty
  const open = Math.floor(minutesOf(salon.open_time) / 60);
  const close = Math.ceil(minutesOf(salon.close_time) / 60);
  const grid = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = open; h < close; h++) {
      const r = rows.find((x) => x.dow === dow && x.h === h);
      grid.push({ dow, h, pct: Math.min(100, Math.round(((r?.mins || 0) / capPerHour) * 100)) });
    }
  }
  return { open, close, grid };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Plain-language nudges for the owner's home screen. */
export async function nudges(salonId) {
  const out = [];
  const to = today();
  const from = ymd(addDays(to, -29));
  const k = await salonKpis(salonId, from, to);
  const heat = await utilisationHeatmap(salonId);
  // Find the emptiest 3-hour weekday block during open hours
  let worst = null;
  for (let dow = 1; dow <= 5; dow++) {
    for (let h = heat.open + 2; h + 3 <= heat.close - 1; h++) {
      const block = heat.grid.filter((g) => g.dow === dow && g.h >= h && g.h < h + 3);
      const avg = block.reduce((t, g) => t + g.pct, 0) / block.length;
      if (!worst || avg < worst.avg) worst = { dow, h, avg };
    }
  }
  if (worst && worst.avg < 45)
    out.push({
      type: 'happy_hour', tone: 'warn',
      title: `${DOW[worst.dow]} ${worst.h}–${worst.h + 3} is only ${Math.round(worst.avg)}% full`,
      body: 'Run an off-peak happy hour (e.g. 20% off) and push it to nearby customers on the app.',
      action: { label: 'Create happy hour', to: 'marketing?tab=offers' },
    });
  const atRisk = await one(
    `SELECT COUNT(*) AS n FROM clients WHERE salon_id = ? AND last_visit BETWEEN CURDATE() - INTERVAL 120 DAY AND CURDATE() - INTERVAL 60 DAY`,
    [salonId],
  );
  if (atRisk.n > 0)
    out.push({
      type: 'win_back', tone: 'warn', title: `${atRisk.n} regular clients are at risk`,
      body: 'They have not visited for 60+ days. Send a win-back WhatsApp with a personal offer.',
      action: { label: 'Send win-back', to: 'marketing?tab=campaigns&segment=at_risk' },
    });
  if (k.second_visit_rate && k.second_visit_rate < 60)
    out.push({
      type: 'retention', tone: 'info', title: `2nd-visit return is ${Math.round(k.second_visit_rate)}% (best salons: 70%)`,
      body: 'Turn on the rebook-before-leaving prompt at billing and the 48-hour thank-you message.',
      action: { label: 'See clients due', to: 'clients?segment=due' },
    });
  if (k.retail_pct < 15)
    out.push({
      type: 'retail', tone: 'info', title: `Retail is ${k.retail_pct}% of sales (leaders: 20–25%)`,
      body: 'Ask stylists to "prescribe" home-care products from their app; they earn retail incentive.',
      action: { label: 'Open inventory', to: 'inventory' },
    });
  if (k.payroll_pct > 40)
    out.push({
      type: 'payroll', tone: 'bad', title: `Payroll is ${k.payroll_pct}% of net sales (target 30–35%)`,
      body: 'Review commission slabs and roster hours against bookings.',
      action: { label: 'Open payroll', to: 'staff?tab=payroll' },
    });
  if (k.no_show_rate > 8)
    out.push({
      type: 'no_show', tone: 'warn', title: `No-shows at ${k.no_show_rate}%`,
      body: 'UPI deposits for new clients and long services cut no-shows by nearly half.',
      action: { label: 'Deposit settings', to: 'settings' },
    });
  const low = await one(
    `SELECT COUNT(*) AS n FROM products WHERE salon_id = ? AND is_active = 1 AND stock_qty <= reorder_level`,
    [salonId],
  );
  if (low.n)
    out.push({
      type: 'stock', tone: 'bad', title: `${low.n} products are low on stock`,
      body: 'Create a one-tap reorder to your distributor before colour runs out mid-service.',
      action: { label: 'Reorder', to: 'inventory?tab=low' },
    });
  const feedback = await one(`SELECT COUNT(*) AS n FROM reviews WHERE salon_id = ? AND stage = 'private'`, [salonId]);
  if (feedback.n)
    out.push({
      type: 'feedback', tone: 'bad', title: `${feedback.n} unhappy clients told you privately`,
      body: 'Recover them with a call or offer before they post a public review.',
      action: { label: 'Recover', to: 'reviews' },
    });
  return out;
}

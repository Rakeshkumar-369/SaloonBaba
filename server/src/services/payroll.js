import { q, one } from '../db.js';
import { round2, monthRange, today, ym, parseJson } from '../util.js';

export const DEFAULT_SLABS = [
  { min: 60000, bonus: 1500 },
  { min: 90000, bonus: 3500 },
  { min: 130000, bonus: 6500 },
];

/**
 * Salary + incentive engine.
 * base (pro-rated for unpaid absences) + service commission + retail incentive
 * + target slab bonus + tips − advances = net
 * With live=true it computes month-to-date (the stylist's live earnings wallet).
 */
export async function computeEarnings(staff, month = ym(), { live = false } = {}) {
  const { from, to: monthEnd, days } = monthRange(month);
  const to = live && today() < monthEnd ? today() : monthEnd;
  const fromDt = `${from} 00:00:00`;
  const toDt = `${to} 23:59:59`;
  const items = await one(
    `SELECT
       COALESCE(SUM(CASE WHEN ii.item_type = 'service' THEN ii.amount END),0) AS service_revenue,
       COALESCE(SUM(CASE WHEN ii.item_type = 'service' THEN ii.commission_amount END),0) AS commission,
       COALESCE(SUM(CASE WHEN ii.item_type = 'product' THEN ii.amount END),0) AS retail_sales,
       COALESCE(SUM(CASE WHEN ii.item_type = 'product' THEN ii.commission_amount END),0) AS retail_incentive,
       COALESCE(SUM(CASE WHEN ii.item_type IN ('package','membership') THEN ii.commission_amount END),0) AS package_incentive,
       COUNT(DISTINCT CASE WHEN ii.item_type = 'service' THEN i.id END) AS clients_served
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE ii.staff_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?`,
    [staff.id, fromDt, toDt],
  );
  const tips = await one(
    `SELECT COALESCE(SUM(tip_amount),0) AS t FROM invoices WHERE tip_staff_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ?`,
    [staff.id, fromDt, toDt],
  );
  const att = await one(
    `SELECT SUM(status = 'absent') AS absent, SUM(status IN ('present','late')) AS present, SUM(status = 'late') AS late
     FROM attendance WHERE staff_id = ? AND date BETWEEN ? AND ?`,
    [staff.id, from, to],
  );
  const adv = await one(
    `SELECT COALESCE(SUM(amount),0) AS a FROM advances WHERE staff_id = ? AND given_on <= ? AND (recovered_in IS NULL OR recovered_in = ?)`,
    [staff.id, monthEnd, month],
  );
  const elapsed = Number(to.slice(8, 10));
  const absent = Number(att.absent || 0);
  const daysPaid = Math.max(0, (live ? elapsed : days) - absent);
  const base = round2((staff.base_salary / days) * daysPaid);
  const slabs = parseJson(staff.slabs, DEFAULT_SLABS) || DEFAULT_SLABS;
  const rev = Number(items.service_revenue);
  const reached = slabs.filter((s) => rev >= s.min).pop();
  const next = slabs.find((s) => rev < s.min);
  const slabBonus = reached ? reached.bonus : 0;
  const retailIncentive = round2(Number(items.retail_incentive) + Number(items.package_incentive));
  const gross = round2(base + Number(items.commission) + retailIncentive + slabBonus + Number(tips.t));
  return {
    month, from, to, days_in_month: days, days_paid: daysPaid, days_present: Number(att.present || 0),
    days_absent: absent, days_late: Number(att.late || 0),
    base_salary: staff.base_salary, base,
    service_revenue: round2(rev), commission: round2(items.commission), commission_pct: staff.service_commission_pct,
    retail_sales: round2(items.retail_sales), retail_incentive: retailIncentive, retail_pct: staff.retail_incentive_pct,
    slab_bonus: slabBonus, slabs, next_slab: next || null, to_next_slab: next ? round2(next.min - rev) : 0,
    target_amount: staff.target_amount, target_progress: staff.target_amount ? Math.min(100, Math.round((rev / staff.target_amount) * 100)) : 0,
    tips: round2(tips.t), advances: round2(adv.a), clients_served: items.clients_served,
    gross, net: round2(gross - Number(adv.a)),
  };
}

/** Earnings for every active staff member of a salon. */
export async function salonPayroll(salonId, month, opts) {
  const staff = await q(
    `SELECT ss.*, u.name, u.phone FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? AND ss.is_active = 1 ORDER BY ss.role, u.name`,
    [salonId],
  );
  const out = [];
  for (const s of staff) out.push({ staff_id: s.id, name: s.name, role: s.role, level: s.level, phone: s.phone, ...(await computeEarnings(s, month, opts)) });
  return out;
}

/** Career ladder: rules for moving up a level. */
export const CAREER_LADDER = [
  { from: 'trainee', to: 'junior', rules: { rebook_pct: 30, rating: 4.0, badges: 1, months: 3 } },
  { from: 'junior', to: 'senior', rules: { rebook_pct: 60, rating: 4.5, badges: 3, months: 12 } },
  { from: 'senior', to: 'educator', rules: { rebook_pct: 70, rating: 4.7, badges: 5, months: 24 } },
];

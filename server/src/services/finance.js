import { q, one } from '../db.js';
import { round2, pct, daysBetween, ymd, addDays, monthRange, today, ym } from '../util.js';

/**
 * True P&L for a salon over a date range: net sales (ex-GST) minus product cost,
 * payroll, expenses and franchise royalty.
 */
export async function pnl(salonId, from, to) {
  const fromDt = `${from} 00:00:00`;
  const toDt = `${to} 23:59:59`;
  const salon = await one('SELECT s.*, b.royalty_pct, b.marketing_fee_pct, b.name AS brand_name FROM salons s LEFT JOIN brands b ON b.id = s.brand_id WHERE s.id = ?', [salonId]);
  const sales = await one(
    `SELECT COALESCE(SUM(taxable),0) AS net_sales, COALESCE(SUM(total),0) AS gross, COALESCE(SUM(cgst + sgst),0) AS gst, COUNT(*) AS bills
     FROM invoices WHERE salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ?`,
    [salonId, fromDt, toDt],
  );
  const mix = await q(
    `SELECT ii.item_type, SUM(ii.amount) AS amt, SUM(ii.commission_amount) AS comm FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? GROUP BY ii.item_type`,
    [salonId, fromDt, toDt],
  );
  const grossItems = mix.reduce((t, m) => t + Number(m.amt), 0) || 1;
  const share = (type) => Number(mix.find((m) => m.item_type === type)?.amt || 0) / grossItems;
  const cogs = await one(
    `SELECT -COALESCE(SUM(CASE WHEN m.type = 'sale' THEN m.qty * p.cost_price END),0) AS retail_cost,
            -COALESCE(SUM(CASE WHEN m.type = 'backbar' THEN m.qty * p.cost_price END),0) AS backbar_cost,
            -COALESCE(SUM(CASE WHEN m.type = 'adjustment' AND m.qty < 0 THEN m.qty * p.cost_price END),0) AS shrinkage
     FROM stock_movements m JOIN products p ON p.id = m.product_id WHERE m.salon_id = ? AND m.created_at BETWEEN ? AND ?`,
    [salonId, fromDt, toDt],
  );
  const exp = await q(
    `SELECT category, SUM(amount) AS amount FROM expenses WHERE salon_id = ? AND expense_date BETWEEN ? AND ? GROUP BY category`,
    [salonId, from, to],
  );
  const days = daysBetween(from, to) + 1;
  const commissions = mix.reduce((t, m) => t + Number(m.comm || 0), 0);
  const salaryBooked = Number(exp.find((e) => e.category === 'salary')?.amount || 0);
  const base = await one('SELECT COALESCE(SUM(base_salary),0) AS b FROM salon_staff WHERE salon_id = ? AND is_active = 1', [salonId]);
  const payrollEstimate = round2((base.b * days) / 30 + commissions);
  const payroll = salaryBooked || payrollEstimate;
  const netSales = round2(sales.net_sales);
  const royalty = salon.brand_id ? round2((netSales * Number(salon.royalty_pct)) / 100) : 0;
  const marketingFee = salon.brand_id ? round2((netSales * Number(salon.marketing_fee_pct)) / 100) : 0;
  const otherExpenses = exp.filter((e) => !['salary', 'royalty', 'product'].includes(e.category));
  const productPurchases = Number(exp.find((e) => e.category === 'product')?.amount || 0);
  const totalOther = round2(otherExpenses.reduce((t, e) => t + Number(e.amount), 0));
  const productCost = round2(Number(cogs.retail_cost) + Number(cogs.backbar_cost) + Number(cogs.shrinkage));
  const totalCost = round2(productCost + payroll + totalOther + royalty + marketingFee);
  const net = round2(netSales - totalCost);
  return {
    from, to, days, brand: salon.brand_name || null,
    revenue: {
      gross_incl_gst: round2(sales.gross), gst: round2(sales.gst), net_sales: netSales, bills: sales.bills,
      services: round2(netSales * share('service')), retail: round2(netSales * share('product')),
      packages: round2(netSales * (share('package') + share('membership'))),
    },
    costs: {
      retail_cost: round2(cogs.retail_cost), backbar_cost: round2(cogs.backbar_cost), shrinkage: round2(cogs.shrinkage), product_cost: productCost,
      payroll: round2(payroll), payroll_is_estimate: !salaryBooked, commissions: round2(commissions),
      expenses: otherExpenses.map((e) => ({ category: e.category, amount: round2(e.amount) })), expenses_total: totalOther,
      product_purchases_cash: round2(productPurchases),
      royalty, marketing_fee: marketingFee, royalty_pct: salon.royalty_pct || 0, marketing_fee_pct: salon.marketing_fee_pct || 0,
      total: totalCost,
    },
    net_profit: net, net_margin: pct(net, netSales), payroll_pct: pct(payroll, netSales), product_cost_pct: pct(productCost, netSales),
    profit_before_royalty: round2(net + royalty + marketingFee),
  };
}

/** Profit by service category: revenue ex-GST minus commission and back-bar product. */
export async function serviceProfit(salonId, from, to) {
  const rows = await q(
    `SELECT s.category, COUNT(*) AS count, SUM(ii.amount) AS amount, SUM(ii.commission_amount) AS commission,
       SUM(COALESCE((SELECT SUM(sr.qty * p.cost_price) FROM service_recipes sr JOIN products p ON p.id = sr.product_id WHERE sr.service_id = s.id),0) * ii.qty) AS product_cost,
       SUM(ii.duration_min) AS minutes
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id JOIN services s ON s.id = ii.ref_id
     WHERE ii.item_type = 'service' AND i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?
     GROUP BY s.category ORDER BY amount DESC`,
    [salonId, `${from} 00:00:00`, `${to} 23:59:59`],
  );
  return rows.map((r) => {
    const net = round2(r.amount / 1.18);
    const margin = round2(net - r.commission - r.product_cost);
    return { ...r, net_sales: net, margin, margin_pct: pct(margin, net), per_hour: r.minutes ? round2((margin / r.minutes) * 60) : 0 };
  });
}

/** Break-even tracker for the current month. */
export async function breakEven(salonId) {
  const month = ym();
  const { from, to, days } = monthRange(month);
  const elapsed = Number(today().slice(8, 10));
  const p = await pnl(salonId, from, today());
  const recurring = await one('SELECT COALESCE(SUM(amount),0) AS a FROM recurring_expenses WHERE salon_id = ? AND is_active = 1', [salonId]);
  const base = await one('SELECT COALESCE(SUM(base_salary),0) AS b FROM salon_staff WHERE salon_id = ? AND is_active = 1', [salonId]);
  const fixed = round2(Number(recurring.a) + Number(base.b));
  const variable = p.revenue.net_sales ? (p.costs.product_cost + p.costs.commissions + p.costs.royalty + p.costs.marketing_fee) / p.revenue.net_sales : 0.3;
  const breakEvenSales = round2(fixed / Math.max(0.05, 1 - variable));
  const projected = round2((p.revenue.net_sales / Math.max(1, elapsed)) * days);
  let breakEvenDay = null;
  const perDay = p.revenue.net_sales / Math.max(1, elapsed);
  if (perDay > 0) breakEvenDay = Math.ceil(breakEvenSales / perDay);
  return {
    month, fixed_costs: fixed, variable_cost_pct: round2(variable * 100), break_even_sales: breakEvenSales,
    mtd_sales: p.revenue.net_sales, projected_sales: projected, progress_pct: Math.min(100, pct(p.revenue.net_sales, breakEvenSales)),
    break_even_day: breakEvenDay && breakEvenDay <= days ? ymd(addDays(from, breakEvenDay - 1)) : null, days_in_month: days, to,
  };
}

/** Tally Prime XML (sales vouchers) for import into the accountant's Tally. */
export async function tallyXml(salonId, from, to) {
  const salon = await one('SELECT name, gst_number FROM salons WHERE id = ?', [salonId]);
  const invoices = await q(
    `SELECT i.*, c.name AS client_name FROM invoices i JOIN clients c ON c.id = i.client_id
     WHERE i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? ORDER BY i.created_at`,
    [salonId, `${from} 00:00:00`, `${to} 23:59:59`],
  );
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const vouchers = invoices
    .map((i) => {
      const d = i.created_at.slice(0, 10).replace(/-/g, '');
      return `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="Sales" ACTION="Create">
     <DATE>${d}</DATE><VOUCHERNUMBER>${esc(i.invoice_no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(i.client_name)}</PARTYLEDGERNAME>
     <NARRATION>${esc(`${salon.name} bill ${i.invoice_no}`)}</NARRATION>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash/Bank</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-${i.total}</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Salon Services Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${i.taxable}</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output CGST 9%</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${i.cgst}</AMOUNT></ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output SGST 9%</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${i.sgst}</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(salon.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
   <REQUESTDATA>
${vouchers}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

import { Router } from 'express';
import { q } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { salonKpis, revenueSeries, staffLeaderboard, utilisationHeatmap, nudges } from '../../services/kpi.js';
import { range, round2, pct, daysBetween, ymd, addDays } from '../../util.js';

const r = Router({ mergeParams: true });

r.get('/insights', async (req, res) => {
  const { from, to } = range(req.query, 30);
  const span = daysBetween(from, to) + 1;
  const prevTo = ymd(addDays(from, -1));
  const prevFrom = ymd(addDays(prevTo, -(span - 1)));
  const [kpi, prev, series, leaders, heat, tips] = await Promise.all([
    salonKpis(req.salon.id, from, to), salonKpis(req.salon.id, prevFrom, prevTo), revenueSeries(req.salon.id, from, to),
    staffLeaderboard(req.salon.id, from, to), utilisationHeatmap(req.salon.id), nudges(req.salon.id),
  ]);
  const sources = await q(
    `SELECT source, COUNT(*) AS n FROM appointments WHERE salon_id = ? AND start_at BETWEEN ? AND ? GROUP BY source ORDER BY n DESC`,
    [req.salon.id, `${from} 00:00:00`, `${to} 23:59:59`],
  );
  const topServices = await q(
    `SELECT ii.name, COUNT(*) AS n, SUM(ii.amount) AS revenue FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.salon_id = ? AND i.status = 'paid' AND ii.item_type = 'service' AND i.created_at BETWEEN ? AND ?
     GROUP BY ii.name ORDER BY revenue DESC LIMIT 8`,
    [req.salon.id, `${from} 00:00:00`, `${to} 23:59:59`],
  );
  res.json({ from, to, kpi, prev, series, leaders, heat, nudges: tips, sources, top_services: topServices });
});

/** Loss prevention: audit trail, billed vs attended hours, cash variance, unbilled work. */
r.get('/loss', allow(), async (req, res) => {
  const { from, to, fromDt, toDt } = range(req.query, 30);
  const trail = await q(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.salon_id = ? AND a.created_at BETWEEN ? AND ? ORDER BY a.created_at DESC LIMIT 200`,
    [req.salon.id, fromDt, toDt],
  );
  const hours = await q(
    `SELECT ss.id, u.name,
       COALESCE((SELECT SUM(TIMESTAMPDIFF(MINUTE, a.check_in, COALESCE(a.check_out, CONCAT(a.date, ' ', r.shift_end))))
          FROM attendance a LEFT JOIN roster r ON r.staff_id = a.staff_id AND r.date = a.date
          WHERE a.staff_id = ss.id AND a.date BETWEEN ? AND ? AND a.check_in IS NOT NULL),0) AS attended_min,
       COALESCE((SELECT SUM(ii.duration_min) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.staff_id = ss.id AND ii.item_type = 'service' AND i.status = 'paid' AND i.created_at BETWEEN ? AND ?),0) AS billed_min
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? AND ss.role = 'stylist' AND ss.is_active = 1 ORDER BY u.name`,
    [from, to, fromDt, toDt, req.salon.id],
  );
  const cash = await q('SELECT * FROM cash_closings WHERE salon_id = ? AND date BETWEEN ? AND ? AND ABS(variance) >= 200 ORDER BY date DESC', [req.salon.id, from, to]);
  const discounts = await q(
    `SELECT u.name, COUNT(*) AS bills, SUM(i.discount_amount) AS discount, SUM(i.subtotal) AS gross FROM invoices i LEFT JOIN users u ON u.id = i.created_by
     WHERE i.salon_id = ? AND i.status = 'paid' AND i.created_at BETWEEN ? AND ? AND i.discount_amount > 0 GROUP BY i.created_by ORDER BY discount DESC`,
    [req.salon.id, fromDt, toDt],
  );
  const unbilled = await q(
    `SELECT a.id, a.start_at, a.status, c.name AS client_name, u.name AS staff_name FROM appointments a JOIN clients c ON c.id = a.client_id
     LEFT JOIN salon_staff ss ON ss.id = a.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE a.salon_id = ? AND a.status IN ('checked_in','in_service') AND a.end_at < NOW() - INTERVAL 2 HOUR ORDER BY a.start_at DESC LIMIT 50`,
    [req.salon.id],
  );
  const voidCount = trail.filter((t) => t.action === 'void').length;
  res.json({
    from, to, trail,
    hours: hours.map((h) => ({ ...h, billed_pct: pct(h.billed_min, h.attended_min), flag: h.attended_min > 600 && pct(h.billed_min, h.attended_min) < 35 })),
    cash_flags: cash,
    discounts: discounts.map((d) => ({ ...d, discount_pct: pct(d.discount, d.gross) })),
    unbilled,
    summary: {
      voids: voidCount, cancellations: trail.filter((t) => t.action === 'cancel').length, no_shows: trail.filter((t) => t.action === 'no_show').length,
      discounts: trail.filter((t) => t.action === 'discount').length, cash_variance_total: round2(cash.reduce((t, c) => t + Number(c.variance), 0)),
      stock_shortages: trail.filter((t) => t.action === 'stock_shortage').length,
    },
  });
});

export default r;

import { q } from '../db.js';

/** Client segments used by CRM lists and campaigns. */
export const SEGMENT_SQL = {
  all: '1=1',
  new: 'c.visits = 1 AND c.last_visit >= CURDATE() - INTERVAL 45 DAY',
  regular: 'c.visits >= 2 AND c.last_visit >= CURDATE() - INTERVAL 60 DAY',
  vip: 'c.total_spend >= 15000',
  at_risk: 'c.visits >= 1 AND c.last_visit < CURDATE() - INTERVAL 60 DAY AND c.last_visit >= CURDATE() - INTERVAL 120 DAY',
  lapsed: 'c.last_visit < CURDATE() - INTERVAL 120 DAY',
  birthday: 'c.dob IS NOT NULL AND MONTH(c.dob) = MONTH(CURDATE())',
  due: `c.id IN (SELECT client_id FROM (${dueSql('?')}) due_x)`,
};

export const SEGMENT_LABELS = {
  all: 'All clients', new: 'New (1 visit)', regular: 'Regulars', vip: 'VIP (₹15k+)', at_risk: 'At risk (60–120 days)',
  lapsed: 'Lapsed (120+ days)', birthday: 'Birthday this month', due: 'Due for a service',
};

/** Clients whose last service is due again (by service cycle_days) from 30 days ago to 7 days ahead. */
function dueSql(salonParam) {
  return `SELECT i.client_id, s.id AS service_id, s.name AS service_name, MAX(i.created_at) AS last_done,
       DATE_ADD(DATE(MAX(i.created_at)), INTERVAL s.cycle_days DAY) AS due_on
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'paid'
     JOIN services s ON s.id = ii.ref_id AND ii.item_type = 'service'
     WHERE i.salon_id = ${salonParam} AND s.cycle_days IS NOT NULL
     GROUP BY i.client_id, s.id, s.name, s.cycle_days
     HAVING due_on BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 7 DAY
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.client_id = i.client_id AND a.start_at >= NOW()
                       AND a.status IN ('booked','confirmed'))`;
}

/** Clients due for a service with the service name and due date. */
export async function dueClients(salonId, limit = 100) {
  return q(
    `SELECT d.*, c.name, c.phone, c.preferred_staff_id FROM (${dueSql('?')}) d JOIN clients c ON c.id = d.client_id
     ORDER BY d.due_on LIMIT ?`,
    [salonId, limit],
  );
}

/** Build WHERE clause + params for a segment. */
export function segmentWhere(segment, salonId) {
  const sql = SEGMENT_SQL[segment] || SEGMENT_SQL.all;
  return { sql, params: segment === 'due' ? [salonId] : [] };
}

/** Segment tag for one client row (for list badges). */
export function clientTag(c) {
  if (!c.last_visit) return 'new';
  const days = Math.round((Date.now() - new Date(c.last_visit).getTime()) / 86400000);
  if (c.total_spend >= 15000 && days <= 120) return 'vip';
  if (days > 120) return 'lapsed';
  if (days > 60) return 'at_risk';
  if (c.visits >= 2) return 'regular';
  return 'new';
}

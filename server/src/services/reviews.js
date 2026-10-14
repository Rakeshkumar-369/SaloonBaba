import { q, one, insert, update } from '../db.js';
import { bad, now, round2 } from '../util.js';
import { notifySalonAdmins } from './notify.js';

const score = (v) => {
  const n = Number(v);
  if (!(n >= 1 && n <= 5)) throw bad('Ratings must be between 1 and 5');
  return Math.round(n);
};

/** Recompute cached ratings from public (verified) reviews. */
export async function recomputeRatings(salonId, staffId) {
  const s = await one(`SELECT AVG(overall) AS a, COUNT(*) AS n FROM reviews WHERE salon_id = ? AND stage = 'public'`, [salonId]);
  await update('salons', salonId, { rating: round2(s.a || 0), rating_count: s.n });
  if (staffId) {
    const t = await one(`SELECT AVG(overall) AS a, COUNT(*) AS n FROM reviews WHERE staff_id = ? AND stage = 'public'`, [staffId]);
    await update('salon_staff', staffId, { rating: round2(t.a || 0), rating_count: t.n });
  }
}

/**
 * Verified review from a billed visit: result, hygiene, wait, value, behaviour.
 * Overall < 4 goes to the salon privately first (recovery before it goes public).
 */
export async function recordReview({ invoice, body, userId = null }) {
  if (invoice.status !== 'paid') throw bad('Only billed visits can be reviewed');
  if (await one('SELECT id FROM reviews WHERE invoice_id = ?', [invoice.id])) throw bad('This visit is already reviewed');
  const r = {
    r_result: score(body.result), r_hygiene: score(body.hygiene), r_wait: score(body.wait),
    r_value: score(body.value), r_behaviour: score(body.behaviour),
  };
  const overall = round2((r.r_result + r.r_hygiene + r.r_wait + r.r_value + r.r_behaviour) / 5);
  const staff = await one(
    `SELECT staff_id FROM invoice_items WHERE invoice_id = ? AND item_type = 'service' AND staff_id IS NOT NULL LIMIT 1`,
    [invoice.id],
  );
  const stage = overall >= 4 ? 'public' : 'private';
  const id = await insert('reviews', {
    salon_id: invoice.salon_id, staff_id: staff?.staff_id || null, client_id: invoice.client_id, user_id: userId,
    invoice_id: invoice.id, ...r, overall: Math.round(overall * 10) / 10, comment: (body.comment || '').slice(0, 800),
    stage, created_at: now(),
  });
  if (stage === 'public') await recomputeRatings(invoice.salon_id, staff?.staff_id);
  else
    await notifySalonAdmins(invoice.salon_id, `Unhappy client feedback (${overall.toFixed(1)}★)`,
      (body.comment || 'No comment').slice(0, 200), 'reviews');
  return {
    id, stage, overall,
    message: stage === 'public'
      ? 'Thank you! Your verified review is live.'
      : 'Sorry it was not perfect. The salon manager will contact you to make it right.',
  };
}

export async function publishReview(reviewId) {
  const rv = await one('SELECT * FROM reviews WHERE id = ?', [reviewId]);
  if (!rv) throw bad('Review not found');
  await update('reviews', rv.id, { stage: rv.stage === 'private' ? 'public' : rv.stage });
  await recomputeRatings(rv.salon_id, rv.staff_id);
}

export async function salonReviews(salonId, { publicOnly = true, limit = 20 } = {}) {
  return q(
    `SELECT r.id, r.overall, r.r_result, r.r_hygiene, r.r_wait, r.r_value, r.r_behaviour, r.comment, r.stage, r.created_at,
       c.name AS client_name, u.name AS staff_name, r.staff_id, r.recovery_note
     FROM reviews r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN salon_staff ss ON ss.id = r.staff_id
     LEFT JOIN users u ON u.id = ss.user_id
     WHERE r.salon_id = ? ${publicOnly ? "AND r.stage = 'public'" : ''}
     ORDER BY r.created_at DESC LIMIT ?`,
    [salonId, limit],
  );
}

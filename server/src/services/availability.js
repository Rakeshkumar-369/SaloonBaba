import { q, one } from '../db.js';
import { today, minutesOf, timeOf, hm, parseLocal, addMin, dt } from '../util.js';

const ACTIVE = "('booked','confirmed','checked_in','in_service','completed')";

/** Stylists of a salon with their skills (service ids). */
export async function salonStylists(salonId) {
  const staff = await q(
    `SELECT ss.id, ss.user_id, u.name, u.gender, ss.level, ss.title, ss.specialities, ss.rating, ss.rating_count, ss.hue
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id
     WHERE ss.salon_id = ? AND ss.is_active = 1
       AND (ss.role = 'stylist' OR EXISTS (SELECT 1 FROM staff_services x WHERE x.staff_id = ss.id))
     ORDER BY FIELD(ss.level,'educator','senior','manager','junior','trainee'), u.name`,
    [salonId],
  );
  const skills = await q(
    `SELECT st.staff_id, st.service_id FROM staff_services st JOIN salon_staff ss ON ss.id = st.staff_id WHERE ss.salon_id = ?`,
    [salonId],
  );
  const map = new Map(staff.map((s) => [s.id, { ...s, skills: new Set() }]));
  for (const k of skills) map.get(k.staff_id)?.skills.add(k.service_id);
  return [...map.values()];
}

/**
 * Plan of one day: shift window and busy intervals (minutes from midnight) per stylist.
 */
export async function dayPlan(salonId, date) {
  const salon = await one('SELECT open_time, close_time FROM salons WHERE id = ?', [salonId]);
  const open = minutesOf(salon.open_time);
  const close = minutesOf(salon.close_time);
  const staff = await salonStylists(salonId);
  const roster = await q('SELECT staff_id, shift_start, shift_end, is_off FROM roster WHERE salon_id = ? AND date = ?', [
    salonId,
    date,
  ]);
  const leaves = await q(
    `SELECT staff_id FROM leave_requests WHERE salon_id = ? AND type = 'leave' AND status = 'approved' AND ? BETWEEN from_date AND to_date`,
    [salonId, date],
  );
  const onLeave = new Set(leaves.map((l) => l.staff_id));
  const rmap = new Map(roster.map((r) => [r.staff_id, r]));
  const appts = await q(
    `SELECT id, staff_id, start_at, end_at FROM appointments
     WHERE salon_id = ? AND start_at >= ? AND start_at < ? + INTERVAL 1 DAY AND status IN ${ACTIVE} AND staff_id IS NOT NULL`,
    [salonId, `${date} 00:00:00`, `${date} 00:00:00`],
  );
  const serving =
    date === today()
      ? await q(
          `SELECT qt.staff_id, qt.started_at, COALESCE(s.duration_min, 30) AS dur FROM queue_tokens qt
           LEFT JOIN services s ON s.id = qt.service_id
           WHERE qt.salon_id = ? AND qt.status = 'serving' AND qt.staff_id IS NOT NULL`,
          [salonId],
        )
      : [];
  return {
    open,
    close,
    staff: staff.map((s) => {
      const r = rmap.get(s.id);
      const off = Boolean(r?.is_off) || onLeave.has(s.id);
      const start = r?.shift_start ? Math.max(open, minutesOf(r.shift_start)) : open;
      const end = r?.shift_end ? Math.min(close, minutesOf(r.shift_end)) : close;
      const busy = appts
        .filter((a) => a.staff_id === s.id)
        .map((a) => [minutesOf(a.start_at.slice(11)), minutesOf(a.end_at.slice(11))]);
      for (const sv of serving.filter((x) => x.staff_id === s.id)) {
        const st = minutesOf(sv.started_at.slice(11));
        busy.push([st, st + sv.dur]);
      }
      busy.sort((a, b) => a[0] - b[0]);
      return { ...s, off, start, end, busy, bookedMin: busy.reduce((t, [a, b]) => t + (b - a), 0) };
    }),
  };
}

const overlaps = (busy, a, b) => busy.some(([x, y]) => a < y && b > x);

/** Earliest minute >= from where a stylist is free for dur minutes (or null). */
export function earliestFree(st, from, dur) {
  let t = Math.max(from, st.start);
  for (let guard = 0; guard < 200; guard++) {
    if (t + dur > st.end) return null;
    const clash = st.busy.find(([x, y]) => t < y && t + dur > x);
    if (!clash) return t;
    t = clash[1];
  }
  return null;
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Free slots for a set of services on a date.
 * Returns [{ time:'10:30', staff:[ids] }]
 */
export async function getSlots({ salonId, date, serviceIds = [], staffId = null, step = 15 }) {
  const services = serviceIds.length
    ? await q('SELECT id, duration_min FROM services WHERE salon_id = ? AND id IN (?)', [salonId, serviceIds])
    : [];
  const duration = services.reduce((t, s) => t + s.duration_min, 0) || 30;
  const plan = await dayPlan(salonId, date);
  let staff = plan.staff.filter((s) => !s.off && serviceIds.every((id) => s.skills.has(Number(id))));
  if (staffId) staff = staff.filter((s) => s.id === Number(staffId));
  let from = plan.open;
  if (date === today()) from = Math.max(from, Math.ceil((nowMinutes() + 10) / step) * step);
  const slots = [];
  for (let t = from; t + duration <= plan.close; t += step) {
    const free = staff.filter((s) => t >= s.start && t + duration <= s.end && !overlaps(s.busy, t, t + duration));
    if (free.length) slots.push({ time: timeOf(t), staff: free.map((s) => s.id) });
  }
  return { duration, slots, staff: staff.map(({ id, name, level, rating, hue }) => ({ id, name, level, rating, hue })) };
}

/**
 * Pick a stylist for a booking: the preferred one if free, otherwise the
 * least-loaded skilled stylist that day (fair allocation between juniors and seniors).
 */
export async function pickStylist({ salonId, startAt, duration, serviceIds = [], preferredId = null }) {
  const date = startAt.slice(0, 10);
  const t = minutesOf(startAt.slice(11, 16));
  const plan = await dayPlan(salonId, date);
  const free = plan.staff.filter(
    (s) =>
      !s.off &&
      serviceIds.every((id) => s.skills.has(Number(id))) &&
      t >= s.start &&
      t + duration <= s.end &&
      !overlaps(s.busy, t, t + duration),
  );
  if (!free.length) return null;
  const pref = free.find((s) => s.id === Number(preferredId));
  if (pref) return pref.id;
  free.sort((a, b) => a.bookedMin - b.bookedMin);
  return free[0].id;
}

/** Is a stylist free for an interval (used to validate manual bookings)? */
export async function isFree({ salonId, staffId, startAt, duration, ignoreAppointmentId = null }) {
  const end = dt(addMin(startAt, duration));
  const clash = await one(
    `SELECT id FROM appointments WHERE salon_id = ? AND staff_id = ? AND status IN ${ACTIVE}
     AND start_at < ? AND end_at > ? ${ignoreAppointmentId ? 'AND id <> ?' : ''} LIMIT 1`,
    [salonId, staffId, end, startAt, ...(ignoreAppointmentId ? [ignoreAppointmentId] : [])],
  );
  return !clash;
}

/**
 * Live walk-in queue: assign waiting tokens to the earliest free skilled stylist
 * and estimate each token's wait, plus "seat in X min" for a new walk-in.
 */
export async function queueStatus(salonId) {
  const date = today();
  const plan = await dayPlan(salonId, date);
  const nowM = nowMinutes();
  const isOpen = nowM >= plan.open && nowM < plan.close;
  const tokens = await q(
    `SELECT qt.*, s.name AS service_name, COALESCE(s.duration_min, 30) AS duration, u.name AS staff_name
     FROM queue_tokens qt LEFT JOIN services s ON s.id = qt.service_id
     LEFT JOIN salon_staff ss ON ss.id = qt.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE qt.salon_id = ? AND DATE(qt.joined_at) = ? AND qt.status IN ('waiting','serving')
     ORDER BY qt.token_no`,
    [salonId, date],
  );
  const onDuty = plan.staff.filter((s) => !s.off && nowM < s.end);
  const sim = onDuty.map((s) => ({ ...s, busy: s.busy.map((b) => [...b]) }));
  const from = Math.max(nowM, plan.open);
  let position = 0;
  const out = [];
  for (const tk of tokens) {
    if (tk.status === 'serving') {
      out.push({ ...tk, eta_min: 0, position: 0 });
      continue;
    }
    position += 1;
    let best = null;
    for (const s of sim) {
      if (tk.staff_id && s.id !== tk.staff_id) continue;
      if (tk.service_id && !s.skills.has(tk.service_id)) continue;
      const t = earliestFree(s, from, tk.duration);
      if (t !== null && (!best || t < best.t)) best = { s, t };
    }
    if (best) {
      best.s.busy.push([best.t, best.t + tk.duration]);
      best.s.busy.sort((a, b) => a[0] - b[0]);
    }
    out.push({
      ...tk,
      position,
      eta_min: best ? Math.max(0, best.t - nowM) : null,
      likely_staff_id: best?.s.id || null,
      likely_staff: best?.s.name || null,
    });
  }
  let wait = null;
  for (const s of sim) {
    const t = earliestFree(s, from, 30);
    if (t !== null && (wait === null || t - nowM < wait)) wait = Math.max(0, t - nowM);
  }
  const nextSlot = wait === null ? null : timeOf(Math.min(plan.close, Math.ceil((nowM + wait) / 5) * 5));
  return {
    is_open: isOpen,
    open_time: timeOf(plan.open),
    close_time: timeOf(plan.close),
    on_duty: onDuty.length,
    waiting: out.filter((t) => t.status === 'waiting').length,
    wait_min: isOpen ? wait : null,
    next_free: isOpen ? nextSlot : null,
    tokens: out,
    now: hm(new Date()),
  };
}

export const appointmentEnd = (startAt, duration) => dt(addMin(parseLocal(startAt), duration));

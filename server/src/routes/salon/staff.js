import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, insert, update, tx } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { salonPayroll } from '../../services/payroll.js';
import { salonKpis } from '../../services/kpi.js';
import { sendMessage, notifyUser } from '../../services/notify.js';
import { bad, need, notFound, now, pick, round2, today, ymd, addDays, ym, monthRange, pct, token } from '../../util.js';

const r = Router({ mergeParams: true });

r.get('/staff', async (req, res) => {
  const rows = await q(
    `SELECT ss.*, u.name, u.phone, u.email, u.gender,
       (SELECT status FROM attendance a WHERE a.staff_id = ss.id AND a.date = CURDATE()) AS today_status,
       (SELECT check_in FROM attendance a WHERE a.staff_id = ss.id AND a.date = CURDATE()) AS today_check_in,
       (SELECT GROUP_CONCAT(service_id) FROM staff_services st WHERE st.staff_id = ss.id) AS skill_ids,
       (SELECT COUNT(*) FROM user_badges b WHERE b.user_id = ss.user_id) AS badges
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? ${req.query.all ? '' : 'AND ss.is_active = 1'}
     ORDER BY ss.is_active DESC, FIELD(ss.role,'manager','stylist','receptionist'), u.name`,
    [req.salon.id],
  );
  const owner = ['owner', 'admin'].includes(req.access);
  res.json(rows.map((s) => (owner ? s : { ...s, base_salary: undefined, slabs: undefined })));
});

/** Add a staff member (creates their employee-app login). */
r.post('/staff', allow(), async (req, res) => {
  const b = need(req.body, 'name', 'phone', 'role');
  const phone = String(b.phone).replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) throw bad('Enter a 10-digit mobile number');
  const tempPassword = `sb${token(3)}`;
  const id = await tx(async (conn) => {
    let user = await one('SELECT * FROM users WHERE phone = ?', [phone], conn);
    if (user && !['stylist', 'manager'].includes(user.role)) throw bad('This phone belongs to another type of account');
    if (!user) {
      const uid = await insert('users', {
        name: b.name, phone, email: b.email || null, role: b.role === 'manager' ? 'manager' : 'stylist', gender: b.gender || null,
        password_hash: await bcrypt.hash(tempPassword, 10),
      }, conn);
      user = { id: uid };
    }
    return insert('salon_staff', {
      salon_id: req.salon.id, user_id: user.id, role: b.role, level: b.level || 'junior', title: b.title || null, specialities: b.specialities || null,
      base_salary: b.base_salary || 15000, service_commission_pct: b.service_commission_pct ?? 10, retail_incentive_pct: b.retail_incentive_pct ?? 5,
      target_amount: b.target_amount || 80000, hue: Math.floor(Math.random() * 360), joined_on: today(),
    }, conn);
  });
  await sendMessage({ salonId: req.salon.id, to: phone, name: b.name, template: 'staff_invite', body: `Welcome to ${req.salon.name}! Download SaloonBaba and log in with ${phone} / ${tempPassword} to see your day, attendance and live earnings.` });
  res.status(201).json({ id, temp_password: tempPassword });
});

r.patch('/staff/:id', allow(), async (req, res) => {
  const s = await one('SELECT * FROM salon_staff WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!s) throw notFound();
  const data = pick(req.body, ['role', 'level', 'title', 'specialities', 'bio', 'base_salary', 'service_commission_pct', 'retail_incentive_pct', 'target_amount', 'is_active']);
  if (req.body.slabs) data.slabs = JSON.stringify(req.body.slabs);
  await update('salon_staff', s.id, data);
  if (data.level && data.level !== s.level) await notifyUser(s.user_id, 'Congratulations!', `You are now ${data.level} at ${req.salon.name}.`);
  res.json({ ok: true });
});

r.put('/staff/:id/skills', allow('manager'), async (req, res) => {
  const s = await one('SELECT id FROM salon_staff WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!s) throw notFound();
  await tx(async (conn) => {
    await q('DELETE FROM staff_services WHERE staff_id = ?', [s.id], conn);
    for (const sid of req.body.service_ids || []) await insert('staff_services', { staff_id: s.id, service_id: sid }, conn);
  });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Roster (shift planner)
r.get('/roster', async (req, res) => {
  const start = req.query.week_start || ymd(addDays(today(), -((new Date().getDay() + 6) % 7)));
  const end = ymd(addDays(start, 6));
  const staff = await q(
    `SELECT ss.id, u.name, ss.level, ss.hue FROM salon_staff ss JOIN users u ON u.id = ss.user_id WHERE ss.salon_id = ? AND ss.is_active = 1 ORDER BY u.name`,
    [req.salon.id],
  );
  const rows = await q('SELECT * FROM roster WHERE salon_id = ? AND date BETWEEN ? AND ?', [req.salon.id, start, end]);
  // Demand: booked minutes per day to compare with hours scheduled
  const demand = await q(
    `SELECT DATE(start_at) AS d, SUM(TIMESTAMPDIFF(MINUTE, start_at, end_at)) AS mins FROM appointments
     WHERE salon_id = ? AND DATE(start_at) BETWEEN ? AND ? AND status NOT IN ('cancelled') GROUP BY DATE(start_at)`,
    [req.salon.id, start, end],
  );
  res.json({ week_start: start, staff, roster: rows, demand, open_time: req.salon.open_time, close_time: req.salon.close_time });
});

r.put('/roster', allow('manager'), async (req, res) => {
  const b = need(req.body, 'staff_id', 'date');
  const s = await one('SELECT id, user_id FROM salon_staff WHERE id = ? AND salon_id = ?', [b.staff_id, req.salon.id]);
  if (!s) throw notFound();
  await q(
    `INSERT INTO roster (staff_id, salon_id, date, shift_start, shift_end, is_off) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE shift_start = VALUES(shift_start), shift_end = VALUES(shift_end), is_off = VALUES(is_off)`,
    [s.id, req.salon.id, b.date, b.is_off ? null : b.shift_start || req.salon.open_time, b.is_off ? null : b.shift_end || req.salon.close_time, b.is_off ? 1 : 0],
  );
  await notifyUser(s.user_id, 'Roster updated', `Your shift on ${b.date} is ${b.is_off ? 'a weekly off' : `${(b.shift_start || req.salon.open_time).slice(0, 5)}–${(b.shift_end || req.salon.close_time).slice(0, 5)}`}`, 'roster');
  res.json({ ok: true });
});

r.post('/roster/copy-week', allow('manager'), async (req, res) => {
  const { from_week } = need(req.body, 'from_week');
  const rows = await q('SELECT * FROM roster WHERE salon_id = ? AND date BETWEEN ? AND ?', [req.salon.id, from_week, ymd(addDays(from_week, 6))]);
  for (const r0 of rows) {
    await q(
      `INSERT INTO roster (staff_id, salon_id, date, shift_start, shift_end, is_off) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE shift_start = VALUES(shift_start), shift_end = VALUES(shift_end), is_off = VALUES(is_off)`,
      [r0.staff_id, r0.salon_id, ymd(addDays(r0.date, 7)), r0.shift_start, r0.shift_end, r0.is_off],
    );
  }
  res.json({ copied: rows.length });
});

// ------------------------------------------------------------ Attendance
r.get('/attendance', async (req, res) => {
  const date = req.query.date || today();
  res.json(await q(
    `SELECT ss.id AS staff_id, u.name, ss.hue, a.id, a.status, a.check_in, a.check_out, a.distance_m, a.selfie_path,
       r.shift_start, r.shift_end, r.is_off
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id
     LEFT JOIN attendance a ON a.staff_id = ss.id AND a.date = ? LEFT JOIN roster r ON r.staff_id = ss.id AND r.date = ?
     WHERE ss.salon_id = ? AND ss.is_active = 1 ORDER BY u.name`,
    [date, date, req.salon.id],
  ));
});

r.put('/attendance', allow('manager'), async (req, res) => {
  const b = need(req.body, 'staff_id', 'date', 'status');
  const s = await one('SELECT id FROM salon_staff WHERE id = ? AND salon_id = ?', [b.staff_id, req.salon.id]);
  if (!s) throw notFound();
  await q(
    `INSERT INTO attendance (staff_id, salon_id, date, status, check_in) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE status = VALUES(status)`,
    [s.id, req.salon.id, b.date, b.status, ['present', 'late'].includes(b.status) ? `${b.date} ${req.salon.open_time}` : null],
  );
  res.json({ ok: true });
});

r.get('/attendance/summary', async (req, res) => {
  const month = req.query.month || ym();
  const { from, to } = monthRange(month);
  res.json(await q(
    `SELECT ss.id, u.name, SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late, SUM(a.status = 'absent') AS absent,
       SUM(a.status = 'leave') AS leave_days, SUM(a.status = 'off') AS off_days
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id LEFT JOIN attendance a ON a.staff_id = ss.id AND a.date BETWEEN ? AND ?
     WHERE ss.salon_id = ? AND ss.is_active = 1 GROUP BY ss.id ORDER BY u.name`,
    [from, to, req.salon.id],
  ));
});

// ------------------------------------------------------------ Leave & shift swaps
r.get('/leaves', async (req, res) => {
  res.json(await q(
    `SELECT l.*, u.name, u2.name AS swap_with FROM leave_requests l JOIN salon_staff ss ON ss.id = l.staff_id JOIN users u ON u.id = ss.user_id
     LEFT JOIN salon_staff s2 ON s2.id = l.swap_with_staff_id LEFT JOIN users u2 ON u2.id = s2.user_id
     WHERE l.salon_id = ? ORDER BY l.status = 'pending' DESC, l.from_date DESC LIMIT 100`,
    [req.salon.id],
  ));
});

r.post('/leaves/:id/decide', allow('manager'), async (req, res) => {
  const l = await one(`SELECT l.*, ss.user_id FROM leave_requests l JOIN salon_staff ss ON ss.id = l.staff_id WHERE l.id = ? AND l.salon_id = ? AND l.status = 'pending'`, [req.params.id, req.salon.id]);
  if (!l) throw notFound();
  const approve = Boolean(req.body.approve);
  await update('leave_requests', l.id, { status: approve ? 'approved' : 'rejected', decided_by: req.user.id });
  if (approve && l.type === 'leave') {
    for (let d = l.from_date; d <= l.to_date; d = ymd(addDays(d, 1)))
      await q(`INSERT INTO attendance (staff_id, salon_id, date, status) VALUES (?,?,?,'leave') ON DUPLICATE KEY UPDATE status = 'leave'`, [l.staff_id, req.salon.id, d]);
  }
  if (approve && l.type === 'swap' && l.swap_with_staff_id) {
    // Swap the two staff members' roster rows for that date
    const a = await one('SELECT * FROM roster WHERE staff_id = ? AND date = ?', [l.staff_id, l.from_date]);
    const b = await one('SELECT * FROM roster WHERE staff_id = ? AND date = ?', [l.swap_with_staff_id, l.from_date]);
    if (a && b) {
      await update('roster', a.id, { shift_start: b.shift_start, shift_end: b.shift_end, is_off: b.is_off });
      await update('roster', b.id, { shift_start: a.shift_start, shift_end: a.shift_end, is_off: a.is_off });
    }
  }
  await notifyUser(l.user_id, `${l.type === 'swap' ? 'Shift swap' : 'Leave'} ${approve ? 'approved' : 'rejected'}`, `${l.from_date}${l.to_date !== l.from_date ? ` to ${l.to_date}` : ''}`, 'roster');
  res.json({ ok: true });
});

// ------------------------------------------------------------ Advances
r.get('/advances', allow(), async (req, res) => {
  res.json(await q(
    `SELECT a.*, u.name FROM advances a JOIN salon_staff ss ON ss.id = a.staff_id JOIN users u ON u.id = ss.user_id WHERE a.salon_id = ? ORDER BY a.given_on DESC LIMIT 100`,
    [req.salon.id],
  ));
});

r.post('/advances', allow(), async (req, res) => {
  const b = need(req.body, 'staff_id', 'amount');
  const s = await one('SELECT id, user_id FROM salon_staff WHERE id = ? AND salon_id = ?', [b.staff_id, req.salon.id]);
  if (!s) throw notFound();
  const id = await insert('advances', { staff_id: s.id, salon_id: req.salon.id, amount: b.amount, given_on: b.given_on || today(), note: b.note || null });
  await notifyUser(s.user_id, 'Salary advance recorded', `₹${b.amount} — will be adjusted in this month's payslip`, 'earnings');
  res.status(201).json({ id });
});

// ------------------------------------------------------------ Payroll & incentives
r.get('/payroll', allow(), async (req, res) => {
  const month = req.query.month || ym();
  const isCurrent = month === ym();
  const rows = await salonPayroll(req.salon.id, month, { live: isCurrent });
  const slips = await q('SELECT staff_id, status, sent_at FROM payslips WHERE salon_id = ? AND month = ?', [req.salon.id, month]);
  const { from, to } = monthRange(month);
  const kpi = await salonKpis(req.salon.id, from, isCurrent ? today() : to);
  const total = round2(rows.reduce((t, r) => t + r.gross, 0));
  res.json({
    month, live: isCurrent,
    rows: rows.map((r) => ({ ...r, slip: slips.find((s) => s.staff_id === r.staff_id) || null })),
    total_gross: total, total_net: round2(rows.reduce((t, r) => t + r.net, 0)),
    net_sales: kpi.net_sales, payroll_pct: pct(total, kpi.net_sales), target_pct: '30–35%',
  });
});

r.post('/payroll/finalise', allow(), async (req, res) => {
  const month = need(req.body, 'month').month;
  if (month >= ym()) throw bad('You can finalise a month only after it ends');
  const rows = await salonPayroll(req.salon.id, month);
  await tx(async (conn) => {
    for (const p of rows) {
      await q(
        `INSERT INTO payslips (staff_id, salon_id, month, days_in_month, days_paid, base, service_revenue, commission, retail_sales, retail_incentive, slab_bonus, tips, advances, gross, net, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'finalised')
         ON DUPLICATE KEY UPDATE days_paid = VALUES(days_paid), base = VALUES(base), service_revenue = VALUES(service_revenue), commission = VALUES(commission),
           retail_sales = VALUES(retail_sales), retail_incentive = VALUES(retail_incentive), slab_bonus = VALUES(slab_bonus), tips = VALUES(tips),
           advances = VALUES(advances), gross = VALUES(gross), net = VALUES(net), status = 'finalised'`,
        [p.staff_id, req.salon.id, month, p.days_in_month, p.days_paid, p.base, p.service_revenue, p.commission, p.retail_sales, p.retail_incentive, p.slab_bonus, p.tips, p.advances, p.gross, p.net],
        conn,
      );
      await q(`UPDATE advances SET recovered_in = ? WHERE staff_id = ? AND recovered_in IS NULL AND given_on <= ?`, [month, p.staff_id, monthRange(month).to], conn);
    }
    const total = round2(rows.reduce((t, r) => t + r.gross - r.tips, 0));
    const exists = await one(`SELECT id FROM expenses WHERE salon_id = ? AND category = 'salary' AND note = ?`, [req.salon.id, `Payroll ${month}`], conn);
    if (!exists) await insert('expenses', { salon_id: req.salon.id, category: 'salary', amount: total, expense_date: monthRange(month).to, note: `Payroll ${month}`, created_by: req.user.id }, conn);
  });
  res.json({ ok: true, count: rows.length });
});

r.post('/payroll/send', allow(), async (req, res) => {
  const month = need(req.body, 'month').month;
  const slips = await q(
    `SELECT p.*, u.name, u.phone FROM payslips p JOIN salon_staff ss ON ss.id = p.staff_id JOIN users u ON u.id = ss.user_id WHERE p.salon_id = ? AND p.month = ?`,
    [req.salon.id, month],
  );
  if (!slips.length) throw bad('Finalise the payroll first');
  for (const s of slips) {
    await sendMessage({
      salonId: req.salon.id, to: s.phone, name: s.name, template: 'payslip', refType: 'payslip', refId: s.id,
      body: `Payslip ${month} — ${req.salon.name}\nBase ₹${s.base} + Commission ₹${s.commission} + Retail ₹${s.retail_incentive} + Bonus ₹${s.slab_bonus} + Tips ₹${s.tips} − Advance ₹${s.advances} = Net ₹${s.net}`,
    });
    await update('payslips', s.id, { sent_at: now() });
  }
  res.json({ sent: slips.length });
});

// ------------------------------------------------------------ Training progress of the team
r.get('/training', async (req, res) => {
  res.json(await q(
    `SELECT u.name, ss.id AS staff_id, ss.level, c.title, c.badge_name, e.progress, e.completed_at
     FROM salon_staff ss JOIN users u ON u.id = ss.user_id JOIN course_enrollments e ON e.user_id = ss.user_id JOIN courses c ON c.id = e.course_id
     WHERE ss.salon_id = ? AND ss.is_active = 1 ORDER BY u.name, e.completed_at IS NULL, c.title`,
    [req.salon.id],
  ));
});

// ------------------------------------------------------------ Staff voice (anonymous feedback)
r.get('/voice', allow(), async (req, res) => {
  res.json(await q(
    `SELECT v.id, v.category, v.message, v.status, v.reply, v.created_at, IF(v.user_id IS NULL, NULL, u.name) AS from_name
     FROM staff_voice v LEFT JOIN users u ON u.id = v.user_id WHERE v.salon_id = ? ORDER BY v.status = 'new' DESC, v.id DESC LIMIT 100`,
    [req.salon.id],
  ));
});

r.patch('/voice/:id', allow(), async (req, res) => {
  const v = await one('SELECT * FROM staff_voice WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!v) throw notFound();
  await update('staff_voice', v.id, pick(req.body, ['status', 'reply']));
  if (v.user_id && req.body.reply) await notifyUser(v.user_id, 'Owner replied to your feedback', req.body.reply.slice(0, 200), 'voice');
  res.json({ ok: true });
});

export default r;


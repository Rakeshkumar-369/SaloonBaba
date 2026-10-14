import { Router } from 'express';
import { q, one, insert, update } from '../../db.js';
import { allow } from '../../middleware/auth.js';
import { upload, filePath } from '../../upload.js';
import { sendMessage } from '../../services/notify.js';
import { publishReview, recomputeRatings } from '../../services/reviews.js';
import { bad, notFound, now, today, parseJson, range } from '../../util.js';

const r = Router({ mergeParams: true });

// ------------------------------------------------------------ Hygiene & SOP checklists (photo proof)
r.get('/checklists', async (req, res) => {
  const templates = await q(
    `SELECT t.*, (t.brand_id IS NOT NULL) AS from_brand FROM checklist_templates t
     WHERE t.salon_id = ? OR (t.brand_id IS NOT NULL AND t.brand_id = ?) ORDER BY FIELD(t.kind,'opening','hygiene','service','closing')`,
    [req.salon.id, req.salon.brand_id || 0],
  );
  const date = req.query.date || today();
  const runs = await q(
    `SELECT cr.*, u.name AS done_by_name FROM checklist_runs cr LEFT JOIN users u ON u.id = cr.done_by WHERE cr.salon_id = ? AND cr.run_date = ?`,
    [req.salon.id, date],
  );
  const history = await q(
    `SELECT run_date, ROUND(AVG(score)) AS score, COUNT(*) AS runs FROM checklist_runs WHERE salon_id = ? AND run_date >= CURDATE() - INTERVAL 14 DAY
     GROUP BY run_date ORDER BY run_date DESC`,
    [req.salon.id],
  );
  res.json({ date, hygiene_score: req.salon.hygiene_score, templates: templates.map((t) => ({ ...t, items: parseJson(t.items, []), run: runs.find((x) => x.template_id === t.id) || null })), history });
});

r.post('/checklists/:templateId/run', upload.single('photo'), async (req, res) => {
  const t = await one('SELECT * FROM checklist_templates WHERE id = ? AND (salon_id = ? OR brand_id = ?)', [req.params.templateId, req.salon.id, req.salon.brand_id || 0]);
  if (!t) throw notFound();
  const tplItems = parseJson(t.items, []);
  const checked = parseJson(req.body.checked, []);
  if (!Array.isArray(checked)) throw bad('Invalid checklist');
  const items = tplItems.map((label, i) => ({ label, done: checked.includes(i) }));
  const score = Math.round((items.filter((i) => i.done).length / Math.max(1, items.length)) * 100);
  const date = req.body.date || today();
  await q(
    `INSERT INTO checklist_runs (template_id, salon_id, run_date, done_by, items, score, photo_path, created_at) VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE done_by = VALUES(done_by), items = VALUES(items), score = VALUES(score), photo_path = COALESCE(VALUES(photo_path), photo_path), created_at = VALUES(created_at)`,
    [t.id, req.salon.id, date, req.user.id, JSON.stringify(items), score, filePath(req.file), now()],
  );
  const avg = await one('SELECT ROUND(AVG(score)) AS s FROM checklist_runs WHERE salon_id = ? AND run_date >= CURDATE() - INTERVAL 14 DAY', [req.salon.id]);
  await update('salons', req.salon.id, { hygiene_score: avg.s || score });
  res.status(201).json({ score, hygiene_score: avg.s });
});

// ------------------------------------------------------------ Reviews & private feedback recovery
r.get('/reviews', async (req, res) => {
  const stage = req.query.stage;
  const rows = await q(
    `SELECT r.*, c.name AS client_name, c.phone AS client_phone, c.id AS client_id, u.name AS staff_name FROM reviews r
     LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN salon_staff ss ON ss.id = r.staff_id LEFT JOIN users u ON u.id = ss.user_id
     WHERE r.salon_id = ? ${stage ? 'AND r.stage = ?' : ''} ORDER BY r.stage = 'private' DESC, r.created_at DESC LIMIT 100`,
    stage ? [req.salon.id, stage] : [req.salon.id],
  );
  const summary = await one(
    `SELECT AVG(overall) AS overall, AVG(r_result) AS result, AVG(r_hygiene) AS hygiene, AVG(r_wait) AS wait, AVG(r_value) AS value,
       AVG(r_behaviour) AS behaviour, COUNT(*) AS n, SUM(stage = 'private') AS private_n, SUM(stage = 'recovered') AS recovered_n
     FROM reviews WHERE salon_id = ?`,
    [req.salon.id],
  );
  res.json({ rows: req.access === 'stylist' ? rows.filter((x) => x.staff_id === req.staff.id).map((x) => ({ ...x, client_phone: undefined })) : rows, summary });
});

/** Recover an unhappy client before they post publicly (call note + optional offer). */
r.post('/reviews/:id/recover', allow('manager'), async (req, res) => {
  const rv = await one(`SELECT r.*, c.name, c.phone FROM reviews r JOIN clients c ON c.id = r.client_id WHERE r.id = ? AND r.salon_id = ? AND r.stage = 'private'`, [req.params.id, req.salon.id]);
  if (!rv) throw notFound('Private feedback not found');
  const note = String(req.body.note || '').slice(0, 400);
  await update('reviews', rv.id, { stage: 'recovered', recovery_note: note });
  if (req.body.message)
    await sendMessage({ salonId: req.salon.id, to: rv.phone, name: rv.name, template: 'recovery', refType: 'review', refId: rv.id, body: String(req.body.message).slice(0, 600) });
  if (Number(req.body.wallet_credit) > 0) {
    await q('UPDATE clients SET wallet_balance = wallet_balance + ? WHERE id = ?', [Number(req.body.wallet_credit), rv.client_id]);
    await insert('wallet_txns', { client_id: rv.client_id, salon_id: req.salon.id, amount: Number(req.body.wallet_credit), type: 'credit', note: 'Service recovery credit', created_at: now() });
  }
  await recomputeRatings(req.salon.id, rv.staff_id);
  res.json({ ok: true });
});

r.post('/reviews/:id/publish', allow('manager'), async (req, res) => {
  const rv = await one('SELECT id FROM reviews WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!rv) throw notFound();
  await publishReview(rv.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------ Brand audit action items for this outlet
r.get('/audit-actions', async (req, res) => {
  const audits = await q(
    `SELECT a.id, a.audit_date, a.score, a.summary, u.name AS auditor FROM audits a JOIN users u ON u.id = a.auditor_id WHERE a.salon_id = ? ORDER BY a.audit_date DESC LIMIT 10`,
    [req.salon.id],
  );
  const actions = await q(`SELECT * FROM audit_actions WHERE salon_id = ? ORDER BY FIELD(status,'open','in_progress','closed'), due_date`, [req.salon.id]);
  res.json({ audits, actions });
});

r.patch('/audit-actions/:id', allow('manager'), async (req, res) => {
  const a = await one('SELECT * FROM audit_actions WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  if (!a) throw notFound();
  const status = req.body.status;
  if (!['open', 'in_progress', 'closed'].includes(status)) throw bad('Invalid status');
  await update('audit_actions', a.id, { status, outlet_note: req.body.outlet_note ?? a.outlet_note, closed_at: status === 'closed' ? now() : null });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Message log (WhatsApp / SMS / push)
r.get('/messages', allow('manager'), async (req, res) => {
  const { fromDt, toDt } = range(req.query, 7);
  res.json(await q(
    `SELECT id, channel, to_name, to_phone, template, body, status, provider, error, created_at FROM message_log
     WHERE salon_id = ? AND created_at BETWEEN ? AND ? ${req.query.template ? 'AND template LIKE ?' : ''} ORDER BY id DESC LIMIT 200`,
    [req.salon.id, fromDt, toDt, ...(req.query.template ? [`${req.query.template}%`] : [])],
  ));
});

export default r;

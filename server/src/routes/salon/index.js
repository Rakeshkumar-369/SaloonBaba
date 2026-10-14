import { Router } from 'express';
import { consoleSalons, salonContext } from '../../middleware/auth.js';
import { salonKpis } from '../../services/kpi.js';
import { range } from '../../util.js';
import core from './core.js';
import calendar from './calendar.js';
import billing from './billing.js';
import clients from './clients.js';
import marketing from './marketing.js';
import inventory from './inventory.js';
import staff from './staff.js';
import finance from './finance.js';
import insights from './insights.js';
import ops from './ops.js';

const r = Router();

/** Salons this user can open in Salon OS. */
r.get('/', async (req, res) => res.json(await consoleSalons(req.user)));

/** Multi-outlet rollup: every outlet's KPIs side by side + total. */
r.get('/rollup', async (req, res) => {
  const salons = (await consoleSalons(req.user)).filter((s) => s.level === 'owner' || req.user.role === 'admin');
  const { from, to } = range(req.query, 30);
  const rows = [];
  for (const s of salons) rows.push({ ...s, kpi: await salonKpis(s.id, from, to) });
  const total = salons.length ? await salonKpis(salons.map((s) => s.id), from, to) : null;
  res.json({ from, to, outlets: rows, total });
});

const scoped = Router({ mergeParams: true });
scoped.use(salonContext);
for (const m of [core, calendar, billing, clients, marketing, inventory, staff, finance, insights, ops]) scoped.use(m);
r.use('/:salonId', scoped);

export default r;

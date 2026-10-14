import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { HttpError, forbidden, notFound } from '../util.js';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });

/** Attach req.user when a valid bearer token is present; reject otherwise. */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const tok = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!tok) throw new HttpError(401, 'Please log in');
  let payload;
  try {
    payload = jwt.verify(tok, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
  const user = await one(
    'SELECT id, name, email, phone, role, gender, lang, city, gold_until, referral_code, is_active FROM users WHERE id = ?',
    [payload.id],
  );
  if (!user || !user.is_active) throw new HttpError(401, 'Account disabled');
  req.user = user;
  next();
}

/** Same as authenticate but never fails (for public endpoints that personalise). */
export async function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  try {
    await authenticate(req, res, () => {});
  } catch {
    /* ignore */
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role) && req.user.role !== 'admin') throw forbidden();
  next();
};

/**
 * Work out how a user relates to a salon.
 * level: admin | owner | manager | stylist | franchisor | area_manager
 */
export async function salonAccess(user, salonId) {
  const salon = await one('SELECT * FROM salons WHERE id = ?', [salonId]);
  if (!salon) return null;
  if (user.role === 'admin') return { salon, level: 'admin' };
  if (salon.owner_user_id === user.id) return { salon, level: 'owner' };
  const staff = await one(
    'SELECT * FROM salon_staff WHERE salon_id = ? AND user_id = ? AND is_active = 1',
    [salonId, user.id],
  );
  if (staff) return { salon, level: staff.role === 'manager' ? 'manager' : 'stylist', staff };
  if (salon.brand_id) {
    const brand = await one('SELECT id, owner_user_id FROM brands WHERE id = ?', [salon.brand_id]);
    if (brand?.owner_user_id === user.id) return { salon, level: 'franchisor' };
    const member = await one('SELECT id FROM brand_members WHERE brand_id = ? AND user_id = ?', [
      salon.brand_id,
      user.id,
    ]);
    if (member) return { salon, level: 'area_manager' };
  }
  return null;
}

/**
 * Router middleware for /salons/:salonId/*.
 * Brand HQ users get read-only access for drill-down.
 */
export async function salonContext(req, _res, next) {
  const ctx = await salonAccess(req.user, Number(req.params.salonId));
  if (!ctx) throw notFound('Salon not found or not accessible');
  const readOnly = ['franchisor', 'area_manager'].includes(ctx.level);
  if (readOnly && req.method !== 'GET') throw forbidden('Brand HQ has read-only access to outlet data');
  req.salon = ctx.salon;
  req.access = ctx.level;
  req.staff = ctx.staff || null;
  next();
}

/** Restrict a salon route to some access levels (admin & owner always allowed). */
export const allow = (...levels) => (req, _res, next) => {
  const ok = ['admin', 'owner', ...levels].includes(req.access);
  if (!ok) throw forbidden('This action needs the salon owner');
  next();
};

/** Salons a user can open in the Salon OS console. */
export async function consoleSalons(user) {
  const { q } = await import('../db.js');
  if (user.role === 'admin') return q('SELECT id, name, area, city, brand_id FROM salons ORDER BY id');
  return q(
    `SELECT s.id, s.name, s.area, s.city, s.brand_id, 'owner' AS level FROM salons s WHERE s.owner_user_id = ?
     UNION
     SELECT s.id, s.name, s.area, s.city, s.brand_id, ss.role AS level FROM salons s
       JOIN salon_staff ss ON ss.salon_id = s.id AND ss.user_id = ? AND ss.is_active = 1
     ORDER BY id`,
    [user.id, user.id],
  );
}

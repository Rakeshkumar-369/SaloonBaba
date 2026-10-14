import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, insert, update } from '../db.js';
import { signToken } from '../middleware/auth.js';
import { HttpError, bad, need, now, otp as makeOtp, sha, token } from '../util.js';
import { sendMessage } from '../services/notify.js';
import { smsLive } from '../integrations/sms.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../db/demoAccounts.js';

const r = Router();

// Tiny in-memory rate limiter for auth endpoints
const hits = new Map();
function limit(req, _res, next) {
  const key = `${req.ip}:${req.path}`;
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < 10 * 60000);
  arr.push(t);
  hits.set(key, arr);
  if (arr.length > 40) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
  next();
}

export const HOME_BY_ROLE = {
  admin: '/admin', franchisor: '/franchise', area_manager: '/franchise', owner: '/salon',
  manager: '/salon', stylist: '/staff', customer: '/app', vendor: '/vendor',
};

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, lang: u.lang, city: u.city,
  gold_until: u.gold_until, referral_code: u.referral_code, home: HOME_BY_ROLE[u.role],
});

r.post('/login', limit, async (req, res) => {
  const { login, password } = need(req.body, 'login', 'password');
  const id = String(login).trim().toLowerCase();
  const user = await one('SELECT * FROM users WHERE email = ? OR phone = ?', [id, id.replace(/\D/g, '') || id]);
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) throw bad('Wrong email/phone or password');
  if (!user.is_active) throw bad('This account is disabled');
  await update('users', user.id, { last_login_at: now() });
  res.json({ token: signToken(user), user: publicUser(user) });
});

/** Customer self-signup (customers can also use OTP login). */
r.post('/register', limit, async (req, res) => {
  const { name, phone, password } = need(req.body, 'name', 'phone', 'password');
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) throw bad('Enter a 10-digit mobile number');
  if (String(password).length < 6) throw bad('Password must be at least 6 characters');
  if (await one('SELECT id FROM users WHERE phone = ?', [digits])) throw bad('This number is already registered. Please log in.');
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
  if (email && (await one('SELECT id FROM users WHERE email = ?', [email]))) throw bad('This email is already registered');
  const id = await insert('users', {
    name: String(name).trim(), phone: digits, email, password_hash: await bcrypt.hash(String(password), 10),
    role: 'customer', city: req.body.city || null, referral_code: `SB${token(3).toUpperCase()}`,
  });
  const user = await one('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// Phone OTP login for customers (SMS via MSG91 when configured)
const otps = new Map();
r.post('/otp/request', limit, async (req, res) => {
  const digits = String(need(req.body, 'phone').phone).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) throw bad('Enter a 10-digit mobile number');
  const code = makeOtp();
  otps.set(digits, { hash: sha(code), exp: Date.now() + 5 * 60000, tries: 0 });
  await sendMessage({ channel: 'sms', to: digits, template: 'login_otp', body: `${code} is your SaloonBaba login code. It expires in 5 minutes.` });
  res.json({ sent: true, ...(smsLive() ? {} : { demo_otp: code }) });
});

r.post('/otp/verify', limit, async (req, res) => {
  const { phone, otp } = need(req.body, 'phone', 'otp');
  const digits = String(phone).replace(/\D/g, '').slice(-10);
  const rec = otps.get(digits);
  if (!rec || rec.exp < Date.now()) throw bad('Code expired. Request a new one.');
  if (++rec.tries > 5 || rec.hash !== sha(otp)) throw bad('Wrong code');
  otps.delete(digits);
  let user = await one('SELECT * FROM users WHERE phone = ?', [digits]);
  if (!user) {
    const id = await insert('users', {
      name: req.body.name || 'Guest', phone: digits, password_hash: await bcrypt.hash(token(8), 10),
      role: 'customer', referral_code: `SB${token(3).toUpperCase()}`,
    });
    user = await one('SELECT * FROM users WHERE id = ?', [id]);
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

r.get('/demo-accounts', (_req, res) => res.json({ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS }));

export { publicUser };
export default r;

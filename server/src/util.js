import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const forbidden = (msg = 'You do not have access to this') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

/** Ensure required fields are present on body; returns the body. */
export function need(body, ...fields) {
  for (const f of fields) {
    if (body?.[f] === undefined || body?.[f] === null || body?.[f] === '') {
      throw bad(`${f.replace(/_/g, ' ')} is required`);
    }
  }
  return body;
}

export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

export const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const pct = (a, b) => (b ? round2((a / b) * 100) : 0);

// ---------- Local date helpers (process TZ is Asia/Kolkata) ----------
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dt = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const ym = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const now = () => dt(new Date());
export const today = () => ymd(new Date());

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM[:SS]' as local time. */
export function parseLocal(s) {
  if (s instanceof Date) return new Date(s);
  const [d, t = '00:00:00'] = String(s).trim().split(/[ T]/);
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss = 0] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, ss || 0);
}
export const addDays = (d, n) => {
  const x = parseLocal(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMin = (d, n) => new Date(parseLocal(d).getTime() + n * 60000);
export const daysBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / 86400000);
export const minutesOf = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const timeOf = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
export const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { from: ymd(start), to: ymd(end), days: end.getDate() };
};

/** Normalise a date range from query (?from&to) with a default window in days. */
export function range(query, defaultDays = 30) {
  const to = query.to || today();
  const from = query.from || ymd(addDays(to, -(defaultDays - 1)));
  return { from, to, fromDt: `${from} 00:00:00`, toDt: `${to} 23:59:59` };
}

export const token = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');
export const otp = () => String(crypto.randomInt(100000, 999999));
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export const maskPhone = (p) => (p ? `${String(p).slice(0, 2)}XXXXX${String(p).slice(-3)}` : '');

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

export const parseJson = (v, d = null) => {
  if (v == null) return d;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return d; }
};
